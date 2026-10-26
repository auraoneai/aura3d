import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Teleoperator camera review (remote only, software WebGL2): every camera the game offers (Chase, Far Chase, Roof LiDAR, Bumper), the player pod
 * at rest, plus a traffic pod parked 8 m ahead for the closest views. Prints `TELEART_FRAME name i n payload` chunks that
 * tools/teleoperator-vehicles/decode.mjs turns back into JPEGs.
 */
type Hooks = Record<string, (...a: unknown[]) => unknown>;
const CAMS = ["chase", "far-chase", "roof-lidar", "bumper"] as const;

async function frame(page: Page, name: string): Promise<void> {
  const b64 = (await page.screenshot({ type: "jpeg", quality: 86 })).toString("base64");
  const n = Math.ceil(b64.length / 16000);
  for (let i = 0; i < n; i++) console.log(`TELEART_FRAME ${name} ${i} ${n} ${b64.slice(i * 16000, (i + 1) * 16000)}`);
}

export function cameraReview(label: string, route: string): void {
  test(`p1tele cameras ${label}`, async ({ page }) => {
    test.setTimeout(2_800_000);
    const server: ExampleDevServer = await startExampleDevServer();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 200)));
    page.on("console", (m) => {
      if (m.type() === "error" && !/404|favicon|local\.css|fonts\//.test(m.text())) errors.push(m.text().slice(0, 200));
    });
    try {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`${server.origin}${route}`, { waitUntil: "load", timeout: 240_000 });
      await page.waitForFunction(() => Boolean((window as unknown as Record<string, unknown>).__AURA3D_SHOWCASE_TELEOPERATOR__), undefined, { timeout: 900_000 });
      // the v2 variant has no qa* drive hooks: those steps are skipped there
      const call = (fn: string, ...args: unknown[]) =>
        page.evaluate(([f, a]) => {
          const h = (window as unknown as { __AURA3D_SHOWCASE_TELEOPERATOR__: Hooks }).__AURA3D_SHOWCASE_TELEOPERATOR__;
          return typeof h[f as string] === "function" ? h[f as string]!(...(a as unknown[])) : "missing";
        }, [fn, args] as const);
      await call("setAutopilotLevel", "MAN");
      await call("qaSetPlayer", { x: 0, speed: 0 });
      for (let i = 0; i < 10; i++) await call("qaPlaceTrafficCar", i, { laneX: 60, zAhead: 400, speed: 0, direction: 1 });
      await page.waitForTimeout(2000);
      for (const [mode, name] of CAMS.entries()) {
        await call("setCameraMode", mode);
        await page.waitForTimeout(2500);
        await frame(page, `${label}-${name}-player`);
      }
      await call("qaPlaceTrafficCar", 0, { laneX: 0, zAhead: 8, speed: 0, direction: 1 });
      for (const [mode, name] of CAMS.entries()) {
        if (name === "far-chase") continue;
        await call("setCameraMode", mode);
        await page.waitForTimeout(2500);
        await frame(page, `${label}-${name}-traffic8m`);
      }
      await call("setCameraMode", 0);
      await call("qaSetYaw", Math.PI / 2);
      await page.waitForTimeout(2500);
      await frame(page, `${label}-chase-side`);
      await call("qaSetYaw", (3 * Math.PI) / 4);
      await page.waitForTimeout(2500);
      await frame(page, `${label}-chase-front34`);
      console.log(`TELEART_ERRORS ${label} ${JSON.stringify(errors.slice(0, 10))}`);
    } finally {
      await server.close();
    }
  });
}
