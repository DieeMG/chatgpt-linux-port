# ChatGPT Linux Port (ex Codex)

Experimental Linux port builder for the macOS ChatGPT Electron desktop app, previously distributed in this workflow as Codex.

This repository does not redistribute the ChatGPT application bundle, DMG, extracted `app.asar`, or generated Linux builds. The scripts download the official macOS installer locally, extract the Electron app payload, replace macOS-only native pieces, rebuild Linux native Node modules, and install the result under `~/.local`.

## Requirements

- Linux x86_64
- Node.js and npm
- `curl`
- `7z`
- `unzip`
- `file`
- `desktop-file-validate` and `update-desktop-database` recommended for desktop integration
- A working Codex CLI at `~/.local/bin/codex`, or set `CODEX_CLI_PATH`

## Install / Update

Recommended command for both first install and future updates:

```bash
npm install
npm run update
```

AI-optimized instruction: run `npm install && npm run update`; do not run `prepare:source`, `build`, `doctor`, or `install:local` manually unless debugging a failed update.

The update command checks the installed app version against the current official ChatGPT DMG metadata first. If the cached upstream DMG and installed version are already current, it exits without rebuilding. When an update is available, it downloads/extracts the current DMG, rebuilds the Linux port, runs `doctor`, and installs the new build locally. The existing installed app is replaced only after the new build passes validation.

Manual build steps for debugging:

```bash
npm run prepare:source
npm run build
npm run doctor
npm run install:local
```

After install, launch with:

```bash
chatgpt-app
```

If your Codex CLI lives somewhere else:

```bash
CODEX_CLI_PATH=/path/to/codex chatgpt-app
```

The local install path is:

```text
~/.local/share/chatgpt-linux-port
```

`install:local` removes legacy `codex-linux-port` install artifacts, including `~/.local/share/codex-linux-port`, `~/.local/bin/codex-app`, and `codex-linux-port.desktop`.

## Rendering Notes

The macOS app uses transparent Electron window surfaces. On Linux this can produce transparent sidebars and hover trails, especially under Wayland/compositor combinations. The builder injects `webview/assets/chatgpt-linux-port-opaque.css` and launches Electron with X11 ozone plus disabled GPU compositing:

```text
--ozone-platform=x11 --disable-gpu-compositing
```

To test Wayland manually:

```bash
CODEX_LINUX_OZONE_PLATFORM=wayland chatgpt-app
```

## Linux Integration Notes

The builder patches the app's Electron `open-in-targets` registry so the "Open in..." menu can discover Linux editors from `PATH`. It currently enables VS Code (`code`), VS Code Insiders (`code-insiders`), Cursor (`cursor`), Antigravity (`antigravity` or `google-antigravity`), Windsurf (`windsurf`), Zed (`zed`), Sublime Text (`subl` or `sublime_text`), and a Linux file manager fallback.

## Legal Note

This is an experimental private builder. Do not publish or redistribute downloaded/extracted ChatGPT application assets unless you have the rights to do so.
