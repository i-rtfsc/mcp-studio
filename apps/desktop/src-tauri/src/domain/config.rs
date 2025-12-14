use crate::domain::cqrs::{Command, Query};
use crate::error::AppError;
use async_trait::async_trait;
use serde::Deserialize;

pub struct SystemSetting {
    pub key: String,
    pub value: String,
}

// ============ Commands ============

/// Command to set a configuration value
#[derive(Debug, Deserialize)]
pub struct SetConfigCmd {
    pub key: String,
    pub value: String,
}

impl Command for SetConfigCmd {}

// ============ Queries ============

/// Query to get a single config value by key
#[derive(Debug)]
pub struct GetConfigQuery {
    pub key: String,
}

impl Query for GetConfigQuery {}

/// Query to get all config values
#[derive(Debug)]
pub struct GetAllConfigQuery;

impl Query for GetAllConfigQuery {}

// ============ Repository ============

#[async_trait]
pub trait IConfigRepository: Send + Sync {
    async fn get(&self, key: &str) -> Result<Option<String>, AppError>;
    async fn set(&self, key: &str, value: &str) -> Result<(), AppError>;
    async fn get_all(&self) -> Result<std::collections::HashMap<String, String>, AppError>;
}
