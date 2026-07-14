import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const sourceApp = path.join(root, "work", "app");
const dist = path.join(root, "out", "ChatGPT-linux-x64");
const resources = path.join(dist, "resources");
const appDest = path.join(resources, "app");
const nativeDeps = path.join(root, "work", "linux-native-deps");
const linuxDesktopClass = "chatgpt";

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

function findFirst(rootDir, predicate) {
  const pending = [rootDir];
  while (pending.length > 0) {
    const dir = pending.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
        continue;
      }

      if (entry.isFile() && predicate(fullPath, entry)) {
        return fullPath;
      }
    }
  }

  return null;
}

function findSourceResources() {
  const appAsar = findFirst(path.join(root, "work", "extracted"), (fullPath, entry) => {
    return entry.name === "app.asar" && fullPath.includes(`${path.sep}Contents${path.sep}Resources${path.sep}`);
  });

  if (!appAsar) {
    throw new Error("Missing extracted app.asar. Run npm run prepare:source first.");
  }

  return path.dirname(appAsar);
}

function decodeXmlEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function readPlistString(plistPath, key) {
  if (!fs.existsSync(plistPath)) {
    return null;
  }

  const plist = fs.readFileSync(plistPath, "utf8");
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`<key>\\s*${escapedKey}\\s*</key>\\s*<string>([\\s\\S]*?)</string>`).exec(plist);
  return match?.[1] ? decodeXmlEntities(match[1]).trim() : null;
}

function readPackageProductName() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(sourceApp, "package.json"), "utf8"));
    return typeof packageJson.productName === "string" ? packageJson.productName.trim() : null;
  } catch {
    return null;
  }
}

function readAppMetadata(sourceResources) {
  const infoPlist = path.resolve(sourceResources, "..", "Info.plist");
  const displayName =
    readPlistString(infoPlist, "CFBundleDisplayName") ??
    readPlistString(infoPlist, "CFBundleName") ??
    readPackageProductName() ??
    "ChatGPT";
  const iconFile = readPlistString(infoPlist, "CFBundleIconFile");

  return { displayName, iconFile };
}

function extractLargestPngFromIcns(icnsPath, pngPath) {
  if (!fs.existsSync(icnsPath)) {
    return false;
  }

  const icns = fs.readFileSync(icnsPath);
  if (icns.length < 8 || icns.toString("ascii", 0, 4) !== "icns") {
    return false;
  }

  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let bestPng = null;
  let offset = 8;
  while (offset + 8 <= icns.length) {
    const length = icns.readUInt32BE(offset + 4);
    if (length < 8 || offset + length > icns.length) {
      break;
    }

    const payload = icns.subarray(offset + 8, offset + length);
    const pngOffset = payload.indexOf(pngSignature);
    if (pngOffset >= 0) {
      const png = payload.subarray(pngOffset);
      if (!bestPng || png.length > bestPng.length) {
        bestPng = png;
      }
    }

    offset += length;
  }

  if (!bestPng) {
    return false;
  }

  fs.writeFileSync(pngPath, bestPng);
  return true;
}

function resolveIconPath(sourceResources, iconFile) {
  if (!iconFile) {
    return null;
  }

  const candidates = [iconFile, iconFile.endsWith(".icns") ? iconFile : `${iconFile}.icns`];
  for (const candidate of candidates) {
    const iconPath = path.join(sourceResources, candidate);
    if (fs.existsSync(iconPath)) {
      return iconPath;
    }
  }

  return null;
}

function findMainBundle() {
  const buildDir = path.join(appDest, ".vite", "build");
  const mainPath = findFirst(buildDir, (_fullPath, entry) => /^main-.*\.js$/.test(entry.name));
  if (!mainPath) {
    throw new Error(`Missing main bundle for Linux open target patch under ${buildDir}`);
  }

  return mainPath;
}

function patchLinuxRendering() {
  const cssPath = path.join(appDest, "webview", "assets", "chatgpt-linux-port-opaque.css");
  const htmlPath = path.join(appDest, "webview", "index.html");
  const cssLink = '<link rel="stylesheet" href="./assets/chatgpt-linux-port-opaque.css">';

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

function patchAppIdentity() {
  const packageJsonPath = path.join(appDest, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  packageJson.productName = "ChatGPT";
  packageJson.description = "ChatGPT";
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  const bootstrapPath = findFirst(path.join(appDest, ".vite", "build"), (_fullPath, entry) => {
    return /^bootstrap-.*\.js$/.test(entry.name);
  });
  if (!bootstrapPath) {
    throw new Error("Missing bootstrap bundle for Linux desktop identity patch.");
  }

  let bootstrap = fs.readFileSync(bootstrapPath, "utf8");
  bootstrap = patchFirst(
    bootstrap,
    [
      [
        "a.app.setName(t.Na(Z,Q)),a.app.setPath(`userData`,ee({appDataPath:a.app.getPath(`appData`),buildFlavor:Z,env:process.env}))",
        "a.app.setName(t.Na(Z,Q)),process.platform===`linux`&&a.app.setDesktopName(`chatgpt-linux-port.desktop`),a.app.setPath(`userData`,ee({appDataPath:a.app.getPath(`appData`),buildFlavor:Z,env:process.env}))",
      ],
      [
        "a.app.setName(t.Na(Z,Q)),a.app.setPath(`userData`,w({appDataPath:a.app.getPath(`appData`),buildFlavor:Z,env:process.env}))",
        "a.app.setName(t.Na(Z,Q)),process.platform===`linux`&&a.app.setDesktopName(`chatgpt-linux-port.desktop`),a.app.setPath(`userData`,w({appDataPath:a.app.getPath(`appData`),buildFlavor:Z,env:process.env}))",
      ],
    ],
    "Linux desktop identity",
  );
  fs.writeFileSync(bootstrapPath, bootstrap);
}

function patchOnce(source, from, to, label) {
  if (!source.includes(from)) {
    throw new Error(`Could not apply Linux open target patch: ${label}`);
  }
  return source.replace(from, to);
}

function patchFirst(source, replacements, label) {
  for (const [from, to] of replacements) {
    if (source.includes(from)) {
      return source.replace(from, to);
    }
  }

  throw new Error(`Could not apply Linux open target patch: ${label}`);
}

function patchLinuxOpenTargets() {
  const mainPath = findMainBundle();

  let main = fs.readFileSync(mainPath, "utf8");

  main = patchFirst(
    main,
    [
      [
        "function cA({id:e,label:t,icon:n,darwinDetect:r,win32Detect:i,darwinEnv:a,darwinArgs:o,hidden:s}){return{id:e,platforms:{darwin:r?{label:t,icon:n,kind:`editor`,hidden:s,detect:r,env:a,args:o??lA,supportsSsh:!0}:void 0,win32:i?{label:t,icon:n,kind:`editor`,hidden:s,detect:i,args:lA,supportsSsh:!0}:void 0}}}",
        "function cA({id:e,label:t,icon:n,darwinDetect:r,win32Detect:i,linuxDetect:u,darwinEnv:a,darwinArgs:o,linuxArgs:c,hidden:s}){return{id:e,platforms:{darwin:r?{label:t,icon:n,kind:`editor`,hidden:s,detect:r,env:a,args:o??lA,supportsSsh:!0}:void 0,win32:i?{label:t,icon:n,kind:`editor`,hidden:s,detect:i,args:lA,supportsSsh:!0}:void 0,linux:u?{label:t,icon:n,kind:`editor`,hidden:s,detect:u,args:c??lA,supportsSsh:!1}:void 0}}}",
      ],
      [
        "function zj({id:e,label:t,icon:n,darwinDetect:r,win32Detect:i,darwinEnv:a,darwinArgs:o,hidden:s}){return{id:e,platforms:{darwin:r?{label:t,icon:n,kind:`editor`,hidden:s,detect:r,env:a,args:o??Bj,supportsSsh:!0}:void 0,win32:i?{label:t,icon:n,kind:`editor`,hidden:s,detect:i,args:Bj,supportsSsh:!0}:void 0}}}",
        "function zj({id:e,label:t,icon:n,darwinDetect:r,win32Detect:i,linuxDetect:u,darwinEnv:a,darwinArgs:o,linuxArgs:c,hidden:s}){return{id:e,platforms:{darwin:r?{label:t,icon:n,kind:`editor`,hidden:s,detect:r,env:a,args:o??Bj,supportsSsh:!0}:void 0,win32:i?{label:t,icon:n,kind:`editor`,hidden:s,detect:i,args:Bj,supportsSsh:!0}:void 0,linux:u?{label:t,icon:n,kind:`editor`,hidden:s,detect:u,args:c??Bj,supportsSsh:!1}:void 0}}}",
      ],
      [
        "function Bj({id:e,label:t,icon:n,darwinDetect:r,win32Detect:i,darwinEnv:a,darwinArgs:o,hidden:s}){return{id:e,platforms:{darwin:r?{label:t,icon:n,kind:`editor`,hidden:s,detect:r,env:a,args:o??Vj,supportsSsh:!0}:void 0,win32:i?{label:t,icon:n,kind:`editor`,hidden:s,detect:i,args:Vj,supportsSsh:!0}:void 0}}}",
        "function Bj({id:e,label:t,icon:n,darwinDetect:r,win32Detect:i,linuxDetect:u,darwinEnv:a,darwinArgs:o,linuxArgs:c,hidden:s}){return{id:e,platforms:{darwin:r?{label:t,icon:n,kind:`editor`,hidden:s,detect:r,env:a,args:o??Vj,supportsSsh:!0}:void 0,win32:i?{label:t,icon:n,kind:`editor`,hidden:s,detect:i,args:Vj,supportsSsh:!0}:void 0,linux:u?{label:t,icon:n,kind:`editor`,hidden:s,detect:u,args:c??Vj,supportsSsh:!1}:void 0}}}",
      ],
    ],
    "editor target helper",
  );

  main = patchFirst(
    main,
    [
      [
        "uA=cA({id:`antigravity`,label:`Antigravity`,icon:`apps/antigravity.png`,darwinDetect:()=>Hk([`/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity`]),win32Detect:dA})",
        "uA=cA({id:`antigravity`,label:`Antigravity`,icon:`apps/antigravity.png`,darwinDetect:()=>Hk([`/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity`]),win32Detect:dA,linuxDetect:()=>Co(`antigravity`)??Co(`google-antigravity`)})",
      ],
      [
        "Vj=zj({id:`antigravity`,label:`Antigravity`,icon:`apps/antigravity.png`,darwinDetect:()=>Aj([`/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity`]),win32Detect:Hj})",
        "Vj=zj({id:`antigravity`,label:`Antigravity`,icon:`apps/antigravity.png`,darwinDetect:()=>Aj([`/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity`]),win32Detect:Hj,linuxDetect:()=>As(`antigravity`)??As(`google-antigravity`)})",
      ],
      [
        "Hj=Bj({id:`antigravity`,label:`Antigravity`,icon:`apps/antigravity.png`,darwinDetect:()=>jj([`/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity`]),win32Detect:Uj})",
        "Hj=Bj({id:`antigravity`,label:`Antigravity`,icon:`apps/antigravity.png`,darwinDetect:()=>jj([`/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity`]),win32Detect:Uj,linuxDetect:()=>ks(`antigravity`)??ks(`google-antigravity`)})",
      ],
    ],
    "Antigravity Linux target",
  );

  main = patchFirst(
    main,
    [
      [
        "Pj=cA({id:`vscode`,label:`VS Code`,icon:`apps/vscode.png`,darwinDetect:()=>Hk([`/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`,`/Applications/Code.app/Contents/Resources/app/bin/code`]),win32Detect:Fj})",
        "Pj=cA({id:`vscode`,label:`VS Code`,icon:`apps/vscode.png`,darwinDetect:()=>Hk([`/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`,`/Applications/Code.app/Contents/Resources/app/bin/code`]),win32Detect:Fj,linuxDetect:()=>Co(`code`)})",
      ],
      [
        "dN=zj({id:`vscode`,label:`VS Code`,icon:`apps/vscode.png`,darwinDetect:()=>Aj([`/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`,`/Applications/Code.app/Contents/Resources/app/bin/code`]),win32Detect:fN})",
        "dN=zj({id:`vscode`,label:`VS Code`,icon:`apps/vscode.png`,darwinDetect:()=>Aj([`/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`,`/Applications/Code.app/Contents/Resources/app/bin/code`]),win32Detect:fN,linuxDetect:()=>As(`code`)})",
      ],
      [
        "fN=Bj({id:`vscode`,label:`VS Code`,icon:`apps/vscode.png`,darwinDetect:()=>jj([`/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`,`/Applications/Code.app/Contents/Resources/app/bin/code`]),win32Detect:pN})",
        "fN=Bj({id:`vscode`,label:`VS Code`,icon:`apps/vscode.png`,darwinDetect:()=>jj([`/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`,`/Applications/Code.app/Contents/Resources/app/bin/code`]),win32Detect:pN,linuxDetect:()=>ks(`code`)})",
      ],
    ],
    "VS Code Linux target",
  );

  main = patchFirst(
    main,
    [
      [
        "Ij=cA({id:`vscodeInsiders`,label:`VS Code Insiders`,icon:`apps/vscode-insiders.png`,darwinDetect:()=>Hk([`/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code`,`/Applications/Code - Insiders.app/Contents/Resources/app/bin/code`]),win32Detect:Lj})",
        "Ij=cA({id:`vscodeInsiders`,label:`VS Code Insiders`,icon:`apps/vscode-insiders.png`,darwinDetect:()=>Hk([`/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code`,`/Applications/Code - Insiders.app/Contents/Resources/app/bin/code`]),win32Detect:Lj,linuxDetect:()=>Co(`code-insiders`)})",
      ],
      [
        "pN=zj({id:`vscodeInsiders`,label:`VS Code Insiders`,icon:`apps/vscode-insiders.png`,darwinDetect:()=>Aj([`/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code`,`/Applications/Code - Insiders.app/Contents/Resources/app/bin/code`]),win32Detect:mN})",
        "pN=zj({id:`vscodeInsiders`,label:`VS Code Insiders`,icon:`apps/vscode-insiders.png`,darwinDetect:()=>Aj([`/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code`,`/Applications/Code - Insiders.app/Contents/Resources/app/bin/code`]),win32Detect:mN,linuxDetect:()=>As(`code-insiders`)})",
      ],
      [
        "mN=Bj({id:`vscodeInsiders`,label:`VS Code Insiders`,icon:`apps/vscode-insiders.png`,darwinDetect:()=>jj([`/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code`,`/Applications/Code - Insiders.app/Contents/Resources/app/bin/code`]),win32Detect:hN})",
        "mN=Bj({id:`vscodeInsiders`,label:`VS Code Insiders`,icon:`apps/vscode-insiders.png`,darwinDetect:()=>jj([`/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code`,`/Applications/Code - Insiders.app/Contents/Resources/app/bin/code`]),win32Detect:hN,linuxDetect:()=>ks(`code-insiders`)})",
      ],
    ],
    "VS Code Insiders Linux target",
  );

  main = patchFirst(
    main,
    [
      [
        "zj=cA({id:`windsurf`,label:`Windsurf`,icon:`apps/windsurf.png`,darwinDetect:()=>Hk([`/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf`])})",
        "zj=cA({id:`windsurf`,label:`Windsurf`,icon:`apps/windsurf.png`,darwinDetect:()=>Hk([`/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf`]),linuxDetect:()=>Co(`windsurf`)})",
      ],
      [
        "gN=zj({id:`windsurf`,label:`Windsurf`,icon:`apps/windsurf.png`,darwinDetect:()=>Aj([`/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf`])})",
        "gN=zj({id:`windsurf`,label:`Windsurf`,icon:`apps/windsurf.png`,darwinDetect:()=>Aj([`/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf`]),linuxDetect:()=>As(`windsurf`)})",
      ],
      [
        "_N=Bj({id:`windsurf`,label:`Windsurf`,icon:`apps/windsurf.png`,darwinDetect:()=>jj([`/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf`])})",
        "_N=Bj({id:`windsurf`,label:`Windsurf`,icon:`apps/windsurf.png`,darwinDetect:()=>jj([`/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf`]),linuxDetect:()=>ks(`windsurf`)})",
      ],
    ],
    "Windsurf Linux target",
  );

  main = patchFirst(
    main,
    [
      [
        "FA=cA({id:`cursor`,label:`Cursor`,icon:`apps/cursor.png`,darwinDetect:()=>LA()?.electronBin??null,win32Detect:RA,darwinEnv:()=>{let e={...process.env};return e.VSCODE_NODE_OPTIONS=e.NODE_OPTIONS,e.VSCODE_NODE_REPL_EXTERNAL_MODULE=e.NODE_REPL_EXTERNAL_MODULE,delete e.NODE_OPTIONS,delete e.NODE_REPL_EXTERNAL_MODULE,e.ELECTRON_RUN_AS_NODE=`1`,e},darwinArgs:(...e)=>{let t=LA();if(!t)throw Error(`Cursor CLI entrypoint not available`);return[t.cliJs,...IA(...e)]}})",
        "FA=cA({id:`cursor`,label:`Cursor`,icon:`apps/cursor.png`,darwinDetect:()=>LA()?.electronBin??null,win32Detect:RA,linuxDetect:()=>Co(`cursor`),darwinEnv:()=>{let e={...process.env};return e.VSCODE_NODE_OPTIONS=e.NODE_OPTIONS,e.VSCODE_NODE_REPL_EXTERNAL_MODULE=e.NODE_REPL_EXTERNAL_MODULE,delete e.NODE_OPTIONS,delete e.NODE_REPL_EXTERNAL_MODULE,e.ELECTRON_RUN_AS_NODE=`1`,e},darwinArgs:(...e)=>{let t=LA();if(!t)throw Error(`Cursor CLI entrypoint not available`);return[t.cliJs,...IA(...e)]}})",
      ],
      [
        "fM=zj({id:`cursor`,label:`Cursor`,icon:`apps/cursor.png`,darwinDetect:()=>mM()?.electronBin??null,win32Detect:hM,darwinEnv:()=>{let e={...process.env};return e.VSCODE_NODE_OPTIONS=e.NODE_OPTIONS,e.VSCODE_NODE_REPL_EXTERNAL_MODULE=e.NODE_REPL_EXTERNAL_MODULE,delete e.NODE_OPTIONS,delete e.NODE_REPL_EXTERNAL_MODULE,e.ELECTRON_RUN_AS_NODE=`1`,e},darwinArgs:(...e)=>{let t=mM();if(!t)throw Error(`Cursor CLI entrypoint not available`);return[t.cliJs,...pM(...e)]}})",
        "fM=zj({id:`cursor`,label:`Cursor`,icon:`apps/cursor.png`,darwinDetect:()=>mM()?.electronBin??null,win32Detect:hM,linuxDetect:()=>As(`cursor`),darwinEnv:()=>{let e={...process.env};return e.VSCODE_NODE_OPTIONS=e.NODE_OPTIONS,e.VSCODE_NODE_REPL_EXTERNAL_MODULE=e.NODE_REPL_EXTERNAL_MODULE,delete e.NODE_OPTIONS,delete e.NODE_REPL_EXTERNAL_MODULE,e.ELECTRON_RUN_AS_NODE=`1`,e},darwinArgs:(...e)=>{let t=mM();if(!t)throw Error(`Cursor CLI entrypoint not available`);return[t.cliJs,...pM(...e)]}})",
      ],
      [
        "pM=Bj({id:`cursor`,label:`Cursor`,icon:`apps/cursor.png`,darwinDetect:()=>hM()?.electronBin??null,win32Detect:gM,darwinEnv:()=>{let e={...process.env};return e.VSCODE_NODE_OPTIONS=e.NODE_OPTIONS,e.VSCODE_NODE_REPL_EXTERNAL_MODULE=e.NODE_REPL_EXTERNAL_MODULE,delete e.NODE_OPTIONS,delete e.NODE_REPL_EXTERNAL_MODULE,e.ELECTRON_RUN_AS_NODE=`1`,e},darwinArgs:(...e)=>{let t=hM();if(!t)throw Error(`Cursor CLI entrypoint not available`);return[t.cliJs,...mM(...e)]}})",
        "pM=Bj({id:`cursor`,label:`Cursor`,icon:`apps/cursor.png`,darwinDetect:()=>hM()?.electronBin??null,win32Detect:gM,linuxDetect:()=>ks(`cursor`),darwinEnv:()=>{let e={...process.env};return e.VSCODE_NODE_OPTIONS=e.NODE_OPTIONS,e.VSCODE_NODE_REPL_EXTERNAL_MODULE=e.NODE_REPL_EXTERNAL_MODULE,delete e.NODE_OPTIONS,delete e.NODE_REPL_EXTERNAL_MODULE,e.ELECTRON_RUN_AS_NODE=`1`,e},darwinArgs:(...e)=>{let t=hM();if(!t)throw Error(`Cursor CLI entrypoint not available`);return[t.cliJs,...mM(...e)]}})",
      ],
    ],
    "Cursor Linux target",
  );

  main = patchFirst(
    main,
    [
      [
        "Sj=sA({id:`sublimeText`,label:`Sublime Text`,icon:`apps/sublime-text.png`,kind:`editor`,darwin:{detect:Cj,args:yj},win32:{detect:wj,args:yj}})",
        "Sj=sA({id:`sublimeText`,label:`Sublime Text`,icon:`apps/sublime-text.png`,kind:`editor`,darwin:{detect:Cj,args:yj},win32:{detect:wj,args:yj},linux:{detect:()=>Co(`subl`)??Co(`sublime_text`),args:yj}})",
      ],
      [
        "$M=Rj({id:`sublimeText`,label:`Sublime Text`,icon:`apps/sublime-text.png`,kind:`editor`,darwin:{detect:eN,args:XM},win32:{detect:tN,args:XM}})",
        "$M=Rj({id:`sublimeText`,label:`Sublime Text`,icon:`apps/sublime-text.png`,kind:`editor`,darwin:{detect:eN,args:XM},win32:{detect:tN,args:XM},linux:{detect:()=>As(`subl`)??As(`sublime_text`),args:XM}})",
      ],
      [
        "eN=zj({id:`sublimeText`,label:`Sublime Text`,icon:`apps/sublime-text.png`,kind:`editor`,darwin:{detect:tN,args:ZM},win32:{detect:nN,args:ZM}})",
        "eN=zj({id:`sublimeText`,label:`Sublime Text`,icon:`apps/sublime-text.png`,kind:`editor`,darwin:{detect:tN,args:ZM},win32:{detect:nN,args:ZM},linux:{detect:()=>ks(`subl`)??ks(`sublime_text`),args:ZM}})",
      ],
    ],
    "Sublime Text Linux target",
  );

  main = patchFirst(
    main,
    [
      [
        "BA=sA({id:`fileManager`,label:`Finder`,icon:`apps/finder.png`,kind:`fileManager`,darwin:{detect:()=>`open`,args:e=>To(e)},win32:{label:`File Explorer`,icon:`apps/file-explorer.png`,detect:VA,args:e=>To(e),open:async({path:e})=>HA(e)}})",
        "BA=sA({id:`fileManager`,label:`Finder`,icon:`apps/finder.png`,kind:`fileManager`,darwin:{detect:()=>`open`,args:e=>To(e)},win32:{label:`File Explorer`,icon:`apps/file-explorer.png`,detect:VA,args:e=>To(e),open:async({path:e})=>HA(e)},linux:{label:`Files`,icon:`apps/file-explorer.png`,detect:()=>Co(`xdg-open`)??`system-default`,args:e=>[vA(e)],open:async({path:e})=>Dj(vA(e))}})",
      ],
      [
        "_M=Rj({id:`fileManager`,label:`Finder`,icon:`apps/finder.png`,kind:`fileManager`,darwin:{detect:()=>`open`,args:e=>Ms(e)},win32:{label:`File Explorer`,icon:`apps/file-explorer.png`,detect:vM,args:e=>Ms(e),open:async({path:e})=>yM(e)}})",
        "_M=Rj({id:`fileManager`,label:`Finder`,icon:`apps/finder.png`,kind:`fileManager`,darwin:{detect:()=>`open`,args:e=>Ms(e)},win32:{label:`File Explorer`,icon:`apps/file-explorer.png`,detect:vM,args:e=>Ms(e),open:async({path:e})=>yM(e)},linux:{label:`Files`,icon:`apps/file-explorer.png`,detect:()=>As(`xdg-open`)??`system-default`,args:e=>[bM(e)??e],open:async({path:e})=>iN(bM(e)??e)}})",
      ],
      [
        "vM=zj({id:`fileManager`,label:`Finder`,icon:`apps/finder.png`,kind:`fileManager`,darwin:{detect:()=>`open`,args:e=>js(e)},win32:{label:`File Explorer`,icon:`apps/file-explorer.png`,detect:yM,args:e=>js(e),open:async({path:e})=>bM(e)}})",
        "vM=zj({id:`fileManager`,label:`Finder`,icon:`apps/finder.png`,kind:`fileManager`,darwin:{detect:()=>`open`,args:e=>js(e)},win32:{label:`File Explorer`,icon:`apps/file-explorer.png`,detect:yM,args:e=>js(e),open:async({path:e})=>bM(e)},linux:{label:`Files`,icon:`apps/file-explorer.png`,detect:()=>ks(`xdg-open`)??`system-default`,args:e=>[xM(e)??e],open:async({path:e})=>aN(xM(e)??e)}})",
      ],
    ],
    "Linux file manager target",
  );

  main = patchFirst(
    main,
    [
      [
        "Xj={id:`zed`,platforms:{darwin:{label:`Zed`,icon:`apps/zed.png`,kind:`editor`,detect:Zj,args:yj,open:eM},win32:{label:`Zed`,icon:`apps/zed.png`,kind:`editor`,detect:Qj,args:yj}}}",
        "Xj={id:`zed`,platforms:{darwin:{label:`Zed`,icon:`apps/zed.png`,kind:`editor`,detect:Zj,args:yj,open:eM},win32:{label:`Zed`,icon:`apps/zed.png`,kind:`editor`,detect:Qj,args:yj},linux:{label:`Zed`,icon:`apps/zed.png`,kind:`editor`,detect:()=>Co(`zed`),args:yj}}}",
      ],
      [
        "DN={id:`zed`,platforms:{darwin:{label:`Zed`,icon:`apps/zed.png`,kind:`editor`,detect:ON,args:XM,open:jN},win32:{label:`Zed`,icon:`apps/zed.png`,kind:`editor`,detect:kN,args:XM}}}",
        "DN={id:`zed`,platforms:{darwin:{label:`Zed`,icon:`apps/zed.png`,kind:`editor`,detect:ON,args:XM,open:jN},win32:{label:`Zed`,icon:`apps/zed.png`,kind:`editor`,detect:kN,args:XM},linux:{label:`Zed`,icon:`apps/zed.png`,kind:`editor`,detect:()=>As(`zed`),args:XM}}}",
      ],
      [
        "ON={id:`zed`,platforms:{darwin:{label:`Zed`,icon:`apps/zed.png`,kind:`editor`,detect:kN,args:ZM,open:MN},win32:{label:`Zed`,icon:`apps/zed.png`,kind:`editor`,detect:AN,args:ZM}}}",
        "ON={id:`zed`,platforms:{darwin:{label:`Zed`,icon:`apps/zed.png`,kind:`editor`,detect:kN,args:ZM,open:MN},win32:{label:`Zed`,icon:`apps/zed.png`,kind:`editor`,detect:AN,args:ZM},linux:{label:`Zed`,icon:`apps/zed.png`,kind:`editor`,detect:()=>ks(`zed`),args:ZM}}}",
      ],
    ],
    "Zed Linux target",
  );

  fs.writeFileSync(mainPath, main);
}

mustExist(sourceApp, "extracted app");
const sourceResources = findSourceResources();
const appMetadata = readAppMetadata(sourceResources);

rm(dist);
fs.mkdirSync(resources, { recursive: true });

const electronDist = path.join(root, "node_modules", "electron", "dist");
mustExist(electronDist, "Electron dist. Run npm install first");
cp(electronDist, dist);
cp(sourceApp, appDest);
patchAppIdentity();
patchLinuxRendering();
patchLinuxOpenTargets();
const electronExecutable = path.join(dist, "electron");
const portExecutable = path.join(dist, "chatgpt-linux-port-bin");
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

const sourceIconFromPlist = resolveIconPath(sourceResources, appMetadata.iconFile);
const desktopIcon = path.join(resources, "icon.png");
if (sourceIconFromPlist?.endsWith(".icns") && extractLargestPngFromIcns(sourceIconFromPlist, desktopIcon)) {
  console.log(`Extracted desktop icon from ${sourceIconFromPlist}`);
} else {
  const sourceIcon = fs.existsSync(path.join(sourceResources, "icon.png"))
    ? path.join(sourceResources, "icon.png")
    : path.join(sourceResources, "default_app", "icon.png");
  cp(sourceIcon, path.join(resources, "icon.png"));
}

fs.writeFileSync(
  path.join(resources, "app-metadata.json"),
  JSON.stringify(appMetadata, null, 2),
);

for (const name of ["codex-notification.wav", "plugins"]) {
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

if [ -n "\${CODEX_CLI_PATH:-}" ]; then
  exec "\$CODEX_CLI_PATH" "\$@"
elif command -v codex >/dev/null 2>&1; then
  exec codex "\$@"
elif [ -x "\$HOME/.npm-global/bin/codex" ]; then
  exec "\$HOME/.npm-global/bin/codex" "\$@"
elif [ -x "\$HOME/.local/bin/codex" ]; then
  exec "\$HOME/.local/bin/codex" "\$@"
else
  echo "Error: codex CLI not found. Please install it using 'npm i -g @openai/codex' or 'curl -fsSL https://chatgpt.com/codex/install.sh | sh'" >&2
  exit 1
fi
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

const bin = path.join(dist, "chatgpt-linux-port");
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
exec "$DIR/chatgpt-linux-port-bin" --class="${linuxDesktopClass}" --ozone-platform="\${CODEX_LINUX_OZONE_PLATFORM:-x11}" --disable-gpu-compositing "$@"
`,
);

const desktop = path.join(root, "out", "chatgpt-linux-port.desktop");
fs.writeFileSync(
  desktop,
  `[Desktop Entry]
Type=Application
Name=${appMetadata.displayName}
Comment=Experimental Linux port of the ${appMetadata.displayName} Electron desktop app
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
