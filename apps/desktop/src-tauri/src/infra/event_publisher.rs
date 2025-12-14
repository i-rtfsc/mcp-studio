use crate::domain::events::{DomainEvent, IEventPublisher};
use async_trait::async_trait;
use tauri::{AppHandle, Emitter, Runtime};

pub struct TauriEventPublisher<R: Runtime> {
    app_handle: AppHandle<R>,
}

impl<R: Runtime> TauriEventPublisher<R> {
    pub fn new(app_handle: AppHandle<R>) -> Self {
        Self { app_handle }
    }
}

impl<R: Runtime> IEventPublisher for TauriEventPublisher<R> {
    fn publish(&self, event: DomainEvent) {
        // We emit to all windows (broadcast)
        // The event name is derived from the event itself
        let event_name = event.name();

        // Log emission for debugging
        tracing::debug!(target: "backend", event = event_name, "Publishing event");

        if let Err(e) = self.app_handle.emit(event_name, &event) {
            tracing::error!(target: "backend", "Failed to emit event {}: {:?}", event_name, e);
        }
    }
}

/// Generic event publisher for custom events (used by MCP client)
#[async_trait]
pub trait EventPublisher: Send + Sync {
    async fn publish(&self, event_name: &str, data: serde_json::Value);
}

/// Tauri-based implementation of generic EventPublisher
pub struct TauriGenericEventPublisher<R: Runtime> {
    app_handle: AppHandle<R>,
}

impl<R: Runtime> TauriGenericEventPublisher<R> {
    pub fn new(app_handle: AppHandle<R>) -> Self {
        Self { app_handle }
    }
}

#[async_trait]
impl<R: Runtime> EventPublisher for TauriGenericEventPublisher<R> {
    async fn publish(&self, event_name: &str, data: serde_json::Value) {
        tracing::debug!(target: "backend", event = event_name, "Publishing generic event");

        if let Err(e) = self.app_handle.emit(event_name, &data) {
            tracing::error!(target: "backend", "Failed to emit event {}: {:?}", event_name, e);
        }
    }
}
