import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const downloads = path.join(root, "downloads");
const work = path.join(root, "work");
const extracted = path.join(work, "extracted");
const sourceApp = path.join(work, "app");
const codexDmg = path.join(downloads, "Codex.dmg");

const codexDmgUrl =
  process.env.CODEX_DMG_URL ??
  "https://persistent.oaistatic.com/codex-app-prod/Codex.dmg";
const electronVersion = packageJson.devDependencies.electron;
const electronZip = path.join(downloads, `electron-v${electronVersion}-linux-x64.zip`);
const electronZipUrl =
  process.env.ELECTRON_ZIP_URL ??
  `https://github.com/electron/electron/releases/download/v${electronVersion}/electron-v${electronVersion}-linux-x64.zip`;

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(" ")}`);
  execFileSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
  });
}

function commandExists(command) {
  try {
    execFileSync("sh", ["-c", `command -v ${command}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function mustHave(command) {
  if (!commandExists(command)) {
    throw new Error(`Missing required command: ${command}`);
  }
}

function download(url, target) {
  if (fs.existsSync(target)) {
    console.log(`ok ${target}`);
    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  run("curl", ["-L", "--fail", "--output", target, url]);
}

function extractCodexApp() {
  const resources = path.join(
    extracted,
    "Codex Installer",
    "Codex.app",
    "Contents",
    "Resources",
  );
  const asar = path.join(resources, "app.asar");

  fs.rmSync(extracted, { force: true, recursive: true });
  fs.mkdirSync(extracted, { recursive: true });
  run("7z", ["x", codexDmg, `-o${extracted}`]);

  if (!fs.existsSync(asar)) {
    throw new Error(`Could not find extracted app.asar at ${asar}`);
  }

  fs.rmSync(sourceApp, { force: true, recursive: true });
  run("npx", ["--yes", "@electron/asar", "extract", asar, sourceApp]);
}

function ensureElectronDist() {
  const electronDist = path.join(root, "node_modules", "electron", "dist");
  const electronBin = path.join(electronDist, "electron");

  if (fs.existsSync(electronBin)) {
    console.log(`ok ${electronBin}`);
    return;
  }

  download(electronZipUrl, electronZip);
  fs.rmSync(electronDist, { force: true, recursive: true });
  fs.mkdirSync(electronDist, { recursive: true });
  run("unzip", ["-q", electronZip, "-d", electronDist]);
  fs.writeFileSync(path.join(root, "node_modules", "electron", "path.txt"), "electron\n");
}

mustHave("curl");
mustHave("7z");
mustHave("unzip");

download(codexDmgUrl, codexDmg);
extractCodexApp();
ensureElectronDist();

console.log("Prepared Codex source payload and Electron Linux runtime.");
