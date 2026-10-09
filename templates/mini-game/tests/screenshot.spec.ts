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
  const floor = await assertTemplateLookFloor(page, { subject: { x: 0.36, y: 0.22, width: 0.54, height: 0.34 } });
  // class-(b) readback: capture through the app (C-05) instead of the
  // compositor screenshot path — the output surface owns the frame.
  const pngBase64 = await page.evaluate(async () => {
    const apps = (window as unknown as {
      __AURA3D_LIVE_APPS__?: readonly { output: { capture(o: { type: "png-blob" }): Promise<Blob> } }[];
    }).__AURA3D_LIVE_APPS__ ?? [];
    const blob = await apps[0]?.output.capture({ type: "png-blob" });
    if (!blob) return "";
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
  writeFileSync(resolve("tests/reports/screenshot.json"), `${JSON.stringify({ bytes: screenshot.byteLength, floor }, null, 2)}\n`);
  expect(screenshot.byteLength).toBeGreaterThan(1000);
});
