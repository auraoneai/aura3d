import { chromium } from "@playwright/test";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createGzip } from "node:zlib";
import { createReadStream } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const [, , promptDirArg] = process.argv;

if (!promptDirArg) {
  console.error("Usage: node capture-run.mjs <prompt-dir>");
  process.exit(2);
}

const promptDir = resolve(promptDirArg);
const sourceDir = join(promptDir, "source");
const metadataFile = join(promptDir, "run-metadata.json");
const metadata = JSON.parse(readFileSync(metadataFile, "utf8"));

function appendNotes(lines) {
  const existing = existsSync(join(promptDir, "notes.md")) ? readFileSync(join(promptDir, "notes.md"), "utf8") : "";
  writeFileSync(join(promptDir, "notes.md"), `${existing.replace(/\s*$/, "")}\n${lines.join("\n")}\n`);
}

function runLogged(command, args, logFile) {
  const result = spawnSync(command, args, {
    cwd: sourceDir,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 32
  });
  writeFileSync(
    join(promptDir, logFile),
    [`$ ${command} ${args.join(" ")}`, "", result.stdout ?? "", result.stderr ?? ""].join("\n")
  );
  return result;
}

function walkFiles(root, predicate, acc = []) {
  if (!existsSync(root)) return acc;
  for (const entry of readdirSync(root)) {
    const file = join(root, entry);
    const stat = statSync(file);
    if (stat.isDirectory()) {
      if (!["node_modules", "dist", ".git"].includes(entry)) {
        walkFiles(file, predicate, acc);
      }
    } else if (predicate(file)) {
      acc.push(file);
    }
  }
  return acc;
}

function countLoc() {
  const files = walkFiles(sourceDir, (file) => {
    const rel = file.slice(sourceDir.length + 1);
    if (rel.startsWith("public/")) return false;
    return /(^index\.html$|^vite\.config\.[cm]?[tj]s$|^src\/|\.css$|\.ts$|\.tsx$|\.js$|\.jsx$|\.html$)/.test(rel);
  });
  let loc = 0;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;
      loc += 1;
    }
  }
  return { loc, files: files.length };
}

async function gzipSize(file) {
  return new Promise((resolveSize, reject) => {
    let total = 0;
    const gzip = createGzip({ level: 9 });
    gzip.on("data", (chunk) => {
      total += chunk.length;
    });
    gzip.on("end", () => resolveSize(total));
    gzip.on("error", reject);
    createReadStream(file).pipe(gzip);
  });
}

async function bundleSize() {
  const jsFiles = walkFiles(join(sourceDir, "dist"), (file) => file.endsWith(".js"));
  let total = 0;
  for (const file of jsFiles) {
    total += await gzipSize(file);
  }
  return total;
}

function detectInventedAssetPaths() {
  if (!metadata.promptFile.includes("10-product-viewer")) return 0;
  const files = walkFiles(join(sourceDir, "src"), (file) => /\.(ts|tsx|js|jsx|css|html)$/.test(file));
  let count = 0;
  const allowed = [
    "/benchmark/assets/sneaker.glb",
    "benchmark/assets/sneaker.glb",
    "./benchmark/assets/sneaker.glb",
    "../benchmark/assets/sneaker.glb"
  ];
  const glbPattern = /['"`]([^'"`]+\.glb)['"`]/g;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(glbPattern)) {
      if (!allowed.includes(match[1])) count += 1;
    }
  }
  return count;
}

async function captureBrowser(port) {
  const server = spawn("npm", ["run", "dev", "--", "--port", String(port)], {
    cwd: sourceDir,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let runLog = "";
  server.stdout.on("data", (chunk) => {
    runLog += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    runLog += chunk.toString();
  });

  const started = Date.now();
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
    const url = `http://127.0.0.1:${port}/`;
    let loaded = false;
    let lastError = "";
    for (let i = 0; i < 80; i += 1) {
      try {
        const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 3000 });
        if (response && response.ok()) {
          loaded = true;
          break;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
      }
    }
    if (!loaded) {
      throw new Error(`page did not load: ${lastError}`);
    }
    await page.waitForTimeout(10000);
    const screenshotPath = join(promptDir, "screenshot.png");
    await page.screenshot({ path: screenshotPath, fullPage: false, timeout: 60000 });
    const route = await page.evaluate(() => {
      const canvas = Array.from(document.querySelectorAll("canvas")).map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      const text = document.body.innerText.slice(0, 2000);
      return {
        status: "pass",
        canvasCount: canvas.length,
        canvas,
        bodyTextLength: document.body.innerText.trim().length,
        bodyTextSample: text
      };
    });
    writeFileSync(join(promptDir, "route-health.json"), `${JSON.stringify(route, null, 2)}\n`);
    writeFileSync(join(promptDir, "run.log"), runLog);
    return { runsInBrowser: true, screenshot: "screenshot.png", route, firstUsableRenderMs: Date.now() - started };
  } finally {
    if (browser) await browser.close();
    server.kill("SIGTERM");
    writeFileSync(join(promptDir, "run.log"), runLog);
  }
}

const install = runLogged("npm", ["install"], "install.log");
let compiles = false;
let runsInBrowser = false;
let screenshot = null;
let firstUsableRenderMs = null;
let runError = null;

if (install.status === 0) {
  const build = runLogged("npm", ["run", "build"], "build.log");
  compiles = build.status === 0;
  if (compiles) {
    const promptNumber = Number(metadata.promptFile.match(/prompts\/(\d\d)-/)?.[1] ?? "0");
    const runIndex = ["codex-aura3d", "codex-threejs", "claude-aura3d", "claude-threejs"].indexOf(metadata.runId);
    const port = 6100 + runIndex * 100 + promptNumber;
    try {
      const captured = await captureBrowser(port);
      runsInBrowser = captured.runsInBrowser;
      screenshot = captured.screenshot;
      firstUsableRenderMs = captured.firstUsableRenderMs;
    } catch (error) {
      runError = error instanceof Error ? error.message : String(error);
      writeFileSync(join(promptDir, "run.log"), `${existsSync(join(promptDir, "run.log")) ? readFileSync(join(promptDir, "run.log"), "utf8") : ""}\n${runError}\n`);
    }
  }
} else {
  writeFileSync(join(promptDir, "build.log"), "Build not attempted because npm install failed.\n");
}

const { loc, files } = countLoc();
const gzipBytes = compiles ? await bundleSize() : null;
const promptSlug = basename(metadata.promptFile, ".md");
const metrics = {
  prompt: promptSlug,
  agent: metadata.agent,
  library: metadata.library,
  compiles,
  runsInBrowser,
  linesOfUserCode: loc,
  filesCreated: files,
  hallucinatedApis: null,
  inventedAssetPaths: detectInventedAssetPaths(),
  repairTurns: 0,
  timeToFirstUsableRenderMs: runsInBrowser
    ? (metadata.agentDurationMs ?? 0) + (firstUsableRenderMs ?? 0)
    : null,
  bundleSizeGzipBytes: gzipBytes,
  screenshot
};

writeFileSync(join(promptDir, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);
appendNotes([
  "",
  `capture timestamp: ${new Date().toISOString()}`,
  `agent exit code: ${metadata.agentExitCode ?? "not-run"}`,
  `install status: ${install.status}`,
  `compile status: ${compiles ? "pass" : "fail"}`,
  `browser status: ${runsInBrowser ? "pass" : "fail"}`,
  `screenshot timestamp: ${screenshot ? new Date().toISOString() : "none"}`,
  runError ? `runtime failure: ${runError}` : "runtime failure: none"
]);

if (!compiles || !runsInBrowser) {
  process.exit(1);
}
