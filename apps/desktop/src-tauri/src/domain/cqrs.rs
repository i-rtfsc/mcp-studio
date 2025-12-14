//! CQRS (Command Query Responsibility Segregation) core abstractions.
//!
//! This module provides the foundational traits for implementing CQRS pattern:
//! - `Command` - Marker trait for write operations
//! - `Query` - Marker trait for read operations
//! - `CommandHandler` - Handles commands and produces side effects
//! - `QueryHandler` - Handles queries and returns data

use crate::error::AppError;
use async_trait::async_trait;

/// Marker trait for commands (write operations).
/// Commands represent intentions to change the system state.
pub trait Command: Send + Sync {}

/// Marker trait for queries (read operations).
/// Queries represent requests for data without side effects.
pub trait Query: Send + Sync {}

/// Handler for processing commands.
///
/// Type parameters:
/// - `C`: The command type to handle
/// - `R`: The result type (defaults to `()` for commands with no return value)
#[async_trait]
pub trait CommandHandler<C: Command, R = ()>: Send + Sync {
    /// Process the command and return the result.
    async fn handle(&self, cmd: C) -> Result<R, AppError>;
}

/// Handler for processing queries.
///
/// Type parameters:
/// - `Q`: The query type to handle
/// - `R`: The result type
#[async_trait]
pub trait QueryHandler<Q: Query, R>: Send + Sync {
    /// Process the query and return the result.
    async fn handle(&self, query: Q) -> Result<R, AppError>;
}
