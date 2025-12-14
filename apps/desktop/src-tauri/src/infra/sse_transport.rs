//! Custom SSE Transport for MCP (Model Context Protocol)
//!
//! This implements the deprecated HTTP+SSE transport for backward compatibility
//! with older MCP servers that use /sse endpoints.

use eventsource_stream::Eventsource;
use futures::StreamExt;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tokio::sync::Mutex;
use tracing::{debug, error, info};

use rmcp::transport::worker::{
    Worker, WorkerContext, WorkerQuitReason, WorkerSendRequest, WorkerTransport,
};
use rmcp::RoleClient;
use serde_json::Value;

type DisconnectCallback = Arc<dyn Fn(String) + Send + Sync + 'static>;

#[derive(Debug, thiserror::Error)]
pub enum SseTransportError {
    #[error("Connection error: {0}")]
    Connection(String),
    #[error("Channel closed")]
    Closed,
    #[error("Join error: {0}")]
    Join(String),
}

pub struct SseWorker {
    url: String,
    base_url: String, // Base URL for constructing full endpoint URLs
    client: reqwest::Client,
    server_id: String,
    disconnect_callback: Option<DisconnectCallback>,
    disconnect_notified: AtomicBool,
}

impl SseWorker {
    pub fn new(
        url: impl Into<String>,
        server_id: impl Into<String>,
        disconnect_callback: Option<DisconnectCallback>,
    ) -> Self {
        let client =
            reqwest::Client::builder().no_proxy().build().expect("Failed to create HTTP client");

        let url_string = url.into();
        let server_id = server_id.into();

        // Extract base URL (scheme + host + port)
        let base_url = if let Ok(parsed) = reqwest::Url::parse(&url_string) {
            format!("{}://{}", parsed.scheme(), parsed.host_str().unwrap_or("localhost"))
                + &parsed.port().map(|p| format!(":{}", p)).unwrap_or_default()
        } else {
            url_string.clone()
        };

        Self {
            url: url_string,
            base_url,
            client,
            server_id,
            disconnect_callback,
            disconnect_notified: AtomicBool::new(false),
        }
    }

    fn notify_disconnect(&self, reason: &str) {
        if self.disconnect_notified.swap(true, Ordering::SeqCst) {
            return;
        }

        info!(target: "sse_transport", server_id = %self.server_id, reason = reason, "Notifying disconnect");

        if let Some(callback) = &self.disconnect_callback {
            callback(reason.to_string());
        }
    }
}

impl Worker for SseWorker {
    type Error = SseTransportError;
    type Role = RoleClient;

    fn err_closed() -> Self::Error {
        SseTransportError::Closed
    }

    fn err_join(e: tokio::task::JoinError) -> Self::Error {
        SseTransportError::Join(e.to_string())
    }

    async fn run(
        self,
        mut context: WorkerContext<Self>,
    ) -> Result<(), WorkerQuitReason<Self::Error>> {
        info!(target: "sse_transport", "Connecting to SSE endpoint: {}", self.url);

        // Start SSE connection
        let response =
            self.client.get(&self.url).header("Accept", "text/event-stream").send().await.map_err(
                |e| {
                    WorkerQuitReason::fatal(
                        SseTransportError::Connection(format!("Failed to connect: {}", e)),
                        "connecting to SSE endpoint",
                    )
                },
            )?;

        if !response.status().is_success() {
            self.notify_disconnect("sse_initial_response_error");
            return Err(WorkerQuitReason::fatal(
                SseTransportError::Connection(format!("Server error: {}", response.status())),
                "checking SSE response status",
            ));
        }

        let sse_stream = response.bytes_stream().eventsource();
        tokio::pin!(sse_stream);

        let post_url = Arc::new(Mutex::new(None::<String>));
        let ct = context.cancellation_token.clone();

        // PHASE 1: Wait for endpoint event before accepting messages
        info!(target: "sse_transport", "Waiting for endpoint event...");
        loop {
            tokio::select! {
                event = sse_stream.next() => {
                    match event {
                        Some(Ok(event)) => {
                            debug!(target: "sse_transport", "Received SSE event: {}", event.event);

                            if event.event.as_str() == "endpoint" {
                                let endpoint = event.data.trim().to_string();
                                info!(target: "sse_transport", "Received endpoint: {}", endpoint);

                                // Construct full URL if endpoint is relative
                                let full_url = if endpoint.starts_with("http://") || endpoint.starts_with("https://") {
                                    endpoint
                                } else {
                                    format!("{}{}", self.base_url, endpoint)
                                };

                                info!(target: "sse_transport", "Full POST URL: {}", full_url);
                                let mut url = post_url.lock().await;
                                *url = Some(full_url);
                                break; // Exit phase 1, proceed to phase 2
                            }
                        }
                        Some(Err(e)) => {
                            self.notify_disconnect("sse_stream_error_before_endpoint");
                            return Err(WorkerQuitReason::fatal(
                                SseTransportError::Connection(format!("SSE error while waiting for endpoint: {:?}", e)),
                                "waiting for endpoint"
                            ));
                        }
                        None => {
                            self.notify_disconnect("sse_stream_closed_before_endpoint");
                            return Err(WorkerQuitReason::fatal(
                                SseTransportError::Connection("SSE stream closed before receiving endpoint".to_string()),
                                "waiting for endpoint"
                            ));
                        }
                    }
                }

                _ = ct.cancelled() => {
                    info!(target: "sse_transport", "SSE transport cancelled during initialization");
                    return Err(WorkerQuitReason::Cancelled);
                }
            }
        }

        info!(target: "sse_transport", "Endpoint received, ready to handle messages");

        // PHASE 2: Normal operation - handle messages and SSE events
        loop {
            tokio::select! {
                // Handle outgoing messages from MCP client
                request = context.recv_from_handler() => {
                    let WorkerSendRequest { message, responder } = request?;

                    debug!(target: "sse_transport", "Sending message: {:?}", message);

                    // Serialize the JSON-RPC message
                    let json_value = serde_json::to_value(&message)
                        .map_err(|e| WorkerQuitReason::fatal(
                            SseTransportError::Connection(format!("Failed to serialize: {}", e)),
                            "serializing message"
                        ))?;

                    // Get POST endpoint (should always be Some in Phase 2)
                    let endpoint = {
                        let url_guard = post_url.lock().await;
                        url_guard.clone().expect("Endpoint must be available in Phase 2")
                    };

                    // Send POST request
                    let result = self.client
                        .post(&endpoint)
                        .header("Content-Type", "application/json")
                        .json(&json_value)
                        .send()
                        .await;

                    let send_result = match result {
                        Ok(response) if response.status().is_success() => Ok(()),
                        Ok(response) => Err(SseTransportError::Connection(
                            format!("POST failed: {}", response.status())
                        )),
                        Err(e) => Err(SseTransportError::Connection(
                            format!("POST error: {}", e)
                        )),
                    };

                    if let Err(err) = send_result {
                        error!(target: "sse_transport", "POST to MCP server failed: {}", err);
                        self.notify_disconnect("post_send_error");
                        let _ = responder.send(Err(err));
                        return Err(WorkerQuitReason::fatal(
                            SseTransportError::Connection("POST request failed, terminating transport".to_string()),
                            "sending POST request"
                        ));
                    }

                    let _ = responder.send(Ok(()));
                }

                // Handle incoming SSE events
                event = sse_stream.next() => {
                    match event {
                        Some(Ok(event)) => {
                            debug!(target: "sse_transport", "Received SSE event: {}", event.event);

                            match event.event.as_str() {
                                "endpoint" => {
                                    let endpoint = event.data.trim().to_string();
                                    info!(target: "sse_transport", "Received endpoint: {}", endpoint);
                                    let mut url = post_url.lock().await;
                                    *url = Some(endpoint);
                                }
                                "message" => {
                                    match serde_json::from_str::<Value>(&event.data) {
                                        Ok(json_value) => {
                                            // Try to deserialize to JSON-RPC message
                                            match serde_json::from_value(json_value.clone()) {
                                                Ok(jsonrpc_msg) => {
                                                    context.send_to_handler(jsonrpc_msg).await?;
                                                }
                                                Err(e) => {
                                                    error!(target: "sse_transport", "Failed to parse JSON-RPC: {}", e);
                                                }
                                            }
                                        }
                                        Err(e) => {
                                            error!(target: "sse_transport", "Failed to parse JSON: {}", e);
                                        }
                                    }
                                }
                                _ => {
                                    debug!(target: "sse_transport", "Unknown event type: {}", event.event);
                                }
                            }
                        }
                        Some(Err(e)) => {
                            error!(target: "sse_transport", "SSE stream error: {:?}", e);
                            self.notify_disconnect("sse_stream_error");
                            return Err(WorkerQuitReason::fatal(
                                SseTransportError::Connection(format!("SSE stream error: {:?}", e)),
                                "receiving SSE event"
                            ));
                        }
                        None => {
                            info!(target: "sse_transport", "SSE stream closed by server");
                            self.notify_disconnect("sse_stream_closed");
                            return Err(WorkerQuitReason::TransportClosed);
                        }
                    }
                }

                // Handle cancellation
                _ = ct.cancelled() => {
                    info!(target: "sse_transport", "SSE transport cancelled");
                    return Err(WorkerQuitReason::Cancelled);
                }
            }
        }
    }
}

pub type SseTransport = WorkerTransport<SseWorker>;
