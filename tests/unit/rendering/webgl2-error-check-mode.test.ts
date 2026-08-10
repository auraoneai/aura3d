import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * `gl.getError()` forces a synchronous CPU/GPU sync. In `strict` mode the WebGL2
 * device calls it after every uniform upload, vertex-format bind, and draw, which
 * on a real scene dominates frame time.
 *
 * Measured on Aura Clash (Apple M4 Max, ANGLE Metal): `strict` produced ~12,000
 * `getError` calls across two frames and held the route at ~11.6 FPS / 86 ms.
 * With frame-level checking the same route reported 6 calls and a steady
 * 60 FPS / 16.67 ms with `budgetOk: true`.
 */
describe("WebGL2 error-check mode default", () => {
  const deviceSource = readFileSync(resolve("packages/rendering/src/WebGL2Device.ts"), "utf8");

  it("defaults to frame-level checking rather than per-operation strict checking", () => {
    expect(deviceSource).toContain('options.errorCheckMode ?? "frame"');
    expect(deviceSource).not.toContain('options.errorCheckMode ?? "strict"');
  });

  it("keeps strict mode available as an explicit opt-in", () => {
    expect(deviceSource).toContain('export type WebGL2ErrorCheckMode = "strict" | "frame";');
    // The per-operation checks must remain, guarded by the strict mode.
    expect(deviceSource.match(/this\.errorCheckMode === "strict"/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("still reads a frame-level error so real WebGL failures surface", () => {
    // endFrame records the error once per frame into lastError.
    expect(deviceSource).toContain("this.lastError = this.readError();");
  });

  it("starts a replacement device with a clean error boundary after context restoration", () => {
    const drain = deviceSource.indexOf("Drain only errors that predate this device");
    const firstCapabilityQuery = deviceSource.indexOf("this.maxVertexAttributes = gl.getParameter");
    expect(drain).toBeGreaterThan(-1);
    expect(firstCapabilityQuery).toBeGreaterThan(drain);
    expect(deviceSource).toContain("index < 16 && gl.getError() !== gl.NO_ERROR");
  });

  it("documents why the default changed so it is not silently reverted", () => {
    expect(deviceSource).toMatch(/synchronous CPU\/GPU sync/);
    expect(deviceSource).toMatch(/getError/);
  });
});
