import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "out", "Codex-linux-x64");
const checks = [
  path.join(root, "downloads", "Codex.dmg"),
  path.join(root, "work", "app", "package.json"),
  path.join(dist, "codex-linux-port-bin"),
  path.join(dist, "resources", "app", "package.json"),
  path.join(dist, "resources", "codex"),
  path.join(dist, "codex-linux-port"),
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
}

process.exit(ok ? 0 : 1);
