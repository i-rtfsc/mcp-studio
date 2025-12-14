use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use time::macros::format_description;
use tracing::{info, Level};
use tracing_subscriber::{
    fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter, Layer, Registry,
};

// Re-export WorkerGuard for main.rs
pub use tracing_appender::non_blocking::WorkerGuard;

// Command to handle frontend logs
#[derive(serde::Deserialize)]
pub struct LogPayload {
    level: String,
    message: String,
    // Optional fields that might come from frontend
    target: Option<String>,
    #[allow(dead_code)]
    file: Option<String>,
    #[allow(dead_code)]
    line: Option<u32>,
    fields: Option<serde_json::Value>,
}

pub fn log_frontend_message(payload: LogPayload) {
    let level = match payload.level.to_lowercase().as_str() {
        "trace" => Level::TRACE,
        "debug" => Level::DEBUG,
        "info" => Level::INFO,
        "warn" => Level::WARN,
        "error" => Level::ERROR,
        _ => Level::INFO,
    };

    let target_str = payload.target.unwrap_or_else(|| "frontend".to_string());

    // Using "frontend" as the static target for filtering convenience,
    // and passing the actual frontend target (e.g. ComponentName) as a field.
    match level {
        Level::TRACE => {
            tracing::trace!(target: "frontend", app_target = %target_str, source = "frontend", fields = ?payload.fields, "{}", payload.message)
        }
        Level::DEBUG => {
            tracing::debug!(target: "frontend", app_target = %target_str, source = "frontend", fields = ?payload.fields, "{}", payload.message)
        }
        Level::INFO => {
            tracing::info!(target: "frontend", app_target = %target_str, source = "frontend", fields = ?payload.fields, "{}", payload.message)
        }
        Level::WARN => {
            tracing::warn!(target: "frontend", app_target = %target_str, source = "frontend", fields = ?payload.fields, "{}", payload.message)
        }
        Level::ERROR => {
            tracing::error!(target: "frontend", app_target = %target_str, source = "frontend", fields = ?payload.fields, "{}", payload.message)
        }
    }
}

pub fn setup_logging<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<WorkerGuard, Box<dyn std::error::Error>> {
    let log_dir = app.path().app_log_dir()?;

    // Ensure directory exists
    if !log_dir.exists() {
        std::fs::create_dir_all(&log_dir)?;
    }

    // Rotation: Daily
    let file_appender = tracing_appender::rolling::daily(&log_dir, "app.log");

    // Non-blocking writer
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    // Custom Timer format
    // We use a simplified format string that is known to work with recent time crate versions
    let timer = fmt::time::OffsetTime::new(
        time::UtcOffset::current_local_offset().unwrap_or(time::UtcOffset::UTC),
        format_description!("[year]-[month]-[day]T[hour]:[minute]:[second].[subsecond digits:3]"),
    );

    // Layer 1: Console (Human Readable)
    // We construct the layer specifically.
    let console_layer = fmt::Layer::default()
        .with_timer(timer.clone())
        .with_thread_ids(true)
        .with_target(true)
        .with_ansi(true) // Color support
        .with_filter(EnvFilter::from_default_env().add_directive(tracing::Level::DEBUG.into()));

    // Layer 2: File (JSON, Structured)
    let file_layer = fmt::Layer::default()
        .with_writer(non_blocking)
        .json()
        .with_timer(timer)
        .with_thread_ids(true)
        .with_thread_names(true)
        .with_target(true)
        .with_file(true)
        .with_line_number(true)
        // .with_filter() is available because we imported tracing_subscriber::Layer
        .with_filter(EnvFilter::new("info"));

    // Registry
    Registry::default().with(console_layer).with(file_layer).init();

    info!(
        target: "backend",
        source = "backend",
        pid = std::process::id(),
        "Logging initialized. Log directory: {:?}",
        log_dir
    );

    Ok(guard)
}
