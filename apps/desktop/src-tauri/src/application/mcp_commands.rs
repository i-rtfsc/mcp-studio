//! MCP Command Handlers - handles all write operations for MCP servers.

use async_trait::async_trait;
use std::sync::Arc;
use tracing::info;
use uuid::Uuid;

use crate::domain::cqrs::CommandHandler;
use crate::domain::mcp::{
    CallMcpToolCmd, ConnectMcpServerCmd, CreateMcpServerCmd, DeleteHttpReceivedMessageCmd,
    DeleteMcpServerCmd, DisconnectMcpServerCmd, HttpReceivedMessage,
    IHttpReceivedMessageRepository, IMcpCallHistoryRepository, IMcpServerRepository,
    MarkMcpServerDisconnectedCmd, McpCallHistory, McpServer, McpServerStatus, McpTool,
    McpToolCallResult, McpToolsListResult, RefreshMcpToolsCmd, SaveHttpReceivedMessageCmd,
    UpdateMcpServerCmd,
};
use crate::error::AppError;
use crate::infra::mcp_client::McpClientManager;

/// Handles MCP server-related commands (write operations).
pub struct McpCommandHandler {
    server_repo: Arc<dyn IMcpServerRepository>,
    history_repo: Arc<dyn IMcpCallHistoryRepository>,
    message_repo: Arc<dyn IHttpReceivedMessageRepository>,
    client_manager: Arc<McpClientManager>,
}

impl McpCommandHandler {
    pub fn new(
        server_repo: Arc<dyn IMcpServerRepository>,
        history_repo: Arc<dyn IMcpCallHistoryRepository>,
        message_repo: Arc<dyn IHttpReceivedMessageRepository>,
        client_manager: Arc<McpClientManager>,
    ) -> Self {
        Self { server_repo, history_repo, message_repo, client_manager }
    }
}

#[async_trait]
impl CommandHandler<CreateMcpServerCmd, McpServer> for McpCommandHandler {
    async fn handle(&self, cmd: CreateMcpServerCmd) -> Result<McpServer, AppError> {
        info!(target: "mcp", "Creating MCP server: {} at {}", cmd.name, cmd.url);

        let server = McpServer {
            id: Uuid::new_v4().to_string(),
            name: cmd.name,
            url: cmd.url,
            server_type: cmd.server_type,
            status: McpServerStatus::Disconnected,
            last_error: None,
            created_at: String::new(),
            updated_at: String::new(),
        };

        self.server_repo.create(server).await
    }
}

#[async_trait]
impl CommandHandler<UpdateMcpServerCmd, McpServer> for McpCommandHandler {
    async fn handle(&self, cmd: UpdateMcpServerCmd) -> Result<McpServer, AppError> {
        info!(target: "mcp", "Updating MCP server: {}", cmd.id);

        let existing = self
            .server_repo
            .find_by_id(&cmd.id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("MCP server {} not found", cmd.id)))?;

        let server = McpServer {
            id: cmd.id,
            name: cmd.name,
            url: cmd.url,
            server_type: cmd.server_type,
            status: existing.status,
            last_error: existing.last_error,
            created_at: existing.created_at,
            updated_at: String::new(),
        };

        self.server_repo.update(server).await
    }
}

#[async_trait]
impl CommandHandler<DeleteMcpServerCmd, ()> for McpCommandHandler {
    async fn handle(&self, cmd: DeleteMcpServerCmd) -> Result<(), AppError> {
        info!(target: "mcp", "Deleting MCP server: {}", cmd.id);

        // Disconnect if connected (this will also clear tools cache)
        self.client_manager.disconnect(&cmd.id).await;

        // Delete server
        self.server_repo.delete(&cmd.id).await
    }
}

#[async_trait]
impl CommandHandler<ConnectMcpServerCmd, McpServer> for McpCommandHandler {
    async fn handle(&self, cmd: ConnectMcpServerCmd) -> Result<McpServer, AppError> {
        info!(target: "mcp", "Connecting to MCP server: {}", cmd.id);

        let server = self
            .server_repo
            .find_by_id(&cmd.id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("MCP server {} not found", cmd.id)))?;

        // Try to connect (status is tracked in McpClientManager, not DB)
        let server_type_str = server.server_type.to_string();
        self.client_manager.connect(&server.id, &server.url, &server_type_str).await?;

        // Auto-refresh tools after successful connection
        info!(target: "mcp", "Auto-refreshing tools for server: {}", cmd.id);
        match self.client_manager.list_tools(&cmd.id).await {
            Ok(result) => {
                info!(target: "mcp", "Auto-loaded {} tools for server {}", result.tools.len(), cmd.id);
            }
            Err(e) => {
                // Don't fail the connection if tool listing fails
                info!(target: "mcp", "Failed to auto-load tools (non-fatal): {}", e);
            }
        }

        // Return server config (status will be fetched from McpClientManager by frontend)
        self.server_repo
            .find_by_id(&cmd.id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("MCP server {} not found", cmd.id)))
    }
}

#[async_trait]
impl CommandHandler<DisconnectMcpServerCmd, McpServer> for McpCommandHandler {
    async fn handle(&self, cmd: DisconnectMcpServerCmd) -> Result<McpServer, AppError> {
        info!(target: "mcp", "Disconnecting from MCP server: {}", cmd.id);

        // Disconnect (status is tracked in McpClientManager, not DB)
        self.client_manager.disconnect(&cmd.id).await;

        self.server_repo
            .find_by_id(&cmd.id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("MCP server {} not found", cmd.id)))
    }
}

#[async_trait]
impl CommandHandler<MarkMcpServerDisconnectedCmd, McpServer> for McpCommandHandler {
    async fn handle(&self, cmd: MarkMcpServerDisconnectedCmd) -> Result<McpServer, AppError> {
        info!(target: "mcp", "Marking MCP server as disconnected: {} (error: {:?})", cmd.id, cmd.error);

        // Connection already removed from manager by heartbeat
        // Status is runtime-only, no DB update needed

        self.server_repo
            .find_by_id(&cmd.id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("MCP server {} not found", cmd.id)))
    }
}

#[async_trait]
impl CommandHandler<RefreshMcpToolsCmd, McpToolsListResult> for McpCommandHandler {
    async fn handle(&self, cmd: RefreshMcpToolsCmd) -> Result<McpToolsListResult, AppError> {
        info!(target: "mcp", "Refreshing tools for MCP server: {}", cmd.server_id);

        // list_tools will automatically cache the tools in memory
        let result = self.client_manager.list_tools(&cmd.server_id).await?;

        // Convert to domain tools for response
        let tools: Vec<McpTool> = result
            .tools
            .iter()
            .map(|t| McpTool {
                id: Uuid::new_v4().to_string(),
                server_id: cmd.server_id.clone(),
                name: t.name.clone(),
                description: t.description.clone(),
                input_schema: t.input_schema.clone(),
                output_schema: t.output_schema.clone(),
                created_at: String::new(),
            })
            .collect();

        Ok(McpToolsListResult { tools, raw_response: result.raw_response })
    }
}

#[async_trait]
impl CommandHandler<CallMcpToolCmd, McpToolCallResult> for McpCommandHandler {
    async fn handle(&self, cmd: CallMcpToolCmd) -> Result<McpToolCallResult, AppError> {
        info!(target: "mcp", "Calling tool {} on server {}", cmd.tool_name, cmd.server_id);

        let start = std::time::Instant::now();
        let result =
            self.client_manager.call_tool(&cmd.server_id, &cmd.tool_name, cmd.params.clone()).await;
        let duration_ms = start.elapsed().as_millis() as i64;

        // Save to history
        let history = match &result {
            Ok(r) => McpCallHistory {
                id: Uuid::new_v4().to_string(),
                server_id: cmd.server_id.clone(),
                tool_name: cmd.tool_name.clone(),
                input_params: cmd.params.map(|p| serde_json::to_string(&p).unwrap_or_default()),
                output_result: Some(r.raw_response.clone()),
                status: "success".to_string(),
                error_message: None,
                duration_ms: Some(duration_ms),
                created_at: String::new(),
            },
            Err(e) => McpCallHistory {
                id: Uuid::new_v4().to_string(),
                server_id: cmd.server_id.clone(),
                tool_name: cmd.tool_name.clone(),
                input_params: cmd.params.map(|p| serde_json::to_string(&p).unwrap_or_default()),
                output_result: None,
                status: "error".to_string(),
                error_message: Some(e.to_string()),
                duration_ms: Some(duration_ms),
                created_at: String::new(),
            },
        };

        let _ = self.history_repo.create(history).await;

        result
    }
}

#[async_trait]
impl CommandHandler<SaveHttpReceivedMessageCmd, HttpReceivedMessage> for McpCommandHandler {
    async fn handle(
        &self,
        cmd: SaveHttpReceivedMessageCmd,
    ) -> Result<HttpReceivedMessage, AppError> {
        info!(target: "mcp", "Saving HTTP received message: {}", cmd.request_id);

        let message = HttpReceivedMessage {
            id: Uuid::new_v4().to_string(),
            request_id: cmd.request_id,
            content_type: cmd.content_type,
            file_name: cmd.file_name,
            file_path: cmd.file_path,
            file_size: cmd.file_size,
            raw_data: cmd.raw_data,
            created_at: String::new(),
        };

        self.message_repo.create(message).await
    }
}

#[async_trait]
impl CommandHandler<DeleteHttpReceivedMessageCmd, ()> for McpCommandHandler {
    async fn handle(&self, cmd: DeleteHttpReceivedMessageCmd) -> Result<(), AppError> {
        info!(target: "mcp", "Deleting HTTP received message: {}", cmd.id);
        self.message_repo.delete(&cmd.id).await
    }
}
