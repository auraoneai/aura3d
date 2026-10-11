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

  it("announces device loss in a polite status overlay and clears it on restore (#118, C-07)", async () => {
    const { installCourierContextLoss, DEVICE_LOST_MESSAGE } = await import(
      "../../../../apps/showcase-courier-rush/src/v2/context-loss"
    );
    const attrs = new Map<string, string>();
    const el = {
      className: "", textContent: "", hidden: false, style: { cssText: "" },
      setAttribute: (k: string, v: string) => void attrs.set(k, v)
    };
    const appended: unknown[] = [];
    const doc = { createElement: () => el, body: { appendChild: (n: unknown) => (appended.push(n), n) } };
    let lost = (): void => undefined;
    let restored = (): void => undefined;
    const calls: string[] = [];
    const app = {
      onDeviceLost: (cb: () => void) => { lost = cb; return () => undefined; },
      onDeviceRestored: (cb: () => void) => { restored = cb; return () => undefined; },
      pause: () => void calls.push("pause"),
      resume: () => void calls.push("resume"),
      setScene: () => void calls.push("setScene"),
      ready: () => Promise.resolve(),
      step: () => void calls.push("step")
    };
    const overlay = installCourierContextLoss(app as never, () => ({}) as never, doc as never);
    expect(overlay).toBe(el);
    expect(appended).toEqual([el]);
    expect(attrs.get("role")).toBe("status");
    expect(attrs.get("aria-live")).toBe("polite");
    expect(el.hidden).toBe(true);

    lost();
    expect(calls).toEqual(["pause"]);
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe(DEVICE_LOST_MESSAGE);
    expect(attrs.get("data-device-state")).toBe("lost");

    restored();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(["pause", "setScene", "resume", "step"]);
    expect(el.hidden).toBe(true);
    expect(el.textContent).toBe("");
    expect(attrs.get("data-device-state")).toBe("ok");
  });

  it("installs both handlers right after game.start(), before the first frame is awaited", () => {
    const start = boot.indexOf("game.start()");
    expect(start).toBeGreaterThan(-1);
    const install = boot.indexOf("installCourierContextLoss(game.app, buildScene)");
    expect(install).toBeGreaterThan(start);
    expect(install).toBeLessThan(boot.indexOf("game.ready()", start));
  });
});
