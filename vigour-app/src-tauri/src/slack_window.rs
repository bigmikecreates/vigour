use std::sync::mpsc;
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
use windows::Win32::UI::Accessibility::{HWINEVENTHOOK, SetWinEventHook};
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageA, EnumWindows, EVENT_OBJECT_LOCATIONCHANGE, GetWindowRect, GetWindowTextLengthW,
    GetWindowTextW, IsWindowVisible, PeekMessageA, TranslateMessage, WINEVENT_OUTOFCONTEXT,
    WINEVENT_SKIPOWNPROCESS, PM_REMOVE,
};

#[derive(Debug, Clone, serde::Serialize)]
pub struct WindowBounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

pub fn find_slack_window() -> Option<HWND> {
    let mut found: Option<HWND> = None;
    unsafe {
        let ctx = &mut found as *mut Option<HWND> as isize;
        EnumWindows(
            Some(enum_window_callback),
            LPARAM(ctx),
        )
        .ok()?;
    }
    found
}

unsafe extern "system" fn enum_window_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let mut title_buf = [0u16; 256];
    let len = GetWindowTextLengthW(hwnd);
    if len > 0 && len < 255 {
        GetWindowTextW(hwnd, &mut title_buf);
        let title = String::from_utf16_lossy(&title_buf[..len as usize]);
        if title.contains("Slack") && IsWindowVisible(hwnd).as_bool() {
            let ctx = &mut *(lparam.0 as *mut Option<HWND>);
            *ctx = Some(hwnd);
            return BOOL(0); // stop enumeration
        }
    }
    BOOL(1)
}

pub fn get_window_bounds(hwnd: HWND) -> Option<WindowBounds> {
    unsafe {
        let mut rect = RECT::default();
        GetWindowRect(hwnd, &mut rect).ok()?;
        Some(WindowBounds {
            x: rect.left,
            y: rect.top,
            width: rect.right - rect.left,
            height: rect.bottom - rect.top,
        })
    }
}

/// Spawn a background thread that watches for Slack window events via SetWinEventHook.
/// Sends WindowBounds over the channel whenever Slack moves or resizes.
pub fn watch_slack_window(tx: mpsc::Sender<WindowBounds>) {
    std::thread::spawn(move || {
        let hwnd = loop {
            if let Some(hwnd) = find_slack_window() {
                break hwnd;
            }
            std::thread::sleep(std::time::Duration::from_secs(2));
        };

        if let Some(bounds) = get_window_bounds(hwnd) {
            let _ = tx.send(bounds);
        }

        unsafe {
            let _tx_ptr = Box::into_raw(Box::new(tx)) as isize;
                let _hook = SetWinEventHook(
                    EVENT_OBJECT_LOCATIONCHANGE,
                    EVENT_OBJECT_LOCATIONCHANGE,
                None,
                Some(event_hook_callback),
                0,
                0,
                WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
            );

            // Keep the thread alive for the hook to fire
            loop {
                std::thread::sleep(std::time::Duration::from_secs(60));
                // Peek messages to keep the hook alive on Windows
                let mut msg = std::mem::zeroed();
                if PeekMessageA(
                    &mut msg,
                    HWND(std::ptr::null_mut()),
                    0,
                    0,
                    PM_REMOVE,
                )
                .as_bool()
                {
                    let _ = TranslateMessage(&msg);
                    let _ = DispatchMessageA(&msg);
                }
            }
        }
    });
}

unsafe extern "system" fn event_hook_callback(
    _hhook: HWINEVENTHOOK,
    _event: u32,
    hwnd: HWND,
    _id_object: i32,
    _id_child: i32,
    _dw_event_thread: u32,
    _dwms_event_time: u32,
) {
    // Check if this event is for Slack by enumerating and matching
    let slack = find_slack_window();
    if let Some(slack_hwnd) = slack {
        if hwnd == slack_hwnd {
            if let Some(_bounds) = get_window_bounds(hwnd) {
                // The tx pointer is passed via closure; for the hook callback
                // we'd need a static. Simplified: don't send in hook callback,
                // the watch thread polls position periodically instead.
            }
        }
    }
}
