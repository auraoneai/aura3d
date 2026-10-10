// tests/qr/prd14/courier-rush/context-loss.test.ts — §14.1 P0: the route must
// survive a lost WebGL context. The v2 route pauses the app on device loss and
// re-mounts the scene + resumes on restore (§6.2); a boot that drops the
// handler leaves the route drawing nothing forever. The handler lives in
// v2/context-loss.ts (kept out of boot.ts for the 14-LOC budget) and boot.ts
// installs it right after game.start().
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../apps/showcase-courier-rush/src/v2/${rel}`, import.meta.url)), "utf8");
const boot = read("boot.ts");
const handler = read("context-loss.ts");

describe("courier-rush context-loss handling (§6.2)", () => {
  it("pauses the app when the device is lost", () => {
    const lost = handler.indexOf("app.onDeviceLost");
    expect(lost).toBeGreaterThan(-1);
    const body = handler.slice(lost, handler.indexOf("app.onDeviceRestored", lost));
    expect(body).toContain("app.pause()");
  });

  it("re-mounts the scene and resumes when the device is restored", () => {
    const restored = handler.indexOf("app.onDeviceRestored");
    expect(restored).toBeGreaterThan(-1);
    const body = handler.slice(restored);
    expect(body).toContain("setScene(buildScene())");
    expect(body).toContain("app.resume()");
    expect(body).toContain("app.step(1 / 60)");
  });

  it("installs both handlers right after game.start(), before the first frame is awaited", () => {
    const start = boot.indexOf("game.start()");
    expect(start).toBeGreaterThan(-1);
    const install = boot.indexOf("installCourierContextLoss(game.app, buildScene)");
    expect(install).toBeGreaterThan(start);
    expect(install).toBeLessThan(boot.indexOf("game.ready()", start));
  });
});
