import { describe, expect, it } from "vitest";
import { selectAuraCinematicBackend } from "../../../../packages/engine/src/ai-runtime";

describe("Aura cinematic backend selector", () => {
  it("uses WebGL2 production runtime as the default cinematic backend", () => {
    expect(selectAuraCinematicBackend({ requested: "auto", availability: { webgl2: true, webgpu: true } })).toMatchObject({
      backend: "webgl2",
      requested: "auto",
      fallbackUsed: false
    });
  });

  it("uses WebGPU only when explicitly selected and available", () => {
    expect(selectAuraCinematicBackend({ requested: "webgpu", availability: { webgl2: true, webgpu: true } })).toMatchObject({
      backend: "webgpu",
      fallbackUsed: false
    });
  });

  it("preserves WebGL2 fallback when WebGPU is unavailable", () => {
    expect(selectAuraCinematicBackend({ requested: "webgpu", availability: { webgl2: true, webgpu: false } })).toMatchObject({
      backend: "webgl2",
      fallbackUsed: true
    });
  });
});
