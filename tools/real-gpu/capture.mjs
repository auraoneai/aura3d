#!/usr/bin/env node
// Real-GPU capture harness. Software GL (SwiftShader/llvmpipe) hides bugs that real GPUs show, so this refuses to
// run on a software renderer unless --allow-software is given. Run it on any machine with a GPU and Chrome:
//   node tools/real-gpu/capture.mjs --games top-tennis,hoops --out evidence/real-gpu/2026-10-26
//   node tools/real-gpu/capture.mjs --all --base https://aura3d.auraone.ai --dpr 2
// Linux GPU VM: add --chrome /usr/bin/google-chrome-stable --headless new (see tools/real-gpu/README.md).
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { evaluateStep } from "./evaluate-step.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);

const base = opt("base", "https://aura3d.auraone.ai").replace(/\/$/, "");
const out = resolve(opt("out", join("evidence", "real-gpu", new Date().toISOString().slice(0, 10))));
const dpr = Number(opt("dpr", "2"));
const width = Number(opt("width", "1440"));
const height = Number(opt("height", "900"));
const chromePath = opt("chrome", process.env.CHROME_PATH || "");
const headless = opt("headless", "new"); // "new" | "false" (headed: best on a Mac with a display)
const allowSoftware = flag("allow-software");
const scenarios = JSON.parse(readFileSync(join(here, "scenarios.json"), "utf8"));
const wanted = flag("all") ? Object.keys(scenarios) : opt("games", "").split(",").filter(Boolean);
if (!wanted.length) {
  console.error(`usage: capture.mjs --games ${Object.keys(scenarios).join(",")} | --all  [--base URL] [--out DIR] [--dpr 2] [--chrome PATH] [--headless new|false] [--allow-software]`);
  process.exit(2);
}

const gpuArgs = [
  "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-webgpu",
  ...(process.platform === "linux" ? ["--use-angle=vulkan", "--use-gl=angle", "--enable-features=Vulkan", "--disable-vulkan-surface"] : [])
];
const launch = {
  headless: headless !== "false",
  args: gpuArgs,
  ...(chromePath ? { executablePath: chromePath } : { channel: "chrome" })
};
if (headless === "new") launch.args.push("--headless=new");

mkdirSync(out, { recursive: true });
const browser = await chromium.launch(launch);
const report = { base, dpr, width, height, startedAt: new Date().toISOString(), renderer: null, games: {} };

const probeGpu = async (page) =>
  page.evaluate(() => {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    if (!gl) return { renderer: "NO_WEBGL", vendor: "" };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      halfFloatRT: !!(gl.getExtension("EXT_color_buffer_half_float") || gl.getExtension("EXT_color_buffer_float"))
    };
  });

const isSoftware = (r) => /swiftshader|llvmpipe|software|softpipe|microsoft basic/i.test(r || "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const key of wanted) {
  const sc = scenarios[key];
  if (!sc) { console.error(`unknown game ${key}`); continue; }
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  const log = { console: [], pageErrors: [], failed: [], badResponses: [], shots: [], evaluations: [] };
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) log.console.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => log.pageErrors.push(String(e).slice(0, 300)));
  page.on("requestfailed", (r) => log.failed.push(`${r.url().slice(0, 160)} ${r.failure()?.errorText}`));
  page.on("response", (r) => { if (r.status() >= 400) log.badResponses.push(`${r.status()} ${r.url().slice(0, 160)}`); });
  const url = `${base}${sc.path}${sc.query || ""}`;
  console.log(`== ${key}: ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  const gpu = await probeGpu(page);
  if (!report.renderer) {
    report.renderer = gpu;
    console.log(`WebGL renderer: ${gpu.renderer} (${gpu.vendor}) halfFloatRT=${gpu.halfFloatRT}`);
    if (isSoftware(gpu.renderer) && !allowSoftware) {
      console.error("REFUSING: this is a software renderer, not a real GPU. Use a machine with a GPU or pass --allow-software.");
      await browser.close();
      process.exit(3);
    }
  }
  await page.waitForSelector("canvas", { timeout: 60000 }).catch(() => log.pageErrors.push("no canvas within 60 s"));
  await sleep(sc.settleMs ?? 8000);
  let n = 0;
  const shot = async (label) => {
    const file = join(out, `${key}-${String(++n).padStart(2, "0")}-${label}.png`);
    await page.screenshot({ path: file });
    log.shots.push(file);
  };
  for (const step of sc.steps) {
    if (step.click) await page.getByText(step.click, { exact: false }).first().click({ timeout: 5000 }).catch(() => log.pageErrors.push(`click '${step.click}' failed`));
    if (step.press) await page.keyboard.press(step.press);
    if (step.down) await page.keyboard.down(step.down);
    if (step.up) await page.keyboard.up(step.up);
    if (step.hold) { await page.keyboard.down(step.hold.key); await sleep(step.hold.ms); await page.keyboard.up(step.hold.key); }
    if (step.wait) await sleep(step.wait);
    if (step.shot) await shot(step.shot);
    if (step.burst) for (let i = 0; i < step.burst.count; i++) { await shot(`${step.burst.label}${i}`); await sleep(step.burst.everyMs); }
    // GU47 E-I/E-F: `{ "evaluate": "<expression>" }` records the expression's JSON result (e.g. `__AURA_VFX_DEBUG__()`)
    // in report.json, after the step's shot so it describes the captured frame.
    if (step.evaluate) log.evaluations.push(await evaluateStep(page, step.evaluate, step.shot));
  }
  report.games[key] = { url, nonCanvas: !(await page.$("canvas")), ...log };
  await ctx.close();
}
await browser.close();
report.finishedAt = new Date().toISOString();
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
const bad = Object.entries(report.games).filter(([, g]) => g.pageErrors.length || g.badResponses.length);
console.log(`done: ${Object.keys(report.games).length} games, ${bad.length} with page errors or bad responses; screenshots in ${out}`);
