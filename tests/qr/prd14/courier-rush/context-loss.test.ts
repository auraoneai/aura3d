// tests/qr/prd14/courier-rush/context-loss.test.ts — §14.1 P0: the route must
// survive a lost WebGL context. The v2 boot pauses the app on device loss and
// re-mounts the scene + resumes on restore (§6.2); a boot that drops the
// handler leaves the route drawing nothing forever.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const boot = readFileSync(
  fileURLToPath(new URL("../../../../apps/showcase-courier-rush/src/v2/boot.ts", import.meta.url)),
  "utf8"
);

describe("courier-rush context-loss handling (§6.2)", () => {
  it("pauses the app when the device is lost", () => {
    const lost = boot.indexOf("onDeviceLost");
    expect(lost).toBeGreaterThan(-1);
    const body = boot.slice(lost, boot.indexOf("onDeviceRestored"));
    expect(body).toContain("game.app.pause()");
  });

  it("re-mounts the scene and resumes when the device is restored", () => {
    const restored = boot.indexOf("onDeviceRestored");
    expect(restored).toBeGreaterThan(-1);
    const body = boot.slice(restored);
    expect(body).toContain("setScene(buildScene())");
    expect(body).toContain("game.app.resume()");
    expect(body).toContain("game.app.step(1 / 60)");
  });

  it("registers both handlers before the first frame is awaited", () => {
    const start = boot.indexOf("game.start()");
    expect(start).toBeGreaterThan(-1);
    expect(boot.indexOf("onDeviceLost")).toBeGreaterThan(start);
    expect(boot.indexOf("onDeviceRestored")).toBeGreaterThan(start);
  });
});
