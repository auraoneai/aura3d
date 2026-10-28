import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Bloom pass-fusion variants on the PBR viewer (milk truck), software WebGL2. Exploration spec: for each variant it
 * records draws (split fullscreen vs mesh, per viewport), the steady frame time (median of FRAMES frames, repeated
 * REPS times in rotating order), and the frame difference against `quality: "production"`.
 *
 *   EXTRA_DIRS="fixtures/environment-corpus/hdri" SPECS=tests/browser/bloom-fusion-variants.spec.ts tools/remote-acr/run.sh
 *
 * Decision rule (coordinator): no software-GL frame-time regression against production (<= +5%) and draws <= 25.
 */
const FRAMES = Number(process.env.FUSION_FRAMES ?? 8);
const REPS = Number(process.env.FUSION_REPS ?? 4);

interface Variant { readonly id: string; readonly query: string }
// Round 1 (all nine variants, 5 frames x 2 reps) chose the default below; this list is the confirmation round.
const VARIANTS: readonly Variant[] = [
  { id: "production", query: "quality=production" },
  { id: "acc+ext", query: "quality=auto&fusion=acc=1,b2d=5,ext=1" },
  { id: "acc+ext+b2d4", query: "quality=auto&fusion=acc=1,b2d=4,ext=1" },
  { id: "default(acc+ext+b2d3)", query: "quality=auto" }
];

const GL_HOOK = `(() => {
  const c = { draws: 0, fullscreen: 0, mesh: 0, byViewport: {} };
  window.__GLC__ = c;
  const proto = WebGL2RenderingContext.prototype;
  let viewport = "unset";
  const vp = proto.viewport;
  proto.viewport = function (x, y, w, h) { viewport = w + "x" + h; return vp.call(this, x, y, w, h); };
  for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "drawRangeElements"]) {
    const orig = proto[name];
    if (!orig) continue;
    proto[name] = function (...a) {
      const kind = name === "drawArrays" && a[2] === 3 ? "fs" : "mesh";
      c.draws++;
      c[kind === "fs" ? "fullscreen" : "mesh"]++;
      const key = viewport + ":" + kind;
      c.byViewport[key] = (c.byViewport[key] || 0) + 1;
      return orig.apply(this, a);
    };
  }
})();`;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

test.describe("PBR viewer bloom fusion variants (software WebGL2)", () => {
  test.setTimeout(55 * 60_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("variants", async ({ browser }) => {
    const sha = createHash("sha256").update(readFileSync(resolve("fixtures/threejs-parity/assets/physics/cesium-milk-truck.glb"))).digest("hex");
    const times = new Map<string, number[]>();
    const draws = new Map<string, unknown>();
    const frames = new Map<string, Buffer>();
    for (let rep = 0; rep < REPS; rep += 1) {
      const order = rep % 2 === 0 ? VARIANTS : [...VARIANTS].reverse();
      for (const variant of order) {
        const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
        const page = await context.newPage();
        const problems: string[] = [];
        page.on("console", (m) => { if ((m.type() === "warning" || m.type() === "error") && !/GPU stall due to ReadPixels/.test(m.text())) problems.push(m.text().slice(0, 160)); });
        page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 160)}`));
        await page.addInitScript(GL_HOOK);
        await page.goto(`${server.origin}/tests/browser/frame-cost-pbr-harness.html?sha=${sha}&${variant.query}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => Boolean((window as unknown as { __PBR__?: unknown }).__PBR__), undefined, { timeout: 300_000 });
        const result = await page.evaluate(async ([n, wantPixels]) => {
          const api = (window as unknown as { __PBR__: { ready: boolean; errors: string[]; stepOnce(): void; measure(n: number): number[]; settledPixels(f: number): Promise<string> } }).__PBR__;
          const glc = (window as unknown as { __GLC__: { draws: number; fullscreen: number; mesh: number; byViewport: Record<string, number> } }).__GLC__;
          if (!api.ready) return { error: api.errors.join(" | ") };
          for (let i = 0; i < 8; i += 1) api.stepOnce();
          glc.draws = 0; glc.fullscreen = 0; glc.mesh = 0; glc.byViewport = {};
          api.stepOnce();
          const counted = { draws: glc.draws, fullscreen: glc.fullscreen, mesh: glc.mesh, byViewport: { ...glc.byViewport } };
          const totals = api.measure(n);
          const pixels = wantPixels ? await api.settledPixels(3) : "";
          return { counted, totals, pixels };
        }, [FRAMES, rep === 0] as const).catch((e: Error) => ({ error: e.message }));
        if ("error" in result) throw new Error(`${variant.id}: ${result.error}`);
        expect(problems, variant.id).toEqual([]);
        times.set(variant.id, [...(times.get(variant.id) ?? []), median(result.totals)]);
        draws.set(variant.id, result.counted);
        if (result.pixels) frames.set(variant.id, Buffer.from(result.pixels, "base64"));
        await context.close();
      }
    }
    const reference = frames.get("production")!;
    const report = VARIANTS.map((variant) => {
      const own = frames.get(variant.id);
      let mean = 0;
      let max = 0;
      if (own) {
        let sum = 0;
        for (let i = 0; i < reference.length; i += 4) {
          for (let c = 0; c < 3; c += 1) {
            const d = Math.abs(reference[i + c]! - own[i + c]!);
            sum += d;
            if (d > max) max = d;
          }
        }
        mean = sum / ((reference.length / 4) * 3);
      }
      const t = times.get(variant.id) ?? [];
      return { id: variant.id, medianFrameMs: Math.round(median(t) * 10) / 10, repsMs: t.map((x) => Math.round(x)), draws: draws.get(variant.id), meanAbsDiffVsProduction: Math.round(mean * 1000) / 1000, maxDiffVsProduction: max };
    });
    const production = report.find((r) => r.id === "production")!.medianFrameMs;
    for (const row of report) console.log(`PBR_VARIANT ${JSON.stringify({ ...row, vsProductionPercent: Math.round(((row.medianFrameMs / production) - 1) * 1000) / 10 })}`);
  });
});
