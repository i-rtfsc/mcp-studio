//! MCP Domain - Entities, Commands, Queries, and Repository interfaces
//!
//! This module defines the core domain model for MCP (Model Context Protocol) management.

use crate::domain::cqrs::{Command, Query};
use crate::error::AppError;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

// ============ Entities ============

/// MCP Server connection status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum McpServerStatus {
    Connected,
    Disconnected,
    Connecting,
    Error,
}

impl Default for McpServerStatus {
    fn default() -> Self {
        Self::Disconnected
    }
}

impl std::fmt::Display for McpServerStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            McpServerStatus::Connected => write!(f, "connected"),
            McpServerStatus::Disconnected => write!(f, "disconnected"),
            McpServerStatus::Connecting => write!(f, "connecting"),
            McpServerStatus::Error => write!(f, "error"),
        }
    }
}

impl From<String> for McpServerStatus {
    fn from(s: String) -> Self {
        match s.to_lowercase().as_str() {
            "connected" => McpServerStatus::Connected,
            "connecting" => McpServerStatus::Connecting,
            "error" => McpServerStatus::Error,
            _ => McpServerStatus::Disconnected,
        }
    }
}

/// MCP Server type
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum McpServerType {
    Sse,
    Stdio,
    #[serde(rename = "streamable_http")]
    StreamableHttp,
}

impl Default for McpServerType {
    fn default() -> Self {
        Self::Sse
    }
}

impl std::fmt::Display for McpServerType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            McpServerType::Sse => write!(f, "sse"),
            McpServerType::Stdio => write!(f, "stdio"),
            McpServerType::StreamableHttp => write!(f, "streamable_http"),
        }
    }
}

impl From<String> for McpServerType {
    fn from(s: String) -> Self {
        match s.to_lowercase().as_str() {
            "stdio" => McpServerType::Stdio,
            "streamable_http" => McpServerType::StreamableHttp,
            "sse" | _ => McpServerType::Sse,
        }
    }
}

/// MCP Server entity
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServer {
    pub id: String,
    pub name: String,
    pub url: String,
    pub server_type: McpServerType,
    pub status: McpServerStatus,
    pub last_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// MCP Tool entity (cached from server)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpTool {
    pub id: String,
    pub server_id: String,
    pub name: String,
    pub description: Option<String>,
    pub input_schema: Option<String>,  // JSON string
    pub output_schema: Option<String>, // JSON string
    pub extra: Option<String>,         // JSON string (annotations, _meta, etc.)
    pub created_at: String,
}

/// MCP Call History entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpCallHistory {
    pub id: String,
    pub server_id: String,
    pub tool_name: String,
    pub input_params: Option<String>,  // JSON string
    pub output_result: Option<String>, // JSON string (raw response)
    pub status: String,                // 'success' or 'error'
    pub error_message: Option<String>,
    pub duration_ms: Option<i64>,
    pub created_at: String,
}

/// HTTP Received Message entity
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpReceivedMessage {
    pub id: String,
    pub request_id: String,
    pub content_type: Option<String>,
    pub file_name: Option<String>,
    pub file_path: Option<String>,
    pub file_size: Option<i64>,
    pub raw_data: Option<String>,
    pub created_at: String,
}

// ============ Commands ============

/// Command to create a new MCP server
#[derive(Debug, Deserialize)]
pub struct CreateMcpServerCmd {
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub server_type: McpServerType,
}

impl Command for CreateMcpServerCmd {}

/// Command to update an existing MCP server
#[derive(Debug, Deserialize)]
pub struct UpdateMcpServerCmd {
    pub id: String,
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub server_type: McpServerType,
}

impl Command for UpdateMcpServerCmd {}

/// Command to delete an MCP server
#[derive(Debug, Deserialize)]
pub struct DeleteMcpServerCmd {
    pub id: String,
}

impl Command for DeleteMcpServerCmd {}

/// Command to connect to an MCP server
#[derive(Debug, Deserialize)]
pub struct ConnectMcpServerCmd {
    pub id: String,
}

impl Command for ConnectMcpServerCmd {}

/// Command to disconnect from an MCP server
#[derive(Debug, Deserialize)]
pub struct DisconnectMcpServerCmd {
    pub id: String,
}

impl Command for DisconnectMcpServerCmd {}

/// Command to mark MCP server as disconnected (used when connection is lost)
#[derive(Debug, Deserialize)]
pub struct MarkMcpServerDisconnectedCmd {
    pub id: String,
    pub error: Option<String>,
}

impl Command for MarkMcpServerDisconnectedCmd {}

/// Command to call an MCP tool
#[derive(Debug, Deserialize)]
pub struct CallMcpToolCmd {
    pub server_id: String,
    pub tool_name: String,
    pub params: Option<serde_json::Value>,
}

impl Command for CallMcpToolCmd {}

/// Command to refresh tools list from server
#[derive(Debug, Deserialize)]
pub struct RefreshMcpToolsCmd {
    pub server_id: String,
}

impl Command for RefreshMcpToolsCmd {}

/// Command to save HTTP received message
#[derive(Debug, Deserialize)]
pub struct SaveHttpReceivedMessageCmd {
    pub request_id: String,
    pub content_type: Option<String>,
    pub file_name: Option<String>,
    pub file_path: Option<String>,
    pub file_size: Option<i64>,
    pub raw_data: Option<String>,
}

impl Command for SaveHttpReceivedMessageCmd {}

/// Command to delete HTTP received message
#[derive(Debug, Deserialize)]
pub struct DeleteHttpReceivedMessageCmd {
    pub id: String,
}

impl Command for DeleteHttpReceivedMessageCmd {}

// ============ Queries ============

/// Query to list all MCP servers
#[derive(Debug)]
pub struct ListMcpServersQuery;

impl Query for ListMcpServersQuery {}

/// Query to get a specific MCP server
#[derive(Debug)]
pub struct GetMcpServerQuery {
    pub id: String,
}

impl Query for GetMcpServerQuery {}

/// Query to get tools for a specific server
#[derive(Debug)]
pub struct GetMcpToolsQuery {
    pub server_id: String,
}

impl Query for GetMcpToolsQuery {}

/// Query to get call history
#[derive(Debug)]
pub struct GetMcpCallHistoryQuery {
    pub server_id: Option<String>,
    pub limit: Option<i64>,
}

impl Query for GetMcpCallHistoryQuery {}

/// Query to list HTTP received messages
#[derive(Debug)]
pub struct ListHttpReceivedMessagesQuery {
    pub limit: Option<i64>,
}

impl Query for ListHttpReceivedMessagesQuery {}

// ============ Result Types ============

/// Result of calling an MCP tool
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolCallResult {
    pub success: bool,
    pub raw_response: String, // Raw JSON response for debugging
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub duration_ms: i64,
}

/// Result of listing tools (includes raw JSON)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolsListResult {
    pub tools: Vec<McpTool>,
    pub raw_response: String, // Raw JSON response for debugging
}

// ============ Repository Interfaces ============

#[async_trait]
pub trait IMcpServerRepository: Send + Sync {
    async fn create(&self, server: McpServer) -> Result<McpServer, AppError>;
    async fn update(&self, server: McpServer) -> Result<McpServer, AppError>;
    async fn delete(&self, id: &str) -> Result<(), AppError>;
    async fn find_by_id(&self, id: &str) -> Result<Option<McpServer>, AppError>;
    async fn list(&self) -> Result<Vec<McpServer>, AppError>;
}

#[async_trait]
pub trait IMcpCallHistoryRepository: Send + Sync {
    async fn create(&self, history: McpCallHistory) -> Result<McpCallHistory, AppError>;
    async fn list(
        &self,
        server_id: Option<&str>,
        limit: Option<i64>,
    ) -> Result<Vec<McpCallHistory>, AppError>;
    async fn clear(&self, server_id: Option<&str>) -> Result<(), AppError>;
}

#[async_trait]
pub trait IHttpReceivedMessageRepository: Send + Sync {
    async fn create(&self, message: HttpReceivedMessage) -> Result<HttpReceivedMessage, AppError>;
    async fn list(&self, limit: Option<i64>) -> Result<Vec<HttpReceivedMessage>, AppError>;
    async fn delete(&self, id: &str) -> Result<(), AppError>;
    async fn clear(&self) -> Result<(), AppError>;
}
