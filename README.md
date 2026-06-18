# Codex macOS Electron Linux Port

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
- A working Codex CLI at `~/.local/bin/codex`

## Build

```bash
npm install
npm run prepare:source
npm run build
npm run doctor
npm run install:local
```

After install, launch with:

```bash
codex-app
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

## Legal Note

This is an experimental private builder. Do not publish or redistribute downloaded/extracted Codex application assets unless you have the rights to do so.
