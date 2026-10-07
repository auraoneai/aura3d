/**
 * C-33 step plugin `burst` (PRD-06 §17.2/T4.8): `{"burst": {"frames": 150,
 * "intervalMs": 33, "region": "character"|"full"}}` timeline step — captures a
 * JPEG frame sequence plus a per-frame `diagnostics().animation` record read
 * through `globalThis.__AURA3D_LIVE_APPS__` (same registry capture-games.mjs
 * uses at :371).
 *
 * `region: "character"` clips each frame to the character's CSS-pixel rect,
 * published by the scene as `globalThis.__PRD06_CHARACTER_REGION__` — either a
 * `{x, y, width, height}` object or a zero-arg function returning one (re-read
 * per frame so a moving hero stays framed). When no region is published the
 * frame falls back to the full viewport and the record carries
 * `regionSource: "viewport"`.
 */
import path from "node:path";
import { writeFileSync } from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Evaluated in page: the published character region (CSS px) or null. */
function characterRegion() {
  const r = globalThis.__PRD06_CHARACTER_REGION__;
  const rect = typeof r === "function" ? r() : r;
  if (!rect || typeof rect !== "object") return null;
  const x = Number(rect.x), y = Number(rect.y), width = Number(rect.width), height = Number(rect.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { x: Math.max(0, Math.floor(x)), y: Math.max(0, Math.floor(y)), width: Math.ceil(width), height: Math.ceil(height) };
}

/** Evaluated in page: per-app diagnostics().animation snapshot. */
function animationDiagnostics() {
  const registry = globalThis.__AURA3D_LIVE_APPS__;
  const apps = registry?.all ? registry.all() : [];
  return apps.map((app, index) => {
    let animation = null;
    try { animation = app?.diagnostics?.()?.animation ?? null; } catch { /* ignore */ }
    return { index, animation };
  });
}

export default {
  name: "burst",
  owner: "prd06",
  async run(page, step, ctx) {
    const d = step.burst ?? {};
    const frames = d.frames ?? 150;
    const intervalMs = d.intervalMs ?? 33;
    const region = d.region ?? "full";
    const files = [];
    const records = [];
    for (let i = 0; i < frames; i++) {
      const clip = region === "character" ? await page.evaluate(characterRegion) : null;
      const file = path.join(ctx.outDir, `burst-${String(i).padStart(3, "0")}.jpg`);
      await page.screenshot({
        path: file,
        type: "jpeg",
        quality: 82,
        timeout: 20_000,
        animations: "allow",
        ...(clip ? { clip } : {})
      });
      files.push(file);
      records.push({
        frame: i,
        at: Date.now(),
        regionSource: region === "character" ? (clip ? "character" : "viewport") : "full",
        animation: await page.evaluate(animationDiagnostics)
      });
      if (i < frames - 1) await sleep(intervalMs);
    }
    const jsonFile = path.join(ctx.outDir, "burst-animation.json");
    writeFileSync(jsonFile, JSON.stringify({ frames, intervalMs, region, records }, null, 2));
    files.push(jsonFile);
    ctx.log(`burst: ${frames} frames @ ${intervalMs}ms region=${region}`);
    return { files, data: { frames, intervalMs, region, records: records.length } };
  }
};
