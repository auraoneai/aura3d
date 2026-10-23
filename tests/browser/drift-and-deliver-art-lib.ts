import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { FRAME_SHOTS, keysFromMask } from "../../tools/crayon-capture/drift-and-deliver-lib";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Photographs the port at the same states as the original's look-reference frames
 * (tools/crayon-capture/drift-and-deliver-frames.ts), 1024 x 576, canvas only (the DOM HUD is not in the capture).
 * Remote only. Every frame is logged as `@@KG_CHUNK <name> <variant> <i>/<n> <base64 jpeg slice>` so
 * `drift-and-deliver-frames-assemble.ts` unpacks it; per-frame image statistics are logged as `DRIFT_ART_METRICS`.
 */

interface ArtApi {
  ready(): boolean;
  reset(): unknown;
  teleport(x: number, z: number, heading?: number): unknown;
  stepFrames(n: number, keys?: Record<string, boolean>): unknown;
  frame(w?: number, h?: number, q?: number): Promise<string>;
  counts(): { blocks: number; buildings: number; trees: number; traffic: number; pickups: number; solids: number };
  diagnostics(): { drawCalls?: number; triangles?: number; errors?: readonly unknown[] } | null;
  info(): unknown;
}

export function registerArtShots(lab: string, only: readonly string[] = [], query = ""): void {
  test.describe(`drift-and-deliver art frames: ${lab}${query}`, () => {
    test.setTimeout(3_300_000);
    let server: ExampleDevServer;
    test.beforeAll(async () => {
      server = await startExampleDevServer();
      mkdirSync(resolve("tests/reports/drift-and-deliver-art"), { recursive: true });
    });
    test.afterAll(async () => {
      await server.close();
    });

    test("photographs the shot list", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.setViewportSize({ width: 1024, height: 576 });
      await page.goto(`${server.origin}/examples/${lab}/?manual=1&quality=high${query}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => {
          const w = window as unknown as { __AURA_DRIFT_AND_DELIVER__?: { ready(): boolean }; __AURA_DRIFT_AND_DELIVER_ERROR__?: string };
          return w.__AURA_DRIFT_AND_DELIVER__?.ready() === true || Boolean(w.__AURA_DRIFT_AND_DELIVER_ERROR__);
        },
        undefined,
        { timeout: 900_000 }
      );
      const bootError = await page.evaluate(() => (window as unknown as { __AURA_DRIFT_AND_DELIVER_ERROR__?: string }).__AURA_DRIFT_AND_DELIVER_ERROR__ ?? null);
      expect(bootError, JSON.stringify(errors.slice(0, 8))).toBeNull();
      const api = <T>(fn: (o: ArtApi) => T | Promise<T>): Promise<T> => page.evaluate(`(${fn.toString()})(window.__AURA_DRIFT_AND_DELIVER__)`) as Promise<T>;
      console.log("DRIFT_ART_COUNTS", lab, JSON.stringify(await api((o) => o.counts())));

      const emit = (name: string, variant: string, b64: string): void => {
        const CHUNK = 48000;
        const total = Math.ceil(b64.length / CHUNK);
        for (let i = 0; i < total; i++) console.log(`\n@@KG_CHUNK ${name} ${variant} ${i + 1}/${total} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}\n`);
      };

      await api((o) => { o.reset(); return 0; });
      for (const shot of FRAME_SHOTS) {
        if (shot.splash) continue;
        if (only.length && !only.includes(shot.name)) continue;
        if (shot.spawn) await page.evaluate(`window.__AURA_DRIFT_AND_DELIVER__.teleport(${shot.spawn.x}, ${shot.spawn.z}, ${shot.spawn.heading})`);
        if (shot.drive) {
          for (const seg of shot.drive) {
            const keys = JSON.stringify(keysFromMask(seg.keys));
            await page.evaluate(`window.__AURA_DRIFT_AND_DELIVER__.stepFrames(${seg.steps}, ${keys})`);
          }
        } else {
          await page.evaluate(`window.__AURA_DRIFT_AND_DELIVER__.stepFrames(150)`);
        }
        // the post-mount texture upgrade is asynchronous: render a few more frames and give it time before photographing
        for (let i = 0; i < 3; i++) {
          await page.evaluate(`window.__AURA_DRIFT_AND_DELIVER__.stepFrames(0)`);
          await page.waitForTimeout(2500);
        }
        const textured = await page.evaluate(() => {
          const d = (window as unknown as { __AURA_DRIFT_AND_DELIVER__: { diagnostics(): { renderer?: { runtime?: { texturedMaterials?: { name?: string; pixelBacked?: boolean }[] } } } | null } }).__AURA_DRIFT_AND_DELIVER__.diagnostics();
          const list = d?.renderer?.runtime?.texturedMaterials ?? [];
          return { total: list.length, pixelBacked: list.filter((m) => m.pixelBacked).length, notBacked: list.filter((m) => !m.pixelBacked).map((m) => m.name).slice(0, 6) };
        });
        console.log("DRIFT_ART_TEXTURES", lab, shot.name, JSON.stringify(textured));
        const data = await api((o) => o.frame(1024, 576, 0.9));
        emit(shot.name, "clean", data.split(",")[1] as string);
        const m = await page.evaluate(async () => {
          const o = (window as unknown as { __AURA_DRIFT_AND_DELIVER__: { pixels(): Promise<{ width: number; height: number; data: Uint8ClampedArray }>; diagnostics(): { drawCalls?: number } | null } }).__AURA_DRIFT_AND_DELIVER__;
          const { width, height, data } = await o.pixels();
          let sum = 0;
          const seen = new Set<number>();
          for (let i = 0; i < width * height; i++) {
            sum += 0.2126 * data[i * 4]! + 0.7152 * data[i * 4 + 1]! + 0.0722 * data[i * 4 + 2]!;
            seen.add(((data[i * 4]! >> 4) << 8) | ((data[i * 4 + 1]! >> 4) << 4) | (data[i * 4 + 2]! >> 4));
          }
          return { width, height, lumaMean: sum / (width * height), colors: seen.size, drawCalls: o.diagnostics()?.drawCalls };
        });
        console.log("DRIFT_ART_METRICS", lab, shot.name, JSON.stringify(m));
      }
      // fps proxy: wall time of render + read-back on software GL (relative numbers only; not a GPU frame time)
      const perf = await page.evaluate(async () => {
        const o = (window as unknown as { __AURA_DRIFT_AND_DELIVER__: { stepFrames(n: number): unknown; pixels(): Promise<unknown>; diagnostics(): { drawCalls?: number } | null } }).__AURA_DRIFT_AND_DELIVER__;
        const ms: number[] = [];
        for (let i = 0; i < 5; i++) {
          const t0 = performance.now();
          o.stepFrames(0);
          await o.pixels();
          ms.push(performance.now() - t0);
        }
        const tail = ms.slice(1);
        return { meanMs: tail.reduce((a, b) => a + b, 0) / tail.length, minMs: Math.min(...tail), drawCalls: o.diagnostics()?.drawCalls };
      });
      console.log("DRIFT_ART_PERF", lab, JSON.stringify(perf));
      const diag = await api((o) => ({ d: o.diagnostics(), info: o.info() }));
      console.log("DRIFT_ART_DIAG", lab, JSON.stringify({ drawCalls: diag.d?.drawCalls, triangles: diag.d?.triangles, errors: diag.d?.errors?.length ?? 0 }), JSON.stringify(diag.info).slice(0, 600));
      expect(diag.d?.drawCalls ?? 0, "the models and the city must draw").toBeGreaterThan(0);
      expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([]);
    });
  });
}
