mod agent_bridge;
mod ocr;
mod today;

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;
use sysinfo::System;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, GetLastError, LocalFree, ERROR_ALREADY_EXISTS, HANDLE, HLOCAL, POINT, RECT};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::Security::Cryptography::{
    CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
};
use windows::Win32::System::DataExchange::{
    GetClipboardSequenceNumber, IsClipboardFormatAvailable, RegisterClipboardFormatW,
};
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
use windows::Win32::System::ProcessStatus::EmptyWorkingSet;
use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
use windows::Win32::System::Registry::{
    RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ, RRF_RT_REG_SZ,
};
use windows::Win32::System::Threading::{CreateMutexW, GetCurrentProcess, GetCurrentProcessId};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, GetAsyncKeyState, KEYEVENTF_KEYUP, VK_MEDIA_NEXT_TRACK, VK_MEDIA_PLAY_PAUSE,
    VK_MEDIA_PREV_TRACK, VK_MENU, VK_VOLUME_DOWN, VK_VOLUME_MUTE, VK_VOLUME_UP,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetAncestor, GetClassNameW, GetCursorPos, GetDesktopWindow, GetForegroundWindow,
    GetShellWindow, GetWindowRect, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
    GA_ROOTOWNER,
};
use windows::Win32::UI::Shell::{
    SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
};

#[derive(serde::Serialize, Clone, Debug)]
pub struct SystemStats {
    pub cpu_usage: f32,
    pub memory_total_gb: f32,
    pub memory_used_gb: f32,
    pub memory_percent: f32,
    pub has_battery: bool,
    pub battery_percent: u8,
    pub is_charging: bool,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct MediaInfo {
    pub is_available: bool,
    pub is_playing: bool,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub source: String,
    pub cover_url: Option<String>,
    pub position_secs: f64,
    pub duration_secs: f64,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct DownloadStatus {
    pub is_downloading: bool,
    pub filename: String,
    pub bytes_downloaded: u64,
    pub speed_formatted: String,
    pub percent: f32,
    pub is_completed: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ShelfFile {
    pub id: String,
    pub name: String,
    pub path: String,
    pub size_formatted: String,
    pub extension: String,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct ClipboardPollResult {
    pub changed: bool,
    pub seq: u32,
    pub text: Option<String>,
    pub skipped_private: bool,
}

struct AppState {
    sys: Mutex<System>,
    last_cpu_refresh: Mutex<std::time::Instant>,
    cached_cpu: Mutex<f32>,
    media: Mutex<MediaInfo>,
    download: Mutex<DownloadStatus>,
    is_expanded: AtomicBool,
    last_clip_seq: AtomicU32,
    pill_bounds: Mutex<(i32, i32, i32, i32)>,
}

#[tauri::command]
fn set_pill_bounds(
    state: tauri::State<'_, AppState>,
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
) {
    *state.pill_bounds.lock().unwrap() = (left, top, right, bottom);
}

#[tauri::command]
fn set_island_expanded(state: tauri::State<'_, AppState>, expanded: bool) {
    state.is_expanded.store(expanded, Ordering::Relaxed);
}

#[tauri::command]
fn trim_working_set() {
    unsafe {
        let _ = EmptyWorkingSet(GetCurrentProcess());
    }
}

#[tauri::command]
fn get_system_stats(state: tauri::State<'_, AppState>) -> SystemStats {
    let mut cpu_usage = *state.cached_cpu.lock().unwrap();
    {
        let mut last = state.last_cpu_refresh.lock().unwrap();
        if last.elapsed() >= sysinfo::MINIMUM_CPU_UPDATE_INTERVAL {
            let mut sys = state.sys.lock().unwrap();
            sys.refresh_cpu_usage();
            cpu_usage = sys.global_cpu_usage();
            *state.cached_cpu.lock().unwrap() = cpu_usage;
            *last = std::time::Instant::now();
        }
    }

    // Use Win32 GlobalMemoryStatusEx so RAM matches Windows Task Manager
    let (total_mem, used_mem, memory_percent) = unsafe {
        let mut mem_status = MEMORYSTATUSEX {
            dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
            ..Default::default()
        };
        if GlobalMemoryStatusEx(&mut mem_status).is_ok() && mem_status.ullTotalPhys > 0 {
            let total_gb = mem_status.ullTotalPhys as f32 / (1024.0 * 1024.0 * 1024.0);
            let avail_gb = mem_status.ullAvailPhys as f32 / (1024.0 * 1024.0 * 1024.0);
            let used_gb = (total_gb - avail_gb).max(0.0);
            let pct = (used_gb / total_gb) * 100.0;
            (total_gb, used_gb, pct)
        } else {
            let mut sys = state.sys.lock().unwrap();
            sys.refresh_memory();
            let total_gb = sys.total_memory() as f32 / (1024.0 * 1024.0 * 1024.0);
            let used_gb = sys.used_memory() as f32 / (1024.0 * 1024.0 * 1024.0);
            let pct = if total_gb > 0.0 { (used_gb / total_gb) * 100.0 } else { 0.0 };
            (total_gb, used_gb, pct)
        }
    };

    let mut power_status = SYSTEM_POWER_STATUS::default();
    let (has_battery, battery_percent, is_charging) = unsafe {
        if GetSystemPowerStatus(&mut power_status).is_ok() {
            let has_bat = power_status.BatteryFlag != 128 && power_status.BatteryLifePercent <= 100;
            let percent = if power_status.BatteryLifePercent <= 100 {
                power_status.BatteryLifePercent
            } else {
                100
            };
            let charging = power_status.ACLineStatus == 1;
            (has_bat, percent, charging)
        } else {
            (false, 100, false)
        }
    };

    SystemStats {
        cpu_usage,
        memory_total_gb: (total_mem * 10.0).round() / 10.0,
        memory_used_gb: (used_mem * 10.0).round() / 10.0,
        memory_percent: (memory_percent * 10.0).round() / 10.0,
        has_battery,
        battery_percent,
        is_charging,
    }
}

#[tauri::command]
fn send_media_key(key: String) -> Result<(), String> {
    let vk = match key.as_str() {
        "play_pause" => VK_MEDIA_PLAY_PAUSE,
        "next" => VK_MEDIA_NEXT_TRACK,
        "prev" => VK_MEDIA_PREV_TRACK,
        "volume_up" => VK_VOLUME_UP,
        "volume_down" => VK_VOLUME_DOWN,
        "volume_mute" => VK_VOLUME_MUTE,
        _ => return Err("Invalid media key".into()),
    };

    unsafe {
        keybd_event(vk.0 as u8, 0, Default::default(), 0);
        keybd_event(vk.0 as u8, 0, KEYEVENTF_KEYUP, 0);
    }
    Ok(())
}

#[tauri::command]
fn get_media_info(state: tauri::State<'_, AppState>) -> MediaInfo {
    state.media.lock().unwrap().clone()
}

#[tauri::command]
fn get_download_status(state: tauri::State<'_, AppState>) -> DownloadStatus {
    state.download.lock().unwrap().clone()
}

async fn extract_thumbnail_base64(
    media_props: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionMediaProperties,
) -> Option<String> {
    use base64::Engine;
    use windows::Storage::Streams::DataReader;

    let thumb_ref = media_props.Thumbnail().ok()?;
    let stream = thumb_ref.OpenReadAsync().ok()?.await.ok()?;
    let size = stream.Size().ok()? as usize;
    if size == 0 || size > 5_000_000 {
        return None;
    }

    let reader = DataReader::CreateDataReader(&stream).ok()?;
    reader.LoadAsync(size as u32).ok()?.await.ok()?;
    let mut buffer = vec![0u8; size];
    reader.ReadBytes(&mut buffer).ok()?;

    let encoded = base64::engine::general_purpose::STANDARD.encode(&buffer);
    Some(format!("data:image/jpeg;base64,{}", encoded))
}

async fn get_gsmtc_media() -> windows::core::Result<MediaInfo> {
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus,
    };

    let session_manager =
        GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.await?;
    if let Ok(current_session) = session_manager.GetCurrentSession() {
        let source = current_session.SourceAppUserModelId()?.to_string();
        let playback_info = current_session.GetPlaybackInfo()?;
        let status = playback_info.PlaybackStatus()?;
        let is_playing =
            status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing;

        let media_props = current_session.TryGetMediaPropertiesAsync()?.await?;
        let title = media_props.Title()?.to_string();
        let artist = media_props.Artist()?.to_string();
        let album = media_props.AlbumTitle()?.to_string();
        let cover_url = extract_thumbnail_base64(&media_props).await;

        let (position_secs, duration_secs) = if let Ok(timeline) = current_session.GetTimelineProperties() {
            let mut pos = timeline.Position().map(|p| p.Duration as f64 / 10_000_000.0).unwrap_or(0.0);
            let end = timeline.EndTime().map(|e| e.Duration as f64 / 10_000_000.0).unwrap_or(0.0);

            if is_playing {
                if let Ok(last_updated) = timeline.LastUpdatedTime() {
                    let unix_now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default();
                    let now_100ns = (unix_now.as_secs() + 11_644_473_600) as i64 * 10_000_000
                        + (unix_now.subsec_nanos() / 100) as i64;
                    let elapsed_ticks = now_100ns - last_updated.UniversalTime;
                    if elapsed_ticks > 0 && elapsed_ticks < 864_000_000_000 {
                        let elapsed_secs = elapsed_ticks as f64 / 10_000_000.0;
                        pos = (pos + elapsed_secs).min(if end > 0.0 { end } else { f64::MAX });
                    }
                }
            }

            (pos, end)
        } else {
            (0.0, 0.0)
        };

        return Ok(MediaInfo {
            is_available: !title.is_empty(),
            is_playing,
            title,
            artist,
            album,
            source,
            cover_url,
            position_secs,
            duration_secs,
        });
    }

    Ok(MediaInfo {
        is_available: false,
        is_playing: false,
        title: "".into(),
        artist: "".into(),
        album: "".into(),
        source: "".into(),
        cover_url: None,
        position_secs: 0.0,
        duration_secs: 0.0,
    })
}

fn scan_downloads_folder(last_size: &mut u64) -> DownloadStatus {
    let mut status = DownloadStatus {
        is_downloading: false,
        filename: "".into(),
        bytes_downloaded: 0,
        speed_formatted: "".into(),
        percent: 0.0,
        is_completed: false,
    };

    let downloads_dir = match std::env::var("USERPROFILE") {
        Ok(profile) => std::path::PathBuf::from(profile).join("Downloads"),
        Err(_) => return status,
    };

    if let Ok(entries) = std::fs::read_dir(downloads_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(ext) = path.extension() {
                let ext_str = ext.to_string_lossy();
                if ext_str == "crdownload" || ext_str == "part" || ext_str == "download" {
                    if let Ok(meta) = entry.metadata() {
                        let cur_len = meta.len();
                        let delta = cur_len.saturating_sub(*last_size);
                        *last_size = cur_len;

                        let speed_mb = (delta as f64) / (1024.0 * 1024.0);
                        let file_stem = path.file_stem().unwrap_or_default().to_string_lossy().to_string();

                        status.is_downloading = true;
                        status.filename = file_stem;
                        status.bytes_downloaded = cur_len;
                        status.speed_formatted = if speed_mb >= 0.1 {
                            format!("{:.1} MB/s", speed_mb)
                        } else {
                            let speed_kb = (delta as f64) / 1024.0;
                            format!("{:.0} KB/s", speed_kb)
                        };
                        status.percent = ((cur_len % (50 * 1024 * 1024)) as f32 / (50.0 * 1024.0 * 1024.0) * 100.0).clamp(10.0, 95.0);
                        return status;
                    }
                }
            }
        }
    }

    *last_size = 0;
    status
}

#[tauri::command]
fn open_file(path: String) -> Result<(), String> {
    let win_path = path.replace('/', "\\");
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &win_path])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn reveal_in_explorer(path: String) -> Result<(), String> {
    let win_path = path.replace('/', "\\");
    std::process::Command::new("explorer")
        .arg(format!("/select,{}", win_path))
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn resize_and_reposition_island(
    app: AppHandle,
    width: u32,
    height: u32,
    notch_mode: bool,
    position: Option<String>,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(Some(monitor)) = window.primary_monitor() {
            let scale_factor = monitor.scale_factor();
            let screen_size = monitor.size();
            let screen_logical_width = screen_size.width as f64 / scale_factor;
            let pos = position.as_deref().unwrap_or("center");
            let x = match pos {
                "top-right" => (screen_logical_width - width as f64 - 148.0).max(0.0),
                "top-left" => 12.0,
                _ => (screen_logical_width - width as f64) / 2.0,
            };
            let is_mini_pos = matches!(pos, "top-right" | "top-left" | "top-center");
            let y = if notch_mode || is_mini_pos { 0.0 } else { 8.0 };
            let _ = window.set_size(tauri::LogicalSize::new(width as f64, height as f64));
            let _ = window.set_position(tauri::LogicalPosition::new(x, y));
        }
    }
    Ok(())
}

#[tauri::command]
fn toggle_pin(app: AppHandle, pinned: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(pinned);
    }
    Ok(())
}

#[tauri::command]
fn set_window_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        if visible {
            let _ = window.show();
        } else {
            let _ = window.hide();
        }
    }
    Ok(())
}

fn is_foreground_window_borderless_fullscreen() -> bool {
    unsafe {
        let fg = GetForegroundWindow();
        if fg.0.is_null() {
            return false;
        }
        // Resolve owned popups/menus/tooltips back to their root owner window.
        let root = GetAncestor(fg, GA_ROOTOWNER);
        let hwnd = if root.0.is_null() { fg } else { root };

        if hwnd == GetDesktopWindow() || hwnd == GetShellWindow() {
            return false;
        }
        // Exclude hidden and minimized windows.
        if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
            return false;
        }

        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 || pid == GetCurrentProcessId() {
            return false;
        }

        let mut class_buf = [0u16; 256];
        for check_hwnd in [fg, hwnd] {
            let len = GetClassNameW(check_hwnd, &mut class_buf);
            if len > 0 {
                let class_name = String::from_utf16_lossy(&class_buf[..len as usize]);
                if matches!(
                    class_name.as_str(),
                    "Progman"
                        | "WorkerW"
                        | "Shell_TrayWnd"
                        | "Shell_SecondaryTrayWnd"
                        | "SHELLDLL_DefView"
                        | "SysListView32"
                        | "XamlExplorerHostIslandWindow"
                ) {
                    return false;
                }
            }
        }

        let mut win_rect = RECT::default();
        if GetWindowRect(hwnd, &mut win_rect).is_err() {
            return false;
        }

        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(monitor, &mut mi).as_bool() {
            return false;
        }

        let mon = mi.rcMonitor;
        // Allow a small tolerance (e.g. 1-2px auto-hide taskbar strip or DPI rounding).
        win_rect.left <= mon.left + 2
            && win_rect.top <= mon.top + 2
            && win_rect.right >= mon.right - 2
            && win_rect.bottom >= mon.bottom - 4
    }
}

#[tauri::command]
fn is_fullscreen_app_active() -> bool {
    unsafe {
        if let Ok(state) = SHQueryUserNotificationState() {
            if state == QUNS_BUSY
                || state == QUNS_RUNNING_D3D_FULL_SCREEN
                || state == QUNS_PRESENTATION_MODE
            {
                return true;
            }
        }
    }
    is_foreground_window_borderless_fullscreen()
}

/// Checks Windows privacy clipboard formats before reading text so password managers are respected.
fn has_private_clipboard_marker() -> bool {
    unsafe {
        let formats = [
            w!("ExcludeClipboardContentFromMonitorProcessing"),
            w!("Clipboard Viewer Ignore"),
        ];
        for fmt_name in formats {
            let fmt = RegisterClipboardFormatW(fmt_name);
            if fmt != 0 && IsClipboardFormatAvailable(fmt).is_ok() {
                return true;
            }
        }
    }
    false
}

#[tauri::command]
fn read_clipboard_safe(state: tauri::State<'_, AppState>) -> ClipboardPollResult {
    let seq = unsafe { GetClipboardSequenceNumber() };
    let prev = state.last_clip_seq.load(Ordering::Relaxed);
    if seq != 0 && seq == prev {
        return ClipboardPollResult {
            changed: false,
            seq,
            text: None,
            skipped_private: false,
        };
    }
    state.last_clip_seq.store(seq, Ordering::Relaxed);

    if has_private_clipboard_marker() {
        return ClipboardPollResult {
            changed: true,
            seq,
            text: None,
            skipped_private: true,
        };
    }

    let text = arboard::Clipboard::new()
        .ok()
        .and_then(|mut cb| cb.get_text().ok())
        .filter(|t| !t.trim().is_empty());

    ClipboardPollResult {
        changed: true,
        seq,
        text,
        skipped_private: false,
    }
}

#[tauri::command]
fn read_clipboard() -> Result<String, String> {
    if has_private_clipboard_marker() {
        return Err("Skipped private clipboard content".into());
    }
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.get_text().map_err(|e| e.to_string())
}

#[tauri::command]
fn write_clipboard(text: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
async fn seek_media(position_secs: f64) -> Result<(), String> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
    if let Ok(manager_op) = GlobalSystemMediaTransportControlsSessionManager::RequestAsync() {
        if let Ok(manager) = manager_op.await {
            if let Ok(session) = manager.GetCurrentSession() {
                let ticks = (position_secs * 10_000_000.0) as i64;
                let _ = session.TryChangePlaybackPositionAsync(ticks);
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn get_autostart() -> Result<bool, String> {
    let mut size: u32 = 0;
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            w!("Software\\Microsoft\\Windows\\CurrentVersion\\Run"),
            w!("ApexIsland"),
            RRF_RT_REG_SZ,
            None,
            None,
            Some(&mut size),
        )
    };
    Ok(status.is_ok() && size > 0)
}

#[tauri::command]
fn set_autostart(enable: bool) -> Result<(), String> {
    let run_key = w!("Software\\Microsoft\\Windows\\CurrentVersion\\Run");
    let approved_key = w!("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run");
    let val_name = w!("ApexIsland");

    if enable {
        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let quoted = format!("\"{}\"", exe_path.to_string_lossy());
        let wide: Vec<u16> = quoted.encode_utf16().chain(std::iter::once(0)).collect();
        let bytes = unsafe {
            std::slice::from_raw_parts(wide.as_ptr() as *const u8, wide.len() * 2)
        };
        let status = unsafe {
            RegSetKeyValueW(
                HKEY_CURRENT_USER,
                run_key,
                val_name,
                REG_SZ.0,
                Some(bytes.as_ptr() as *const _),
                bytes.len() as u32,
            )
        };
        if status.is_err() {
            return Err(format!("RegSetKeyValueW failed: {:?}", status));
        }
        unsafe {
            let _ = RegDeleteKeyValueW(HKEY_CURRENT_USER, approved_key, val_name);
        }
    } else {
        unsafe {
            let _ = RegDeleteKeyValueW(HKEY_CURRENT_USER, run_key, val_name);
        }
    }
    Ok(())
}

#[tauri::command]
fn dpapi_protect(plaintext: String) -> Result<String, String> {
    use base64::Engine;
    let mut input_bytes = plaintext.into_bytes();
    let in_blob = CRYPT_INTEGER_BLOB {
        cbData: input_bytes.len() as u32,
        pbData: input_bytes.as_mut_ptr(),
    };
    let mut out_blob = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptProtectData(
            &in_blob,
            PCWSTR::null(),
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        )
        .map_err(|e| e.to_string())?;

        let slice = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize);
        let encoded = base64::engine::general_purpose::STANDARD.encode(slice);
        let _ = LocalFree(Some(HLOCAL(out_blob.pbData as *mut _)));
        Ok(encoded)
    }
}

#[tauri::command]
fn dpapi_unprotect(cipher_b64: String) -> Result<String, String> {
    use base64::Engine;
    let mut decoded = base64::engine::general_purpose::STANDARD
        .decode(cipher_b64)
        .map_err(|e| e.to_string())?;
    let in_blob = CRYPT_INTEGER_BLOB {
        cbData: decoded.len() as u32,
        pbData: decoded.as_mut_ptr(),
    };
    let mut out_blob = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptUnprotectData(
            &in_blob,
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        )
        .map_err(|e| e.to_string())?;

        let slice = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize);
        let text = String::from_utf8(slice.to_vec()).map_err(|e| e.to_string())?;
        let _ = LocalFree(Some(HLOCAL(out_blob.pbData as *mut _)));
        Ok(text)
    }
}

struct SingleInstanceGuard(HANDLE);
impl Drop for SingleInstanceGuard {
    fn drop(&mut self) {
        if !self.0.is_invalid() {
            unsafe {
                let _ = CloseHandle(self.0);
            }
        }
    }
}

#[tauri::command]
async fn capture_and_ocr(x: i32, y: i32, width: i32, height: i32) -> Result<String, String> {
    let text = ocr::run_screen_ocr(x, y, width, height).await?;
    if !text.is_empty() {
        if let Ok(mut cb) = arboard::Clipboard::new() {
            let _ = cb.set_text(text.clone());
        }
    }
    Ok(text)
}

#[tauri::command]
fn open_ocr_snip_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("ocr-snip") {
        let _ = existing.set_focus();
        return Ok(());
    }

    if let Some(main_w) = app.get_webview_window("main") {
        let _ = main_w.hide();
    }

    let (w, h) = app
        .get_webview_window("main")
        .and_then(|win| win.primary_monitor().ok().flatten())
        .map(|m| {
            let sf = m.scale_factor();
            let sz = m.size();
            (sz.width as f64 / sf, sz.height as f64 / sf)
        })
        .unwrap_or((1920.0, 1080.0));

    let snip = tauri::WebviewWindowBuilder::new(
        &app,
        "ocr-snip",
        tauri::WebviewUrl::App("index.html?mode=ocr-snip".into()),
    )
    .title("Apex OCR Region")
    .inner_size(w, h)
    .position(0.0, 0.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(false)
    .resizable(false)
    .build()
    .map_err(|e| format!("Failed to open OCR overlay: {:?}", e))?;

    let _ = snip.set_focus();
    Ok(())
}

#[tauri::command]
fn close_ocr_snip_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(snip) = app.get_webview_window("ocr-snip") {
        let _ = snip.destroy();
    }
    if let Some(main_w) = app.get_webview_window("main") {
        let _ = main_w.show();
    }
    Ok(())
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct VolumeInfo {
    pub volume: u8,
    pub muted: bool,
}

unsafe fn with_endpoint_volume<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume) -> Result<R, String>,
{
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
    };

    unsafe {
        let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let need_uninit = hr.is_ok();
        let res = (|| {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .map_err(|e| format!("IMMDeviceEnumerator error: {:?}", e))?;
            let device = enumerator
                .GetDefaultAudioEndpoint(eRender, eMultimedia)
                .map_err(|e| format!("GetDefaultAudioEndpoint error: {:?}", e))?;
            let endpoint: IAudioEndpointVolume = device
                .Activate(CLSCTX_ALL, None)
                .map_err(|e| format!("Activate IAudioEndpointVolume error: {:?}", e))?;
            f(&endpoint)
        })();
        if need_uninit {
            CoUninitialize();
        }
        res
    }
}

#[tauri::command]
fn get_system_volume() -> Result<VolumeInfo, String> {
    unsafe {
        with_endpoint_volume(|ep| {
            let level = ep
                .GetMasterVolumeLevelScalar()
                .map_err(|e| format!("GetMasterVolumeLevelScalar: {:?}", e))?;
            let muted = ep
                .GetMute()
                .map_err(|e| format!("GetMute: {:?}", e))?
                .as_bool();
            Ok(VolumeInfo {
                volume: (level * 100.0).round().clamp(0.0, 100.0) as u8,
                muted,
            })
        })
    }
}

#[tauri::command]
fn set_system_volume(volume: u8, muted: Option<bool>) -> Result<VolumeInfo, String> {
    unsafe {
        with_endpoint_volume(|ep| {
            let clamped = (volume.min(100) as f32) / 100.0;
            ep.SetMasterVolumeLevelScalar(clamped, std::ptr::null())
                .map_err(|e| format!("SetMasterVolumeLevelScalar: {:?}", e))?;
            if let Some(m) = muted {
                ep.SetMute(m, std::ptr::null())
                    .map_err(|e| format!("SetMute: {:?}", e))?;
            }
            let level = ep.GetMasterVolumeLevelScalar().unwrap_or(clamped);
            let is_muted = ep.GetMute().map(|b| b.as_bool()).unwrap_or(false);
            Ok(VolumeInfo {
                volume: (level * 100.0).round().clamp(0.0, 100.0) as u8,
                muted: is_muted,
            })
        })
    }
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct AgentHookStatus {
    pub installed: bool,
    pub config_path: String,
}

fn antigravity_hooks_path() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("USERPROFILE").map_err(|_| "USERPROFILE not set".to_string())?;
    Ok(std::path::PathBuf::from(home)
        .join(".gemini")
        .join("config")
        .join("hooks.json"))
}

fn claude_settings_path() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("USERPROFILE").map_err(|_| "USERPROFILE not set".to_string())?;
    Ok(std::path::PathBuf::from(home).join(".claude").join("settings.json"))
}

fn apex_hook_script_path() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("USERPROFILE").map_err(|_| "USERPROFILE not set".to_string())?;
    Ok(std::path::PathBuf::from(home).join(".apex").join("apex-hook.ps1"))
}

fn write_apex_hook_script(token: &str) -> Result<std::path::PathBuf, String> {
    let script_path = apex_hook_script_path()?;
    if let Some(parent) = script_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let ps1 = format!(
        "$inputJson = [Console]::In.ReadToEnd()\n\
         $agent = 'Antigravity'\n\
         $tool = 'tool'\n\
         $detail = ''\n\
         try {{\n\
           $obj = $inputJson | ConvertFrom-Json\n\
           if ($obj.tool_name) {{ $tool = $obj.tool_name }}\n\
           elseif ($obj.tool) {{ $tool = $obj.tool }}\n\
           if ($obj.tool_input) {{ $detail = ($obj.tool_input | ConvertTo-Json -Compress) }}\n\
           elseif ($obj.input) {{ $detail = ($obj.input | ConvertTo-Json -Compress) }}\n\
         }} catch {{}}\n\
         $body = @{{ agent = $agent; tool = $tool; detail = $detail }} | ConvertTo-Json -Compress\n\
         try {{\n\
           $res = Invoke-RestMethod -Uri 'http://127.0.0.1:{}/hook/permission' -Method Post -Headers @{{ 'X-Apex-Token' = '{}' }} -ContentType 'application/json' -Body $body -TimeoutSec 65\n\
           if ($res.approved -eq $false) {{ exit 2 }}\n\
         }} catch {{}}\n\
         exit 0\n",
        agent_bridge::BRIDGE_PORT,
        token
    );
    std::fs::write(&script_path, ps1).map_err(|e| e.to_string())?;
    Ok(script_path)
}

fn is_hook_installed_internal() -> (bool, String) {
    if let Ok(ag_path) = antigravity_hooks_path() {
        if let Ok(content) = std::fs::read_to_string(&ag_path) {
            if content.contains("apex-island-gate") || content.contains("apex-hook.ps1") {
                return (true, ag_path.to_string_lossy().to_string());
            }
        }
    }
    if let Ok(cl_path) = claude_settings_path() {
        if let Ok(content) = std::fs::read_to_string(&cl_path) {
            if content.contains("apex-hook.ps1") || content.contains("47291/hook/permission") {
                return (true, cl_path.to_string_lossy().to_string());
            }
        }
    }
    let fallback = antigravity_hooks_path()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    (false, fallback)
}

#[tauri::command]
fn get_agent_hook_status() -> AgentHookStatus {
    let (installed, config_path) = is_hook_installed_internal();
    AgentHookStatus {
        installed,
        config_path,
    }
}

#[tauri::command]
fn toggle_agent_hook(
    state: tauri::State<'_, agent_bridge::AgentBridgeState>,
    enable: bool,
) -> Result<AgentHookStatus, String> {
    let ag_path = antigravity_hooks_path()?;
    let cl_path = claude_settings_path()?;

    if let Some(parent) = ag_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let script_path = if enable {
        write_apex_hook_script(&state.token)?
    } else {
        apex_hook_script_path()?
    };

    let cmd = format!(
        "powershell -NoProfile -ExecutionPolicy Bypass -File \"{}\"",
        script_path.to_string_lossy()
    );

    // 1. Update Antigravity global hooks.json
    let mut ag_root: serde_json::Value = if ag_path.exists() {
        let raw = std::fs::read_to_string(&ag_path).unwrap_or_else(|_| "{}".into());
        serde_json::from_str(&raw).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    if !ag_root.is_object() {
        ag_root = serde_json::json!({});
    }
    if enable {
        ag_root.as_object_mut().unwrap().insert(
            "apex-island-gate".to_string(),
            serde_json::json!({
                "PreToolUse": [{
                    "matcher": "run_command|write_file|edit_file",
                    "hooks": [{
                        "type": "command",
                        "command": cmd,
                        "timeout": 65
                    }]
                }]
            }),
        );
    } else {
        ag_root.as_object_mut().unwrap().remove("apex-island-gate");
    }
    let ag_formatted = serde_json::to_string_pretty(&ag_root).map_err(|e| e.to_string())?;
    std::fs::write(&ag_path, ag_formatted).map_err(|e| e.to_string())?;

    // 2. Also clean up or update Claude Code settings.json if present
    if cl_path.exists() {
        let raw = std::fs::read_to_string(&cl_path).unwrap_or_else(|_| "{}".into());
        if let Ok(mut cl_root) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(hooks) = cl_root.get_mut("hooks").and_then(|h| h.as_object_mut()) {
                if let Some(pre) = hooks.get_mut("PreToolUse").and_then(|p| p.as_array_mut()) {
                    pre.retain(|item| {
                        !item.to_string().contains("apex-hook.ps1")
                            && !item.to_string().contains("47291/hook/permission")
                    });
                }
            }
            if let Ok(formatted) = serde_json::to_string_pretty(&cl_root) {
                let _ = std::fs::write(&cl_path, formatted);
            }
        }
    }

    Ok(AgentHookStatus {
        installed: enable,
        config_path: ag_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn test_agent_hook(app: AppHandle) -> Result<(), String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let _ = app.emit(
        "agent-permission-request",
        agent_bridge::AgentPermissionRequest {
            id: format!("test-{}", now),
            agent: "Claude Code".to_string(),
            tool: "Bash".to_string(),
            detail: "npm run test (Simulasi Hook)".to_string(),
            timestamp: now,
        },
    );
    Ok(())
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct OsNotificationStatus {
    pub status: String,
    pub supported: bool,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct OsNotificationItem {
    pub id: u32,
    pub app_name: String,
    pub title: String,
    pub body: String,
}

#[tauri::command]
async fn check_os_notification_access() -> OsNotificationStatus {
    use windows::UI::Notifications::Management::{
        UserNotificationListener, UserNotificationListenerAccessStatus,
    };

    let Ok(listener) = UserNotificationListener::Current() else {
        return OsNotificationStatus {
            status: "unsupported".into(),
            supported: false,
        };
    };

    let Ok(op) = listener.RequestAccessAsync() else {
        return OsNotificationStatus {
            status: "needs_identity".into(),
            supported: false,
        };
    };

    match op.await {
        Ok(UserNotificationListenerAccessStatus::Allowed) => OsNotificationStatus {
            status: "allowed".into(),
            supported: true,
        },
        Ok(UserNotificationListenerAccessStatus::Denied) => OsNotificationStatus {
            status: "denied".into(),
            supported: false,
        },
        _ => OsNotificationStatus {
            status: "needs_identity".into(),
            supported: false,
        },
    }
}

#[tauri::command]
async fn get_recent_os_notifications() -> Result<Vec<OsNotificationItem>, String> {
    use windows::UI::Notifications::Management::{
        UserNotificationListener, UserNotificationListenerAccessStatus,
    };
    use windows::UI::Notifications::{KnownNotificationBindings, NotificationKinds};

    let listener = UserNotificationListener::Current()
        .map_err(|e| format!("UserNotificationListener error: {:?}", e))?;
    let status = listener
        .RequestAccessAsync()
        .map_err(|e| format!("RequestAccessAsync error: {:?}", e))?
        .await
        .map_err(|e| format!("RequestAccessAsync await error: {:?}", e))?;

    if status != UserNotificationListenerAccessStatus::Allowed {
        return Err("needs_identity".into());
    }

    let list = listener
        .GetNotificationsAsync(NotificationKinds::Toast)
        .map_err(|e| format!("GetNotificationsAsync error: {:?}", e))?
        .await
        .map_err(|e| format!("GetNotificationsAsync await error: {:?}", e))?;

    let toast_template = KnownNotificationBindings::ToastGeneric()
        .map_err(|e| format!("ToastGeneric error: {:?}", e))?;

    let mut items = Vec::new();
    let count = list.Size().unwrap_or(0);
    for i in 0..count {
        if let Ok(notif) = list.GetAt(i) {
            let id = notif.Id().unwrap_or(0);
            let app_name = notif
                .AppInfo()
                .and_then(|a| a.DisplayInfo())
                .and_then(|d| d.DisplayName())
                .map(|s| s.to_string())
                .unwrap_or_else(|_| "Windows".into());

            let mut title = String::new();
            let mut body = String::new();
            if let Ok(inner) = notif.Notification() {
                if let Ok(visual) = inner.Visual() {
                    if let Ok(binding) = visual.GetBinding(&toast_template) {
                        if let Ok(texts) = binding.GetTextElements() {
                            let t_count = texts.Size().unwrap_or(0);
                            if t_count >= 1 {
                                if let Ok(el) = texts.GetAt(0) {
                                    title = el.Text().map(|s| s.to_string()).unwrap_or_default();
                                }
                            }
                            if t_count >= 2 {
                                if let Ok(el) = texts.GetAt(1) {
                                    body = el.Text().map(|s| s.to_string()).unwrap_or_default();
                                }
                            }
                        }
                    }
                }
            }

            if !title.is_empty() || !body.is_empty() {
                items.push(OsNotificationItem {
                    id,
                    app_name,
                    title,
                    body,
                });
            }
        }
    }

    Ok(items)
}

#[tauri::command]
fn get_agent_bridge_info(
    state: tauri::State<'_, agent_bridge::AgentBridgeState>,
) -> agent_bridge::AgentBridgeInfo {
    agent_bridge::AgentBridgeInfo {
        port: agent_bridge::BRIDGE_PORT,
        token: state.token.clone(),
        running: *state.running.lock().unwrap(),
    }
}

#[tauri::command]
fn respond_agent_permission(
    state: tauri::State<'_, agent_bridge::AgentBridgeState>,
    id: String,
    approved: bool,
) -> Result<(), String> {
    let map = state.pending.lock().unwrap();
    if let Some(entry) = map.get(&id) {
        let mut d = entry.decision.lock().unwrap();
        *d = Some(approved);
        entry.cvar.notify_all();
    }
    Ok(())
}

#[tauri::command]
fn get_prayer_times(
    year: i32,
    month: i32,
    day: i32,
    lat: f64,
    lng: f64,
    tz_hours: f64,
    now_hours: f64,
    method: String,
) -> today::PrayerTimesResult {
    today::compute_prayer_times(year, month, day, lat, lng, tz_hours, now_hours, &method)
}

#[tauri::command]
async fn get_windows_location() -> Result<today::GeoLocation, String> {
    today::get_windows_location().await
}

#[tauri::command]
async fn fetch_ical_events(url: String) -> Result<Vec<today::CalendarEvent>, String> {
    today::fetch_ical_events(&url).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Enforce single instance using a named Win32 mutex
    let mutex_handle = unsafe {
        CreateMutexW(None, false, w!("Local\\ApexIsland.SingleInstance")).ok()
    };
    if let Some(handle) = mutex_handle {
        if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
            unsafe {
                let _ = CloseHandle(handle);
            }
            return;
        }
    }
    let _instance_guard = mutex_handle.map(SingleInstanceGuard);

    // Lightweight System::new() avoids enumerating all OS processes on startup
    let mut initial_sys = System::new();
    initial_sys.refresh_cpu_usage();
    initial_sys.refresh_memory();

    let initial_media = MediaInfo {
        is_available: false,
        is_playing: false,
        title: "".into(),
        artist: "".into(),
        album: "".into(),
        source: "".into(),
        cover_url: None,
        position_secs: 0.0,
        duration_secs: 0.0,
    };

    let initial_download = DownloadStatus {
        is_downloading: false,
        filename: "".into(),
        bytes_downloaded: 0,
        speed_formatted: "".into(),
        percent: 0.0,
        is_completed: false,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(agent_bridge::AgentBridgeState::new())
        .manage(AppState {
            sys: Mutex::new(initial_sys),
            last_cpu_refresh: Mutex::new(
                std::time::Instant::now() - std::time::Duration::from_secs(1),
            ),
            cached_cpu: Mutex::new(0.0),
            media: Mutex::new(initial_media),
            download: Mutex::new(initial_download),
            is_expanded: AtomicBool::new(false),
            last_clip_seq: AtomicU32::new(0),
            pill_bounds: Mutex::new((0, 0, 0, 0)),
        })
        .invoke_handler(tauri::generate_handler![
            set_pill_bounds,
            get_system_stats,
            send_media_key,
            get_media_info,
            get_download_status,
            open_file,
            reveal_in_explorer,
            resize_and_reposition_island,
            toggle_pin,
            set_window_visible,
            is_fullscreen_app_active,
            set_island_expanded,
            trim_working_set,
            read_clipboard_safe,
            read_clipboard,
            write_clipboard,
            seek_media,
            get_autostart,
            set_autostart,
            dpapi_protect,
            dpapi_unprotect,
            capture_and_ocr,
            open_ocr_snip_overlay,
            close_ocr_snip_overlay,
            get_agent_bridge_info,
            respond_agent_permission,
            get_agent_hook_status,
            toggle_agent_hook,
            test_agent_hook,
            get_system_volume,
            set_system_volume,
            check_os_notification_access,
            get_recent_os_notifications,
            get_prayer_times,
            get_windows_location,
            fetch_ical_events
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_decorations(false);
                let _ = window.set_shadow(false);
                let _ = window.set_always_on_top(true);
                let _ = window.set_skip_taskbar(true);
                let _ = window.set_size(tauri::LogicalSize::new(250.0, 52.0));
                if let Ok(Some(monitor)) = window.primary_monitor() {
                    let scale_factor = monitor.scale_factor();
                    let screen_logical_width = monitor.size().width as f64 / scale_factor;
                    let x = (screen_logical_width - 250.0) / 2.0;
                    let _ = window.set_position(tauri::LogicalPosition::new(x, 8.0));
                }
            }

            // System Tray Icon & Menu
            if let Ok(toggle_i) = MenuItem::with_id(app, "toggle", "Toggle Island", true, None::<&str>) {
                if let (Ok(settings_i), Ok(quit_i)) = (
                    MenuItem::with_id(app, "settings", "Pengaturan", true, None::<&str>),
                    MenuItem::with_id(app, "quit", "Keluar", true, None::<&str>),
                ) {
                    if let Ok(menu) = Menu::with_items(app, &[&toggle_i, &settings_i, &quit_i]) {
                        let mut builder = TrayIconBuilder::new()
                            .menu(&menu)
                            .tooltip("Apex Island")
                            .on_menu_event(|app, event| match event.id.as_ref() {
                                "toggle" => {
                                    if let Some(w) = app.get_webview_window("main") {
                                        let _ = w.show();
                                    }
                                    let _ = app.emit("tray-toggle-expand", ());
                                }
                                "settings" => {
                                    if let Some(w) = app.get_webview_window("main") {
                                        let _ = w.show();
                                    }
                                    let _ = app.emit("tray-open-settings", ());
                                }
                                "quit" => {
                                    app.exit(0);
                                }
                                _ => {}
                            })
                            .on_tray_icon_event(|tray, event| {
                                if let TrayIconEvent::Click {
                                    button: MouseButton::Left,
                                    button_state: MouseButtonState::Up,
                                    ..
                                } = event
                                {
                                    let app = tray.app_handle();
                                    if let Some(w) = app.get_webview_window("main") {
                                        let _ = w.show();
                                    }
                                    let _ = app.emit("tray-toggle-expand", ());
                                }
                            });
                        if let Some(icon) = app.default_window_icon() {
                            builder = builder.icon(icon.clone());
                        }
                        let _ = builder.build(app);
                    }
                }
            }

            // Background worker for downloads & GSMTC media (adapts sleep based on expanded state)
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut last_dl_size = 0u64;
                let rt = tokio::runtime::Builder::new_current_thread().build();

                loop {
                    let expanded = app_handle
                        .try_state::<AppState>()
                        .map(|s| s.is_expanded.load(Ordering::Relaxed))
                        .unwrap_or(false);

                    let dl = scan_downloads_folder(&mut last_dl_size);
                    if let Some(state) = app_handle.try_state::<AppState>() {
                        *state.download.lock().unwrap() = dl;
                    }

                    if let Ok(ref rt) = rt {
                        let info_res = rt.block_on(async { get_gsmtc_media().await });
                        if let Ok(info) = info_res {
                            if let Some(state) = app_handle.try_state::<AppState>() {
                                *state.media.lock().unwrap() = info;
                            }
                        }
                    }

                    let sleep_ms = if expanded { 1100 } else { 2200 };
                    std::thread::sleep(std::time::Duration::from_millis(sleep_ms));
                }
            });

            // Auto-refresh apex-hook.ps1 token on startup if hook is installed
            let (hook_installed, _) = is_hook_installed_internal();
            if hook_installed {
                if let Some(bridge_state) = app.try_state::<agent_bridge::AgentBridgeState>() {
                    let _ = write_apex_hook_script(&bridge_state.token);
                }
            }

            // Start Tier 2 background services: Smart OCR Hotkey (Ctrl+Alt+T) & Agent Bridge
            ocr::spawn_ocr_hotkey_listener(app.handle().clone());
            agent_bridge::spawn_agent_bridge_server(app.handle().clone());

            // Precision click-through around the compact pill + Alt-key ghost mode
            let ct_handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut last_ignore = false;
                let mut last_ghost = false;
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(75));
                    let Some(window) = ct_handle.get_webview_window("main") else {
                        continue;
                    };
                    if !window.is_visible().unwrap_or(false) {
                        continue;
                    }
                    let expanded = ct_handle
                        .try_state::<AppState>()
                        .map(|s| s.is_expanded.load(Ordering::Relaxed))
                        .unwrap_or(false);

                    let alt_down = unsafe { GetAsyncKeyState(VK_MENU.0 as i32) } < 0;
                    if alt_down != last_ghost {
                        last_ghost = alt_down;
                        let _ = ct_handle.emit("island-ghost", alt_down);
                    }

                    let should_ignore = if alt_down {
                        true
                    } else if !expanded {
                        let bounds = ct_handle
                            .try_state::<AppState>()
                            .map(|s| *s.pill_bounds.lock().unwrap())
                            .unwrap_or((0, 0, 0, 0));
                        if bounds.2 > bounds.0 && bounds.3 > bounds.1 {
                            let mut pt = POINT::default();
                            if unsafe { GetCursorPos(&mut pt) }.is_ok() {
                                pt.x < bounds.0 || pt.x > bounds.2 || pt.y < bounds.1 || pt.y > bounds.3
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    } else {
                        false
                    };

                    if should_ignore != last_ignore {
                        last_ignore = should_ignore;
                        let _ = window.set_ignore_cursor_events(should_ignore);
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dpapi_roundtrip_works() {
        let secret = "sk-test-apex-island-12345";
        let encrypted = dpapi_protect(secret.to_string()).expect("dpapi_protect failed");
        assert_ne!(encrypted, secret);
        let decrypted = dpapi_unprotect(encrypted).expect("dpapi_unprotect failed");
        assert_eq!(decrypted, secret);
    }

    #[test]
    fn fullscreen_check_returns_bool() {
        let _ = is_fullscreen_app_active();
    }
}
