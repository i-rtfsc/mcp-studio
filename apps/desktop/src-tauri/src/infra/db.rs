use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};
use tracing::{error, info};

use crate::error::AppError;

/// Initialize the database:
/// 1. Ensure directory exists.
/// 2. Create database file.
/// 3. Connect.
/// 4. Run migrations.
pub async fn init_db<R: Runtime>(app: &AppHandle<R>) -> Result<SqlitePool, AppError> {
    let app_data_dir = app.path().app_data_dir()?;

    // Ensure app_data_dir exists
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)?;
    }

    let db_path = app_data_dir.join("db.sqlite");
    let db_url = format!("sqlite:{}", db_path.to_string_lossy());

    info!("Connecting to database at: {}", db_url);

    // Create the file if it doesn't exist (SqlitePool won't create it by default without specific options usually,
    // but using sqlx::migrate! often handles setup. However, standard practice is ensuring the file exists
    // for local embedded usage to avoid connection errors).
    if !db_path.exists() {
        fs::File::create(&db_path)?;
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .map_err(|e| AppError::Database(format!("Failed to connect: {}", e)))?;

    // Run Migrations (Embedded in binary)
    // sqlx looks for the 'migrations' folder relative to CARGO_MANIFEST_DIR at compile time.
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .map_err(|e| AppError::Database(format!("Migration failed: {}", e)))?;

    info!("Database migrations applied successfully.");

    Ok(pool)
}
