import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const home = process.env.HOME;
if (!home) {
  throw new Error("HOME is not set");
}

const installRoot = path.join(home, ".local", "share", "chatgpt-linux-port");
const legacyInstallRoot = path.join(home, ".local", "share", "codex-linux-port");
const binDir = path.join(home, ".local", "bin");
const applicationsDir = path.join(home, ".local", "share", "applications");
const launcher = path.join(binDir, "chatgpt-app");
const legacyLauncher = path.join(binDir, "codex-app");
const desktopFile = path.join(applicationsDir, "chatgpt-linux-port.desktop");
const legacyDesktopFile = path.join(applicationsDir, "codex-linux-port.desktop");
const configUserData = path.join(home, ".config", "chatgpt-linux-port");
const legacyPortHome = path.join(home, ".chatgpt-linux-port");

function run(command, args) {
  try {
    execFileSync(command, args, { stdio: "inherit" });
  } catch (error) {
    console.warn(`warn: ${command} ${args.join(" ")} failed: ${error.message}`);
  }
}

// Terminate running port processes
run("pkill", ["-9", "-f", "chatgpt-linux-port-bin"]);

// Remove binary and share directories
for (const target of [installRoot, legacyInstallRoot, configUserData, legacyPortHome]) {
  if (fs.existsSync(target)) {
    console.log(`Removing ${target}...`);
    run("chmod", ["-R", "u+w", target]);
    fs.rmSync(target, { force: true, recursive: true });
  }
}

// Remove launchers
for (const target of [launcher, legacyLauncher]) {
  if (fs.existsSync(target)) {
    console.log(`Removing launcher ${target}...`);
    fs.rmSync(target, { force: true });
  }
}

// Remove desktop entries
for (const target of [desktopFile, legacyDesktopFile]) {
  if (fs.existsSync(target)) {
    console.log(`Removing desktop entry ${target}...`);
    fs.rmSync(target, { force: true });
  }
}

run("update-desktop-database", [applicationsDir]);

// Restore default protocol handler to official chatgpt app if available
if (fs.existsSync("/usr/share/applications/chatgpt.desktop")) {
  run("xdg-mime", ["default", "chatgpt.desktop", "x-scheme-handler/codex"]);
}

console.log("ChatGPT Linux Port uninstalled successfully.");
