# Codex Linux Port

Experimental Linux port builder for the macOS Codex Electron desktop app.

This repository does not redistribute the Codex application bundle, DMG, extracted `app.asar`, or generated Linux builds. The scripts download the official macOS installer locally, extract the Electron app payload, replace macOS-only native pieces, rebuild Linux native Node modules, and install the result under `~/.local`.

## Requirements

- Linux x86_64
- Node.js and npm
- `curl`
- `7z`
- `unzip`
- `file`
- `desktop-file-validate` and `update-desktop-database` recommended for desktop integration
- A working Codex CLI at `~/.local/bin/codex`, or set `CODEX_CLI_PATH`

## Build

```bash
npm install
npm run prepare:source
npm run build
npm run doctor
npm run install:local
```

## Update

```bash
npm run update
```

The update command removes the cached upstream DMG, downloads/extracts the current official Codex DMG, rebuilds the Linux port, runs `doctor`, and installs the new build locally. The existing installed app is replaced only after the new build passes validation.

After install, launch with:

```bash
codex-app
```

If your Codex CLI lives somewhere else:

```bash
CODEX_CLI_PATH=/path/to/codex codex-app
```

The local install path is:

```text
~/.local/share/codex-linux-port
```

## Rendering Notes

The macOS app uses transparent Electron window surfaces. On Linux this can produce transparent sidebars and hover trails, especially under Wayland/compositor combinations. The builder injects `webview/assets/codex-linux-port-opaque.css` and launches Electron with X11 ozone plus disabled GPU compositing:

```text
--ozone-platform=x11 --disable-gpu-compositing
```

To test Wayland manually:

```bash
CODEX_LINUX_OZONE_PLATFORM=wayland codex-app
```

## Linux Integration Notes

The builder patches Codex's Electron `open-in-targets` registry so the "Open in..." menu can discover Linux editors from `PATH`. It currently enables VS Code (`code`), VS Code Insiders (`code-insiders`), Cursor (`cursor`), Antigravity (`antigravity` or `google-antigravity`), Windsurf (`windsurf`), Zed (`zed`), Sublime Text (`subl` or `sublime_text`), and a Linux file manager fallback.

## Legal Note

This is an experimental private builder. Do not publish or redistribute downloaded/extracted Codex application assets unless you have the rights to do so.
