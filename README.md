<div align="center">
  <img src="src-tauri/icons/128x128@2x.png" alt="Apex Island Logo" width="88" height="88" />
  <h1>🏝️ Apex Island</h1>
  <p>
    <strong>Dynamic Island &amp; Notch Overlay untuk Windows 10/11</strong><br />
    Ringan, responsif, dan terintegrasi langsung dengan Windows Native APIs.
  </p>

  <p>
    <a href="https://github.com/NaufalSaputraa/Apex/releases">
      <img src="https://img.shields.io/github/v/release/NaufalSaputraa/Apex?style=for-the-badge&color=10b981&label=Release" alt="Latest Release" />
    </a>
    <a href="https://github.com/NaufalSaputraa/Apex/actions/workflows/ci.yml">
      <img src="https://img.shields.io/github/actions/workflow/status/NaufalSaputraa/Apex/ci.yml?style=for-the-badge&label=CI" alt="CI Status" />
    </a>
    <img src="https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D6?style=for-the-badge&logo=windows" alt="Windows 10/11" />
    <img src="https://img.shields.io/badge/Tauri-v2-FFC131?style=for-the-badge&logo=tauri&logoColor=black" alt="Tauri v2" />
    <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
  </p>

  <p>
    <a href="#-instalasi">Download Installer</a> •
    <a href="#-fitur-utama">Fitur Utama</a> •
    <a href="#-tech-stack">Tech Stack</a> •
    <a href="#-development">Development</a>
  </p>
</div>

---

## ✨ Fitur Utama

- **🏝️ Dynamic Pill, Notch & Fullscreen Mini-Notch**
  - Mode **Floating Pill** atau **Top Notch** dengan animasi spring halus (*Framer Motion*).
  - **Fullscreen / Maximize Mode**: otomatis mengecil menjadi **Mini-Notch** (`48×18` px) yang menempel di bezel atas (`Top-Left`, `Top-Center`, atau `Top-Right`) dengan area sekitar tetap *click-through*, atau pilih **Auto-Hide** penuh di Settings.
  - **Idle Companions**: pilih karakter **Peeking Cat**, **Orb**, atau tampilan **Minimal**.

- **🎵 Media Player (Windows GSMTC) + Lyrics**
  - Terintegrasi dengan *Windows Global System Media Transport Controls* (Spotify, YouTube/Browser, Apple Music, VLC, dll).
  - Kontrol Play/Pause, Next, Previous, interactive seekbar, volume slider, dan tampilan lirik.

- **📊 System Telemetry**
  - Monitoring penggunaan **CPU**, **RAM**, dan status **Baterai / Charger** secara real-time dengan peringatan baterai lemah & status pengisian daya.

- **🗓️ Today Hub**
  - Jadwal waktu salat (Kemenag), cuaca, dan ringkasan harian dalam satu tab.

- **🤖 Agent Bridge & Smart OCR**
  - Snip layar untuk mengekstrak teks langsung menggunakan **Windows Native OCR** (`Media_Ocr`), plus bridge notifikasi/approval untuk AI Agent.

- **📁 File Shelf & 📋 Clipboard History**
  - *Drag & drop* file ke island untuk akses cepat (`open`, `reveal in Explorer`, `copy path`).
  - Riwayat clipboard otomatis dengan perlindungan format privat password manager (`ExcludeClipboardContentFromMonitorProcessing`).

- **⏱️ Focus Timer & OS Toast Listener**
  - Timer fokus/Pomodoro bawaan dan listener notifikasi Windows untuk peek alert langsung di island.

---

## 📦 Instalasi

1. Buka halaman [**GitHub Releases**](https://github.com/NaufalSaputraa/Apex/releases).
2. Unduh file installer terbaru:
   - `Apex Island_x.x.x_x64-setup.exe` *(NSIS Installer — direkomendasikan)*, atau
   - `Apex Island_x.x.x_x64_en-US.msi` *(MSI Installer)*
3. Jalankan installer hingga selesai.

> [!NOTE]
> **Windows SmartScreen:** Karena installer belum menggunakan sertifikat *Code Signing* berbayar, Windows mungkin menampilkan peringatan *"Windows protected your PC"* saat pertama kali dijalankan. Klik **More info** → **Run anyway** untuk melanjutkan.

---

## 🛠️ Tech Stack

| Layer | Teknologi |
|---|---|
| **Desktop Host** | [Tauri v2](https://tauri.app/) (Rust) |
| **Windows Native APIs** | `windows 0.62` (`Media_Control`, `Media_Ocr`, `UI_Notifications`, `Win32_UI_Shell`, `Win32_System_Power`) |
| **Telemetry** | `sysinfo 0.39` |
| **Frontend** | React 19, TypeScript, Vite |
| **Motion & Icons** | Framer Motion, Lucide React |

---

## 🚀 Development

### Prasyarat
- [Node.js](https://nodejs.org/) (v20+ / v22)
- [Rust](https://www.rust-lang.org/tools/install) (stable) & Visual Studio Build Tools (C++ desktop workload)

### Menjalankan Lokal
```powershell
git clone https://github.com/NaufalSaputraa/Apex.git
cd Apex
npm install
npm run tauri dev
```

### Build Installer Produksi
```powershell
npm run tauri build
```
Hasil installer akan dibuat di `src-tauri/target/release/bundle/`.

### Rilis Otomatis via GitHub Actions
Push tag versi baru untuk memicu workflow [`.github/workflows/release.yml`](.github/workflows/release.yml):
```powershell
git tag v1.0.0
git push origin v1.0.0
```
