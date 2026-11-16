use tauri::{AppHandle, Emitter};
use windows::Graphics::Imaging::{BitmapAlphaMode, BitmapPixelFormat, SoftwareBitmap};
use windows::Media::Ocr::OcrEngine;
use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
    ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, SRCCOPY,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{RegisterHotKey, MOD_ALT, MOD_CONTROL};
use windows::Win32::UI::WindowsAndMessaging::{
    GetMessageW, GetSystemMetrics, MSG, SM_CXSCREEN, SM_CYSCREEN, WM_HOTKEY,
};

/// Captures a screen region (or full primary screen if width/height == 0) and runs WinRT OCR.
pub async fn run_screen_ocr(x: i32, y: i32, width: i32, height: i32) -> Result<String, String> {
    let (cap_x, cap_y, cap_w, cap_h) = unsafe {
        if width <= 0 || height <= 0 {
            (0, 0, GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN))
        } else {
            (x, y, width, height)
        }
    };
    if cap_w <= 0 || cap_h <= 0 {
        return Err("Invalid screen dimensions".into());
    }

    let bgra_bytes = unsafe {
        let hdc_screen = GetDC(None);
        if hdc_screen.is_invalid() {
            return Err("GetDC failed".into());
        }
        let hdc_mem = CreateCompatibleDC(Some(hdc_screen));
        let hbm = CreateCompatibleBitmap(hdc_screen, cap_w, cap_h);
        let old = SelectObject(hdc_mem, hbm.into());

        let blt_ok = BitBlt(hdc_mem, 0, 0, cap_w, cap_h, Some(hdc_screen), cap_x, cap_y, SRCCOPY);

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: cap_w,
                biHeight: -cap_h, // top-down DIB
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut buf = vec![0u8; (cap_w * cap_h * 4) as usize];
        let lines = if blt_ok.is_ok() {
            GetDIBits(
                hdc_mem,
                hbm,
                0,
                cap_h as u32,
                Some(buf.as_mut_ptr() as *mut _),
                &mut bmi,
                DIB_RGB_COLORS,
            )
        } else {
            0
        };

        SelectObject(hdc_mem, old);
        let _ = DeleteObject(hbm.into());
        let _ = DeleteDC(hdc_mem);
        ReleaseDC(None, hdc_screen);

        if lines == 0 {
            return Err("Screen capture failed".into());
        }
        buf
    };

    let op = {
        let stream = InMemoryRandomAccessStream::new().map_err(|e| e.to_string())?;
        let writer = DataWriter::CreateDataWriter(&stream).map_err(|e| e.to_string())?;
        writer.WriteBytes(&bgra_bytes).map_err(|e| e.to_string())?;
        let ibuf = writer.DetachBuffer().map_err(|e| e.to_string())?;

        let bitmap = SoftwareBitmap::CreateCopyWithAlphaFromBuffer(
            &ibuf,
            BitmapPixelFormat::Bgra8,
            cap_w,
            cap_h,
            BitmapAlphaMode::Premultiplied,
        )
        .map_err(|e| e.to_string())?;

        let engine = OcrEngine::TryCreateFromUserProfileLanguages()
            .map_err(|_| "Tidak ada bahasa OCR Windows terpasang (tambahkan di Windows Settings)".to_string())?;

        engine.RecognizeAsync(&bitmap).map_err(|e| e.to_string())?
    };

    let result = op.await.map_err(|e| e.to_string())?;
    let text = result.Text().map_err(|e| e.to_string())?.to_string();
    Ok(text.trim().to_string())
}

/// Spawns a lightweight Win32 message loop listening for Ctrl+Alt+T global hotkey.
pub fn spawn_ocr_hotkey_listener(app: AppHandle) {
    std::thread::spawn(move || unsafe {
        if RegisterHotKey(None, 1, MOD_CONTROL | MOD_ALT, 'T' as u32).is_err() {
            return;
        }
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            if msg.message == WM_HOTKEY && msg.wParam.0 == 1 {
                let _ = app.emit("hotkey-ocr", ());
            }
        }
    });
}
