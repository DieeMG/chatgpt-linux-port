import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const home = process.env.HOME;
if (!home) {
  throw new Error("HOME is not set");
}

const root = path.resolve(import.meta.dirname, "..");
const builtApp = path.join(root, "out", "Codex-linux-x64");
const installRoot = path.join(home, ".local", "share", "codex-linux-port");
const binDir = path.join(home, ".local", "bin");
const applicationsDir = path.join(home, ".local", "share", "applications");
const launcher = path.join(binDir, "codex-app");
const desktopFile = path.join(applicationsDir, "codex-linux-port.desktop");
const linuxDesktopClass = "codex";

function mustExist(target) {
  if (!fs.existsSync(target)) {
    throw new Error(`Missing ${target}. Run npm run build first.`);
  }
}

function run(command, args) {
  try {
    execFileSync(command, args, { stdio: "inherit" });
  } catch (error) {
    console.warn(`warn: ${command} ${args.join(" ")} failed: ${error.message}`);
  }
}

mustExist(path.join(builtApp, "codex-linux-port"));

fs.rmSync(installRoot, { force: true, recursive: true });
fs.mkdirSync(path.dirname(installRoot), { recursive: true });
fs.cpSync(builtApp, installRoot, { force: true, recursive: true, dereference: false });

fs.mkdirSync(binDir, { recursive: true });
fs.writeFileSync(
  launcher,
  `#!/usr/bin/env bash
set -euo pipefail
exec "${path.join(installRoot, "codex-linux-port")}" "$@"
`,
  { mode: 0o755 },
);

fs.mkdirSync(applicationsDir, { recursive: true });
fs.writeFileSync(
  desktopFile,
  `[Desktop Entry]
Type=Application
Name=Codex
Comment=Experimental Linux port of the Codex Electron desktop app
Exec=${launcher} %u
Icon=${path.join(installRoot, "resources", "icon.png")}
Terminal=false
Categories=Development;IDE;
MimeType=x-scheme-handler/codex;
StartupWMClass=${linuxDesktopClass}
StartupNotify=true
`,
);

run("desktop-file-validate", [desktopFile]);
run("update-desktop-database", [applicationsDir]);
run("xdg-mime", ["default", "codex-linux-port.desktop", "x-scheme-handler/codex"]);

console.log(`Installed app: ${installRoot}`);
console.log(`Launcher: ${launcher}`);
console.log(`Desktop entry: ${desktopFile}`);
