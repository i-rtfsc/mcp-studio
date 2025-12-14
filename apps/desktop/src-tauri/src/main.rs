// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod application;
mod domain;
mod error;
mod infra;
mod interface;

use std::sync::Arc;
use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};
use tracing::{error, info};

use crate::domain::mcp::{HttpReceivedMessage, IHttpReceivedMessageRepository};
use crate::infra::repo_mcp::SqliteHttpReceivedMessageRepository;

// State wrapper to keep the file logger guard alive
struct LogGuardState(#[allow(dead_code)] infra::logging::WorkerGuard);

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        // 1. Window State (Auto save/restore position & size)
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // 2. Single Instance Lock
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            // 1. Initialize Logging
            let guard = infra::logging::setup_logging(app.handle())?;
            app.manage(LogGuardState(guard));

            // 2. Initialize Tray (Desktop Only)
            #[cfg(desktop)]
            {
                interface::tray::create_tray(app.handle())?;
            }

            // 3. Initialize HTTP Client
            let http_client = infra::http::HttpClient::new()
                .map_err(|e| format!("Failed to init HTTP client: {}", e))?;
            app.manage(http_client);

            // 4. Create Event Publishers (Infra)
            // Domain event publisher (for config changes etc.)
            let domain_publisher: Arc<dyn crate::domain::events::IEventPublisher> = Arc::new(
                infra::event_publisher::TauriEventPublisher::new(app.handle().clone())
            );
            // Generic event publisher (for MCP connection events)
            let generic_publisher: Arc<dyn infra::event_publisher::EventPublisher> = Arc::new(
                infra::event_publisher::TauriGenericEventPublisher::new(app.handle().clone())
            );

            // 5. Initialize MCP Client Manager
            let mcp_client_manager = infra::mcp_client::McpClientManager::new(generic_publisher);
            let mcp_client_manager = Arc::new(mcp_client_manager);
            app.manage(mcp_client_manager.clone());

            // 6. Initialize HTTP Server Manager with app data path
            let http_server_manager = infra::http_server::HttpServerManager::new();

            // Set storage path to app data directory
            let app_data_dir = app.path().app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?;
            let storage_path = app_data_dir.join("received_files");
            tauri::async_runtime::block_on(async {
                http_server_manager.set_storage_path(storage_path).await;
            });

            app.manage(http_server_manager);

            // 7. Initialize Database and CQRS Handlers (Async in setup)
            let app_handle = app.handle().clone();

            tauri::async_runtime::block_on(async move {
                match infra::db::init_db(&app_handle).await {
                    Ok(pool) => {
                        info!("Database initialized successfully");
                        app_handle.manage(pool.clone());

                        // --- Config Domain (CQRS) ---
                        let config_repo = Arc::new(infra::repo_config::SqliteConfigRepository::new(pool.clone()));

                        // Command Handler (writes)
                        let config_cmd_handler = application::ConfigCommandHandler::new(
                            config_repo.clone(),
                            domain_publisher
                        );
                        app_handle.manage(config_cmd_handler);

                        // Query Handler (reads)
                        let config_query_handler = application::ConfigQueryHandler::new(config_repo.clone());
                        app_handle.manage(config_query_handler);

                        // Set config repo for MCP client manager
                        let mcp_client_manager = app_handle.state::<Arc<infra::mcp_client::McpClientManager>>();
                        mcp_client_manager.set_config_repo(config_repo.clone()).await;

                        // --- MCP Domain (CQRS) ---
                        let mcp_server_repo = Arc::new(infra::repo_mcp::SqliteMcpServerRepository::new(pool.clone()));
                        let mcp_history_repo = Arc::new(infra::repo_mcp::SqliteMcpCallHistoryRepository::new(pool.clone()));
                        let mcp_message_repo = Arc::new(infra::repo_mcp::SqliteHttpReceivedMessageRepository::new(pool.clone()));

                        // Get MCP client manager from state
                        let mcp_client = app_handle.state::<Arc<infra::mcp_client::McpClientManager>>().inner().clone();

                        // Command Handler (writes)
                        let mcp_cmd_handler = application::McpCommandHandler::new(
                            mcp_server_repo.clone(),
                            mcp_history_repo.clone(),
                            mcp_message_repo.clone(),
                            mcp_client.clone(),
                        );
                        app_handle.manage(mcp_cmd_handler);

                        // Query Handler (reads)
                        let mcp_query_handler = application::McpQueryHandler::new(
                            mcp_server_repo,
                            mcp_history_repo,
                            mcp_message_repo,
                            mcp_client,
                        );
                        app_handle.manage(mcp_query_handler);

                        // Wire HTTP server callback -> persistence + UI refresh events
                        let http_server_manager = app_handle.state::<infra::http_server::HttpServerManager>();
                        let pool_for_http_messages = pool.clone();
                        let app_handle_for_http_messages = app_handle.clone();

                        http_server_manager.inner().set_callback({
                            let pool = pool_for_http_messages.clone();
                            let app_handle = app_handle_for_http_messages.clone();
                            Arc::new(move |info: infra::http_server::ReceivedMessageInfo| {
                                let pool = pool.clone();
                                let app_handle = app_handle.clone();

                                tauri::async_runtime::spawn(async move {
                                    let repo = SqliteHttpReceivedMessageRepository::new(pool.clone());
                                    let message = HttpReceivedMessage {
                                        id: info.id.clone(),
                                        request_id: info.request_id.clone(),
                                        content_type: info.content_type.clone(),
                                        file_name: info.file_name.clone(),
                                        file_path: info.file_path.clone(),
                                        file_size: info.file_size,
                                        raw_data: info.raw_data.clone(),
                                        created_at: String::new(),
                                    };

                                    if let Err(err) = repo.create(message).await {
                                        error!(target: "http_server", "Failed to persist webhook payload: {:?}", err);
                                        return;
                                    }

                                    if let Err(err) = app_handle.emit("http-receiver:new-message", &info) {
                                        error!(target: "http_server", "Failed to emit webhook event: {:?}", err);
                                    }
                                });
                            })
                        }).await;
                    }
                    Err(e) => {
                        error!("Failed to initialize database: {:?}", e);
                        panic!("Database initialization failed: {:?}", e);
                    }
                }
            });

            Ok(())
        })
        // Window event handling
        .on_window_event(|window, event| {
            match event {
                // Save state when window is resized or moved
                WindowEvent::Resized(_) | WindowEvent::Moved(_) => {
                    let _ = window.app_handle().save_window_state(StateFlags::all());
                }
                // Handle close request -> Hide to Tray
                WindowEvent::CloseRequested { api, .. } => {
                    if window.label() == "main" {
                        let _ = window.app_handle().save_window_state(StateFlags::all());

                        #[cfg(not(target_os = "macos"))]
                        {
                            let _ = window.hide();
                            api.prevent_close();
                        }
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            // General commands
            interface::commands::greet,
            interface::commands::log_frontend_message,
            interface::commands::open_log_folder,
            interface::commands::open_storage_folder,
            interface::commands::check_db_health,
            // Config commands
            interface::commands::get_app_setting,
            interface::commands::set_app_setting,
            interface::commands::get_all_settings,
            // HTTP client commands
            interface::commands::http_request,
            // MCP Server commands
            interface::commands::create_mcp_server,
            interface::commands::update_mcp_server,
            interface::commands::delete_mcp_server,
            interface::commands::list_mcp_servers,
            interface::commands::get_mcp_server,
            interface::commands::connect_mcp_server,
            interface::commands::disconnect_mcp_server,
            interface::commands::mark_mcp_server_disconnected,
            // MCP Tools commands
            interface::commands::refresh_mcp_tools,
            interface::commands::get_mcp_tools,
            interface::commands::call_mcp_tool,
            interface::commands::export_mcp_tools_json,
            // MCP Call History
            interface::commands::get_mcp_call_history,
            // HTTP Server commands
            interface::commands::start_http_server,
            interface::commands::stop_http_server,
            interface::commands::is_http_server_running,
            interface::commands::get_http_server_port,
            interface::commands::get_local_ip_address,
            // HTTP Received Messages
            interface::commands::list_http_received_messages,
            interface::commands::delete_http_received_message
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
