# OmniFetch — Universal Social Media Video & Audio Downloader

A high-performance video downloader tailored for both **Laptop (Web App)** and **Mobile (Android PWA & Native APK)**. Supports YouTube, TikTok, Facebook, Dailymotion, Instagram, X (Twitter), and Vimeo with granular resolution selection, TikTok clean watermark removal, and full creator/caption text extraction.

---

## Key Features

1. **Multi-Platform Support**:
   - **YouTube**: 4K UHD (2160p), 1440p (2K), 1080p Full HD, 720p HD, 480p, 360p, and 320kbps MP3 audio.
   - **TikTok**:
     - 🌟 **Clean HD (No Watermark)**: Downloads clean video without the bouncing TikTok logo or creator username overlay.
     - 🏷️ **Original (With Watermark)**: Preserves the original TikTok watermark and handle.
     - 🎵 **Audio/Sound**: Extracts original sound or background music track.
   - **Facebook, Dailymotion & Instagram**: Reels, posts, and public video extraction in highest available stream qualities.

2. **Uploader & Creator Identification**:
   - Displays creator name, handle (`@username`), profile avatar picture, follower counts, and direct profile link so you always know who uploaded the video.

3. **Text & Caption Tools**:
   - Full post description text viewer with instant **"Copy Text"** clipboard tool.
   - Subtitle & Closed Captions downloader supporting `.vtt` and `.srt` formats across all available languages.

4. **Android Mobile + Laptop Web Experience**:
   - **Laptop Web App**: Responsive modern desktop layout with keyboard shortcuts and instant clipboard paste.
   - **Android PWA**: Standalone mobile app experience with offline shell caching (`manifest.webmanifest` + `sw.js`).
   - **Android Device Simulator**: Test bench for Pixel 8 Pro, Galaxy S24 Ultra, and Pixel Fold right in your browser.
   - **Capacitor Android Build**: Ready-to-compile project configuration (`capacitor.config.json`) to build a standalone Android `.apk`.

---

## Directory Structure

```
omni-downloader/
├── backend/
│   ├── .venv/               # Python virtual environment
│   ├── main.py              # FastAPI server & static file host
│   ├── extractor.py         # yt-dlp & TikWM extraction engine
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── index.html           # Modern responsive web interface
│   ├── styles.css           # Tailored HSL design system
│   ├── app.js               # Reactive client controller & downloader
│   ├── sw.js                # Service Worker for PWA
│   ├── manifest.webmanifest # Android PWA manifest
│   ├── android_test_bench.html # Interactive Android 15 Simulator
│   └── icons/               # SVG & PNG app icons
├── downloads/               # Directory where downloaded media is saved
├── capacitor.config.json    # Capacitor configuration for Android APK
├── package.json             # NPM build scripts
├── start.sh                 # Launcher script
└── README.md
```

---

## How to Run & Use

### 1. Running on Laptop (Web App)
Start the backend server:
```bash
./start.sh
```
Then open your browser at:
```
http://localhost:8000
```

### 2. Installing on Android Phone (PWA Mode)
1. Ensure your laptop and phone are on the same Wi-Fi network (or host the backend on a server).
2. Open Chrome on your Android phone and navigate to `http://<your-laptop-ip>:8000`.
3. Tap the Chrome three-dot menu (**⋮**) and select **"Install app"** or **"Add to Home screen"**.
4. OmniFetch will now appear as an app in your Android app drawer with full-screen standalone mode.

### 3. Testing in the Android Device Simulator
You can test the mobile version right on your laptop without needing a physical phone:
- Open `http://localhost:8000/android_test_bench.html` in your browser.
- Switch between **Pixel 8 Pro**, **Galaxy S24 Ultra**, and **Pixel Fold** profiles.
- Test rotation, network conditions (5G, 4G, 3G, Offline), and view live Android Logcat streams.

### 4. Compiling a Native Android APK (Capacitor)
If you prefer a standalone `.apk` file:
```bash
npm install
npx cap add android
npx cap sync
npx cap open android
```
In Android Studio, click **Build > Build Bundle(s) / APK(s) > Build APK(s)** to generate `app-debug.apk`.
