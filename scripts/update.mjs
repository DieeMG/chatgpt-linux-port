import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const home = process.env.HOME;
const cachedDmg = path.join(root, "downloads", "Codex.dmg");
const installedPackageJson = home
  ? path.join(home, ".local", "share", "codex-linux-port", "resources", "app", "package.json")
  : null;

function readVersion(packageJsonPath) {
  if (!packageJsonPath || !fs.existsSync(packageJsonPath)) {
    return "not installed";
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    return packageJson.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function runNpmScript(scriptName) {
  console.log(`\n==> npm run ${scriptName}`);
  execFileSync("npm", ["run", scriptName], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
}

const previousVersion = readVersion(installedPackageJson);
console.log(`Current installed Codex app version: ${previousVersion}`);

if (fs.existsSync(cachedDmg)) {
  console.log(`Removing cached upstream DMG: ${cachedDmg}`);
  fs.rmSync(cachedDmg, { force: true });
}

runNpmScript("prepare:source");
runNpmScript("build");
runNpmScript("doctor");
runNpmScript("install:local");

const nextVersion = readVersion(installedPackageJson);
console.log(`\nUpdate complete: ${previousVersion} -> ${nextVersion}`);
