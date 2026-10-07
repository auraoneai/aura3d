/**
 * QR lane-01 capture (PRD-01 §16.4). Serves the built harness
 * (tests/qr/prd01/harness/dist) and captures each prd01-* scene on both
 * engines for every requested flag list. Metrics are computed in-page via
 * window.__QR_TOOLS__ so the same code runs in CI and in unit tests.
 *
 * Usage:
 *   pnpm exec vite build --config tests/qr/prd01/harness/vite.config.ts
 *   node tests/qr/prd01/capture.mjs --flags none --out docs/project/aura3d-quality-rebuild/evidence/prd01/IC-0
 *   node tests/qr/prd01/capture.mjs --flags none,core
 *
 * Options: --scenes <csv> --engines <csv> --flags <csv> --out <dir>
 *          --frames <n> (strip length for animated scenes, default 8)
 *          --timeout <ms> --dist <dir> --port <n>
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { startStaticServer } from "./serve.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const OUT_DIR = resolve(arg("--out", join(here, "out")));
const DIST = resolve(arg("--dist", join(here, "harness/dist")));
const PORT = Number(arg("--port", "0"));
const TIMEOUT = Number(arg("--timeout", "120000"));
const STRIP_FRAMES = Number(arg("--frames", "8"));
const STRIP_GAP_MS = Number(arg("--strip-gap-ms", "180"));
const SCENES = arg("--scenes", "prd01-scene-graph-hierarchy,prd01-tonemap-exposure-ramp,prd01-blend-modes,prd01-specular-aa,prd01-primitive-catalog,prd01-draw-throughput").split(",");
const ENGINES = arg("--engines", "aura3d,three").split(",");
const FLAG_SETS = arg("--flags", "none").split(",");

const TONEMAP_VARIANTS = [];
const AB_OPERATORS = ["aces", "agx"];
for (const operator of ["aces", "agx", "neutral"]) {
  for (const exposure of [0.5, 1, 2]) TONEMAP_VARIANTS.push({ tm: operator, exp: exposure });
}

const ANIMATED_SCENES = new Set(["prd01-specular-aa"]);

async function captureOne(browser, baseUrl, { scene, engine, flags, tm, exp }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  const url = `${baseUrl}/index.html?engine=${encodeURIComponent(engine)}&scene=${encodeURIComponent(scene)}&a3d-qr=${encodeURIComponent(flags)}${tm ? `&tm=${tm}` : ""}${exp ? `&exp=${exp}` : ""}`;
  await page.goto(url, { waitUntil: "load" });
  const ready = await page
    .waitForFunction(() => window.__QR_READY__ !== undefined || window.__QR_ERROR__ !== undefined, null, { timeout: TIMEOUT })
    .catch(() => null);
  if (!ready) {
    await page.close();
    return { scene, engine, error: "ready-timeout", errors };
  }
  const qrError = await page.evaluate(() => window.__QR_ERROR__);
  if (qrError) {
    await page.close();
    return { scene, engine, error: String(qrError), errors };
  }
  const payload = await page.evaluate(() => window.__QR_READY__);
  const png = await page.screenshot();
  let strip = [];
  if (ANIMATED_SCENES.has(scene)) {
    for (let i = 0; i < STRIP_FRAMES; i += 1) {
      await page.waitForTimeout(STRIP_GAP_MS);
      strip.push(await page.screenshot());
    }
  }
  await page.close();
  return { scene, engine, payload, png, strip, errors };
}

async function evalMetric(page, fnName, args) {
  return page.evaluate(
    async ({ fnName, args }) => {
      const tools = window.__QR_TOOLS__;
      const decode = (b64) => tools.decodePng(b64);
      const [a, b] = args.pngs ? await Promise.all(args.pngs.map(decode)) : [null, null];
      const frames = args.stripPngs ? await Promise.all(args.stripPngs.map(decode)) : undefined;
      const region = args.region;
      switch (fnName) {
        case "mask-iou":
          return tools.metrics.maskIoU(a, b, { region });
        case "mad":
          return tools.metrics.meanAbsDiff(a, b, region);
        case "ssim":
          return tools.metrics.regionSsim(a, b, region);
        case "delta-e":
          return tools.metrics.regionDeltaE2000Stats(a, b, region);
        case "temporal-sigma":
          return tools.metrics.temporalSigma(frames, region);
        default:
          return { error: `unknown metric ${fnName}` };
      }
    },
    { fnName, args }
  );
}

const specRegions = {
  "prd01-scene-graph-hierarchy": [
    { id: "vehicle", description: "vehicle group", rect: { x: 0.05, y: 0.15, w: 0.5, h: 0.7 } },
    { id: "sign", description: "sign group", rect: { x: 0.55, y: 0.15, w: 0.4, h: 0.7 } }
  ],
  "prd01-blend-modes": [
    { id: "quads", description: "blend columns", rect: { x: 0.06, y: 0.24, w: 0.88, h: 0.52 } }
  ],
  "prd01-primitive-catalog": [
    { id: "catalog", description: "primitive row", rect: { x: 0.04, y: 0.22, w: 0.92, h: 0.56 } }
  ],
  "prd01-tonemap-exposure-ramp": [
    { id: "ramp", description: "emissive ramp", rect: { x: 0.07, y: 0.3, w: 0.86, h: 0.28 } }
  ],
  "prd01-specular-aa": [
    { id: "spheres", description: "chrome sphere row", rect: { x: 0.1, y: 0.3, w: 0.8, h: 0.42 } }
  ]
};

const sceneMetric = {
  "prd01-scene-graph-hierarchy": "mask-iou",
  "prd01-tonemap-exposure-ramp": "delta-e",
  "prd01-blend-modes": "mad",
  "prd01-specular-aa": "temporal-sigma",
  "prd01-primitive-catalog": "mask-iou",
  "prd01-draw-throughput": "mask-iou"
};

async function main() {
  if (!ENGINES.includes("aura3d") || !ENGINES.includes("three")) {
    // metric comparisons need both; single-engine runs are allowed but marked.
    console.warn(`[prd01-capture] engines=${ENGINES.join(",")} — cross-engine metrics need both aura3d and three`);
  }
  const { server, url } = await startStaticServer(DIST, PORT);
  console.log(`[prd01-capture] serving ${DIST} at ${url}`);
  const browser = await chromium.launch();
  const failures = [];
  const report = { generated: new Date().toISOString(), flags: FLAG_SETS, scenes: {}, metrics: [], captures: [] };

  // metrics evaluate inside the harness page context (window.__QR_TOOLS__ is
  // set at module eval, before any scene mounts).
  const metricPage = await browser.newPage();
  await metricPage.goto(`${url}/index.html?engine=three&scene=__tools__`, { waitUntil: "load" });
  await metricPage.waitForFunction(() => window.__QR_TOOLS__ !== undefined, null, { timeout: 30000 });

  try {
    for (const flags of FLAG_SETS) {
      for (const sceneId of SCENES) {
        // Phase 5 (§14): the tonemap ramp captures the full tm × exp matrix on
        // both engines; every other scene under a core flag set captures the
        // ACES-vs-AgX A/B on aura3d (three stays on its default variant).
        const engineVariants = (engine) => sceneId === "prd01-tonemap-exposure-ramp"
          ? TONEMAP_VARIANTS
          : engine === "aura3d" && flags !== "none"
            ? AB_OPERATORS.map((tm) => ({ tm }))
            : [{}];
        const variantKey = (variant) => (variant.tm ? (variant.exp !== undefined ? `${variant.tm}-x${variant.exp}` : variant.tm) : "");
        const engineResults = { aura3d: new Map(), three: new Map() };
        for (const engine of ENGINES) {
          for (const variant of engineVariants(engine)) {
            const res = await captureOne(browser, url, { scene: sceneId, engine, flags, tm: variant.tm, exp: variant.exp });
            const dir = join(OUT_DIR, flags, sceneId);
            mkdirSync(dir, { recursive: true });
            const key = variantKey(variant);
            const suffix = key ? `.${key}` : "";
            if (res.png) writeFileSync(join(dir, `${engine}${suffix}.png`), res.png);
            if (res.strip?.length) {
              const stripDir = join(dir, `${engine}${suffix}.strip`);
              mkdirSync(stripDir, { recursive: true });
              res.strip.forEach((frame, i) => writeFileSync(join(stripDir, `${String(i).padStart(2, "0")}.png`), frame));
            }
            engineResults[engine].set(key, { res, variant });
            report.captures.push({
              scene: sceneId,
              engine,
              flags,
              variant,
              payload: res.payload,
              error: res.error,
              pageErrors: res.errors
            });
            if (res.error) failures.push(`${sceneId}/${engine}: ${res.error}`);
          }
        }

        // cross-engine metric: each aura3d variant pairs with the matching
        // three variant, else three's default capture.
        for (const [key, a] of engineResults.aura3d) {
          const t = engineResults.three.get(key) ?? engineResults.three.get("");
          const variant = a.variant;
          if (a.res.png && t?.res.png) {
            const metricName = sceneMetric[sceneId];
            const regions = specRegions[sceneId] ?? [undefined];
            for (const region of regions) {
              let metricArgs;
              if (metricName === "temporal-sigma") {
                const auraFrames = [a.res.png, ...a.res.strip].map((b) => b.toString("base64"));
                const threeFrames = [t.res.png, ...t.res.strip].map((b) => b.toString("base64"));
                const aura = await evalMetric(metricPage, "temporal-sigma", { stripPngs: auraFrames, region: region?.rect });
                const three = await evalMetric(metricPage, "temporal-sigma", { stripPngs: threeFrames, region: region?.rect });
                report.metrics.push({
                  scene: sceneId, flags, variant, region: region?.id ?? null, metric: "temporal-sigma",
                  aura3d: aura, three, ratio: aura.meanSigma && three.meanSigma ? aura.meanSigma / three.meanSigma : null
                });
              } else {
                metricArgs = {
                  pngs: [a.res.png.toString("base64"), t.res.png.toString("base64")],
                  region: region?.rect
                };
                const value = await evalMetric(metricPage, metricName, metricArgs);
                report.metrics.push({ scene: sceneId, flags, variant, region: region?.id ?? null, metric: metricName, value });
              }
            }
          }
          console.log(`[prd01-capture] ${flags} ${sceneId} ${variant.tm ? `${variant.tm}@${variant.exp ?? 1}` : ""} done`);
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
  const lines = ["# prd01 lane capture", "", `flags: ${FLAG_SETS.join(", ")}`, `scenes: ${SCENES.join(", ")}`, "", "## captures"];
  for (const c of report.captures) {
    lines.push(`- ${c.scene} [${c.engine}] flags=${c.flags} ${c.error ? `ERROR: ${c.error}` : `drawCalls=${c.payload?.drawCalls ?? "?"} loadMs=${c.payload?.loadMs ?? "?"}`}`);
  }
  lines.push("", "## metrics");
  for (const m of report.metrics) {
    lines.push(`- ${m.scene} ${m.region ?? ""} ${m.metric} flags=${m.flags}: ${JSON.stringify(m.value ?? { aura3d: m.aura3d?.meanSigma, three: m.three?.meanSigma, ratio: m.ratio })}`);
  }
  if (failures.length) {
    lines.push("", "## failures", ...failures.map((f) => `- ${f}`));
  }
  writeFileSync(join(OUT_DIR, "summary.md"), lines.join("\n"));
  console.log(`[prd01-capture] wrote ${join(OUT_DIR, "report.json")}`);
  if (failures.length) {
    console.error(`[prd01-capture] ${failures.length} capture failure(s)`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
