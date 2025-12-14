// CQRS Handlers
pub mod config_commands;
pub mod config_queries;
pub mod mcp_commands;
pub mod mcp_queries;

// Re-exports for convenience
pub use config_commands::ConfigCommandHandler;
pub use config_queries::ConfigQueryHandler;
pub use mcp_commands::McpCommandHandler;
pub use mcp_queries::McpQueryHandler;
