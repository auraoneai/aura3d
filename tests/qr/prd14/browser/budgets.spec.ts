import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { builtDist, ROOT, serve, watchConsole } from "./lib/serve";

/**
 * PRD-14 §16.1 S8 + S9 for every selected route (A3D_QR_ROUTES, default all 18).
 * S8: after warm-up at `?aura3d-quality=medium`, `diagnostics().drawCalls` is
 *     within the games.json Medium budget (§7.2.1) and the C-28 counter
 *     `diagnostics().frame.readbacksThisFrame` is 0 on every sampled frame.
 * S9: p95 requestAnimationFrame interval ≤ 50 ms at 1280×720 across the
 *     sampling window (A3D_S9_WINDOW_MS, default the 60 s timeline).
 * Reads the route beacon `window.__AURA3D_GAME__.app` (the v2 boots publish
 * the mounted app there); a route that does not expose it fails.
 */

interface GamesEntry {
  readonly id: string;
  readonly appDir?: string;
  readonly qrFlags?: readonly string[];
  readonly budgets?: { readonly drawCalls?: Readonly<Record<string, number>> };
}

const WARMUP_MS = 3_000;
const S9_WINDOW_MS = Number(process.env.A3D_S9_WINDOW_MS ?? 60_000);
const S9_P95_MAX_MS = 50;

const games = (JSON.parse(readFileSync(join(ROOT, "tools/quality-rebuild-capture/games.json"), "utf8")) as {
  games: GamesEntry[];
}).games;
const wanted = (process.env.A3D_QR_ROUTES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const selected = games.filter((g) => wanted.length === 0 || wanted.includes(g.appDir ?? g.id) || wanted.includes(g.id));

interface FrameSample { drawCalls: number; readbacks: number | null; hasFrameSection: boolean }

test.describe("S8 draws/readbacks + S9 stall-free (PRD-14 §16.1)", () => {
  test.describe.configure({ timeout: S9_WINDOW_MS + 120_000 });

  for (const entry of selected) {
    const appDir = entry.appDir ?? entry.id;
    const medium = entry.budgets?.drawCalls?.medium;

    test(`${appDir}: S8 Medium draws ≤ budget, 0 readbacks; S9 p95 rAF ≤ ${S9_P95_MAX_MS} ms`, async ({ page }) => {
      expect(medium, `${appDir}: games.json has no budgets.drawCalls.medium`).toBeGreaterThan(0);
      const root = builtDist(appDir);
      expect(root, `${appDir} not built`).not.toBeUndefined();
      const errors = watchConsole(page);
      const { server, url } = await serve(root!);
      try {
        await page.setViewportSize({ width: 1280, height: 720 });
        const flags = (entry.qrFlags ?? []).join(",");
        await page.goto(`${url}/?a3d-qr=${flags}&aura3d-quality=medium&autorun=1`);
        await expect.poll(() => page.evaluate(() =>
          (window as unknown as { __AURA3D_GAME__?: { state?: string } }).__AURA3D_GAME__?.state), { timeout: 30_000 })
          .toBe("playing");
        await page.waitForTimeout(WARMUP_MS);

        // S9: rAF intervals over the window, measured in the page.
        const intervals = await page.evaluate((windowMs) => new Promise<number[]>((resolve) => {
          const out: number[] = [];
          let last = performance.now();
          const end = last + windowMs;
          const tick = (now: number) => {
            out.push(now - last);
            last = now;
            if (now < end) requestAnimationFrame(tick); else resolve(out);
          };
          requestAnimationFrame(tick);
        }), S9_WINDOW_MS);

        // S8: sample diagnostics on several frames after warm-up.
        const samples: FrameSample[] = [];
        for (let i = 0; i < 10; i += 1) {
          samples.push(await page.evaluate(() => {
            const beacon = (window as unknown as { __AURA3D_GAME__?: { app?: { diagnostics?: () => Record<string, unknown> } } }).__AURA3D_GAME__;
            const d = beacon?.app?.diagnostics?.() ?? {};
            const frame = d.frame as { readbacksThisFrame?: number } | undefined;
            return {
              drawCalls: typeof d.drawCalls === "number" ? d.drawCalls : -1,
              readbacks: typeof frame?.readbacksThisFrame === "number" ? frame.readbacksThisFrame : null,
              hasFrameSection: frame !== undefined
            };
          }));
          await page.waitForTimeout(200);
        }

        const sorted = [...intervals].sort((a, b) => a - b);
        const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? Infinity;
        const maxDraws = Math.max(...samples.map((s) => s.drawCalls));
        test.info().annotations.push({
          type: "s8-s9",
          description: JSON.stringify({ appDir, medium, maxDraws, readbacks: samples.map((s) => s.readbacks), p95, frames: intervals.length })
        });

        expect(samples.every((s) => s.drawCalls >= 0), `${appDir}: beacon app.diagnostics() unavailable`).toBe(true);
        expect(maxDraws, `${appDir}: S8 draw calls`).toBeLessThanOrEqual(medium!);
        expect(samples.every((s) => s.hasFrameSection), `${appDir}: diagnostics().frame (C-28 counters) missing`).toBe(true);
        expect(samples.map((s) => s.readbacks), `${appDir}: S8 readbacks per frame`).toEqual(samples.map(() => 0));
        expect(p95, `${appDir}: S9 p95 rAF interval (ms)`).toBeLessThanOrEqual(S9_P95_MAX_MS);
        expect(errors).toEqual([]);
      } finally {
        server.close();
      }
    });
  }
});
