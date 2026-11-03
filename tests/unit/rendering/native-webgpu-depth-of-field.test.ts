import { describe, expect, it } from "vitest";
import { Texture } from "../../../packages/rendering/src/Texture";
import type { RenderTarget, RenderTargetDescriptor } from "../../../packages/rendering/src/RenderDevice";
import { WebGPUDepthOfField, validateWebGPUDepthOfFieldOptions, type WebGPUDepthOfFieldDraw, type WebGPUDepthOfFieldInput } from "../../../packages/rendering/src/post/WebGPUDepthOfField";
import {
  INDEPENDENT_DOF_COMPOSITE_WGSL,
  INDEPENDENT_DOF_GATHER_INFLUENCE_WGSL,
  INDEPENDENT_DOF_GATHER_WGSL,
  INDEPENDENT_DOF_NEAR_TILE_WGSL,
  INDEPENDENT_DOF_PREFILTER_COC_WGSL,
  INDEPENDENT_DOF_PREFILTER_WGSL
} from "../../../packages/rendering/src/post/shaders/independentDepthOfField.wgsl";

interface Target extends RenderTarget { disposed: boolean; disposeCount: number; failDisposal: boolean; }

function fixture(maxBytes?: number) {
  let nextId = 0, generation = 1, lost = false, failAllocation = 0, allocationCount = 0;
  let aliasAllocation: RenderTarget | undefined;
  let onDraw: ((pass: WebGPUDepthOfFieldDraw, index: number) => void) | undefined;
  const allocations: Target[] = [], draws: WebGPUDepthOfFieldDraw[] = [];
  const target = (width: number, height: number, format: "rgba16f" | "rgba32f" = "rgba16f", label = "source"): Target => {
    const texture = new Texture({ width, height, format, renderAttachment: true });
    return {
      id: ++nextId, width, height, label, colorTexture: texture, sampleCount: 1, disposed: false, disposeCount: 0, failDisposal: false,
      dispose(this: Target) {
        this.disposeCount += 1;
        this.disposed = true;
        texture.dispose();
        if (this.failDisposal) throw new Error("dispose failed");
      }
    };
  };
  const createTarget = (desc: RenderTargetDescriptor): RenderTarget => {
    allocationCount += 1;
    if (allocationCount === failAllocation) throw new Error("allocation failed");
    if (aliasAllocation) return aliasAllocation;
    const created = target(desc.width, desc.height, desc.format as "rgba16f" | "rgba32f", desc.label);
    allocations.push(created);
    return created;
  };
  const driver = new WebGPUDepthOfField({ createTarget, draw(pass) { draws.push(pass); onDraw?.(pass, draws.length); },
    deviceGeneration: () => generation, isDeviceLost: () => lost }, { maxBytes });
  const input = (width = 33, height = 17): WebGPUDepthOfFieldInput => ({
    color: target(width, height, "rgba32f", "color"), alpha: "opaque", depthModel: "single-surface", linearDepth: target(width, height, "rgba32f", "depth"),
    depthEncoding: "linear-view-metres", maxGeometryDepthMeters: 500, skyDepthMeters: 1000, options: {}
  });
  return { driver, input, target, allocations, draws, failAllocation: (n: number) => { failAllocation = n; },
    aliasAllocation: (value: RenderTarget) => { aliasAllocation = value; },
    onDraw: (fn: typeof onDraw) => { onDraw = fn; }, lose: () => { lost = true; }, replace: () => { generation += 1; } };
}

describe("WebGPU depth-of-field host driver", () => {
  it("preflights optical controls and depth bounds without allocating or submitting", () => {
    const f = fixture();
    expect(() => validateWebGPUDepthOfFieldOptions({ focusDistance: 3, halfRes: true }, 500, 1000)).not.toThrow();
    expect(() => validateWebGPUDepthOfFieldOptions({ fStop: 0 }, 500, 1000)).toThrow();
    expect(() => validateWebGPUDepthOfFieldOptions({ halfRes: false }, 500, 1000)).toThrow();
    expect(() => validateWebGPUDepthOfFieldOptions({ tiltShift: { bandCenter: .5, bandWidth: .2 } }, 500, 1000)).toThrow();
    expect(() => validateWebGPUDepthOfFieldOptions({}, 1000, 1000)).toThrow();
    expect(f.allocations).toHaveLength(0);
    expect(f.draws).toHaveLength(0);
    f.driver.dispose();
  });

  it("submits the independently authored stages in order with odd sizes, sparse bindings and the optical uniform", () => {
    const f = fixture(), input = f.input();
    const result = f.driver.execute({ ...input, gatherRings: 2, options: { focusDistance: 7, focalLengthMm: 35, fStop: 4, sensorHeightMm: 18, maxBlurPx: 12 } });
    expect(f.draws.map(pass => pass.fragment)).toEqual([
      INDEPENDENT_DOF_PREFILTER_WGSL, INDEPENDENT_DOF_PREFILTER_COC_WGSL, INDEPENDENT_DOF_NEAR_TILE_WGSL,
      INDEPENDENT_DOF_GATHER_WGSL, INDEPENDENT_DOF_GATHER_INFLUENCE_WGSL, INDEPENDENT_DOF_COMPOSITE_WGSL
    ]);
    expect(f.draws.map(pass => pass.entryPoint)).toEqual([
      "fs_dof_prefilter", "fs_dof_prefilter_coc", "fs_dof_near_tile", "fs_dof_gather", "fs_dof_gather_influence", "fs_dof_composite"
    ]);
    expect(f.allocations.map(t => [t.width, t.height, t.colorTexture.format])).toEqual([
      [17, 9, "rgba32f"], [17, 9, "rgba16f"], [3, 2, "rgba16f"], [17, 9, "rgba32f"], [17, 9, "rgba16f"], [33, 17, "rgba32f"]
    ]);
    expect(f.draws[0]!.textures).toEqual([
      { binding: 1, target: input.color, sampleType: "unfilterable-float" },
      { binding: 2, target: input.linearDepth, sampleType: "unfilterable-float" }
    ]);
    expect(f.draws[1]!.textures).toEqual(f.draws[0]!.textures);
    expect(f.draws[1]!.uniforms).toEqual(f.draws[0]!.uniforms);
    const prefilter = f.allocations[0]!, coc = f.allocations[1]!, near = f.allocations[2]!, gather = f.allocations[3]!, influence = f.allocations[4]!;
    expect(f.draws[2]!.textures).toEqual([{ binding: 1, target: coc, sampleType: "unfilterable-float" }]);
    expect(f.draws[3]!.textures).toEqual([
      { binding: 1, target: prefilter, sampleType: "unfilterable-float" }, { binding: 2, target: coc, sampleType: "unfilterable-float" },
      { binding: 3, target: near, sampleType: "unfilterable-float" }
    ]);
    expect(f.draws[4]!.textures).toEqual(f.draws[3]!.textures);
    expect(f.draws[3]!.constants).toEqual({ DOF_RINGS: 2 });
    expect(f.draws[4]!.constants).toEqual({ DOF_RINGS: 2 });
    expect(f.draws[5]!.textures).toEqual([
      { binding: 1, target: input.color, sampleType: "unfilterable-float" }, { binding: 2, target: gather, sampleType: "unfilterable-float" },
      { binding: 3, target: influence, sampleType: "float" }
    ]);
    expect(f.draws[5]!.sampler).toEqual({ binding: 4, filter: "linear", addressMode: "clamp-to-edge" });
    const bytes = f.draws[0]!.uniforms!;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(bytes.byteLength).toBe(32);
    expect(Array.from({ length: 8 }, (_, index) => view.getFloat32(index * 4, true))).toEqual([7, 35, 4, 18, 17, 12, 1000, 0]);
    expect(f.allocations.slice(0, 5).every(t => t.disposed)).toBe(true);
    expect(result.target).toBe(f.allocations[5]);
    expect(result.target.disposed).toBe(false);
    result.release(); result.release();
    expect(f.allocations[5]!.disposeCount).toBe(1);
    expect(input.color.disposed).toBe(false);
    expect(input.linearDepth.disposed).toBe(false);
    f.driver.dispose();
  });

  it("rejects straight alpha, layered depth, unsupported quality modes and invalid inputs before allocation", () => {
    const f = fixture(), base = f.input();
    const invalid = [
      { ...base, alpha: "straight" },
      { ...base, depthModel: "layered" },
      { ...base, depthModel: undefined },
      { ...base, depthEncoding: "device-depth" },
      { ...base, skyDepthMeters: 500 },
      { ...base, skyDepthMeters: 500.000001 },
      { ...base, options: { tiltShift: { bandCenter: .5, bandWidth: .2 } } },
      { ...base, options: { halfRes: false } },
      { ...base, options: { focalLengthMm: NaN } },
      { ...base, options: { maxBlurPx: 65 } },
      { ...base, options: { misspelled: 1 } },
      { ...base, gatherRings: 4 },
      { ...base, fullCoC: true },
      { ...base, linearDepth: f.target(33, 17, "rgba16f") },
      { ...base, linearDepth: f.target(32, 17, "rgba32f") },
      { ...base, linearDepth: base.color }
    ];
    for (const entry of invalid) expect(() => f.driver.execute(entry as WebGPUDepthOfFieldInput)).toThrow();
    expect(f.allocations).toHaveLength(0);
    expect(f.draws).toHaveLength(0);
    f.driver.dispose();
  });

  it("accepts the declared premultiplied single-surface contract", () => {
    const f = fixture(), input = f.input();
    const output = f.driver.execute({ ...input, alpha: "premultiplied" });
    expect(f.draws).toHaveLength(6);
    expect(output.target.colorTexture.format).toBe("rgba32f");
    output.release();
    expect(input.color.disposed).toBe(false);
    expect(input.linearDepth.disposed).toBe(false);
  });

  it("counts retained outputs against the memory bound and frees their budget on release", () => {
    const f = fixture(400), input = f.input(4, 4);
    // Four 2x2 half targets (192 bytes), one tile (8), and one rgba16f output (128).
    const color = f.target(4, 4, "rgba16f"), small = { ...input, color };
    const first = f.driver.execute(small);
    expect(() => f.driver.execute(small)).toThrow(/budget/i);
    expect(f.draws).toHaveLength(6);
    first.release();
    const second = f.driver.execute(small);
    expect(f.draws).toHaveLength(12);
    f.driver.dispose();
    expect(second.target.disposed).toBe(true);
  });

  it("leaves borrowed targets alone if allocation aliases an input or fails part way", () => {
    const aliased = fixture(), input = aliased.input();
    aliased.aliasAllocation(input.color);
    expect(() => aliased.driver.execute(input)).toThrow(/alias/i);
    expect(input.color.disposed).toBe(false);
    expect(input.linearDepth.disposed).toBe(false);
    const failing = fixture(), other = failing.input();
    failing.failAllocation(3);
    expect(() => failing.driver.execute(other)).toThrow("allocation failed");
    expect(failing.allocations).toHaveLength(2);
    expect(failing.allocations.every(target => target.disposed && target.disposeCount === 1)).toBe(true);
    expect(other.color.disposed).toBe(false);
    expect(other.linearDepth.disposed).toBe(false);
  });

  it("stops later submissions on cancellation and cleans every owned target", () => {
    const f = fixture(), controller = new AbortController(), input = f.input();
    f.onDraw((_pass, index) => { if (index === 1) controller.abort(); });
    expect(() => f.driver.execute({ ...input, signal: controller.signal })).toThrow(/cancelled/i);
    expect(f.draws).toHaveLength(1);
    expect(f.allocations).toHaveLength(6);
    expect(f.allocations.every(target => target.disposed && target.disposeCount === 1)).toBe(true);
    expect(input.color.disposed).toBe(false);
    expect(input.linearDepth.disposed).toBe(false);
    expect(() => f.driver.execute({ ...input, signal: controller.signal })).toThrow(/cancelled/i);
  });

  it("invalidates prior output and cleans in-flight targets when the device is lost or replaced", () => {
    const f = fixture(), input = f.input(), previous = f.driver.execute(input);
    f.onDraw((_pass, index) => { if (index === 8) f.lose(); });
    expect(() => f.driver.execute(input)).toThrow(/device was lost/i);
    expect(f.draws).toHaveLength(8);
    expect(previous.target.disposed).toBe(true);
    expect(f.allocations.every(target => target.disposed)).toBe(true);
    expect(input.color.disposed).toBe(false);
    expect(() => f.driver.execute(input)).toThrow(/disposed/i);
    const other = fixture(), next = other.input();
    other.replace();
    expect(() => other.driver.execute(next)).toThrow(/device was lost or replaced/i);
    expect(other.allocations).toHaveLength(0);
  });

  it("attempts all disposals after a draw failure and rejects reentrant execution", () => {
    const f = fixture(), input = f.input();
    f.onDraw(() => {
      expect(() => f.driver.execute(input)).toThrow(/reentered/i);
      f.allocations[0]!.failDisposal = true;
      throw new Error("submission failed");
    });
    expect(() => f.driver.execute(input)).toThrow(AggregateError);
    expect(f.allocations).toHaveLength(6);
    expect(f.allocations.every(target => target.disposed && target.disposeCount === 1)).toBe(true);
    expect(input.color.disposed).toBe(false);
    expect(input.linearDepth.disposed).toBe(false);
  });
});
