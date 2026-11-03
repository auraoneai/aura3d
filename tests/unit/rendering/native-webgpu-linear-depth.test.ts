import { describe, expect, it } from "vitest";
import { Texture } from "../../../packages/rendering/src/Texture";
import type { RenderTarget, RenderTargetDescriptor } from "../../../packages/rendering/src/RenderDevice";
import {
  WebGPULinearDepth,
  linearizeWebGPUDepthSample,
  type WebGPULinearDepthHost,
  type WebGPULinearDepthProjection
} from "../../../packages/rendering/src/post/WebGPULinearDepth";

type ProjectionKind = "perspective" | "orthographic";
type ClipRange = "minus-one-to-one" | "zero-to-one";

/**
 * Build a view-from-clip matrix from separately chosen near/far endpoints.
 * At distance z, perspective NDC depth is A + B/z; orthographic depth is
 * A + B*z. The fixtures below compare recovered distances against explicit
 * physical values instead of deriving expected results from this matrix.
 */
function inverseProjection(kind: ProjectionKind, range: ClipRange, reversed: boolean, near = 1, far = 11): Float32Array {
  const low = range === "minus-one-to-one" ? -1 : 0;
  const nearClip = reversed ? 1 : low;
  const farClip = reversed ? low : 1;
  const matrix = new Float32Array(16);
  matrix[0] = 1;
  matrix[5] = 1;
  if (kind === "perspective") {
    const b = (nearClip - farClip) / (1 / near - 1 / far);
    const a = nearClip - b / near;
    matrix[14] = -1;
    matrix[11] = 1 / b;
    matrix[15] = -a / b;
  } else {
    const b = (farClip - nearClip) / (far - near);
    const a = nearClip - b * near;
    matrix[10] = -1 / b;
    matrix[14] = a / b;
    matrix[15] = 1;
  }
  return matrix;
}

// Distances with near=1 and far=11. The hardware depth is the viewport depth
// after mapping either clip convention to [0,1], before depth quantization.
const samples: Record<ProjectionKind, ReadonlyArray<readonly [number, number]>> = {
  perspective: [[0, 1], [.55, 2], [.88, 5], [.99, 10]],
  orthographic: [[0, 1], [.1, 2], [.4, 5], [.9, 10]]
};

function projection(kind: ProjectionKind = "perspective", clipRange: ClipRange = "zero-to-one", reversed = false): WebGPULinearDepthProjection {
  return {
    kind,
    mode: reversed ? "reversed" : "standard",
    clipRange,
    inverseProjection: inverseProjection(kind, clipRange, reversed),
    nearMeters: 1,
    farMeters: 11,
    viewportDepthRange: [0, 1],
    clearValue: reversed ? 0 : 1
  };
}

interface Target extends RenderTarget {
  disposed: boolean;
  disposeCount: number;
}

function fixture(maxBytes?: number) {
  let nextId = 0, generation = 1, lost = false;
  let failAllocation = false, wrongOutputFormat = false, foreignOutput = false;
  let aliasAllocation: RenderTarget | undefined;
  let onDraw: ((pass: Parameters<WebGPULinearDepthHost["draw"]>[0]) => void) | undefined;
  let onCreate: ((descriptor: RenderTargetDescriptor, allocate: () => Target) => RenderTarget) | undefined;
  const allocations: Target[] = [], draws: Parameters<WebGPULinearDepthHost["draw"]>[0][] = [];
  const owned = new Set<RenderTarget>(), ownershipChecks: RenderTarget[] = [];
  const target = (width: number, height: number, format: "rgba8" | "rgba16f" | "rgba32f", depth: boolean): Target => {
    const colorTexture = new Texture({ width, height, format, renderAttachment: true });
    const depthTexture = depth ? new Texture({ width, height, format: "depth24", renderAttachment: true }) : undefined;
    const created: Target = {
      id: ++nextId, width, height, label: depth ? "source" : "converted", colorTexture, depthTexture,
      sampleCount: 1, disposed: false, disposeCount: 0,
      dispose(this: Target) {
        this.disposed = true;
        this.disposeCount += 1;
        colorTexture.dispose();
        depthTexture?.dispose();
      }
    };
    owned.add(created);
    return created;
  };
  const host: WebGPULinearDepthHost = {
    createTarget(descriptor: RenderTargetDescriptor) {
      if (failAllocation) throw new Error("allocation failed");
      if (aliasAllocation) return aliasAllocation;
      const allocate = () => {
        const format = wrongOutputFormat ? "rgba16f" : descriptor.format as "rgba8" | "rgba16f" | "rgba32f";
        const created = target(descriptor.width, descriptor.height, format, false);
        if (foreignOutput) owned.delete(created);
        allocations.push(created);
        return created;
      };
      return onCreate ? onCreate(descriptor, allocate) : allocate();
    },
    draw(pass) { draws.push(pass); onDraw?.(pass); },
    assertTargetOwned(value) {
      ownershipChecks.push(value);
      if (!owned.has(value)) throw new Error("foreign or stale target");
    },
    deviceGeneration: () => generation,
    isDeviceLost: () => lost
  };
  const driver = new WebGPULinearDepth(host, { maxBytes });
  const input = (width = 33, height = 17) => ({
    source: target(width, height, "rgba16f", true),
    projection: projection(),
    maxGeometryDepthMeters: 12,
    skyDepthMeters: 20,
    clearValueIsBackground: true as const
  });
  return {
    driver, input, target, allocations, draws, ownershipChecks,
    failAllocation: () => { failAllocation = true; },
    wrongOutputFormat: () => { wrongOutputFormat = true; },
    foreignOutput: () => { foreignOutput = true; },
    aliasAllocation: (value: RenderTarget) => { owned.add(value); aliasAllocation = value; },
    admit: (value: RenderTarget) => { owned.add(value); },
    forget: (value: RenderTarget) => { owned.delete(value); },
    onDraw: (fn: typeof onDraw) => { onDraw = fn; },
    onCreate: (fn: typeof onCreate) => { onCreate = fn; },
    lose: () => { lost = true; },
    replace: () => { generation += 1; }
  };
}

function coveredInput(f: ReturnType<typeof fixture>, width = 33, height = 17) {
  const base = f.input(width, height);
  const coverageTarget = f.target(width, height, "rgba8", false);
  return {
    ...base,
    clearValueIsBackground: false as const,
    coverage: { target: coverageTarget, colorAttachment: 0, encoding: "depth-coverage-red8" as const }
  };
}

describe("hardware-depth reconstruction", () => {
  for (const kind of ["perspective", "orthographic"] as const) {
    for (const range of ["zero-to-one", "minus-one-to-one"] as const) {
      for (const reversed of [false, true]) {
        it(`reconstructs ${kind}, ${range}, ${reversed ? "reversed" : "standard"} depth in metres`, () => {
          const config = projection(kind, range, reversed);
          for (const [standardDepth, expectedMeters] of samples[kind]) {
            const rawDepth = reversed ? 1 - standardDepth : standardDepth;
            expect(linearizeWebGPUDepthSample(rawDepth, config, 12, 20)).toBeCloseTo(expectedMeters, 4);
          }
          // A cleared depth attachment has no coverage and becomes the sky
          // sentinel, rather than a far-plane geometry sample.
          expect(linearizeWebGPUDepthSample(config.clearValue, config, 12, 20)).toBe(20);
        });
      }
    }
  }

  it("does not turn invalid hardware values into valid geometry", () => {
    const config = projection();
    for (const value of [NaN, Infinity, -Infinity, -0.01, 1.01]) {
      expect(linearizeWebGPUDepthSample(value, config, 12, 20)).toBe(0);
    }
  });

  it("uses per-pixel coverage to distinguish the clear endpoint from far-plane geometry", () => {
    for (const kind of ["perspective", "orthographic"] as const) {
      for (const range of ["zero-to-one", "minus-one-to-one"] as const) {
        for (const reversed of [false, true]) {
          const config = projection(kind, range, reversed);
          const middle = reversed ? 1 - samples[kind][2]![0] : samples[kind][2]![0];
          // The identical hardware sample means sky without coverage, but
          // a covered sample at the endpoint is camera-far geometry.
          expect(linearizeWebGPUDepthSample(config.clearValue, config, 12, 20)).toBe(20);
          expect(linearizeWebGPUDepthSample(config.clearValue, config, 12, 20, 0)).toBe(20);
          expect(linearizeWebGPUDepthSample(config.clearValue, config, 12, 20, 1)).toBeCloseTo(11, 4);
          expect(linearizeWebGPUDepthSample(middle, config, 12, 20, 1)).toBeCloseTo(5, 4);
          expect(linearizeWebGPUDepthSample(middle, config, 12, 20, 0)).toBe(20);
          // An uncovered sample is classified before the depth read is
          // interpreted; a covered invalid depth remains invalid.
          expect(linearizeWebGPUDepthSample(NaN, config, 12, 20, 0)).toBe(20);
          expect(linearizeWebGPUDepthSample(NaN, config, 12, 20, 1)).toBe(0);
        }
      }
    }
  });

  it("treats nonbinary coverage as invalid rather than inventing geometry or sky", () => {
    const config = projection();
    for (const red of [-1, .25, .5, 2, NaN, Infinity, -Infinity]) {
      expect(linearizeWebGPUDepthSample(.55, config, 12, 20, red)).toBe(0);
    }
  });

  it("retains a small positive reversed-depth weight near the far plane", () => {
    const nearMeters = .01, farMeters = 10000, rawDepth = 2 ** -26;
    const config = {
      ...projection("perspective", "zero-to-one", true), nearMeters, farMeters,
      inverseProjection: inverseProjection("perspective", "zero-to-one", true, nearMeters, farMeters)
    };
    const expected = 1 / (rawDepth / nearMeters + (1 - rawDepth) / farMeters);
    const actual = linearizeWebGPUDepthSample(rawDepth, config, 10001, 20000);
    // Forming 1 - (1 - rawDepth) in f32 loses the near weight here and
    // returns the full 10000 m far distance instead of this nearer value.
    expect(Math.abs(actual - expected)).toBeLessThan(.1);
    expect(actual).toBeLessThan(9900);
  });

  it("keeps off-center image projection independent from view distance", () => {
    for (const kind of ["perspective", "orthographic"] as const) {
      const config = projection(kind), inverse = Array.from(config.inverseProjection);
      inverse[12] = .375;
      inverse[13] = -.25;
      const shifted = { ...config, inverseProjection: inverse };
      expect(linearizeWebGPUDepthSample(kind === "perspective" ? .88 : .4, shifted, 12, 20)).toBeCloseTo(5, 4);
    }
  });

  it("rejects unsupported or inconsistent projection conventions", () => {
    const good = projection();
    const nonFinite = Array.from(good.inverseProjection); nonFinite[10] = NaN;
    const singular = new Float32Array(16);
    const oblique = Array.from(good.inverseProjection); oblique[2] = .1;
    const invalid = [
      { ...good, kind: "custom" },
      { ...good, kind: "orthographic" },
      { ...good, mode: "logarithmic" },
      { ...good, mode: "reversed", clearValue: 0 },
      { ...good, clipRange: "unknown" },
      { ...good, clipRange: "minus-one-to-one" },
      { ...good, viewportDepthRange: [.1, 1] },
      { ...good, viewportDepthRange: [1, 0] },
      { ...good, clearValue: 0 },
      { ...good, nearMeters: 0 },
      { ...good, nearMeters: 2 },
      { ...good, nearMeters: Number.MIN_VALUE },
      { ...good, farMeters: Infinity },
      { ...good, farMeters: 1 },
      { ...good, farMeters: 10 },
      { ...good, inverseProjection: nonFinite },
      { ...good, inverseProjection: singular },
      { ...good, inverseProjection: oblique },
      { ...good, inverseProjection: [1, 2, 3] }
    ];
    for (const entry of invalid) {
      expect(() => linearizeWebGPUDepthSample(.55, entry as WebGPULinearDepthProjection, 12, 20)).toThrow();
    }
  });
});

describe("WebGPU hardware-depth host", () => {
  it("submits a single same-size rgba32f output using a depth-only source binding", () => {
    const f = fixture(), input = f.input();
    const result = f.driver.execute(input);
    expect(f.allocations).toHaveLength(1);
    expect(result.target).toBe(f.allocations[0]);
    expect([result.target.width, result.target.height, result.target.colorTexture.format]).toEqual([33, 17, "rgba32f"]);
    expect(f.draws).toHaveLength(1);
    expect(f.draws[0]).toMatchObject({ source: input.source, sourceAspect: "depth-only", target: result.target });
    expect(f.draws[0]!.fragment).toMatch(/\btexture_depth_2d\b/);
    expect(f.draws[0]!.fragment).toMatch(/\btextureLoad\s*\(/);
    expect(f.draws[0]!.fragment).not.toMatch(/\btextureSample\s*\(/);
    expect(f.draws[0]!.fragment).toMatch(/if\s*\(!\s*\(depth\s*>=\s*0\.0\s*&&\s*depth\s*<=\s*1\.0\)\)\s*\{\s*return\s+vec4<f32>\(0\.0/s);
    expect(f.draws[0]!.fragment).toMatch(/if\s*\(!\s*\(metres\s*>=\s*1\.1754943508222875e-38\s*&&\s*metres\s*<=\s*params\.maxGeometryDepth\)\)\s*\{\s*return\s+vec4<f32>\(0\.0/s);
    expect(f.draws[0]!.fragment).toMatch(/if\s*\(depth\s*==\s*params\.clearDepth\)\s*\{\s*return\s+vec4<f32>\(params\.skyDepth/s);
    expect(f.draws[0]!.uniforms).toBeInstanceOf(Uint8Array);
    const bytes = f.draws[0]!.uniforms;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(bytes.byteLength).toBe(32);
    expect(view.getFloat32(0, true)).toBe(1);
    expect(view.getFloat32(4, true)).toBeCloseTo(1 / 11, 7);
    expect([view.getFloat32(8, true), view.getFloat32(12, true), view.getFloat32(16, true)]).toEqual([12, 20, 1]);
    expect([view.getUint32(20, true), view.getUint32(24, true)]).toEqual([1, 0]);
    expect(result.target.disposed).toBe(false);
    result.release();
    result.release();
    expect(f.allocations[0]!.disposeCount).toBe(1);
    expect(input.source.disposed).toBe(false);
    f.driver.dispose();
  });

  it("rounds geometry down and sky up before encoding f32 uniforms", () => {
    const f = fixture(), base = f.input();
    // At 12 the f32 interval is 2^-20; at 20 it is 2^-19.
    const max = 12 + 3 * 2 ** -22;
    const sky = 20 + 2 ** -21;
    const config = projection("orthographic", "minus-one-to-one", true);
    const result = f.driver.execute({ ...base, projection: config, maxGeometryDepthMeters: max, skyDepthMeters: sky });
    const bytes = f.draws[0]!.uniforms;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getFloat32(8, true)).toBe(12);
    expect(view.getFloat32(12, true)).toBe(20 + 2 ** -19);
    expect([view.getFloat32(16, true), view.getUint32(20, true), view.getUint32(24, true)]).toEqual([0, 0, 1]);
    expect(linearizeWebGPUDepthSample(0, config, max, sky)).toBe(20 + 2 ** -19);
    result.release();
    f.driver.dispose();
  });

  it("requires a caller guarantee because covered depth can quantize to the clear value", () => {
    const quantizeDepth24 = (value: number) => Math.round(value * (2 ** 24 - 1)) / (2 ** 24 - 1);
    for (const reversed of [false, true]) {
      const nearClear = reversed ? 2 ** -26 : 1 - 2 ** -26;
      const clear = reversed ? 0 : 1;
      expect(nearClear).not.toBe(clear);
      expect(quantizeDepth24(nearClear)).toBe(clear);
      const f = fixture(), input = f.input();
      const ambiguous = { ...input, projection: projection("perspective", "zero-to-one", reversed), clearValueIsBackground: false };
      expect(() => f.driver.execute(ambiguous as Parameters<WebGPULinearDepth["execute"]>[0])).toThrow();
      expect(f.allocations).toHaveLength(0);
      expect(f.draws).toHaveLength(0);
      f.driver.dispose();
    }
  });

  it("rejects ambiguous clear encodings, unsafe depth bounds, and unsupported input targets before allocation", () => {
    const f = fixture(), base = f.input();
    const badProjection = { ...base.projection, mode: "logarithmic" };
    const invalid = [
      { ...base, clearValueIsBackground: false },
      { ...base, clearValueIsBackground: undefined },
      { ...base, maxGeometryDepthMeters: 0 },
      { ...base, maxGeometryDepthMeters: 11 },
      { ...base, maxGeometryDepthMeters: NaN },
      { ...base, skyDepthMeters: 100001 },
      { ...base, skyDepthMeters: base.maxGeometryDepthMeters },
      // Distinct f64 values that collapse to the same f32 cannot separate
      // geometry from sky in the consumer's shader.
      { ...base, skyDepthMeters: base.maxGeometryDepthMeters + .0000001 },
      { ...base, projection: badProjection },
      { ...base, source: { ...base.source, sampleCount: 4 } },
      { ...base, source: { ...base.source, depthTexture: undefined } },
      { ...base, source: { ...base.source, disposed: true } },
      { ...base, source: { ...base.source, width: 0 } },
      { ...base, source: { ...base.source, width: 16385 } },
      { ...base, source: { ...base.source, dimension: "cube" } }
    ];
    for (const entry of invalid) {
      f.admit(entry.source as RenderTarget);
      expect(() => f.driver.execute(entry as Parameters<WebGPULinearDepth["execute"]>[0])).toThrow();
    }
    expect(f.allocations).toHaveLength(0);
    expect(f.draws).toHaveLength(0);
    expect(base.source.disposed).toBe(false);
    f.driver.dispose();
  });

  it("accounts for retained outputs and restores its budget when released", () => {
    const f = fixture(4 * 4 * 16), input = f.input(4, 4);
    const first = f.driver.execute(input);
    expect(() => f.driver.execute(input)).toThrow(/budget|memory/i);
    expect(f.draws).toHaveLength(1);
    first.release();
    const second = f.driver.execute(input);
    expect(f.draws).toHaveLength(2);
    f.driver.dispose();
    expect(second.target.disposed).toBe(true);
    second.release();
    expect(f.allocations[1]!.disposeCount).toBe(1);
  });

  it("does not dispose a borrowed source on alias or allocation failure", () => {
    const aliased = fixture(), input = aliased.input();
    // A distinct wrapper can still expose a borrowed GPU texture. Destroying
    // this wrapper would also destroy the source.
    aliased.aliasAllocation({ ...input.source, colorTexture: input.source.depthTexture! });
    expect(() => aliased.driver.execute(input)).toThrow();
    expect(input.source.disposed).toBe(false);
    expect(aliased.draws).toHaveLength(0);
    const failing = fixture(), other = failing.input();
    failing.failAllocation();
    expect(() => failing.driver.execute(other)).toThrow("allocation failed");
    expect(other.source.disposed).toBe(false);
    expect(failing.draws).toHaveLength(0);
  });

  it("disposes an owned allocation if the host returns the wrong format", () => {
    const f = fixture(), input = f.input();
    f.wrongOutputFormat();
    expect(() => f.driver.execute(input)).toThrow();
    expect(f.allocations).toHaveLength(1);
    expect(f.allocations[0]!.disposeCount).toBe(1);
    expect(input.source.disposed).toBe(false);
    expect(f.draws).toHaveLength(0);
    f.driver.dispose();
  });

  it("releases owned output if submission fails and preserves the source", () => {
    const f = fixture(), input = f.input();
    f.onDraw(() => { throw new Error("submission failed"); });
    expect(() => f.driver.execute(input)).toThrow("submission failed");
    expect(f.allocations).toHaveLength(1);
    expect(f.allocations[0]!.disposeCount).toBe(1);
    expect(input.source.disposed).toBe(false);
    f.driver.dispose();
  });

  it("stops on cancellation or device generation changes and retires owned targets", () => {
    const f = fixture(), input = f.input(), previous = f.driver.execute(input);
    const controller = new AbortController();
    f.onDraw(() => { controller.abort(); });
    expect(() => f.driver.execute({ ...input, signal: controller.signal })).toThrow(/cancel/i);
    expect(f.allocations[1]!.disposeCount).toBe(1);
    expect(previous.target.disposed).toBe(false);
    f.replace();
    expect(() => f.driver.execute(input)).toThrow(/device|lost|replaced/i);
    expect(previous.target.disposed).toBe(true);
    expect(input.source.disposed).toBe(false);
  });

  it("invalidates outstanding leases if the device is lost during submission", () => {
    const f = fixture(), input = f.input(), previous = f.driver.execute(input);
    f.onDraw(() => { f.lose(); });
    expect(() => f.driver.execute(input)).toThrow(/device|lost/i);
    expect(previous.target.disposed).toBe(true);
    expect(f.allocations[1]!.disposeCount).toBe(1);
    expect(input.source.disposed).toBe(false);
  });
});

describe("WebGPU depth coverage input", () => {
  it("binds a same-size coverage attachment and validates ownership of all resources", () => {
    const f = fixture(), input = coveredInput(f);
    const result = f.driver.execute(input);
    const pass = f.draws[0]!;
    expect(pass).toMatchObject({ source: input.source, sourceAspect: "depth-only", target: result.target,
      coverage: { target: input.coverage.target, colorAttachment: 0, binding: 2, sampleType: "float" } });
    expect(pass.fragment).toMatch(/@group\(0\)\s*@binding\(2\)\s*var\s+\w+\s*:\s*texture_2d<f32>/);
    expect(pass.fragment).toMatch(/\btextureLoad\s*\(/);
    expect(pass.fragment).not.toMatch(/\btextureSample\s*\(/);
    expect(f.ownershipChecks).toEqual(expect.arrayContaining([input.source, input.coverage.target, result.target]));
    result.release();
    expect(input.source.disposed).toBe(false);
    expect(input.coverage.target.disposed).toBe(false);
    f.driver.dispose();
  });

  it("uses the selected attachment of the depth source when coverage is an MRT color", () => {
    const f = fixture(), base = f.input();
    const coverage = f.target(33, 17, "rgba8", false);
    const mrt = { ...base.source, colorTextures: [base.source.colorTexture, coverage.colorTexture] };
    f.admit(mrt);
    const input = { ...base, source: mrt, clearValueIsBackground: undefined,
      coverage: { target: mrt, colorAttachment: 1, encoding: "depth-coverage-red8" as const } };
    const result = f.driver.execute(input);
    expect(f.draws[0]!.coverage).toEqual({ target: mrt, colorAttachment: 1, binding: 2, sampleType: "float" });
    expect(f.draws[0]!.source).toBe(mrt);
    result.release();
    expect(mrt.disposed).toBe(false);
    expect(coverage.colorTexture.disposed).toBe(false);
    f.driver.dispose();
  });

  it("rejects absent, ambiguous, malformed or incompatible coverage before allocating", () => {
    const f = fixture(), base = coveredInput(f), coverageTarget = base.coverage.target;
    const format16 = f.target(33, 17, "rgba16f", false);
    const format32 = f.target(33, 17, "rgba32f", false);
    const nonsampled = new Texture({ width: 33, height: 17, format: "rgba8", renderAttachment: true, usage: ["render-attachment"] });
    const srgb = new Texture({ width: 33, height: 17, format: "rgba8", renderAttachment: true, colorSpace: "srgb" });
    const disposed = new Texture({ width: 33, height: 17, format: "rgba8", renderAttachment: true });
    disposed.dispose();
    const invalidTargets = [
      format16, format32,
      { ...coverageTarget, width: 32 },
      { ...coverageTarget, height: 18 },
      { ...coverageTarget, sampleCount: 4 },
      { ...coverageTarget, dimension: "2d-array" },
      { ...coverageTarget, attachmentMipLevel: 1 },
      { ...coverageTarget, attachmentLayer: 1 },
      { ...coverageTarget, disposed: true },
      { ...coverageTarget, colorTexture: nonsampled },
      { ...coverageTarget, colorTexture: srgb },
      { ...coverageTarget, colorTexture: disposed },
      { ...coverageTarget, colorTextures: [format16.colorTexture, coverageTarget.colorTexture] }
    ];
    const invalid = [
      { ...base, clearValueIsBackground: true },
      { ...base, coverage: undefined },
      { ...base, coverage: null },
      { ...base, coverage: { ...base.coverage, encoding: "unknown" } },
      { ...base, coverage: { ...base.coverage, colorAttachment: -1 } },
      { ...base, coverage: { ...base.coverage, colorAttachment: 1 } },
      { ...base, coverage: { ...base.coverage, colorAttachment: 8 } },
      { ...base, coverage: { ...base.coverage, colorAttachment: 0.5 } },
      ...invalidTargets.map(target => ({ ...base, coverage: { ...base.coverage, target } }))
    ];
    for (const entry of invalid) {
      if (entry.coverage?.target) f.admit(entry.coverage.target as RenderTarget);
      expect(() => f.driver.execute(entry as Parameters<WebGPULinearDepth["execute"]>[0])).toThrow();
    }
    expect(f.allocations).toHaveLength(0);
    expect(f.draws).toHaveLength(0);
    expect(base.source.disposed).toBe(false);
    expect(coverageTarget.disposed).toBe(false);
    f.driver.dispose();
  });

  it("rejects foreign or stale source and coverage targets before allocation", () => {
    const f = fixture(), foreign = fixture(), input = coveredInput(f);
    const foreignSource = foreign.input().source;
    const foreignMask = foreign.target(33, 17, "rgba8", false);
    for (const entry of [
      { ...input, source: foreignSource },
      { ...input, coverage: { ...input.coverage, target: foreignMask } }
    ]) expect(() => f.driver.execute(entry)).toThrow(/foreign|stale/i);
    f.forget(input.coverage.target);
    expect(() => f.driver.execute(input)).toThrow(/foreign|stale/i);
    expect(f.allocations).toHaveLength(0);
    expect(f.draws).toHaveLength(0);
    expect(input.source.disposed).toBe(false);
    expect(input.coverage.target.disposed).toBe(false);
    expect(foreignSource.disposed).toBe(false);
    expect(foreignMask.disposed).toBe(false);
    f.driver.dispose();
    foreign.driver.dispose();
  });

  it("never disposes a borrowed coverage texture when an output aliases it", () => {
    const f = fixture(), input = coveredInput(f);
    f.aliasAllocation({ ...input.coverage.target });
    expect(() => f.driver.execute(input)).toThrow(/alias/i);
    expect(f.draws).toHaveLength(0);
    expect(input.source.disposed).toBe(false);
    expect(input.coverage.target.disposed).toBe(false);
    expect(input.coverage.target.colorTexture.disposed).toBe(false);
    f.driver.dispose();
  });

  it("does not destroy the original borrowed depth if an allocation callback swaps it", () => {
    const f = fixture(), input = coveredInput(f), original = input.source.depthTexture!;
    const replacement = new Texture({ width: 33, height: 17, format: "depth24", renderAttachment: true });
    let wrapperDisposed = false;
    const wrapper: RenderTarget = { ...input.source, colorTexture: original, depthTexture: undefined,
      dispose() { wrapperDisposed = true; original.dispose(); } };
    f.admit(wrapper);
    f.onCreate(() => {
      Object.assign(input.source, { depthTexture: replacement });
      return wrapper;
    });
    expect(() => f.driver.execute(input)).toThrow();
    expect(wrapperDisposed).toBe(false);
    expect(original.disposed).toBe(false);
    expect(input.source.disposed).toBe(false);
    expect(input.coverage.target.disposed).toBe(false);
    expect(f.draws).toHaveLength(0);
    f.driver.dispose();
  });

  it("does not destroy the original selected MRT coverage if an allocation callback swaps it", () => {
    const f = fixture(), base = f.input(), coverageTarget = f.target(33, 17, "rgba8", false);
    const original = coverageTarget.colorTexture;
    const replacement = new Texture({ width: 33, height: 17, format: "rgba8", renderAttachment: true });
    const mrt = { ...base.source, colorTextures: [base.source.colorTexture, original] };
    f.admit(mrt);
    const input = { ...base, source: mrt, clearValueIsBackground: undefined,
      coverage: { target: mrt, colorAttachment: 1, encoding: "depth-coverage-red8" as const } };
    let wrapperDisposed = false;
    const wrapper: RenderTarget = { ...coverageTarget, colorTexture: original,
      dispose() { wrapperDisposed = true; original.dispose(); } };
    f.admit(wrapper);
    f.onCreate(() => {
      Object.assign(mrt, { colorTextures: [mrt.colorTexture, replacement] });
      return wrapper;
    });
    expect(() => f.driver.execute(input)).toThrow();
    expect(wrapperDisposed).toBe(false);
    expect(original.disposed).toBe(false);
    expect(mrt.disposed).toBe(false);
    expect(f.draws).toHaveLength(0);
    f.driver.dispose();
  });

  it("does not destroy an unowned target returned by a faulty host", () => {
    const f = fixture(), input = coveredInput(f);
    f.foreignOutput();
    expect(() => f.driver.execute(input)).toThrow(/foreign|stale/i);
    expect(f.allocations).toHaveLength(1);
    expect(f.allocations[0]!.disposed).toBe(false);
    expect(f.draws).toHaveLength(0);
    expect(input.source.disposed).toBe(false);
    expect(input.coverage.target.disposed).toBe(false);
    f.driver.dispose();
  });

  it("retires an owned output when allocation aborts the request before returning", () => {
    const f = fixture(), input = coveredInput(f), controller = new AbortController();
    f.onCreate((_descriptor, allocate) => {
      const ownedOutput = allocate();
      controller.abort();
      return ownedOutput;
    });
    expect(() => f.driver.execute({ ...input, signal: controller.signal })).toThrow(/cancel/i);
    expect(f.allocations).toHaveLength(1);
    expect(f.allocations[0]!.disposeCount).toBe(1);
    expect(f.draws).toHaveLength(0);
    expect(input.source.disposed).toBe(false);
    expect(input.coverage.target.disposed).toBe(false);
    f.driver.dispose();
  });

  it("preserves borrowed coverage through cancellation, retained-budget checks and device loss", () => {
    const f = fixture(4 * 4 * 16), input = coveredInput(f, 4, 4);
    const first = f.driver.execute(input);
    expect(() => f.driver.execute(input)).toThrow(/budget|memory/i);
    first.release();
    const controller = new AbortController();
    f.onDraw(() => controller.abort());
    expect(() => f.driver.execute({ ...input, signal: controller.signal })).toThrow(/cancel/i);
    expect(f.allocations[1]!.disposeCount).toBe(1);
    expect(input.coverage.target.disposed).toBe(false);
    f.onDraw(undefined);
    const previous = f.driver.execute(input);
    f.lose();
    expect(() => f.driver.execute(input)).toThrow(/device|lost/i);
    expect(previous.target.disposed).toBe(true);
    expect(input.source.disposed).toBe(false);
    expect(input.coverage.target.disposed).toBe(false);
  });
});
