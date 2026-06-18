import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const sourceApp = path.join(root, "work", "app");
const sourceResources = path.join(
  root,
  "work",
  "extracted",
  "Codex Installer",
  "Codex.app",
  "Contents",
  "Resources",
);
const dist = path.join(root, "out", "Codex-linux-x64");
const resources = path.join(dist, "resources");
const appDest = path.join(resources, "app");
const nativeDeps = path.join(root, "work", "linux-native-deps");
const linuxDesktopClass = "codex";

function rm(target) {
  fs.rmSync(target, { force: true, recursive: true });
}

function cp(src, dest) {
  fs.cpSync(src, dest, { force: true, recursive: true, dereference: false });
}

function mustExist(target, label = target) {
  if (!fs.existsSync(target)) {
    throw new Error(`Missing ${label}: ${target}`);
  }
}

function writeExecutable(target, contents) {
  fs.writeFileSync(target, contents, { mode: 0o755 });
}

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(" ")}`);
  execFileSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
  });
}

function patchLinuxRendering() {
  const cssPath = path.join(appDest, "webview", "assets", "codex-linux-port-opaque.css");
  const htmlPath = path.join(appDest, "webview", "index.html");
  const cssLink = '<link rel="stylesheet" href="./assets/codex-linux-port-opaque.css">';

  fs.writeFileSync(
    cssPath,
    `html[data-codex-window-type="electron"],
html[data-codex-window-type="electron"] body,
html[data-codex-window-type="electron"] #root {
  background-color: var(--color-background-surface-under, #181818) !important;
  background-image: none !important;
}

html[data-codex-window-type="electron"]:not([data-codex-window-chrome="application-menu"]) body {
  background-color: var(--color-background-surface-under, #181818) !important;
  background-image: none !important;
}

html[data-codex-window-type="electron"]:not([data-codex-window-chrome="application-menu"]) .app-shell-left-panel,
html[data-codex-window-type="electron"]:not([data-codex-window-chrome="application-menu"]) .app-shell-left-panel::before,
html[data-codex-window-type="electron"]:not([data-codex-window-chrome="application-menu"]) .app-shell-left-panel::after {
  background: var(--color-token-editor-background, #181818) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  opacity: 1 !important;
}

html[data-codex-window-type="electron"] .app-header-tint {
  background-color: var(--color-token-editor-background, #181818) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
`,
  );

  if (fs.existsSync(htmlPath)) {
    let html = fs.readFileSync(htmlPath, "utf8");
    if (!html.includes(cssLink)) {
      html = html.replace("</head>", `  ${cssLink}\n</head>`);
      fs.writeFileSync(htmlPath, html);
    }
  }
}

function patchOnce(source, from, to, label) {
  if (!source.includes(from)) {
    throw new Error(`Could not apply Linux open target patch: ${label}`);
  }
  return source.replace(from, to);
}

function patchLinuxOpenTargets() {
  const mainPath = path.join(appDest, ".vite", "build", "main-DLo8G5hp.js");
  if (!fs.existsSync(mainPath)) {
    throw new Error(`Missing main bundle for Linux open target patch: ${mainPath}`);
  }

  let main = fs.readFileSync(mainPath, "utf8");

  main = patchOnce(
    main,
    "function cA({id:e,label:t,icon:n,darwinDetect:r,win32Detect:i,darwinEnv:a,darwinArgs:o,hidden:s}){return{id:e,platforms:{darwin:r?{label:t,icon:n,kind:`editor`,hidden:s,detect:r,env:a,args:o??lA,supportsSsh:!0}:void 0,win32:i?{label:t,icon:n,kind:`editor`,hidden:s,detect:i,args:lA,supportsSsh:!0}:void 0}}}",
    "function cA({id:e,label:t,icon:n,darwinDetect:r,win32Detect:i,linuxDetect:u,darwinEnv:a,darwinArgs:o,linuxArgs:c,hidden:s}){return{id:e,platforms:{darwin:r?{label:t,icon:n,kind:`editor`,hidden:s,detect:r,env:a,args:o??lA,supportsSsh:!0}:void 0,win32:i?{label:t,icon:n,kind:`editor`,hidden:s,detect:i,args:lA,supportsSsh:!0}:void 0,linux:u?{label:t,icon:n,kind:`editor`,hidden:s,detect:u,args:c??lA,supportsSsh:!1}:void 0}}}",
    "editor target helper",
  );

  main = patchOnce(
    main,
    "uA=cA({id:`antigravity`,label:`Antigravity`,icon:`apps/antigravity.png`,darwinDetect:()=>Hk([`/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity`]),win32Detect:dA})",
    "uA=cA({id:`antigravity`,label:`Antigravity`,icon:`apps/antigravity.png`,darwinDetect:()=>Hk([`/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity`]),win32Detect:dA,linuxDetect:()=>Co(`antigravity`)??Co(`google-antigravity`)})",
    "Antigravity Linux target",
  );

  main = patchOnce(
    main,
    "Pj=cA({id:`vscode`,label:`VS Code`,icon:`apps/vscode.png`,darwinDetect:()=>Hk([`/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`,`/Applications/Code.app/Contents/Resources/app/bin/code`]),win32Detect:Fj})",
    "Pj=cA({id:`vscode`,label:`VS Code`,icon:`apps/vscode.png`,darwinDetect:()=>Hk([`/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`,`/Applications/Code.app/Contents/Resources/app/bin/code`]),win32Detect:Fj,linuxDetect:()=>Co(`code`)})",
    "VS Code Linux target",
  );

  main = patchOnce(
    main,
    "Ij=cA({id:`vscodeInsiders`,label:`VS Code Insiders`,icon:`apps/vscode-insiders.png`,darwinDetect:()=>Hk([`/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code`,`/Applications/Code - Insiders.app/Contents/Resources/app/bin/code`]),win32Detect:Lj})",
    "Ij=cA({id:`vscodeInsiders`,label:`VS Code Insiders`,icon:`apps/vscode-insiders.png`,darwinDetect:()=>Hk([`/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code`,`/Applications/Code - Insiders.app/Contents/Resources/app/bin/code`]),win32Detect:Lj,linuxDetect:()=>Co(`code-insiders`)})",
    "VS Code Insiders Linux target",
  );

  main = patchOnce(
    main,
    "zj=cA({id:`windsurf`,label:`Windsurf`,icon:`apps/windsurf.png`,darwinDetect:()=>Hk([`/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf`])})",
    "zj=cA({id:`windsurf`,label:`Windsurf`,icon:`apps/windsurf.png`,darwinDetect:()=>Hk([`/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf`]),linuxDetect:()=>Co(`windsurf`)})",
    "Windsurf Linux target",
  );

  main = patchOnce(
    main,
    "FA=cA({id:`cursor`,label:`Cursor`,icon:`apps/cursor.png`,darwinDetect:()=>LA()?.electronBin??null,win32Detect:RA,darwinEnv:()=>{let e={...process.env};return e.VSCODE_NODE_OPTIONS=e.NODE_OPTIONS,e.VSCODE_NODE_REPL_EXTERNAL_MODULE=e.NODE_REPL_EXTERNAL_MODULE,delete e.NODE_OPTIONS,delete e.NODE_REPL_EXTERNAL_MODULE,e.ELECTRON_RUN_AS_NODE=`1`,e},darwinArgs:(...e)=>{let t=LA();if(!t)throw Error(`Cursor CLI entrypoint not available`);return[t.cliJs,...IA(...e)]}})",
    "FA=cA({id:`cursor`,label:`Cursor`,icon:`apps/cursor.png`,darwinDetect:()=>LA()?.electronBin??null,win32Detect:RA,linuxDetect:()=>Co(`cursor`),darwinEnv:()=>{let e={...process.env};return e.VSCODE_NODE_OPTIONS=e.NODE_OPTIONS,e.VSCODE_NODE_REPL_EXTERNAL_MODULE=e.NODE_REPL_EXTERNAL_MODULE,delete e.NODE_OPTIONS,delete e.NODE_REPL_EXTERNAL_MODULE,e.ELECTRON_RUN_AS_NODE=`1`,e},darwinArgs:(...e)=>{let t=LA();if(!t)throw Error(`Cursor CLI entrypoint not available`);return[t.cliJs,...IA(...e)]}})",
    "Cursor Linux target",
  );

  main = patchOnce(
    main,
    "Sj=sA({id:`sublimeText`,label:`Sublime Text`,icon:`apps/sublime-text.png`,kind:`editor`,darwin:{detect:Cj,args:yj},win32:{detect:wj,args:yj}})",
    "Sj=sA({id:`sublimeText`,label:`Sublime Text`,icon:`apps/sublime-text.png`,kind:`editor`,darwin:{detect:Cj,args:yj},win32:{detect:wj,args:yj},linux:{detect:()=>Co(`subl`)??Co(`sublime_text`),args:yj}})",
    "Sublime Text Linux target",
  );

  main = patchOnce(
    main,
    "BA=sA({id:`fileManager`,label:`Finder`,icon:`apps/finder.png`,kind:`fileManager`,darwin:{detect:()=>`open`,args:e=>To(e)},win32:{label:`File Explorer`,icon:`apps/file-explorer.png`,detect:VA,args:e=>To(e),open:async({path:e})=>HA(e)}})",
    "BA=sA({id:`fileManager`,label:`Finder`,icon:`apps/finder.png`,kind:`fileManager`,darwin:{detect:()=>`open`,args:e=>To(e)},win32:{label:`File Explorer`,icon:`apps/file-explorer.png`,detect:VA,args:e=>To(e),open:async({path:e})=>HA(e)},linux:{label:`Files`,icon:`apps/file-explorer.png`,detect:()=>Co(`xdg-open`)??`system-default`,args:e=>[vA(e)],open:async({path:e})=>Dj(vA(e))}})",
    "Linux file manager target",
  );

  main = patchOnce(
    main,
    "Xj={id:`zed`,platforms:{darwin:{label:`Zed`,icon:`apps/zed.png`,kind:`editor`,detect:Zj,args:yj,open:eM},win32:{label:`Zed`,icon:`apps/zed.png`,kind:`editor`,detect:Qj,args:yj}}}",
    "Xj={id:`zed`,platforms:{darwin:{label:`Zed`,icon:`apps/zed.png`,kind:`editor`,detect:Zj,args:yj,open:eM},win32:{label:`Zed`,icon:`apps/zed.png`,kind:`editor`,detect:Qj,args:yj},linux:{label:`Zed`,icon:`apps/zed.png`,kind:`editor`,detect:()=>Co(`zed`),args:yj}}}",
    "Zed Linux target",
  );

  fs.writeFileSync(mainPath, main);
}

mustExist(sourceApp, "extracted app");
mustExist(sourceResources, "extracted resources");

rm(dist);
fs.mkdirSync(resources, { recursive: true });

const electronDist = path.join(root, "node_modules", "electron", "dist");
mustExist(electronDist, "Electron dist. Run npm install first");
cp(electronDist, dist);
cp(sourceApp, appDest);
patchLinuxRendering();
patchLinuxOpenTargets();
const electronExecutable = path.join(dist, "electron");
const portExecutable = path.join(dist, "codex-linux-port-bin");
if (fs.existsSync(electronExecutable)) {
  fs.renameSync(electronExecutable, portExecutable);
}

rm(nativeDeps);
fs.mkdirSync(nativeDeps, { recursive: true });
fs.writeFileSync(
  path.join(nativeDeps, "package.json"),
  JSON.stringify({ private: true, dependencies: {} }, null, 2),
);
run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "better-sqlite3@12.11.1", "node-pty@1.1.0"], {
  cwd: nativeDeps,
});

for (const name of ["better-sqlite3", "node-pty"]) {
  rm(path.join(appDest, "node_modules", name));
  cp(path.join(nativeDeps, "node_modules", name), path.join(appDest, "node_modules", name));
}

for (const name of ["icon.png", "codex-notification.wav", "plugins"]) {
  const src = path.join(sourceResources, name);
  if (fs.existsSync(src)) {
    cp(src, path.join(resources, name));
  }
}

// The macOS bundle ships an arm64 Mach-O codex binary. Use the local Linux CLI instead.
writeExecutable(
  path.join(resources, "codex"),
  `#!/usr/bin/env bash
set -euo pipefail
exec "\${CODEX_CLI_PATH:-$HOME/.local/bin/codex}" "$@"
`,
);

// Disable macOS-only native helpers by replacing them with deterministic stubs.
const nativeDir = path.join(resources, "native");
fs.mkdirSync(nativeDir, { recursive: true });
for (const helper of ["bare-modifier-monitor", "launch-services-helper"]) {
  writeExecutable(
    path.join(nativeDir, helper),
    `#!/usr/bin/env bash
echo "${helper} is disabled in the experimental Linux port" >&2
exit 1
`,
  );
}

// app.asar.unpacked contains native module payloads Electron will prefer at runtime.
const unpacked = path.join(resources, "app.asar.unpacked");
const sourceUnpacked = path.join(sourceResources, "app.asar.unpacked");
if (fs.existsSync(sourceUnpacked)) {
  cp(sourceUnpacked, unpacked);
}

run(
  path.join(root, "node_modules", ".bin", "electron-rebuild"),
  [
    "--version",
    "42.1.0",
    "--module-dir",
    appDest,
    "--only",
    "better-sqlite3,node-pty",
  ],
  {
    env: {
      npm_config_runtime: "electron",
      npm_config_target: "42.1.0",
      npm_config_disturl: "https://electronjs.org/headers",
    },
  },
);

// Mirror rebuilt native modules into the unpacked overlay if it exists.
for (const rel of [
  path.join("node_modules", "better-sqlite3", "build"),
  path.join("node_modules", "node-pty", "build"),
]) {
  const src = path.join(appDest, rel);
  const dest = path.join(unpacked, rel);
  if (fs.existsSync(src) && fs.existsSync(path.dirname(dest))) {
    rm(dest);
    cp(src, dest);
  }
}

const bin = path.join(dist, "codex-linux-port");
writeExecutable(
  bin,
  `#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
export NODE_ENV=production
export CODEX_SPARKLE_ENABLED=false
export CODEX_USE_OWL_APP_SHELL=0
export ELECTRON_OZONE_PLATFORM_HINT="\${ELECTRON_OZONE_PLATFORM_HINT:-x11}"
cd "$DIR/resources/app"
exec "$DIR/codex-linux-port-bin" --class="${linuxDesktopClass}" --ozone-platform="\${CODEX_LINUX_OZONE_PLATFORM:-x11}" --disable-gpu-compositing "$@"
`,
);

const desktop = path.join(root, "out", "codex-linux-port.desktop");
fs.writeFileSync(
  desktop,
  `[Desktop Entry]
Type=Application
Name=Codex Linux Port
Comment=Experimental Linux port of the Codex Electron desktop app
Exec=${bin} %u
Icon=${path.join(resources, "icon.png")}
Terminal=false
Categories=Development;IDE;
MimeType=x-scheme-handler/codex;
StartupWMClass=${linuxDesktopClass}
StartupNotify=true
`,
);

console.log(`Built ${bin}`);
console.log(`Desktop file ${desktop}`);
