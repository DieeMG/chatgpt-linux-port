import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const home = process.env.HOME;
const cachedDmg = path.join(root, "downloads", "Codex.dmg");
const cachedDmgMetadata = path.join(root, "downloads", "Codex.dmg.meta.json");
const sourcePackageJson = path.join(root, "work", "app", "package.json");
const codexDmgUrl =
  process.env.CODEX_DMG_URL ??
  "https://persistent.oaistatic.com/codex-app-prod/Codex.dmg";
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

function readJson(jsonPath) {
  if (!fs.existsSync(jsonPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  } catch {
    return null;
  }
}

function normalizeHeaderName(name) {
  return name.trim().toLowerCase();
}

function readRemoteDmgMetadata() {
  const output = execFileSync("curl", ["-L", "--fail", "--silent", "--show-error", "--head", codexDmgUrl], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
  });

  const responses = output
    .split(/\r?\n(?=HTTP\/)/)
    .map((response) => response.trim())
    .filter(Boolean);
  const lastResponse = responses.at(-1) ?? output;
  const headers = {};

  for (const line of lastResponse.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }

    const name = normalizeHeaderName(line.slice(0, separatorIndex));
    const value = line.slice(separatorIndex + 1).trim();
    headers[name] = value;
  }

  return {
    url: codexDmgUrl,
    contentLength: headers["content-length"] ? Number(headers["content-length"]) : null,
    etag: headers.etag ?? null,
    lastModified: headers["last-modified"] ?? null,
    checkedAt: new Date().toISOString(),
  };
}

function cachedDmgMatchesRemote(remoteMetadata) {
  if (!fs.existsSync(cachedDmg)) {
    return false;
  }

  const localSize = fs.statSync(cachedDmg).size;
  const metadata = readJson(cachedDmgMetadata);

  if (metadata?.url && metadata.url !== remoteMetadata.url) {
    return false;
  }

  if (metadata?.etag && remoteMetadata.etag) {
    return metadata.etag === remoteMetadata.etag;
  }

  if (metadata?.lastModified && remoteMetadata.lastModified && metadata?.contentLength) {
    return metadata.lastModified === remoteMetadata.lastModified && metadata.contentLength === remoteMetadata.contentLength;
  }

  return remoteMetadata.contentLength != null && localSize === remoteMetadata.contentLength;
}

function writeCachedDmgMetadata(remoteMetadata) {
  if (!fs.existsSync(cachedDmg)) {
    return;
  }

  const metadata = {
    ...remoteMetadata,
    cachedAt: new Date().toISOString(),
    localSize: fs.statSync(cachedDmg).size,
  };

  fs.mkdirSync(path.dirname(cachedDmgMetadata), { recursive: true });
  fs.writeFileSync(cachedDmgMetadata, `${JSON.stringify(metadata, null, 2)}\n`);
}

const previousVersion = readVersion(installedPackageJson);
const sourceVersion = readVersion(sourcePackageJson);
console.log(`Current installed ChatGPT app version: ${previousVersion}`);
console.log(`Current extracted ChatGPT app version: ${sourceVersion}`);

const remoteMetadata = readRemoteDmgMetadata();
const cacheIsCurrent = cachedDmgMatchesRemote(remoteMetadata);
console.log(
  `Upstream DMG: size=${remoteMetadata.contentLength ?? "unknown"} etag=${remoteMetadata.etag ?? "unknown"} last-modified=${remoteMetadata.lastModified ?? "unknown"}`,
);

if (previousVersion !== "not installed" && previousVersion !== "unknown" && previousVersion === sourceVersion && cacheIsCurrent) {
  writeCachedDmgMetadata(remoteMetadata);
  console.log(`\nAlready up to date: ${previousVersion}`);
  process.exit(0);
}

if (!cacheIsCurrent && fs.existsSync(cachedDmg)) {
  console.log(`Removing cached upstream DMG: ${cachedDmg}`);
  fs.rmSync(cachedDmg, { force: true });
}

runNpmScript("prepare:source");
writeCachedDmgMetadata(remoteMetadata);
runNpmScript("build");
runNpmScript("doctor");
runNpmScript("install:local");

const nextVersion = readVersion(installedPackageJson);
console.log(`\nUpdate complete: ${previousVersion} -> ${nextVersion}`);
