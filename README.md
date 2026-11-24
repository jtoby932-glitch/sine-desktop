# Sine for PC

The Windows version of Sine. Same app as the iPhone version (its web files are synced from there with
`tools/sync-renderer.py`), in a desktop layout, run by Electron.

- `main.js` – the window, tray, media keys, files and folders; starts the in-app server
- `preload.js` – what the page can ask the PC for (`window.electronAPI`)
- `server/` – the in-app server (`server.js`, shared with the iPhone version); songs come from the in-app
  YouTube/SoundCloud client (`extract.js`) answering in place of yt-dlp (`ytdlp-emulation.js`)
- `renderer/` – the page
- `smoke-test.js` – `Sine.exe --smoke-test`, run by the build workflow on Windows

Every push to `main` builds `Sine-Setup-<version>.exe` (Actions → the run → Artifacts).
