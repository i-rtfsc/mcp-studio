//! MCP Query Handlers - handles all read operations for MCP servers.

use async_trait::async_trait;
use std::sync::Arc;

use crate::domain::cqrs::QueryHandler;
use crate::domain::mcp::{
    GetMcpCallHistoryQuery, GetMcpServerQuery, GetMcpToolsQuery, HttpReceivedMessage,
    IHttpReceivedMessageRepository, IMcpCallHistoryRepository, IMcpServerRepository,
    ListHttpReceivedMessagesQuery, ListMcpServersQuery, McpCallHistory, McpServer, McpServerStatus,
    McpTool,
};
use crate::error::AppError;
use crate::infra::mcp_client::McpClientManager;
use uuid::Uuid;

/// Handles MCP server-related queries (read operations).
pub struct McpQueryHandler {
    server_repo: Arc<dyn IMcpServerRepository>,
    history_repo: Arc<dyn IMcpCallHistoryRepository>,
    message_repo: Arc<dyn IHttpReceivedMessageRepository>,
    client_manager: Arc<McpClientManager>,
}

impl McpQueryHandler {
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
impl QueryHandler<ListMcpServersQuery, Vec<McpServer>> for McpQueryHandler {
    async fn handle(&self, _query: ListMcpServersQuery) -> Result<Vec<McpServer>, AppError> {
        let mut servers = self.server_repo.list().await?;

        // Update runtime connection status from McpClientManager
        for server in &mut servers {
            server.status = if self.client_manager.is_connected(&server.id).await {
                McpServerStatus::Connected
            } else {
                McpServerStatus::Disconnected
            };
        }

        Ok(servers)
    }
}

#[async_trait]
impl QueryHandler<GetMcpServerQuery, Option<McpServer>> for McpQueryHandler {
    async fn handle(&self, query: GetMcpServerQuery) -> Result<Option<McpServer>, AppError> {
        let mut server_opt = self.server_repo.find_by_id(&query.id).await?;

        // Update runtime connection status from McpClientManager
        if let Some(ref mut server) = server_opt {
            server.status = if self.client_manager.is_connected(&server.id).await {
                McpServerStatus::Connected
            } else {
                McpServerStatus::Disconnected
            };
        }

        Ok(server_opt)
    }
}

#[async_trait]
impl QueryHandler<GetMcpToolsQuery, Vec<McpTool>> for McpQueryHandler {
    async fn handle(&self, query: GetMcpToolsQuery) -> Result<Vec<McpTool>, AppError> {
        // Get tools from memory cache
        let cached_tools = self.client_manager.get_cached_tools(&query.server_id).await;

        match cached_tools {
            Some(tools) => {
                // Convert to domain tools
                Ok(tools
                    .iter()
                    .map(|t| McpTool {
                        id: Uuid::new_v4().to_string(),
                        server_id: query.server_id.clone(),
                        name: t.name.clone(),
                        description: t.description.clone(),
                        input_schema: t.input_schema.clone(),
                        output_schema: t.output_schema.clone(),
                        extra: t.extra.clone(),
                        created_at: String::new(),
                    })
                    .collect())
            }
            None => Ok(Vec::new()),
        }
    }
}

#[async_trait]
impl QueryHandler<GetMcpCallHistoryQuery, Vec<McpCallHistory>> for McpQueryHandler {
    async fn handle(&self, query: GetMcpCallHistoryQuery) -> Result<Vec<McpCallHistory>, AppError> {
        self.history_repo.list(query.server_id.as_deref(), query.limit).await
    }
}

#[async_trait]
impl QueryHandler<ListHttpReceivedMessagesQuery, Vec<HttpReceivedMessage>> for McpQueryHandler {
    async fn handle(
        &self,
        query: ListHttpReceivedMessagesQuery,
    ) -> Result<Vec<HttpReceivedMessage>, AppError> {
        self.message_repo.list(query.limit).await
    }
}
