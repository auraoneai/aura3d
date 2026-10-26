import { test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

// Teleoperator draw-call and triangle probe (remote only, software WebGL2): boots the route, lets textures upgrade, prints the renderer counters.
test.setTimeout(2_400_000);

test("p1tele probe", async ({ page }) => {
  const server = await startExampleDevServer();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 200)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/404|favicon|local\.css|fonts\//.test(m.text())) errors.push(m.text().slice(0, 200));
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __dc: number };
    w.__dc = 0;
    for (const name of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced", "drawRangeElements"]) {
      const proto = WebGL2RenderingContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
      const orig = proto[name];
      if (!orig) continue;
      proto[name] = function (this: unknown, ...a: unknown[]) { w.__dc++; return orig.apply(this, a); };
    }
  });
  try {
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto(`${server.origin}/apps/showcase-teleoperator/`, { waitUntil: "load", timeout: 240_000 });
    await page.waitForFunction(() => Boolean((window as unknown as Record<string, unknown>).__AURA3D_SHOWCASE_TELEOPERATOR__), undefined, { timeout: 900_000 });
    await page.waitForFunction(() => !/LOADING FLEET/i.test(document.body.innerText), undefined, { timeout: 600_000 }).catch(() => undefined);
    for (let round = 0; round < 3; round++) {
      await page.waitForTimeout(20_000);
      const d = await page.evaluate(async () => {
        const w = window as unknown as { __dc: number };
        const c0 = w.__dc;
        let frames = 0;
        const t0 = performance.now();
        await new Promise<void>((res) => { const f = () => { frames++; if (frames >= 8 || performance.now() - t0 > 60_000) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
        return { drawsPerFrame: Math.round(((w.__dc - c0) / Math.max(1, frames)) * 10) / 10, frames, ms: Math.round(performance.now() - t0) };
      });
      console.log(`P1TELE_PROBE round=${round} ${JSON.stringify(d)}`);
    }
    console.log(`P1TELE_ERRORS ${JSON.stringify(errors.slice(0, 10))}`);
  } finally {
    await server.close();
  }
});
