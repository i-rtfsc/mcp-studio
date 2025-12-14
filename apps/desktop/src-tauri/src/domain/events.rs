use async_trait::async_trait;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "event", content = "payload")] // { "event": "ConfigChanged", "payload": { ... } }
pub enum DomainEvent {
    ConfigChanged { key: String, value: String },
    // Future events:
    // DownloadProgress { id: String, progress: u32 },
    // UserLoggedIn { user_id: String },
}

impl DomainEvent {
    /// Returns the channel name for Tauri (e.g., "app://event")
    pub fn name(&self) -> &'static str {
        match self {
            DomainEvent::ConfigChanged { .. } => "config:changed",
        }
    }
}

#[async_trait]
pub trait IEventPublisher: Send + Sync {
    fn publish(&self, event: DomainEvent);
}
