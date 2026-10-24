import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * strange-orbit-port rework (docs/workflows/game-rework-prompt.md section 3.5): solid scenery has
 * consequences in zero-G flight. Remote-only (tools/remote-acr/run.sh), software WebGL2.
 * Drives the real page: flies the rider straight at a gate pillar, the gate lintel, a boulder and the
 * observatory at 35 m/s and checks one impact each, no pass-through, a hit notice, no console errors
 * and a live frame at approach, contact and rebound.
 */

const REPORT_ROOT = resolve("tests/reports/strange-orbit-rework");
const LAB = "/examples/strange-orbit-port/";

interface Collider { id: string; label: string; a: number[]; b: number[]; radius: number; approach: number[] }

test.describe("strange-orbit-port rework: impacts", () => {
  test.setTimeout(1_800_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_ROOT, { recursive: true });
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("flying into gate pillars, the lintel, boulders and the observatory stops the rider", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto(`${server.origin}${LAB}?manual=1&quality=low`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __AURA_STRANGE_ORBIT__?: { ready(): boolean }; __AURA_STRANGE_ORBIT_ERROR__?: string };
        return w.__AURA_STRANGE_ORBIT__?.ready() === true || Boolean(w.__AURA_STRANGE_ORBIT_ERROR__);
      },
      undefined,
      { timeout: 540_000 }
    );
    const bootError = await page.evaluate(() => (window as unknown as { __AURA_STRANGE_ORBIT_ERROR__?: string }).__AURA_STRANGE_ORBIT_ERROR__ ?? null);
    expect(bootError, JSON.stringify(errors.slice(0, 8))).toBeNull();

    const frame = async (name: string): Promise<void> => {
      const data = await page.evaluate(() => (window as unknown as { __AURA_STRANGE_ORBIT__: { frame(w: number, h: number, q: number): Promise<string> } }).__AURA_STRANGE_ORBIT__.frame(640, 360, 0.7));
      const b64 = data.split(",")[1] ?? "";
      const parts = Math.ceil(b64.length / 1800);
      for (let i = 0; i < parts; i++) console.log(`STRANGE_ORBIT_REWORK_FRAMEPART ${name} ${i + 1}/${parts} ${b64.slice(i * 1800, (i + 1) * 1800)}`);
    };

    // start a race and run the countdown out
    await page.evaluate(() => (window as unknown as { __AURA_STRANGE_ORBIT__: { begin(): void } }).__AURA_STRANGE_ORBIT__.begin());
    await page.evaluate(() => (window as unknown as { __AURA_STRANGE_ORBIT__: { stepFrames(n: number): unknown } }).__AURA_STRANGE_ORBIT__.stepFrames(260));
    const phase = await page.evaluate(() => (window as unknown as { __AURA_STRANGE_ORBIT__: { state(): { phase: string } } }).__AURA_STRANGE_ORBIT__.state().phase);
    expect(phase).toBe("racing");

    const colliders = await page.evaluate(() => (window as unknown as { __AURA_STRANGE_ORBIT__: { colliders(): Collider[] } }).__AURA_STRANGE_ORBIT__.colliders());
    expect(colliders.length).toBe(5 * 3 + 17);
    const targets = [
      colliders.find((c) => c.id === "gate-1-pillar-1")!,
      colliders.find((c) => c.id === "gate-1-lintel")!,
      colliders.find((c) => c.label === "moon boulder")!,
      colliders.find((c) => c.label === "observatory")!
    ];

    const results: unknown[] = [];
    for (const c of targets) {
      const armed = await page.evaluate((id) => (window as unknown as { __AURA_STRANGE_ORBIT__: { flyInto(id: string, speed: number): boolean } }).__AURA_STRANGE_ORBIT__.flyInto(id, 35), c.id);
      expect(armed, `flyInto ${c.id}`).toBe(true);
      await frame(`${c.id}-approach`);
      const run = await page.evaluate(
        async ({ id, a, b, radius }) => {
          const w = window as unknown as {
            __AURA_STRANGE_ORBIT__: { stepFrames(n: number): unknown };
            __orbit: { race: { impacts: number; hits: number;  flight: { position: { x: number; y: number; z: number }; velocity: { x: number; y: number; z: number } } | null; events: { type: string; text?: string; impact?: number }[] } };
          };
          const base = { impacts: w.__orbit.race.impacts, hits: w.__orbit.race.hits };
          let minGap = Infinity, impactStep = -1, notice = "";
          for (let i = 0; i < 90; i++) {
            if (impactStep >= 0 && i - impactStep >= 20) break;
            w.__AURA_STRANGE_ORBIT__.stepFrames(1);
            const flight = w.__orbit.race.flight;
            if (!flight) break;
            const p = flight.position;
            const ab = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
            const len2 = ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2;
            const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a[0]!) * ab[0]! + (p.y - a[1]!) * ab[1]! + (p.z - a[2]!) * ab[2]!) / len2));
            const d = Math.hypot(p.x - (a[0]! + ab[0]! * t), p.y - (a[1]! + ab[1]! * t), p.z - (a[2]! + ab[2]! * t));
            minGap = Math.min(minGap, d - (radius + 0.8));
            const hit = w.__orbit.race.events.find((e) => e.impact !== undefined);
            if (hit && impactStep < 0) { impactStep = i; notice = hit.text ?? ""; }
          }
          const after = { impacts: w.__orbit.race.impacts, hits: w.__orbit.race.hits };
          const v = w.__orbit.race.flight?.velocity;
          return { id, impacts: after.impacts - base.impacts, hits: after.hits - base.hits, minGap, impactStep, notice, rebound: v ? Math.hypot(v.x, v.y, v.z) : null };
        },
        { id: c.id, a: c.a, b: c.b, radius: c.radius }
      );
      results.push(run);
      console.log("STRANGE_ORBIT_REWORK_RESULT", JSON.stringify(run));
      await frame(`${c.id}-after`);
      expect(run.impacts, c.id).toBe(1);
      expect(run.hits, c.id).toBe(1);
      expect(run.impactStep, c.id).toBeGreaterThanOrEqual(0);
      expect(run.notice, c.id).toContain("Crashed into the");
      expect(run.minGap, c.id).toBeGreaterThan(-(0.025 * c.radius + 0.03));
      expect(run.rebound ?? 0, c.id).toBeLessThan(35);

      // back to a clean racing state for the next target
      if (c === targets[targets.length - 1]) break;
      await page.evaluate(() => {
        const w = window as unknown as { __orbit: { menu(): void }; __AURA_STRANGE_ORBIT__: { begin(): void; stepFrames(n: number): unknown } };
        w.__orbit.menu();
        w.__AURA_STRANGE_ORBIT__.begin();
        w.__AURA_STRANGE_ORBIT__.stepFrames(260);
      });
    }
    console.log("STRANGE_ORBIT_REWORK_SUMMARY", JSON.stringify(results));
    expect(errors, JSON.stringify(errors.slice(0, 8))).toEqual([]);
  });
});
