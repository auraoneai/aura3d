/**
 * PRD-13 T3.13 — the template look floor checker.
 *
 * Static half (PR CI, via `tools/agent-templates/index.ts`): every
 * create-aura3d template declares its §6.4 look — `looks.preset("<id>")` in
 * `src/main.ts`, the plan-resolved look for the prompt-plan template, or the
 * stage-set look for animation-studio — and ships a screenshot spec that runs
 * `assertTemplateLookFloor`.
 *
 * Runtime half (macos-14 in `template-lookdev.yml`): `look-floor.mjs --runtime`
 * walks the capture tool's scaffold work dirs (or `--dist <dir>` for one) and
 * probes each built template's first frame for the floor values — lit pixels,
 * `appliedLook.environment.specularIntensity > 0`, shadow strength, pixelRatio —
 * through `__AURA3D_LIVE_APPS__`. Exit code 1 on any finding.
 *
 *   node tools/agent-templates/look-floor.mjs --static
 *   node tools/agent-templates/look-floor.mjs --runtime --work <dir>
 *   node tools/agent-templates/look-floor.mjs --runtime --dist <dir> --template <id>
 */

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const templateRoot = path.join(repoRoot, "packages", "create-aura3d", "templates");

/**
 * §6.4/§T3.x expected look per template.
 * anchor "preset"  — src/main.ts must contain `looks.preset("<look>")`.
 * anchor "plan"    — the compiled prompt plan resolves it; main.ts carries the
 *                    look id in evidence (cinematic-scene: night-city).
 * anchor "set"     — bespoke renderer; the default stage set carries the look
 *                    marker comment (animation-studio: interior-warm).
 */
export const TEMPLATE_LOOK_FLOOR = Object.freeze({
  "mini-game": Object.freeze({ look: "outdoor-day", anchor: "preset" }),
  "racing-starter": Object.freeze({ look: "golden-hour", anchor: "preset" }),
  "falling-blocks-starter": Object.freeze({ look: "neon-arcade", anchor: "preset" }),
  "fighting-game": Object.freeze({ look: "arena-fight", anchor: "preset" }),
  "character-controller": Object.freeze({ look: "outdoor-day", anchor: "preset" }),
  "arena-shooter": Object.freeze({ look: "space", anchor: "preset" }),
  "product-viewer": Object.freeze({ look: "product-studio", anchor: "preset" }),
  "cinematic-scene": Object.freeze({ look: "night-city", anchor: "plan" }),
  "animation-channel": Object.freeze({ look: "character-showcase", anchor: "preset" }),
  "prompt-animation-channel": Object.freeze({ look: "character-showcase", anchor: "preset" }),
  "episode-builder": Object.freeze({ look: "character-showcase", anchor: "preset" }),
  "animation-studio": Object.freeze({ look: "interior-warm", anchor: "set" }),
  "three-compat-premium-product-viewer": Object.freeze({ look: "product-studio", anchor: "preset" }),
  "three-compat-architecture-interior": Object.freeze({ look: "interior-warm", anchor: "preset" }),
  "three-compat-postprocess-scene": Object.freeze({ look: "neon-arcade", anchor: "preset" }),
  "three-compat-material-authoring": Object.freeze({ look: "product-studio", anchor: "preset" }),
  "three-compat-large-scene": Object.freeze({ look: "outdoor-day", anchor: "preset" }),
  "three-compat-character-viewer": Object.freeze({ look: "character-showcase", anchor: "preset" }),
  "three-compat-asset-inspector": Object.freeze({ look: "product-studio", anchor: "preset" }),
  "three-compat-custom-threejs-migration": Object.freeze({ look: "outdoor-day", anchor: "preset" })
});

function readIfExists(file) {
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

/** Static floor checks for one template dir. Returns findings (empty = pass). */
export function lookFloorStaticFindings(template) {
  const dir = path.join(templateRoot, template);
  const entry = TEMPLATE_LOOK_FLOOR[template];
  const findings = [];
  if (!entry) return [`${template}: no §6.4 look-floor row`];

  if (entry.anchor === "preset") {
    const main = readIfExists(path.join(dir, "src", "main.ts"));
    // Accepts both `looks.preset("<id>")` and `looks.preset(LOOK_ID)` with a
    // `LOOK_ID = "<id>"` const — the look id must appear in the file.
    if (!main.includes("looks.preset(") || !main.includes(`"${entry.look}"`)) {
      findings.push(`${template}: src/main.ts must apply looks.preset("${entry.look}")`);
    }
    if (/lights\.ambient\(/.test(main)) {
      findings.push(`${template}: src/main.ts still uses lights.ambient() — the look's environment owns ambient`);
    }
  } else if (entry.anchor === "plan") {
    const main = readIfExists(path.join(dir, "src", "main.ts"));
    // The plan resolves the look at compile time (keyword-mapped); the resolved
    // id is asserted by the template's route-health spec and the runtime floor.
    // Static floor: the v2 compiler call + the resolved look must surface in
    // evidence (`report.look`).
    if (!main.includes("compilePromptPlanV2") || !main.includes("report.look")) {
      findings.push(`${template}: src/main.ts must compilePromptPlanV2 and surface report.look (resolves to "${entry.look}")`);
    }
  } else if (entry.anchor === "set") {
    const sets = readIfExists(path.join(dir, "src", "set-templates.ts"));
    if (!sets.includes(entry.look)) {
      findings.push(`${template}: default stage set must adopt the "${entry.look}" look values`);
    }
  }

  const spec = readIfExists(path.join(dir, "tests", "screenshot.spec.ts"));
  if (!spec.includes("assertTemplateLookFloor")) {
    findings.push(`${template}: tests/screenshot.spec.ts must call assertTemplateLookFloor`);
  }
  if (!existsSync(path.join(dir, "tests", "look-floor.ts"))) {
    findings.push(`${template}: tests/look-floor.ts (shared floor probe) is missing`);
  }
  return findings;
}

/** Static scan across every template row. Returns findings (empty = pass). */
export function lookFloorStaticScan(templates = Object.keys(TEMPLATE_LOOK_FLOOR)) {
  return templates.flatMap((template) => lookFloorStaticFindings(template));
}

// ---------------------------------------------------------------------------
// Runtime floor: same five checks as tests/look-floor.ts, run against a built
// template's dist/ on this machine's Playwright.
// ---------------------------------------------------------------------------

const FLOOR_PROBE = `(() => {
  const target = document.querySelector("canvas");
  const empty = { sampledPixels: 0, brightPixels: 0, uniqueBuckets: 0, appliedLook: null, lookLintErrors: ["no-canvas"], devicePixelRatio: globalThis.devicePixelRatio ?? 1 };
  if (!target) return empty;
  const gl = target.getContext("webgl2", { preserveDrawingBuffer: true }) ?? target.getContext("webgl", { preserveDrawingBuffer: true });
  if (!gl) return { ...empty, lookLintErrors: ["no-webgl-context"] };
  const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let sampled = 0, bright = 0;
  const buckets = new Set();
  for (let y = 0; y < height; y += 4) for (let x = 0; x < width; x += 4) {
    const o = (y * width + x) * 4;
    const r = pixels[o] ?? 0, g = pixels[o + 1] ?? 0, b = pixels[o + 2] ?? 0;
    sampled += 1;
    buckets.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
    if (0.2126 * r + 0.7152 * g + 0.0722 * b > 48) bright += 1;
  }
  const apps = (globalThis).__AURA3D_LIVE_APPS__?.all?.() ?? [];
  const diagnostics = apps[0]?.diagnostics?.() ?? null;
  const appliedLook = diagnostics?.appliedLook ? {
    specularIntensity: diagnostics.appliedLook.environment?.specularIntensity ?? 0,
    shadowStrength: diagnostics.appliedLook.shadows?.strength ?? null,
    pixelRatio: diagnostics.appliedLook.pixelRatio ?? 0,
    renderPath: diagnostics.appliedLook.renderPath ?? "unknown"
  } : null;
  return {
    sampledPixels: sampled,
    brightPixels: bright,
    uniqueBuckets: buckets.size,
    appliedLook,
    lookLintErrors: (diagnostics?.look?.lint ?? []).filter((f) => f.severity === "error").map((f) => f.code ?? "unknown"),
    devicePixelRatio: globalThis.devicePixelRatio ?? 1
  };
})()`;

function runtimeFindings(template, report) {
  const findings = [];
  if (report.brightPixels / Math.max(1, report.sampledPixels) <= 0.02) findings.push(`${template}: frame is blank (<2% lit pixels)`);
  if (report.uniqueBuckets <= 8) findings.push(`${template}: frame lacks colour variety (${report.uniqueBuckets} buckets)`);
  if (report.lookLintErrors.length) findings.push(`${template}: look lint errors ${report.lookLintErrors.join(", ")}`);
  const applied = report.appliedLook;
  if (applied === null) {
    // The bespoke-renderer template has no live app; its stage floor is the
    // static interior-warm check plus the non-blank assertions above.
    if (template !== "animation-studio") findings.push(`${template}: no appliedLook diagnostics — is a createAuraApp mounted?`);
    return findings;
  }
  if (!(applied.specularIntensity > 0)) findings.push(`${template}: appliedLook.environment.specularIntensity ${applied.specularIntensity} <= 0`);
  if (applied.shadowStrength !== null && applied.shadowStrength < 0.8) findings.push(`${template}: shadow strength ${applied.shadowStrength} < 0.8`);
  const expectedPixelRatio = Math.min(report.devicePixelRatio, 2);
  if (applied.pixelRatio < expectedPixelRatio) findings.push(`${template}: pixelRatio ${applied.pixelRatio} < min(dpr ${report.devicePixelRatio}, tier cap 2)`);
  return findings;
}

async function runRuntime(workDir, singleDist, singleTemplate) {
  const { chromium } = await import("@playwright/test");
  const gpuArgs = (process.env.QRC_GPU_ARGS ?? "").split(" ").filter(Boolean);
  const targets = [];
  if (singleDist) {
    targets.push({ template: singleTemplate ?? "adhoc", distDir: path.resolve(singleDist) });
  } else {
    const root = path.resolve(workDir ?? path.join(repoRoot, "tools", "agent-templates", "out", "template-lookdev", "work"));
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const dist = path.join(root, entry.name, "dist");
      if (entry.isDirectory() && existsSync(path.join(dist, "index.html"))) targets.push({ template: entry.name, distDir: dist });
    }
  }
  if (targets.length === 0) throw new Error("no built template dist/ found — run capture-templates.mjs first (or pass --dist)");

  const results = [];
  const failures = [];
  const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", ...gpuArgs] });
  try {
    const { createServer } = await import("node:http");
    const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".wasm": "application/wasm", ".hdr": "application/octet-stream", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".woff2": "font/woff2" };
    for (const { template, distDir } of targets) {
      const server = createServer((req, res) => {
        const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
        const file = path.join(distDir, urlPath === "/" ? "index.html" : urlPath);
        if (!file.startsWith(distDir) || !existsSync(file) || !file.includes(distDir)) { res.statusCode = 404; res.end(); return; }
        res.setHeader("content-type", types[path.extname(file)] ?? "application/octet-stream");
        res.end(readFileSync(file));
      });
      await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
      const port = server.address().port;
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      try {
        await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 60_000 });
        // readiness: data-aura3d-ready for engine apps; the live-route proof for
        // animation-studio; otherwise settle on first canvas + 6s.
        await page.waitForFunction(
          () => document.body.dataset.aura3dReady === "true" || globalThis.__AURA_LIVE_ROUTE_READY__?.ready === true || document.querySelectorAll("canvas").length > 0,
          { timeout: 60_000 }
        ).catch(() => undefined);
        await page.waitForTimeout(4_000);
        const report = await page.evaluate(FLOOR_PROBE);
        const findings = runtimeFindings(template, report);
        results.push({ template, report, findings });
        for (const finding of findings) failures.push(finding);
      } catch (error) {
        failures.push(`${template}: probe threw ${String(error?.message ?? error).slice(0, 200)}`);
      } finally {
        await page.close().catch(() => undefined);
        server.close();
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
  return { results, failures };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(name);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

  if (flag("--static") || args.length === 0) {
    const findings = lookFloorStaticScan();
    const report = { schema: "aura3d.look-floor/1", mode: "static", findings };
    const outDir = path.join(repoRoot, "tests", "reports");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, "look-floor-static.json"), `${JSON.stringify(report, null, 2)}\n`);
    if (findings.length) { console.error(`look-floor static: ${findings.length} finding(s)`); findings.forEach((f) => console.error(`  - ${f}`)); process.exit(1); }
    console.log(`look-floor static: ${Object.keys(TEMPLATE_LOOK_FLOOR).length} templates clean`);
    process.exit(0);
  }

  if (flag("--runtime")) {
    const { results, failures } = await runRuntime(opt("--work"), opt("--dist"), opt("--template"));
    const report = { schema: "aura3d.look-floor/1", mode: "runtime", results, failures };
    const outDir = path.join(repoRoot, "tests", "reports");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, "look-floor-runtime.json"), `${JSON.stringify(report, null, 2)}\n`);
    if (failures.length) { console.error(`look-floor runtime: ${failures.length} finding(s)`); failures.forEach((f) => console.error(`  - ${f}`)); process.exit(1); }
    console.log(`look-floor runtime: ${results.length} templates clean`);
    process.exit(0);
  }

  console.error("usage: look-floor.mjs --static | --runtime [--work <dir> | --dist <dir> --template <id>]");
  process.exit(2);
}
