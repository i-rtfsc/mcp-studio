//! HTTP Server for receiving multipart/form-data requests.
//!
//! This module provides an embedded HTTP server that:
//! - Listens on a configurable port
//! - Accepts POST requests with multipart/form-data
//! - Extracts requestId and file data
//! - Saves files and notifies the application

use axum::{
    body::Body,
    extract::{FromRequest, Json as ExtractJson, Multipart, State},
    http::{header::CONTENT_TYPE, Request, StatusCode},
    response::Json,
    routing::post,
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use tracing::{debug, error, info};
use uuid::Uuid;

use crate::error::AppError;

/// HTTP Server configuration
#[derive(Debug, Clone)]
pub struct HttpServerConfig {
    pub port: u16,
    pub storage_path: PathBuf,
}

impl Default for HttpServerConfig {
    fn default() -> Self {
        Self { port: 9527, storage_path: PathBuf::from("./received_files") }
    }
}

/// Received message info (returned to client and stored)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceivedMessageInfo {
    pub id: String,
    pub request_id: String,
    pub content_type: Option<String>,
    pub file_name: Option<String>,
    pub file_path: Option<String>,
    pub file_size: Option<i64>,
    pub raw_data: Option<String>,
}

/// Callback for handling received messages
pub type MessageCallback = Arc<dyn Fn(ReceivedMessageInfo) + Send + Sync>;

/// HTTP Server state
struct ServerState {
    config: HttpServerConfig,
    callback: Option<MessageCallback>,
}

/// HTTP Server manager
pub struct HttpServerManager {
    state: RwLock<Option<ServerHandle>>,
    config: RwLock<HttpServerConfig>,
    callback: RwLock<Option<MessageCallback>>,
}

struct ServerHandle {
    shutdown_tx: tokio::sync::oneshot::Sender<()>,
}

impl HttpServerManager {
    pub fn new() -> Self {
        Self {
            state: RwLock::new(None),
            config: RwLock::new(HttpServerConfig::default()),
            callback: RwLock::new(None),
        }
    }

    /// Set the storage path for received files
    pub async fn set_storage_path(&self, path: PathBuf) {
        let mut config = self.config.write().await;
        config.storage_path = path;
    }

    /// Set the callback for received messages
    pub async fn set_callback(&self, callback: MessageCallback) {
        let mut cb = self.callback.write().await;
        *cb = Some(callback);
    }

    /// Start the HTTP server
    pub async fn start(&self, port: u16) -> Result<u16, AppError> {
        // Check if already running
        {
            let state = self.state.read().await;
            if state.is_some() {
                return Err(AppError::Domain("HTTP server is already running".to_string()));
            }
        }

        // Update port in config
        {
            let mut config = self.config.write().await;
            config.port = port;
        }

        let config = self.config.read().await.clone();
        let callback = self.callback.read().await.clone();

        // Ensure storage directory exists
        if let Err(e) = fs::create_dir_all(&config.storage_path).await {
            error!(target: "http_server", "Failed to create storage directory: {}", e);
            return Err(AppError::Io(format!("Failed to create storage directory: {}", e)));
        }

        // Create shared state
        let state = Arc::new(ServerState { config: config.clone(), callback });

        // Build router
        let app = Router::new()
            .route("/webhook/agent", post(handle_receive))
            .route("/health", axum::routing::get(health_check))
            .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any))
            .with_state(state);

        // Create shutdown channel
        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

        // Start server
        let addr = format!("0.0.0.0:{}", port);
        let listener = tokio::net::TcpListener::bind(&addr).await.map_err(|e| {
            error!(target: "http_server", "Failed to bind to {}: {}", addr, e);
            AppError::Io(format!("Failed to bind to {}: {}", addr, e))
        })?;

        let actual_port = listener.local_addr().map(|a| a.port()).unwrap_or(port);

        info!(target: "http_server", "Starting HTTP server on port {}", actual_port);

        // Spawn server task
        tokio::spawn(async move {
            let server = axum::serve(listener, app).with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            });

            if let Err(e) = server.await {
                error!(target: "http_server", "HTTP server error: {}", e);
            }
            info!(target: "http_server", "HTTP server stopped");
        });

        // Store handle
        {
            let mut state = self.state.write().await;
            *state = Some(ServerHandle { shutdown_tx });
        }

        Ok(actual_port)
    }

    /// Stop the HTTP server
    pub async fn stop(&self) -> Result<(), AppError> {
        let mut state = self.state.write().await;
        if let Some(handle) = state.take() {
            info!(target: "http_server", "Stopping HTTP server");
            let _ = handle.shutdown_tx.send(());
            Ok(())
        } else {
            Err(AppError::Domain("HTTP server is not running".to_string()))
        }
    }

    /// Check if server is running
    pub async fn is_running(&self) -> bool {
        let state = self.state.read().await;
        state.is_some()
    }

    /// Get current port
    pub async fn get_port(&self) -> u16 {
        let config = self.config.read().await;
        config.port
    }

    /// Get local IP address
    pub fn get_local_ip(&self) -> Option<String> {
        use std::net::{IpAddr, UdpSocket};

        // Try to get local IP by connecting to a public DNS (doesn't actually send data)
        let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
        socket.connect("8.8.8.8:80").ok()?;
        let addr = socket.local_addr().ok()?;

        match addr.ip() {
            IpAddr::V4(ip) => Some(ip.to_string()),
            IpAddr::V6(ip) => Some(ip.to_string()),
        }
    }
}

impl Default for HttpServerManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Health check endpoint
async fn health_check() -> &'static str {
    "OK"
}

/// Response for receive endpoint
#[derive(Serialize)]
struct ReceiveResponse {
    success: bool,
    message: String,
    data: Option<ReceivedMessageInfo>,
}

/// Handle multipart/form-data POST request
async fn handle_receive(
    State(state): State<Arc<ServerState>>,
    req: Request<Body>,
) -> Result<Json<ReceiveResponse>, (StatusCode, Json<ReceiveResponse>)> {
    let content_type =
        req.headers().get(CONTENT_TYPE).and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let normalized = content_type.to_ascii_lowercase();

    if normalized.starts_with("application/json") || normalized.starts_with("text/json") {
        handle_json_payload(state, content_type, req).await
    } else if normalized.starts_with("multipart/form-data") {
        handle_multipart_payload(state, req).await
    } else {
        Err((
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            Json(ReceiveResponse {
                success: false,
                message: format!(
                    "Unsupported Content-Type: {}",
                    if content_type.is_empty() { "unknown" } else { &content_type }
                ),
                data: None,
            }),
        ))
    }
}

async fn handle_multipart_payload(
    state: Arc<ServerState>,
    req: Request<Body>,
) -> Result<Json<ReceiveResponse>, (StatusCode, Json<ReceiveResponse>)> {
    info!(target: "http_server", "Received multipart request");

    match Multipart::from_request(req, &state).await {
        Ok(multipart) => process_multipart(state, multipart).await,
        Err(e) => {
            error!(target: "http_server", "Failed to parse multipart body: {}", e);
            Err((
                StatusCode::BAD_REQUEST,
                Json(ReceiveResponse {
                    success: false,
                    message: format!("Failed to parse multipart data: {}", e),
                    data: None,
                }),
            ))
        }
    }
}

async fn process_multipart(
    state: Arc<ServerState>,
    mut multipart: Multipart,
) -> Result<Json<ReceiveResponse>, (StatusCode, Json<ReceiveResponse>)> {
    let mut request_id: Option<String> = None;
    let mut file_info: Option<ReceivedMessageInfo> = None;

    loop {
        match multipart.next_field().await {
            Ok(Some(field)) => {
                let name = field.name().unwrap_or("").to_string();
                let file_name = field.file_name().map(|s| s.to_string());
                let content_type = field.content_type().map(|s| s.to_string());

                debug!(target: "http_server", "Processing field: name={}, file_name={:?}, content_type={:?}",
                       name, file_name, content_type);

                if name == "requestId" {
                    if let Ok(data) = field.text().await {
                        request_id = Some(data);
                        debug!(target: "http_server", "Got requestId: {:?}", request_id);
                    }
                } else {
                    match field.bytes().await {
                        Ok(data) => {
                            let id = Uuid::new_v4().to_string();
                            let file_size = data.len() as i64;

                            let extension = file_name
                                .as_ref()
                                .and_then(|n| n.rsplit('.').next())
                                .unwrap_or("bin");
                            let save_name =
                                format!("{}_{}.{}", chrono_lite_timestamp(), &id[..8], extension);
                            let file_path = state.config.storage_path.join(&save_name);

                            if let Err(e) = fs::write(&file_path, &data).await {
                                error!(target: "http_server", "Failed to save file: {}", e);
                                return Err((
                                    StatusCode::INTERNAL_SERVER_ERROR,
                                    Json(ReceiveResponse {
                                        success: false,
                                        message: format!("Failed to save file: {}", e),
                                        data: None,
                                    }),
                                ));
                            }

                            info!(target: "http_server", "Saved file: {:?} ({} bytes)", file_path, file_size);

                            file_info = Some(ReceivedMessageInfo {
                                id,
                                request_id: request_id.clone().unwrap_or_default(),
                                content_type,
                                file_name,
                                file_path: Some(file_path.to_string_lossy().to_string()),
                                file_size: Some(file_size),
                                raw_data: None,
                            });
                        }
                        Err(e) => {
                            error!(target: "http_server", "Failed to read field data: {}", e);
                        }
                    }
                }
            }
            Ok(None) => {
                break;
            }
            Err(e) => {
                error!(target: "http_server", "Error reading multipart field: {}", e);
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(ReceiveResponse {
                        success: false,
                        message: format!("Error reading multipart data: {}", e),
                        data: None,
                    }),
                ));
            }
        }
    }

    if let (Some(rid), Some(ref mut info)) = (&request_id, &mut file_info) {
        if info.request_id.is_empty() {
            info.request_id = rid.clone();
        }
    }

    if file_info.is_none() && request_id.is_some() {
        file_info = Some(ReceivedMessageInfo {
            id: Uuid::new_v4().to_string(),
            request_id: request_id.clone().unwrap_or_default(),
            content_type: Some("text/plain".to_string()),
            file_name: None,
            file_path: None,
            file_size: None,
            raw_data: None,
        });
    }

    match file_info {
        Some(info) => respond_with_message(state, info),
        None => Err((
            StatusCode::BAD_REQUEST,
            Json(ReceiveResponse {
                success: false,
                message: "No valid data received".to_string(),
                data: None,
            }),
        )),
    }
}

async fn handle_json_payload(
    state: Arc<ServerState>,
    content_type: String,
    req: Request<Body>,
) -> Result<Json<ReceiveResponse>, (StatusCode, Json<ReceiveResponse>)> {
    info!(target: "http_server", "Received JSON webhook payload");

    match ExtractJson::<Value>::from_request(req, &state).await {
        Ok(ExtractJson(payload)) => {
            let request_id =
                extract_request_id(&payload).unwrap_or_else(|| Uuid::new_v4().to_string());
            let raw_string = serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string());
            let size_bytes = raw_string.as_bytes().len() as i64;

            let info = ReceivedMessageInfo {
                id: Uuid::new_v4().to_string(),
                request_id,
                content_type: if content_type.is_empty() { None } else { Some(content_type) },
                file_name: None,
                file_path: None,
                file_size: Some(size_bytes),
                raw_data: Some(raw_string),
            };

            respond_with_message(state, info)
        }
        Err(err) => {
            error!(target: "http_server", "Failed to parse JSON body: {}", err);
            Err((
                StatusCode::BAD_REQUEST,
                Json(ReceiveResponse {
                    success: false,
                    message: format!("Failed to parse JSON body: {}", err),
                    data: None,
                }),
            ))
        }
    }
}

fn respond_with_message(
    state: Arc<ServerState>,
    info: ReceivedMessageInfo,
) -> Result<Json<ReceiveResponse>, (StatusCode, Json<ReceiveResponse>)> {
    notify_callback(&state, &info);

    Ok(Json(ReceiveResponse {
        success: true,
        message: "Message received successfully".to_string(),
        data: Some(info),
    }))
}

fn notify_callback(state: &Arc<ServerState>, info: &ReceivedMessageInfo) {
    if let Some(callback) = &state.callback {
        let info_clone = info.clone();
        let callback_clone = callback.clone();
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || {
            callback_clone(info_clone);
        }))
        .unwrap_or_else(|e| {
            error!(target: "http_server", "Callback panicked: {:?}", e);
        });
    }
}

fn extract_request_id(value: &Value) -> Option<String> {
    value
        .pointer("/result/requestId")
        .and_then(Value::as_str)
        .map(|s| s.to_string())
        .or_else(|| value.get("requestId").and_then(Value::as_str).map(|s| s.to_string()))
        .or_else(|| value.pointer("/result/id").and_then(Value::as_str).map(|s| s.to_string()))
}

/// Generate a simple timestamp string without external deps
fn chrono_lite_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    format!("{}", duration.as_secs())
}
