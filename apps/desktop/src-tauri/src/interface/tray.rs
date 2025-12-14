use std::path::Path;
use tauri::image::Image;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime, WebviewWindow,
};

pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    // 1. Load Icon (Assuming app-icon.png exists in icons folder or resources)
    // For simplicity in template, we try to use the default app icon or a specific tray icon.
    // In Tauri 2, we can often just reference the default app icon.

    // 2. Create Menu Items
    let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let hide_i = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    // 3. Create Menu
    let menu = Menu::with_items(app, &[&show_i, &hide_i, &quit_i])?;

    // 4. Build Tray
    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone()) // Use default window icon
        .menu(&menu)
        .menu_on_left_click(true) // Show menu on left click too (macOS style often, but Windows usually context menu)
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "hide" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.hide();
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}
