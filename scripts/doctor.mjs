import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "out", "ChatGPT-linux-x64");
const checks = [
  path.join(root, "downloads", "Codex.dmg"),
  path.join(root, "work", "app", "package.json"),
  path.join(dist, "chatgpt-linux-port-bin"),
  path.join(dist, "resources", "app", "package.json"),
  path.join(dist, "resources", "codex"),
  path.join(dist, "chatgpt-linux-port"),
];

let ok = true;
for (const file of checks) {
  const exists = fs.existsSync(file);
  console.log(`${exists ? "ok" : "missing"} ${file}`);
  ok &&= exists;
}

if (fs.existsSync(dist)) {
  try {
    execFileSync("file", [
      path.join(dist, "resources", "app", "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node"),
      path.join(dist, "resources", "app", "node_modules", "node-pty", "build", "Release", "pty.node"),
    ], { stdio: "inherit" });
  } catch {
    ok = false;
  }

  const buildDir = path.join(dist, "resources", "app", ".vite", "build");
  const openTargetBundles = fs.existsSync(buildDir)
    ? fs.readdirSync(buildDir)
        .filter((name) => name === "worker.js" || /^main-.*\.js$/.test(name))
        .map((name) => path.join(buildDir, name))
    : [];

  for (const bundle of openTargetBundles) {
    const source = fs.readFileSync(bundle, "utf8");
    const hasVsCode = /id:`vscode`[^;]+linuxDetect:[^;]+`code`/.test(source);
    const hasCursor = /id:`cursor`[^;]+linuxDetect:[^;]+`cursor`/.test(source);
    const hasFileManager = /id:`fileManager`[^;]+linux:\{label:`(?:Files|File Manager)`/.test(source);
    const bundleOk = hasVsCode && hasCursor && hasFileManager;
    console.log(`${bundleOk ? "ok" : "missing Linux open targets"} ${bundle}`);
    ok &&= bundleOk;
  }

  if (openTargetBundles.length < 2) {
    console.log(`missing Linux open target bundles under ${buildDir}`);
    ok = false;
  }
}

process.exit(ok ? 0 : 1);
