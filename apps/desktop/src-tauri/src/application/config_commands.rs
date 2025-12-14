//! Config command handlers - handles all write operations for config.

use crate::domain::config::{IConfigRepository, SetConfigCmd};
use crate::domain::cqrs::CommandHandler;
use crate::domain::events::{DomainEvent, IEventPublisher};
use crate::error::AppError;
use async_trait::async_trait;
use std::sync::Arc;

/// Handles config-related commands (write operations).
pub struct ConfigCommandHandler {
    repo: Arc<dyn IConfigRepository>,
    publisher: Arc<dyn IEventPublisher>,
}

impl ConfigCommandHandler {
    pub fn new(repo: Arc<dyn IConfigRepository>, publisher: Arc<dyn IEventPublisher>) -> Self {
        Self { repo, publisher }
    }
}

#[async_trait]
impl CommandHandler<SetConfigCmd, ()> for ConfigCommandHandler {
    async fn handle(&self, cmd: SetConfigCmd) -> Result<(), AppError> {
        self.repo.set(&cmd.key, &cmd.value).await?;

        // Publish domain event
        self.publisher.publish(DomainEvent::ConfigChanged { key: cmd.key, value: cmd.value });

        Ok(())
    }
}
