import { describe, expect, it } from "vitest";
import { WebGL2StateCache } from "../../../packages/rendering/src";

describe("WebGL2StateCache", () => {
  it("skips redundant state changes while preserving issued changes", () => {
    const cache = new WebGL2StateCache({ label: "unit-state-cache" });
    const calls: string[] = [];
    const program = { id: "program-a" };

    expect(cache.useProgram(program, () => calls.push("useProgram"))).toBe(true);
    expect(cache.useProgram(program, () => calls.push("useProgram"))).toBe(false);
    expect(cache.bindVertexArray("vao-a", () => calls.push("bindVertexArray"))).toBe(true);
    expect(cache.bindVertexArray("vao-a", () => calls.push("bindVertexArray"))).toBe(false);
    expect(cache.bindSampler(0, "sampler-a", () => calls.push("bindSampler"))).toBe(true);
    expect(cache.bindSampler(0, "sampler-a", () => calls.push("bindSampler"))).toBe(false);
    expect(cache.viewport(0, 0, 640, 360, () => calls.push("viewport"))).toBe(true);
    expect(cache.viewport(0, 0, 640, 360, () => calls.push("viewport"))).toBe(false);
    expect(cache.setEnabled(0x0b71, true, () => calls.push("enable-depth"))).toBe(true);
    expect(cache.setEnabled(0x0b71, true, () => calls.push("enable-depth"))).toBe(false);

    expect(calls).toEqual(["useProgram", "bindVertexArray", "bindSampler", "viewport", "enable-depth"]);
    expect(cache.stats()).toMatchObject({
      issued: 5,
      skipped: 5,
      byOperation: {
        useProgram: { issued: 1, skipped: 1 },
        bindVertexArray: { issued: 1, skipped: 1 },
        bindSampler: { issued: 1, skipped: 1 },
        viewport: { issued: 1, skipped: 1 },
        enable: { issued: 1, skipped: 1 }
      }
    });
  });

  it("invalidates cached state without clearing diagnostics", () => {
    const cache = new WebGL2StateCache({ label: "unit-state-cache" });
    const buffer = { id: "buffer-a" };
    let issued = 0;

    cache.bindBuffer(0x8892, buffer, () => issued += 1);
    cache.bindBuffer(0x8892, buffer, () => issued += 1);
    cache.invalidate();
    cache.bindBuffer(0x8892, buffer, () => issued += 1);

    expect(issued).toBe(2);
    expect(cache.snapshot().arrayBuffer).toBe(buffer);
    expect(cache.stats().byOperation.bindBuffer).toEqual({ issued: 2, skipped: 1 });
  });

  it("caches extended render state for scissor, color writes, and polygon offset", () => {
    const cache = new WebGL2StateCache({ label: "extended-render-state-cache" });
    const calls: string[] = [];

    expect(cache.scissor(4, 8, 320, 180, () => calls.push("scissor"))).toBe(true);
    expect(cache.scissor(4, 8, 320, 180, () => calls.push("scissor"))).toBe(false);
    expect(cache.colorMask(true, false, true, false, () => calls.push("colorMask"))).toBe(true);
    expect(cache.colorMask(true, false, true, false, () => calls.push("colorMask"))).toBe(false);
    expect(cache.polygonOffset(1, 2, () => calls.push("polygonOffset"))).toBe(true);
    expect(cache.polygonOffset(1, 2, () => calls.push("polygonOffset"))).toBe(false);

    expect(calls).toEqual(["scissor", "colorMask", "polygonOffset"]);
    expect(cache.snapshot()).toMatchObject({
      scissor: [4, 8, 320, 180],
      colorMask: [true, false, true, false],
      polygonOffset: [1, 2]
    });
    expect(cache.stats().byOperation).toMatchObject({
      scissor: { issued: 1, skipped: 1 },
      colorMask: { issued: 1, skipped: 1 },
      polygonOffset: { issued: 1, skipped: 1 }
    });
  });

  it("caches stencil function, write mask, and operations", () => {
    const cache = new WebGL2StateCache({ label: "stencil-state-cache" });
    const calls: string[] = [];

    expect(cache.stencilFunc(0x0202, 2, 0xff, () => calls.push("stencilFunc"))).toBe(true);
    expect(cache.stencilFunc(0x0202, 2, 0xff, () => calls.push("stencilFunc"))).toBe(false);
    expect(cache.stencilMask(0x0f, () => calls.push("stencilMask"))).toBe(true);
    expect(cache.stencilMask(0x0f, () => calls.push("stencilMask"))).toBe(false);
    expect(cache.stencilOp(0x1e00, 0x1e01, 0x1e02, () => calls.push("stencilOp"))).toBe(true);
    expect(cache.stencilOp(0x1e00, 0x1e01, 0x1e02, () => calls.push("stencilOp"))).toBe(false);

    expect(calls).toEqual(["stencilFunc", "stencilMask", "stencilOp"]);
    expect(cache.snapshot()).toMatchObject({
      stencilFunc: [0x0202, 2, 0xff],
      stencilMask: 0x0f,
      stencilOp: [0x1e00, 0x1e01, 0x1e02]
    });
    expect(cache.stats().byOperation).toMatchObject({
      stencilFunc: { issued: 1, skipped: 1 },
      stencilMask: { issued: 1, skipped: 1 },
      stencilOp: { issued: 1, skipped: 1 }
    });
  });
});
