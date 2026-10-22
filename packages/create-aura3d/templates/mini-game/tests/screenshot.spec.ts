import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { assertTemplateLookFloor } from "./look-floor";

test.setTimeout(600_000);

// PRD-13 T3.12 — look floor: non-blank, look.lint error-free, appliedLook
// environment specular > 0, shadow strength >= 0.8, pixelRatio at tier cap,
// subject bounds within ±10% — plus this template's bespoke assertions.
test("Aura3D mini game screenshot clears the look floor", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 150_000 }).toBe("true");
  // Hold ArrowRight until the player crosses the threshold rather than a
  // wall-clock 550ms: sim time advances at most 0.25s per presented frame
  // (dt clamp), so a fixed wall hold is meaningless on slow renderers.
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    () => ((window as unknown as { __AURA3D_MINI_GAME__?: { readonly player?: { readonly x?: number } } }).__AURA3D_MINI_GAME__?.player?.x ?? 0) > 0.8,
    undefined,
    { timeout: 180_000 }
  );
  await page.keyboard.up("ArrowRight");
  const state = await page.evaluate(() =>
    (window as unknown as { __AURA3D_MINI_GAME__?: { readonly player?: { readonly x: number }; readonly look?: { readonly id: string } } }).__AURA3D_MINI_GAME__
  );
  expect(state?.player?.x ?? 0).toBeGreaterThan(0.8);
  expect(state?.look?.id).toBe("outdoor-day");
  // Subject bounds omitted: the outdoor-day look's bright sky reads above the
  // luma floor across the whole central region, so the bright-pixel bound
  // cannot isolate the platform mass — the color-class profile asserts the
  // scene's alignment instead (bright/cyan/warm/red cues).
  const floor = await assertTemplateLookFloor(page);
  // class-(b) readback: capture through the app (C-05) instead of the
  // compositor screenshot path — the output surface owns the frame.
  // `__AURA3D_LIVE_APPS__` is the live-app registry (not an array); `output`
  // is the C-05 extension installed under A3D_QR_CORE. A missing registry,
  // app or surface fails the spec instead of writing an empty frame.
  const pngBase64 = await page.evaluate(async () => {
    const registry = (window as unknown as {
      __AURA3D_LIVE_APPS__?: {
        all(): readonly { output?: { capture(o: { type: "png-blob" }): Promise<Blob | ImageBitmap> } }[];
      };
    }).__AURA3D_LIVE_APPS__;
    if (!registry) throw new Error("app.output.capture: __AURA3D_LIVE_APPS__ registry is not installed");
    const app = registry.all()[0];
    if (!app) throw new Error("app.output.capture: no live Aura3D app is mounted");
    if (!app.output) throw new Error("app.output.capture: app.output (C-05, A3D_QR_CORE) is not installed");
    const blob = await app.output.capture({ type: "png-blob" });
    if (!(blob instanceof Blob)) throw new Error("app.output.capture: png-blob capture did not return a Blob");
    const dataUrl = await new Promise<string>((resolvePromise) => {
      const reader = new FileReader();
      reader.onload = () => resolvePromise(String(reader.result));
      reader.readAsDataURL(blob);
    });
    return dataUrl.split(",")[1] ?? "";
  });
  const screenshot = Buffer.from(pngBase64, "base64");
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/screenshot.png"), screenshot);
  writeFileSync(resolve("tests/reports/screenshot.json"), `${JSON.stringify({ bytes: screenshot.byteLength, floor, profile: floor.profile }, null, 2)}\n`);
  expect(screenshot.byteLength).toBeGreaterThan(1000);
});
