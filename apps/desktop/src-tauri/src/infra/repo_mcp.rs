//! SQLite Repository implementations for MCP entities.

use async_trait::async_trait;
use sqlx::SqlitePool;

use crate::domain::mcp::{
    HttpReceivedMessage, IHttpReceivedMessageRepository, IMcpCallHistoryRepository,
    IMcpServerRepository, McpCallHistory, McpServer, McpServerStatus,
};
use crate::error::AppError;

// ============ MCP Server Repository ============

pub struct SqliteMcpServerRepository {
    pool: SqlitePool,
}

impl SqliteMcpServerRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl IMcpServerRepository for SqliteMcpServerRepository {
    async fn create(&self, server: McpServer) -> Result<McpServer, AppError> {
        sqlx::query(
            r#"INSERT INTO mcp_servers (id, name, url, server_type, created_at, updated_at)
               VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"#,
        )
        .bind(&server.id)
        .bind(&server.name)
        .bind(&server.url)
        .bind(server.server_type.to_string())
        .execute(&self.pool)
        .await?;

        self.find_by_id(&server.id)
            .await?
            .ok_or_else(|| AppError::Database("Failed to create server".to_string()))
    }

    async fn update(&self, server: McpServer) -> Result<McpServer, AppError> {
        let result = sqlx::query(
            r#"UPDATE mcp_servers
               SET name = ?, url = ?, server_type = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?"#,
        )
        .bind(&server.name)
        .bind(&server.url)
        .bind(server.server_type.to_string())
        .bind(&server.id)
        .execute(&self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound(format!("MCP server {} not found", server.id)));
        }

        self.find_by_id(&server.id)
            .await?
            .ok_or_else(|| AppError::Database("Failed to update server".to_string()))
    }

    async fn delete(&self, id: &str) -> Result<(), AppError> {
        let result = sqlx::query("DELETE FROM mcp_servers WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound(format!("MCP server {} not found", id)));
        }
        Ok(())
    }

    async fn find_by_id(&self, id: &str) -> Result<Option<McpServer>, AppError> {
        let row = sqlx::query_as::<_, McpServerRow>(
            "SELECT id, name, url, server_type, created_at, updated_at FROM mcp_servers WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    async fn list(&self) -> Result<Vec<McpServer>, AppError> {
        let rows = sqlx::query_as::<_, McpServerRow>(
            "SELECT id, name, url, server_type, created_at, updated_at FROM mcp_servers ORDER BY created_at DESC"
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }
}

#[derive(sqlx::FromRow)]
struct McpServerRow {
    id: String,
    name: String,
    url: String,
    server_type: String,
    created_at: String,
    updated_at: String,
}

impl From<McpServerRow> for McpServer {
    fn from(row: McpServerRow) -> Self {
        McpServer {
            id: row.id,
            name: row.name,
            url: row.url,
            server_type: row.server_type.into(),
            status: McpServerStatus::Disconnected, // Default to disconnected
            last_error: None,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

// MCP Tool Repository removed - tools are now cached in memory by McpClientManager
// Tools are retrieved via tools/list RPC call and should listen to ToolsListChanged notifications

// ============ MCP Call History Repository ============

pub struct SqliteMcpCallHistoryRepository {
    pool: SqlitePool,
}

impl SqliteMcpCallHistoryRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl IMcpCallHistoryRepository for SqliteMcpCallHistoryRepository {
    async fn create(&self, history: McpCallHistory) -> Result<McpCallHistory, AppError> {
        sqlx::query(
            r#"INSERT INTO mcp_call_history (id, server_id, tool_name, input_params, output_result, status, error_message, duration_ms, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"#
        )
        .bind(&history.id)
        .bind(&history.server_id)
        .bind(&history.tool_name)
        .bind(&history.input_params)
        .bind(&history.output_result)
        .bind(&history.status)
        .bind(&history.error_message)
        .bind(history.duration_ms)
        .execute(&self.pool)
        .await?;

        Ok(history)
    }

    async fn list(
        &self,
        server_id: Option<&str>,
        limit: Option<i64>,
    ) -> Result<Vec<McpCallHistory>, AppError> {
        let limit = limit.unwrap_or(100);

        let rows = if let Some(sid) = server_id {
            sqlx::query_as::<_, McpCallHistoryRow>(
                r#"SELECT id, server_id, tool_name, input_params, output_result, status, error_message, duration_ms, created_at
                   FROM mcp_call_history WHERE server_id = ? ORDER BY created_at DESC LIMIT ?"#
            )
            .bind(sid)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query_as::<_, McpCallHistoryRow>(
                r#"SELECT id, server_id, tool_name, input_params, output_result, status, error_message, duration_ms, created_at
                   FROM mcp_call_history ORDER BY created_at DESC LIMIT ?"#
            )
            .bind(limit)
            .fetch_all(&self.pool)
            .await?
        };

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    async fn clear(&self, server_id: Option<&str>) -> Result<(), AppError> {
        if let Some(sid) = server_id {
            sqlx::query("DELETE FROM mcp_call_history WHERE server_id = ?")
                .bind(sid)
                .execute(&self.pool)
                .await?;
        } else {
            sqlx::query("DELETE FROM mcp_call_history").execute(&self.pool).await?;
        }
        Ok(())
    }
}

#[derive(sqlx::FromRow)]
struct McpCallHistoryRow {
    id: String,
    server_id: String,
    tool_name: String,
    input_params: Option<String>,
    output_result: Option<String>,
    status: String,
    error_message: Option<String>,
    duration_ms: Option<i64>,
    created_at: String,
}

impl From<McpCallHistoryRow> for McpCallHistory {
    fn from(row: McpCallHistoryRow) -> Self {
        McpCallHistory {
            id: row.id,
            server_id: row.server_id,
            tool_name: row.tool_name,
            input_params: row.input_params,
            output_result: row.output_result,
            status: row.status,
            error_message: row.error_message,
            duration_ms: row.duration_ms,
            created_at: row.created_at,
        }
    }
}

// ============ HTTP Received Message Repository ============

pub struct SqliteHttpReceivedMessageRepository {
    pool: SqlitePool,
}

impl SqliteHttpReceivedMessageRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl IHttpReceivedMessageRepository for SqliteHttpReceivedMessageRepository {
    async fn create(&self, message: HttpReceivedMessage) -> Result<HttpReceivedMessage, AppError> {
        sqlx::query(
            r#"INSERT INTO http_received_messages (id, request_id, content_type, file_name, file_path, file_size, raw_data, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"#
        )
        .bind(&message.id)
        .bind(&message.request_id)
        .bind(&message.content_type)
        .bind(&message.file_name)
        .bind(&message.file_path)
        .bind(message.file_size)
        .bind(&message.raw_data)
        .execute(&self.pool)
        .await?;

        Ok(message)
    }

    async fn list(&self, limit: Option<i64>) -> Result<Vec<HttpReceivedMessage>, AppError> {
        let limit = limit.unwrap_or(100);

        let rows = sqlx::query_as::<_, HttpReceivedMessageRow>(
            r#"SELECT id, request_id, content_type, file_name, file_path, file_size, raw_data, created_at
               FROM http_received_messages ORDER BY created_at DESC LIMIT ?"#
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    async fn delete(&self, id: &str) -> Result<(), AppError> {
        let result = sqlx::query("DELETE FROM http_received_messages WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound(format!("Message {} not found", id)));
        }
        Ok(())
    }

    async fn clear(&self) -> Result<(), AppError> {
        sqlx::query("DELETE FROM http_received_messages").execute(&self.pool).await?;
        Ok(())
    }
}

#[derive(sqlx::FromRow)]
struct HttpReceivedMessageRow {
    id: String,
    request_id: String,
    content_type: Option<String>,
    file_name: Option<String>,
    file_path: Option<String>,
    file_size: Option<i64>,
    raw_data: Option<String>,
    created_at: String,
}

impl From<HttpReceivedMessageRow> for HttpReceivedMessage {
    fn from(row: HttpReceivedMessageRow) -> Self {
        HttpReceivedMessage {
            id: row.id,
            request_id: row.request_id,
            content_type: row.content_type,
            file_name: row.file_name,
            file_path: row.file_path,
            file_size: row.file_size,
            raw_data: row.raw_data,
            created_at: row.created_at,
        }
    }
}
