use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};
use std::sync::mpsc;
use crate::slack_window::{self, WindowBounds};

/// Default debug size/position used when Slack window isn't found.
const DEBUG_WIDTH: f64 = 400.0;
const DEBUG_HEIGHT: f64 = 600.0;
const DEBUG_X: f64 = 100.0;
const DEBUG_Y: f64 = 100.0;

/// Set up the overlay tracking: finds Slack window, starts a background
/// poller that sends position updates to the frontend via Tauri events.
pub fn setup_overlay_tracking(app: &tauri::AppHandle) {
    let (tx, rx) = mpsc::channel::<WindowBounds>();

    // Spawn background polling: every 500ms, check Slack window position
    let app_handle = app.clone();
    std::thread::spawn(move || {
        loop {
            if let Some(hwnd) = slack_window::find_slack_window() {
                if let Some(bounds) = slack_window::get_window_bounds(hwnd) {
                    let _ = app_handle.emit("slack-window-moved", &bounds);
                    let _ = tx.send(bounds);
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    });

    // Resize overlay window to match Slack position; show on first match
    let app_handle = app.clone();
    std::thread::spawn(move || {
        for bounds in rx {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.set_position(tauri::PhysicalPosition::new(
                    bounds.x as f64,
                    bounds.y as f64,
                ));
                let _ = window.set_size(tauri::PhysicalSize::new(
                    bounds.width as f64,
                    bounds.height as f64,
                ));
                let _ = window.show();
            }
        }
    });
}

/// Toggle overlay visibility, repositioning over Slack (or debug position).
/// Returns `true` if now visible.
pub fn toggle_overlay_impl(window: &WebviewWindow) -> Result<bool, String> {
    let visible = window.is_visible().map_err(|e| e.to_string())?;
    if visible {
        window.hide().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        // Reposition: prefer Slack bounds, fall back to debug default
        let (x, y, w, h) = match slack_window::find_slack_window() {
            Some(hwnd) => match slack_window::get_window_bounds(hwnd) {
                Some(b) => (b.x as f64, b.y as f64, b.width as f64, b.height as f64),
                None => (DEBUG_X, DEBUG_Y, DEBUG_WIDTH, DEBUG_HEIGHT),
            },
            None => (DEBUG_X, DEBUG_Y, DEBUG_WIDTH, DEBUG_HEIGHT),
        };

        let _ = window.set_position(PhysicalPosition::new(x, y));
        let _ = window.set_size(PhysicalSize::new(w, h));
        window.show().map_err(|e| e.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
pub fn toggle_overlay(window: WebviewWindow) -> Result<bool, String> {
    toggle_overlay_impl(&window)
}
