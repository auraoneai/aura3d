import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Teleoperator player-versus-traffic contact (rework lane). Remote only (tools/remote-acr/run.sh, RUN_ID prefix rwtel,
 * software WebGL2). Drives the live page through the QA drive hooks on `window.__AURA3D_SHOWCASE_TELEOPERATOR__`:
 * a car is staged behind, beside and head-on at three player speeds and each case must raise exactly one impact event
 * and never let the player pass through the car. Results print as `RWTEL_CASE json` and `RWTEL_FRAME name i n payload`.
 */
const ROUTE = "/apps/showcase-teleoperator/";
const SPEEDS = [8, 16, 30];
const FAR = { laneX: 40, zAhead: 400, speed: 0, direction: 1 as const };

type Kind = "rear" | "side" | "head";

interface CaseResult {
  kind: Kind;
  speed: number;
  events: number;
  firstImpactSpeed: number | null;
  passedThrough: boolean;
  minGapZ: number;
  speedAfter: number;
  carSpeed: number;
  frames: number;
}

async function frame(page: Page, name: string): Promise<void> {
  const b64 = (await page.screenshot({ type: "jpeg", quality: 80 })).toString("base64");
  const n = Math.ceil(b64.length / 16000);
  for (let i = 0; i < n; i++) console.log(`RWTEL_FRAME ${name} ${i} ${n} ${b64.slice(i * 16000, (i + 1) * 16000)}`);
}

async function runCase(page: Page, kind: Kind, speed: number, shot: boolean): Promise<CaseResult> {
  await page.evaluate(
    ({ kind, speed, far }) => {
      const h = (window as unknown as { __AURA3D_SHOWCASE_TELEOPERATOR__: any }).__AURA3D_SHOWCASE_TELEOPERATOR__;
      for (let i = 1; i < 10; i++) h.qaPlaceTrafficCar(i, far);
      if (kind === "rear") {
        h.qaSetPlayer({ x: 3.4, speed });
        h.qaPlaceTrafficCar(0, { laneX: 3.4, zAhead: 7, speed: 4, direction: 1 });
      } else if (kind === "head") {
        h.qaSetPlayer({ x: -3.2, speed });
        h.qaPlaceTrafficCar(0, { laneX: -3.2, zAhead: 14, speed: 13, direction: -1 });
      } else {
        h.qaSetPlayer({ x: 4.2, speed });
        h.qaPlaceTrafficCar(0, { laneX: 7.4, zAhead: 0.5, speed, direction: 1 });
      }
    },
    { kind, speed, far: FAR }
  );
  if (kind === "side") await page.keyboard.down("KeyD");
  const pending = page.evaluate(
    (shotRequested) =>
      new Promise<{ events: number; first: number | null; passed: boolean; minGapZ: number; speedAfter: number; carSpeed: number; frames: number; sinceHit: number }>((resolve) => {
        const h = (window as unknown as { __AURA3D_SHOWCASE_TELEOPERATOR__: any }).__AURA3D_SHOWCASE_TELEOPERATOR__;
        const start = h.qaCollisions().log.length + 0;
        const startCount = h.qaCollisions().count;
        let prevSign = 0;
        let passed = false;
        let minGapZ = Infinity;
        let frames = 0;
        let sinceHit = -1;
        const w = window as unknown as { __rwtelPaused?: boolean };
        const tick = () => {
          if (shotRequested && sinceHit === 3 && w.__rwtelPaused === undefined) {
            // Freeze a few frames after the first contact so the spark burst can be photographed.
            h.app.pause();
            w.__rwtelPaused = true;
            const release = () => {
              if (w.__rwtelPaused) setTimeout(release, 100);
              else {
                h.app.resume();
                requestAnimationFrame(tick);
              }
            };
            release();
            return;
          }
          frames += 1;
          const q = h.qaCollisions();
          const car = q.cars[0];
          const dz = q.player.z - car.z;
          const dx = Math.abs(q.player.x - car.laneX);
          minGapZ = Math.min(minGapZ, Math.abs(dz));
          const sign = Math.sign(dz);
          if (prevSign !== 0 && sign !== 0 && sign !== prevSign && dx < 1.9) passed = true;
          prevSign = sign || prevSign;
          const events = q.count - startCount;
          if (events >= 1 && sinceHit < 0) {
            // Manual mode re-accelerates to a 9.5 m/s cruise floor, which would rear-end a slow car again: release the
            // steer key and brake at the first contact so this case measures one contact.
            window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD" }));
            window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyS" }));
            sinceHit = 0;
          }
          if (sinceHit >= 0) sinceHit += 1;
          if ((events >= 1 && sinceHit > 14) || frames > 500) {
            const mine = (q.log as Array<{ slot: number; speed: number }>).slice(start).filter((e) => e.slot === 0);
            resolve({ events, first: mine.length ? mine[0]!.speed : null, passed, minGapZ, speedAfter: q.player.speed, carSpeed: car.speed, frames, sinceHit });
          } else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    shot
  );
  if (shot) {
    await page.waitForFunction(() => (window as unknown as { __rwtelPaused?: boolean }).__rwtelPaused === true, undefined, { timeout: 600_000 });
    await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        if (el.tagName === "CANVAS" || el.querySelector("canvas")) continue;
        el.dataset.rwtelVis = el.style.visibility;
        el.style.visibility = "hidden";
      }
    });
    await frame(page, `${kind}-${speed}`);
    await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        if (el.dataset.rwtelVis !== undefined) el.style.visibility = el.dataset.rwtelVis;
      }
      (window as unknown as { __rwtelPaused?: boolean }).__rwtelPaused = false;
    });
  }
  const result = await pending;
  if (kind === "side") await page.keyboard.up("KeyD");
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyS" }));
    delete (window as unknown as { __rwtelPaused?: boolean }).__rwtelPaused;
  });
  return {
    kind,
    speed,
    events: result.events,
    firstImpactSpeed: result.first,
    passedThrough: result.passed,
    minGapZ: Number(result.minGapZ.toFixed(2)),
    speedAfter: Number(result.speedAfter.toFixed(2)),
    carSpeed: result.carSpeed,
    frames: result.frames
  };
}

test("teleoperator: traffic contact raises one impact and never passes through", async ({ page }) => {
  test.setTimeout(1_500_000);
  const server: ExampleDevServer = await startExampleDevServer();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 200)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/404|favicon|local\.css|fonts\//.test(m.text())) errors.push(m.text().slice(0, 200));
  });
  try {
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto(`${server.origin}${ROUTE}`, { waitUntil: "load", timeout: 180_000 });
    await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_SHOWCASE_TELEOPERATOR__?: unknown }).__AURA3D_SHOWCASE_TELEOPERATOR__), undefined, { timeout: 600_000 });
    await page.evaluate(() => (window as unknown as { __AURA3D_SHOWCASE_TELEOPERATOR__: any }).__AURA3D_SHOWCASE_TELEOPERATOR__.setAutopilotLevel("MAN"));
    await page.waitForTimeout(2_000);

    // tests/browser/rwtel-cases.txt (whitespace-separated `kind:speed`) narrows the run; the default is all nine cases.
    const only = existsSync(path.resolve("tests/browser/rwtel-cases.txt"))
      ? new Set(readFileSync(path.resolve("tests/browser/rwtel-cases.txt"), "utf8").trim().split(/\s+/))
      : undefined;
    const results: CaseResult[] = [];
    for (const kind of ["rear", "head", "side"] as Kind[]) {
      for (const speed of SPEEDS) {
        if (only && !only.has(`${kind}:${speed}`)) continue;
        const r = await runCase(page, kind, speed, speed === 16);
        results.push(r);
        console.log(`RWTEL_CASE ${JSON.stringify(r)}`);
      }
    }
    console.log(`RWTEL_ERRORS ${JSON.stringify(errors)}`);
    for (const r of results) {
      expect(r.events, `${r.kind} ${r.speed}: exactly one impact`).toBe(1);
      expect(r.passedThrough, `${r.kind} ${r.speed}: no pass-through`).toBe(false);
    }
    expect(errors, "no console or page errors").toEqual([]);
  } finally {
    await server.close();
  }
});
