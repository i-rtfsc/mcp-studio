//! MCP Client Manager - manages connections to MCP servers using rmcp SDK.
//!
//! This module provides:
//! - HTTP streaming client connections to MCP servers
//! - Tool listing with raw JSON responses (cached in memory)
//! - Tool calling with raw JSON responses
//! - Heartbeat monitoring for connection health
//! - In-memory caching of tools (not persisted to database)
//!
//! ## Important Design Decision:
//! Tools are NOT stored in the database. They are runtime data that should be:
//! 1. Fetched via `tools/list` RPC call when needed
//! 2. Cached in memory for performance
//! 3. Automatically refreshed when server sends `ToolsListChanged` notification
//!
//! ## TODO: Implement ToolsListChanged Notification Listener
//! To automatically refresh tools when the server notifies changes, we need to:
//! 1. Implement a custom ClientHandler trait from rmcp::handler
//! 2. Override the notification handler to listen for `notifications/tools/list_changed`
//! 3. When notification is received, automatically call `list_tools()` to refresh cache
//! 4. Emit an event to frontend via EventPublisher so UI can update
//!
//! Example implementation:
//! ```rust,ignore
//! struct McpNotificationHandler {
//!     server_id: String,
//!     manager: Arc<McpClientManager>,
//! }
//!
//! impl ClientHandler for McpNotificationHandler {
//!     async fn handle_notification(&self, method: &str, params: serde_json::Value) {
//!         match method {
//!             "notifications/tools/list_changed" => {
//!                 info!("Tools changed for server {}", self.server_id);
//!                 // Refresh tools cache
//!                 if let Ok(result) = self.manager.list_tools(&self.server_id).await {
//!                     // Publish event to frontend
//!                     let event_data = serde_json::json!({
//!                         "server_id": self.server_id,
//!                         "tools_count": result.tools.len(),
//!                     });
//!                     self.manager.event_publisher.publish("mcp:tools_changed", event_data).await;
//!                 }
//!             }
//!             _ => {}
//!         }
//!     }
//! }
//! ```

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{interval, Duration};
use tokio_util::sync::CancellationToken;
use tracing::{debug, error, info, warn};

use rmcp::{
    model::{
        CallToolRequestParam, ClientCapabilities, ClientInfo, Implementation,
        InitializeRequestParam,
    },
    service::RunningService,
    transport::streamable_http_client::{
        StreamableHttpClientTransport, StreamableHttpClientTransportConfig,
    },
    RoleClient, ServiceExt,
};

use crate::domain::mcp::McpToolCallResult;
use crate::error::AppError;
use crate::infra::event_publisher::EventPublisher;
use tauri::async_runtime;

/// Create a reqwest client without proxy
fn create_no_proxy_client() -> Result<reqwest::Client, AppError> {
    reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| AppError::Io(format!("Failed to create reqwest client: {}", e)))
}

/// Tool information from MCP server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolInfo {
    pub name: String,
    pub description: Option<String>,
    pub input_schema: Option<String>,
    pub output_schema: Option<String>,
}

/// Result of listing tools
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolsListResultInternal {
    pub tools: Vec<McpToolInfo>,
    pub raw_response: String,
}

/// MCP Client connection wrapper
struct McpConnection {
    client: RunningService<RoleClient, InitializeRequestParam>,
    heartbeat_cancel: CancellationToken,
}

/// Manages multiple MCP client connections
pub struct McpClientManager {
    connections: Arc<RwLock<HashMap<String, McpConnection>>>,
    /// In-memory cache of tools per server (runtime data, not persisted)
    tools_cache: Arc<RwLock<HashMap<String, Vec<McpToolInfo>>>>,
    event_publisher: Arc<dyn EventPublisher>,
    config_repo: Arc<RwLock<Option<Arc<dyn crate::domain::config::IConfigRepository>>>>,
}

impl McpClientManager {
    pub fn new(event_publisher: Arc<dyn EventPublisher>) -> Self {
        Self {
            connections: Arc::new(RwLock::new(HashMap::new())),
            tools_cache: Arc::new(RwLock::new(HashMap::new())),
            event_publisher,
            config_repo: Arc::new(RwLock::new(None)),
        }
    }

    /// Set config repository for reading settings
    pub async fn set_config_repo(
        &self,
        config_repo: Arc<dyn crate::domain::config::IConfigRepository>,
    ) {
        let mut repo = self.config_repo.write().await;
        *repo = Some(config_repo);
    }

    /// Connect to an MCP server (auto-select transport based on server_type)
    pub async fn connect(
        &self,
        server_id: &str,
        url: &str,
        server_type: &str,
    ) -> Result<(), AppError> {
        info!(target: "mcp_client", "Connecting to MCP server {} at {} (type: {})", server_id, url, server_type);

        // Check if already connected
        {
            let connections = self.connections.read().await;
            if connections.contains_key(server_id) {
                return Err(AppError::Domain("Already connected".to_string()));
            }
        }

        // Create client info
        let client_info = ClientInfo {
            protocol_version: Default::default(),
            capabilities: ClientCapabilities::default(),
            client_info: Implementation {
                name: "MCP Studio".to_string(),
                title: Some("MCP Studio Debug Client".to_string()),
                version: "0.1.0".to_string(),
                website_url: None,
                icons: None,
            },
        };

        // Select transport based on server_type
        let client = match server_type {
            "streamable_http" => {
                info!(target: "mcp_client", "Using Streamable HTTP transport");
                let http_client = create_no_proxy_client()?;
                let config = StreamableHttpClientTransportConfig::with_uri(url);
                let transport = StreamableHttpClientTransport::with_client(http_client, config);

                client_info.serve(transport).await.map_err(|e| {
                    error!(target: "mcp_client", "Failed to initialize MCP client: {}", e);
                    AppError::Io(format!("Failed to initialize MCP connection: {}", e))
                })?
            }
            "sse" => {
                info!(target: "mcp_client", "Using SSE transport");
                use crate::infra::sse_transport::SseWorker;

                let manager_for_disconnect = self.clone_manager_ref();
                let server_id_for_disconnect = server_id.to_string();
                let disconnect_callback = Arc::new(move |reason: String| {
                    let manager = manager_for_disconnect.clone_manager_ref();
                    let server_id = server_id_for_disconnect.clone();
                    async_runtime::spawn(async move {
                        manager.handle_transport_disconnect(&server_id, reason).await;
                    });
                });

                let worker = SseWorker::new(url, server_id.to_string(), Some(disconnect_callback));

                client_info.serve(worker).await.map_err(|e| {
                    error!(target: "mcp_client", "Failed to initialize MCP client: {}", e);
                    AppError::Io(format!("Failed to initialize MCP connection: {}", e))
                })?
            }
            _ => {
                return Err(AppError::Domain(format!("Unsupported server type: {}", server_type)));
            }
        };

        // Log server info
        let server_info = client.peer_info();
        info!(target: "mcp_client", "Connected to server: {:?}", server_info);

        // Create heartbeat cancellation token
        let heartbeat_cancel = CancellationToken::new();

        // Store connection
        {
            let mut connections = self.connections.write().await;
            connections.insert(
                server_id.to_string(),
                McpConnection { client, heartbeat_cancel: heartbeat_cancel.clone() },
            );
        }

        // Start heartbeat task
        let server_id_clone = server_id.to_string();
        let manager_ref = Arc::new(self.clone_manager_ref());
        tokio::spawn(async move {
            manager_ref.run_heartbeat(&server_id_clone, heartbeat_cancel).await;
        });

        Ok(())
    }

    /// Clone manager reference for heartbeat task
    fn clone_manager_ref(&self) -> Self {
        Self {
            connections: self.connections.clone(),
            tools_cache: self.tools_cache.clone(),
            event_publisher: self.event_publisher.clone(),
            config_repo: self.config_repo.clone(),
        }
    }

    /// Run heartbeat task to monitor connection health
    async fn run_heartbeat(&self, server_id: &str, cancel_token: CancellationToken) {
        const DEFAULT_HEARTBEAT_INTERVAL_SECS: u64 = 10;
        const MAX_FAILURES: u32 = 1; // Disconnect after first failure to react quickly

        // Read heartbeat interval from config
        let heartbeat_interval = {
            let config_repo_lock = self.config_repo.read().await;
            if let Some(config_repo) = config_repo_lock.as_ref() {
                match config_repo.get("heartbeat_interval").await {
                    Ok(Some(value)) => {
                        value.parse::<u64>().unwrap_or(DEFAULT_HEARTBEAT_INTERVAL_SECS)
                    }
                    _ => DEFAULT_HEARTBEAT_INTERVAL_SECS,
                }
            } else {
                DEFAULT_HEARTBEAT_INTERVAL_SECS
            }
        };

        let mut ticker = interval(Duration::from_secs(heartbeat_interval));
        let mut consecutive_failures = 0;

        info!(target: "mcp_client", "Starting heartbeat for server {} with interval {}s", server_id, heartbeat_interval);

        loop {
            tokio::select! {
                _ = ticker.tick() => {
                    debug!(target: "mcp_client", "Heartbeat tick for server {}", server_id);

                    // Try to ping the server
                    let ping_result = self.ping_server(server_id).await;

                    match ping_result {
                        Ok(_) => {
                            debug!(target: "mcp_client", "Heartbeat OK for server {}", server_id);
                            consecutive_failures = 0;
                        }
                        Err(e) => {
                            consecutive_failures += 1;
                            let is_transport_closed = matches!(
                                &e,
                                AppError::Io(msg) if msg.contains("Transport closed") || msg.contains("Connection reset")
                            );
                            warn!(target: "mcp_client", "Heartbeat failed for server {} ({}/{}): {}",
                                server_id, consecutive_failures, MAX_FAILURES, e);

                            if consecutive_failures >= MAX_FAILURES || is_transport_closed {
                                error!(target: "mcp_client", "Heartbeat marked server {} as disconnected", server_id);
                                self.handle_transport_disconnect(server_id, "heartbeat_failed".to_string()).await;
                                break;
                            }
                        }
                    }
                }

                _ = cancel_token.cancelled() => {
                    info!(target: "mcp_client", "Heartbeat cancelled for server {}", server_id);
                    break;
                }
            }
        }
    }

    /// Ping the server to check connection health
    /// Uses list_tools as a health check since MCP protocol doesn't have a dedicated ping
    async fn ping_server(&self, server_id: &str) -> Result<(), AppError> {
        let connections = self.connections.read().await;
        let conn = connections
            .get(server_id)
            .ok_or_else(|| AppError::Domain("Not connected to server".to_string()))?;

        // Use list_tools as a health check (lightweight operation)
        // If the connection is dead, this will fail
        conn.client.list_tools(Default::default()).await.map_err(|e| {
            error!(target: "mcp_client", "Health check failed: {}", e);
            AppError::Io(format!("Health check failed: {}", e))
        })?;

        Ok(())
    }

    /// Disconnect from an MCP server
    pub async fn disconnect(&self, server_id: &str) {
        info!(target: "mcp_client", "Disconnecting from MCP server {}", server_id);

        let mut connections = self.connections.write().await;
        if let Some(conn) = connections.remove(server_id) {
            // Cancel heartbeat task
            conn.heartbeat_cancel.cancel();

            if let Err(e) = conn.client.cancel().await {
                error!(target: "mcp_client", "Error disconnecting: {}", e);
            }
        }

        // Clear tools cache for this server
        let mut tools_cache = self.tools_cache.write().await;
        tools_cache.remove(server_id);
    }

    /// Check if connected to a server
    pub async fn is_connected(&self, server_id: &str) -> bool {
        let connections = self.connections.read().await;
        connections.contains_key(server_id)
    }

    /// List tools from an MCP server (returns raw JSON response)
    pub async fn list_tools(
        &self,
        server_id: &str,
    ) -> Result<McpToolsListResultInternal, AppError> {
        info!(target: "mcp_client", "Listing tools for server {}", server_id);

        let connections = self.connections.read().await;
        let conn = connections
            .get(server_id)
            .ok_or_else(|| AppError::Domain("Not connected to server".to_string()))?;

        // Call tools/list
        let tools_result = conn.client.list_tools(Default::default()).await.map_err(|e| {
            error!(target: "mcp_client", "Failed to list tools: {}", e);
            AppError::Io(format!("Failed to list tools: {}", e))
        })?;

        // Serialize the raw response for debugging
        let raw_response = serde_json::to_string_pretty(&tools_result)
            .unwrap_or_else(|_| format!("{:?}", tools_result));

        debug!(target: "mcp_client", "Raw tools/list response:\n{}", raw_response);

        // Convert to our tool format
        let tools: Vec<McpToolInfo> = tools_result
            .tools
            .into_iter()
            .map(|t| {
                // input_schema is Arc<serde_json::Map<String, Value>>, serialize it directly
                let input_schema =
                    serde_json::to_string_pretty(&*t.input_schema).ok().filter(|s| s != "{}");

                // output_schema is also Arc<serde_json::Map<String, Value>>, serialize it
                let output_schema = t.output_schema.and_then(|schema| {
                    serde_json::to_string_pretty(&*schema).ok().filter(|s| s != "{}")
                });

                McpToolInfo {
                    name: t.name.to_string(),
                    description: t.description.map(|d| d.to_string()),
                    input_schema,
                    output_schema,
                }
            })
            .collect();

        info!(target: "mcp_client", "Found {} tools", tools.len());

        // Cache tools in memory
        {
            let mut tools_cache = self.tools_cache.write().await;
            tools_cache.insert(server_id.to_string(), tools.clone());
        }

        Ok(McpToolsListResultInternal { tools, raw_response })
    }

    /// Get cached tools for a server (from memory, not database)
    pub async fn get_cached_tools(&self, server_id: &str) -> Option<Vec<McpToolInfo>> {
        let tools_cache = self.tools_cache.read().await;
        tools_cache.get(server_id).cloned()
    }

    /// Call a tool on an MCP server (returns raw JSON response)
    pub async fn call_tool(
        &self,
        server_id: &str,
        tool_name: &str,
        params: Option<serde_json::Value>,
    ) -> Result<McpToolCallResult, AppError> {
        info!(target: "mcp_client", "Calling tool {} on server {}", tool_name, server_id);

        info!(target: "mcp_client", "Acquiring read lock on connections...");
        let connections = self.connections.read().await;
        info!(target: "mcp_client", "Read lock acquired, getting connection for server {}", server_id);

        let conn = connections.get(server_id).ok_or_else(|| {
            error!(target: "mcp_client", "Server {} not found in connections map", server_id);
            AppError::Domain("Not connected to server".to_string())
        })?;

        info!(target: "mcp_client", "Connection found, preparing tool call");

        // Prepare arguments
        let arguments = params.and_then(|p| p.as_object().cloned());

        debug!(target: "mcp_client", "Tool call arguments: {:?}", arguments);

        // Log as JSON to see exact structure
        if let Some(ref args) = arguments {
            match serde_json::to_string_pretty(args) {
                Ok(json) => info!(target: "mcp_client", "Arguments as JSON:\n{}", json),
                Err(e) => warn!(target: "mcp_client", "Failed to serialize arguments: {}", e),
            }
        }

        // Clone tool_name to own it
        let tool_name_owned = tool_name.to_string();

        // Call the tool
        info!(target: "mcp_client", "Sending tool call request to server...");
        let start = std::time::Instant::now();

        // Add timeout to debug
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            conn.client.call_tool(CallToolRequestParam { name: tool_name_owned.into(), arguments }),
        )
        .await;

        match result {
            Ok(Ok(tool_result)) => {
                let duration_ms = start.elapsed().as_millis() as i64;
                info!(target: "mcp_client", "Tool call completed in {}ms", duration_ms);
                info!(target: "mcp_client", "Tool call succeeded, processing response...");

                // Serialize the raw response for debugging
                let raw_response = serde_json::to_string_pretty(&tool_result)
                    .unwrap_or_else(|_| format!("{:?}", tool_result));

                debug!(target: "mcp_client", "Raw tools/call response:\n{}", raw_response);

                // Convert content to JSON value
                let result_value =
                    serde_json::to_value(&tool_result.content).unwrap_or(serde_json::Value::Null);

                info!(target: "mcp_client", "Tool call result prepared, returning to frontend");

                Ok(McpToolCallResult {
                    success: !tool_result.is_error.unwrap_or(false),
                    raw_response,
                    result: Some(result_value),
                    error: None,
                    duration_ms,
                })
            }
            Ok(Err(e)) => {
                let duration_ms = start.elapsed().as_millis() as i64;
                error!(target: "mcp_client", "Tool call failed: {}", e);
                Ok(McpToolCallResult {
                    success: false,
                    raw_response: format!("{{\"error\": \"{}\"}}", e),
                    result: None,
                    error: Some(e.to_string()),
                    duration_ms,
                })
            }
            Err(_timeout) => {
                let duration_ms = start.elapsed().as_millis() as i64;
                error!(target: "mcp_client", "Tool call timed out after {}ms", duration_ms);
                Ok(McpToolCallResult {
                    success: false,
                    raw_response: r#"{"error": "Request timed out"}"#.to_string(),
                    result: None,
                    error: Some("Request timed out after 30 seconds".to_string()),
                    duration_ms,
                })
            }
        }
    }

    /// Get server info for a connected server
    pub async fn get_server_info(&self, server_id: &str) -> Result<String, AppError> {
        let connections = self.connections.read().await;
        let conn = connections
            .get(server_id)
            .ok_or_else(|| AppError::Domain("Not connected to server".to_string()))?;

        let server_info = conn.client.peer_info();
        let raw_response = serde_json::to_string_pretty(&server_info)
            .unwrap_or_else(|_| format!("{:?}", server_info));

        Ok(raw_response)
    }

    /// Disconnect all servers
    pub async fn disconnect_all(&self) {
        info!(target: "mcp_client", "Disconnecting all MCP servers");
        let mut connections = self.connections.write().await;
        for (id, conn) in connections.drain() {
            debug!(target: "mcp_client", "Disconnecting server {}", id);
            conn.heartbeat_cancel.cancel();
            let _ = conn.client.cancel().await;
        }
    }

    async fn handle_transport_disconnect(&self, server_id: &str, reason: String) {
        info!(target: "mcp_client", "Handling transport disconnect for server {} (reason: {})", server_id, reason);

        let connection = {
            let mut connections = self.connections.write().await;
            connections.remove(server_id)
        };

        if let Some(conn) = connection {
            conn.heartbeat_cancel.cancel();
            if let Err(e) = conn.client.cancel().await {
                error!(target: "mcp_client", "Failed to cancel client after disconnect: {}", e);
            }

            let mut tools_cache = self.tools_cache.write().await;
            tools_cache.remove(server_id);
        } else {
            warn!(target: "mcp_client", "Disconnect callback triggered but no connection found for {}", server_id);
        }

        let event_data = serde_json::json!({
            "server_id": server_id,
            "status": "disconnected",
            "error": format!("Transport closed: {}", reason),
            "reason": reason,
        });
        self.event_publisher.publish("mcp:connection_lost", event_data).await;
    }
}

impl Clone for McpClientManager {
    fn clone(&self) -> Self {
        Self {
            connections: self.connections.clone(),
            tools_cache: self.tools_cache.clone(),
            event_publisher: self.event_publisher.clone(),
            config_repo: self.config_repo.clone(),
        }
    }
}
