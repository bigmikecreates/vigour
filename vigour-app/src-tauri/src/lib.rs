mod overlay;
mod slack_window;
mod websocket;

use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let ws_clients: websocket::Clients = Arc::new(Mutex::new(Vec::new()));

    // Spawn WebSocket server in the background
    let clients_for_ws = ws_clients.clone();
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            if let Err(e) = websocket::start_server(9000, clients_for_ws).await {
                eprintln!("WebSocket server error: {}", e);
            }
        });
    });

    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app_handle, shortcut, event| {
                    if event.state == ShortcutState::Pressed
                        && shortcut.matches(Modifiers::CONTROL | Modifiers::SHIFT, Code::KeyV)
                    {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = overlay::toggle_overlay_impl(&window);
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![overlay::toggle_overlay])
        .setup(|app| {
            overlay::setup_overlay_tracking(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Vigour overlay");
}
