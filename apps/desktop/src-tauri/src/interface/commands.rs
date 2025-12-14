use crate::application::{
    ConfigCommandHandler, ConfigQueryHandler, McpCommandHandler, McpQueryHandler,
};
use crate::domain::config::{GetAllConfigQuery, GetConfigQuery, SetConfigCmd};
use crate::domain::cqrs::{CommandHandler, QueryHandler};
use crate::domain::mcp::{
    CallMcpToolCmd, ConnectMcpServerCmd, CreateMcpServerCmd, DeleteHttpReceivedMessageCmd,
    DeleteMcpServerCmd, DisconnectMcpServerCmd, GetMcpCallHistoryQuery, GetMcpServerQuery,
    GetMcpToolsQuery, HttpReceivedMessage, ListHttpReceivedMessagesQuery, ListMcpServersQuery,
    MarkMcpServerDisconnectedCmd, McpCallHistory, McpServer, McpTool, McpToolCallResult,
    McpToolsListResult, RefreshMcpToolsCmd, SaveHttpReceivedMessageCmd, UpdateMcpServerCmd,
};
use crate::error::AppError;
use crate::infra::http::{HttpClient, HttpRequest, HttpResponse};
use crate::infra::http_server::HttpServerManager;
use crate::infra::logging::LogPayload;
use std::collections::HashMap;
use std::process::Command;
use tauri::{AppHandle, Manager, State};
use tracing::info;

#[cfg(target_os = "macos")]
const OPEN_LOG_COMMAND: &str = "open";
#[cfg(target_os = "windows")]
const OPEN_LOG_COMMAND: &str = "explorer";
#[cfg(target_os = "linux")]
const OPEN_LOG_COMMAND: &str = "xdg-open";
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
const OPEN_LOG_COMMAND: &str = "open";

// Example Command
#[tauri::command]
pub async fn greet(name: String) -> Result<String, String> {
    info!(target: "app::greet", "Greeting requested for: {}", name);
    Ok(format!("Hello, {}! Welcome to Tauri + React!", name))
}

// Logging Command
#[tauri::command]
pub fn log_frontend_message(payload: LogPayload) {
    crate::infra::logging::log_frontend_message(payload);
}

// Log folder command
#[tauri::command]
pub async fn open_log_folder(app: AppHandle) -> Result<(), AppError> {
    let log_dir = app.path().app_log_dir().map_err(|e| AppError::Io(e.to_string()))?;

    if !log_dir.exists() {
        std::fs::create_dir_all(&log_dir).map_err(|e| AppError::Io(e.to_string()))?;
    }

    let status = Command::new(OPEN_LOG_COMMAND)
        .arg(log_dir.to_string_lossy().to_string())
        .status()
        .map_err(|e| AppError::Io(e.to_string()))?;

    if !status.success() {
        return Err(AppError::Io(format!(
            "Failed to open log directory (status: {:?})",
            status.code()
        )));
    }

    Ok(())
}

// Storage folder command
#[tauri::command]
pub async fn open_storage_folder(app: AppHandle) -> Result<(), AppError> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| AppError::Io(e.to_string()))?;

    let storage_dir = app_data_dir.join("received_files");

    if !storage_dir.exists() {
        std::fs::create_dir_all(&storage_dir).map_err(|e| AppError::Io(e.to_string()))?;
    }

    let status = Command::new(OPEN_LOG_COMMAND)
        .arg(storage_dir.to_string_lossy().to_string())
        .status()
        .map_err(|e| AppError::Io(e.to_string()))?;

    if !status.success() {
        return Err(AppError::Io(format!(
            "Failed to open storage directory (status: {:?})",
            status.code()
        )));
    }

    Ok(())
}

// Database Check Command
#[tauri::command]
pub async fn check_db_health(pool: State<'_, sqlx::SqlitePool>) -> Result<String, AppError> {
    let result: (i32,) = sqlx::query_as("SELECT 1").fetch_one(pool.inner()).await?;

    Ok(format!("Database is healthy! Result: {}", result.0))
}

// --- Configuration Commands (CQRS) ---

#[tauri::command]
pub async fn get_app_setting(
    handler: State<'_, ConfigQueryHandler>,
    key: String,
) -> Result<Option<String>, AppError> {
    handler.handle(GetConfigQuery { key }).await
}

#[tauri::command]
pub async fn set_app_setting(
    handler: State<'_, ConfigCommandHandler>,
    key: String,
    value: String,
) -> Result<(), AppError> {
    handler.handle(SetConfigCmd { key, value }).await
}

#[tauri::command]
pub async fn get_all_settings(
    handler: State<'_, ConfigQueryHandler>,
) -> Result<HashMap<String, String>, AppError> {
    handler.handle(GetAllConfigQuery).await
}

// --- Network Commands ---

#[tauri::command]
pub async fn http_request(
    client: State<'_, HttpClient>,
    request: HttpRequest,
) -> Result<HttpResponse, AppError> {
    client.execute(request).await
}

// --- MCP Server Commands ---

#[tauri::command]
pub async fn create_mcp_server(
    handler: State<'_, McpCommandHandler>,
    cmd: CreateMcpServerCmd,
) -> Result<McpServer, AppError> {
    handler.handle(cmd).await
}

#[tauri::command]
pub async fn update_mcp_server(
    handler: State<'_, McpCommandHandler>,
    cmd: UpdateMcpServerCmd,
) -> Result<McpServer, AppError> {
    handler.handle(cmd).await
}

#[tauri::command]
pub async fn delete_mcp_server(
    handler: State<'_, McpCommandHandler>,
    id: String,
) -> Result<(), AppError> {
    handler.handle(DeleteMcpServerCmd { id }).await
}

#[tauri::command]
pub async fn list_mcp_servers(
    handler: State<'_, McpQueryHandler>,
) -> Result<Vec<McpServer>, AppError> {
    handler.handle(ListMcpServersQuery).await
}

#[tauri::command]
pub async fn get_mcp_server(
    handler: State<'_, McpQueryHandler>,
    id: String,
) -> Result<Option<McpServer>, AppError> {
    handler.handle(GetMcpServerQuery { id }).await
}

#[tauri::command]
pub async fn connect_mcp_server(
    handler: State<'_, McpCommandHandler>,
    id: String,
) -> Result<McpServer, AppError> {
    handler.handle(ConnectMcpServerCmd { id }).await
}

#[tauri::command]
pub async fn disconnect_mcp_server(
    handler: State<'_, McpCommandHandler>,
    id: String,
) -> Result<McpServer, AppError> {
    handler.handle(DisconnectMcpServerCmd { id }).await
}

#[tauri::command]
pub async fn mark_mcp_server_disconnected(
    handler: State<'_, McpCommandHandler>,
    id: String,
    error: Option<String>,
) -> Result<McpServer, AppError> {
    handler.handle(MarkMcpServerDisconnectedCmd { id, error }).await
}

// --- MCP Tools Commands ---

#[tauri::command]
pub async fn refresh_mcp_tools(
    handler: State<'_, McpCommandHandler>,
    server_id: String,
) -> Result<McpToolsListResult, AppError> {
    handler.handle(RefreshMcpToolsCmd { server_id }).await
}

#[tauri::command]
pub async fn get_mcp_tools(
    handler: State<'_, McpQueryHandler>,
    server_id: String,
) -> Result<Vec<McpTool>, AppError> {
    handler.handle(GetMcpToolsQuery { server_id }).await
}

#[tauri::command]
pub async fn call_mcp_tool(
    handler: State<'_, McpCommandHandler>,
    server_id: String,
    tool_name: String,
    params: Option<serde_json::Value>,
) -> Result<McpToolCallResult, AppError> {
    handler.handle(CallMcpToolCmd { server_id, tool_name, params }).await
}

#[tauri::command]
pub async fn export_mcp_tools_json(
    handler: State<'_, McpQueryHandler>,
    server_id: String,
) -> Result<String, AppError> {
    let tools = handler.handle(GetMcpToolsQuery { server_id }).await?;
    serde_json::to_string_pretty(&tools)
        .map_err(|e| AppError::Unknown(format!("Failed to serialize tools: {}", e)))
}

// --- MCP Call History ---

#[tauri::command]
pub async fn get_mcp_call_history(
    handler: State<'_, McpQueryHandler>,
    server_id: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<McpCallHistory>, AppError> {
    handler.handle(GetMcpCallHistoryQuery { server_id, limit }).await
}

// --- HTTP Server Commands ---

#[tauri::command]
pub async fn start_http_server(
    server: State<'_, HttpServerManager>,
    port: u16,
) -> Result<u16, AppError> {
    server.start(port).await
}

#[tauri::command]
pub async fn stop_http_server(server: State<'_, HttpServerManager>) -> Result<(), AppError> {
    server.stop().await
}

#[tauri::command]
pub async fn is_http_server_running(
    server: State<'_, HttpServerManager>,
) -> Result<bool, AppError> {
    Ok(server.is_running().await)
}

#[tauri::command]
pub async fn get_http_server_port(server: State<'_, HttpServerManager>) -> Result<u16, AppError> {
    Ok(server.get_port().await)
}

#[tauri::command]
pub async fn get_local_ip_address(
    server: State<'_, HttpServerManager>,
) -> Result<Option<String>, AppError> {
    Ok(server.get_local_ip())
}

// --- HTTP Received Messages ---

#[tauri::command]
pub async fn list_http_received_messages(
    handler: State<'_, McpQueryHandler>,
    limit: Option<i64>,
) -> Result<Vec<HttpReceivedMessage>, AppError> {
    handler.handle(ListHttpReceivedMessagesQuery { limit }).await
}

#[tauri::command]
pub async fn delete_http_received_message(
    handler: State<'_, McpCommandHandler>,
    id: String,
) -> Result<(), AppError> {
    handler.handle(DeleteHttpReceivedMessageCmd { id }).await
}
