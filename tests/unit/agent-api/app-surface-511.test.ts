import { describe, expect, it } from "vitest";
import { createAuraApp, scene } from "../../../packages/engine/src";
import type { AuraRendererInfo, AuraPrecompileResult } from "../../../packages/engine/src/public/index";

// Headless (no canvas): the members must exist and behave without a renderer. Memory gauges are asserted against a
// real device in the lane's GPU capture, not here.
describe("AuraApp surface used by the 25 games", () => {
  it("setClearColor is callable on the app (no cast) with a colour string and alpha, before and after a renderer exists", () => {
    const app = createAuraApp(null, { autoStart: false, scene: scene() });
    expect(typeof app.setClearColor).toBe("function");
    expect(() => app.setClearColor?.("#203040", 0.5)).not.toThrow();
    expect(() => app.setClearColor?.("#ffffff")).not.toThrow();
    app.dispose();
  });

  it("readiness() and readyStrict() exist with the documented shape (docs/migration/4-to-5.md B2)", async () => {
    const app = createAuraApp(null, { autoStart: false, scene: scene() });
    expect(typeof app.readiness).toBe("function");
    expect(typeof app.readyStrict).toBe("function");
    const outcome = await app.readiness({ stage: "renderer" });
    expect(["ready", "failed", "cancelled", "disposed", "superseded"]).toContain(outcome.state);
    app.dispose();
    const after = await app.readiness();
    expect(after.state).toBe("disposed");
    await expect(app.readyStrict()).rejects.toMatchObject({ code: "disposed" });
  });

  it("AuraRendererInfo carries optional bufferBytes/textureBytes and is importable from the public entry", () => {
    const info: AuraRendererInfo = {
      render: { calls: 1, triangles: 2, points: 0, lines: 0, frame: 3 },
      memory: { geometries: 1, textures: 1, bufferBytes: 128, textureBytes: 4096 },
      approximateGpuMemoryBytes: 4224
    };
    const result: AuraPrecompileResult = { compiledPrograms: 0, durationMs: 0 };
    expect(info.memory.bufferBytes! + info.memory.textureBytes!).toBe(info.approximateGpuMemoryBytes);
    expect(result.compiledPrograms).toBe(0);
    const headless = createAuraApp(null, { autoStart: false, scene: scene() });
    expect(headless.info).toBeUndefined();
    headless.dispose();
  });
});
