import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebGPUAutoExposure, WEBGPU_EXPOSURE_METER_EDGE, normalizeWebGPUAutoExposure, type WebGPUExposureDraw, type WebGPUExposureFrame } from "../../../packages/rendering/src/post/WebGPUAutoExposure";
import { EXPOSURE_ADAPT_WGSL, EXPOSURE_LUMA_LOG_WGSL, EXPOSURE_MUL_WGSL, EXPOSURE_REDUCE_WGSL } from "../../../packages/rendering/src/post/shaders/exposure.wgsl";
import type { RenderTarget, RenderTargetDescriptor } from "../../../packages/rendering/src/RenderDevice";

interface Target extends RenderTarget { pixels: Float64Array; disposed: boolean; failDisposal?: boolean; }
function fixture(simulate = true) {
  let id = 0, failure = "";
  const targets: Target[] = [], draws: WebGPUExposureDraw[] = [];
  const make = (descriptor: RenderTargetDescriptor): Target => {
    const texture = { format: descriptor.format ?? "rgba8", disposed: false };
    const target = { id: ++id, width: descriptor.width, height: descriptor.height, label: descriptor.label ?? "source", colorTexture: texture,
      disposed: false, sampleCount: descriptor.sampleCount ?? 1, pixels: new Float64Array(simulate ? descriptor.width * descriptor.height * 4 : 0),
      dispose(this: Target) { this.disposed = true; texture.disposed = true; if (this.failDisposal) throw new Error("disposal failed"); } } as unknown as Target;
    targets.push(target);
    return target;
  };
  const draw = (p: WebGPUExposureDraw): void => {
    draws.push(p);
    if (p.entryPoint === failure) throw new Error("draw failed");
    if (!simulate) return;
    const data = new DataView(p.uniforms.buffer, p.uniforms.byteOffset, p.uniforms.byteLength);
    const dst = p.target as Target, source = p.sources[0] as Target;
    dst.pixels.fill(0);
    const pixel = (target: Target, x: number, y: number, c: number) => target.pixels[(y * target.width + x) * 4 + c]!;
    const set = (x: number, y: number, c: number, value: number) => { dst.pixels[(y * dst.width + x) * 4 + c] = value; };
    if (p.entryPoint === "fs_exposure_luma_log") {
      const width = data.getUint32(0, true), height = data.getUint32(4, true), sx = data.getUint32(8, true), sy = data.getUint32(12, true);
      for (let y = 0; y < dst.height; y++) for (let x = 0; x < dst.width; x++) {
        let red = 0, green = 0, blue = 0, count = 0;
        for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
          const bx = (x * 4 + px) * sx, by = (y * 4 + py) * sy;
          if (bx >= width || by >= height) continue;
          const tx = Math.min(width - 1, bx + Math.floor(sx / 2)), ty = Math.min(height - 1, by + Math.floor(sy / 2));
          red += pixel(source, tx, ty, 0); green += pixel(source, tx, ty, 1); blue += pixel(source, tx, ty, 2); count++;
        }
        const luminance = Math.max((red * .2126 + green * .7152 + blue * .0722) / Math.max(count, 1), 1e-5);
        const left = x * 4 * sx, top = y * 4 * sy;
        const right = Math.min((x + 1) * 4 * sx, width), bottom = Math.min((y + 1) * 4 * sy, height);
        const dx = (left + right) * .5 / width - .5, dy = (top + bottom) * .5 / height - .5;
        const mask = data.getUint32(16, true) === 1 ? Math.max(0, 1 - 4 * (dx * dx + dy * dy)) : 1;
        const weight = mask * count / 16;
        set(x, y, 0, Math.log2(luminance) * weight); set(x, y, 1, weight);
      }
    } else if (p.entryPoint === "fs_exposure_reduce") {
      for (let y = 0; y < dst.height; y++) for (let x = 0; x < dst.width; x++) {
        for (let py = 0; py < 2; py++) for (let px = 0; px < 2; px++) {
          const tx = x * 2 + px, ty = y * 2 + py;
          if (tx >= source.width || ty >= source.height) continue;
          for (let c = 0; c < 2; c++) set(x, y, c, pixel(dst, x, y, c) + pixel(source, tx, ty, c) / 4);
        }
      }
    } else if (p.entryPoint === "fs_exposure_adapt") {
      const average = p.sources[1] as Target;
      const target = Math.max(data.getFloat32(12, true), Math.min(data.getFloat32(16, true), Math.log2(.18) - average.pixels[0]! / Math.max(average.pixels[1]!, 1e-8) + data.getFloat32(20, true)));
      const prev = source.pixels[0]!, speed = data.getFloat32(target > prev ? 4 : 8, true);
      dst.pixels[0] = data.getUint32(24, true) ? prev + (target - prev) * (1 - Math.exp(-data.getFloat32(0, true) * speed)) : target;
    } else if (p.entryPoint === "fs_exposure_mul") {
      const multiplier = 2 ** (p.sources[1] as Target).pixels[0]!;
      for (let i = 0; i < dst.pixels.length; i += 4) {
        for (let c = 0; c < 3; c++) dst.pixels[i + c] = source.pixels[i + c]! * multiplier;
        dst.pixels[i + 3] = source.pixels[i + 3]!;
      }
    } else throw new Error(`Unexpected pass ${p.entryPoint}`);
  };
  const exposure = new WebGPUAutoExposure({ createTarget: make, draw });
  const source = (width: number, height: number, value: number, alpha = 1, format: "rgba16f" | "rgba32f" = "rgba16f") => {
    const result = make({ width, height, format });
    for (let i = 0; i < result.pixels.length; i += 4) { result.pixels[i] = value; result.pixels[i + 1] = value; result.pixels[i + 2] = value; result.pixels[i + 3] = alpha; }
    return result;
  };
  return { exposure, source, make, targets, draws, fail: (entry = "") => { failure = entry; } };
}
const frame = (scopeId: object, viewId: string, frameId: number, timeSeconds: number, cameraCut = false): WebGPUExposureFrame =>
  ({ scopeId, viewId, frameId, timeSeconds, cameraCut, deviceGeneration: 1 });
const adapt = (draws: WebGPUExposureDraw[]) => {
  const pass = draws.filter(p => p.entryPoint === "fs_exposure_adapt").at(-1)!;
  const data = new DataView(pass.uniforms.buffer, pass.uniforms.byteOffset, pass.uniforms.byteLength);
  return { pass, dt: data.getFloat32(0, true), hasPrev: data.getUint32(24, true) === 1, ev: (pass.target as Target).pixels[0] };
};

describe("native WebGPU auto exposure", () => {
  it("meters every sample for odd dimensions and preserves HDR color and alpha", () => {
    const f = fixture(), scope = {}, source = f.source(5, 3, 1, .37);
    for (let i = 0; i < 15; i++) for (let c = 0; c < 3; c++) source.pixels[i * 4 + c] = .05 + i * .05;
    const output = f.exposure.execute(source, { meteringMask: "average" }, frame(scope, "main", 1, 8));
    const firstBlock = [0, 1, 2, 3, 5, 6, 7, 8, 10, 11, 12, 13].reduce((sum, i) => sum + source.pixels[i * 4]!, 0) / 12;
    const edgeBlock = [4, 9, 14].reduce((sum, i) => sum + source.pixels[i * 4]!, 0) / 3;
    const averageLog = (12 * Math.log2(firstBlock) + 3 * Math.log2(edgeBlock)) / 15;
    const expected = Math.max(-4, Math.min(4, Math.log2(.18) - averageLog));
    expect(adapt(f.draws).ev).toBeCloseTo(expected, 6);
    expect((output.target as Target).pixels[0]).toBeCloseTo(source.pixels[0]! * 2 ** expected, 6);
    expect((output.target as Target).pixels[3]).toBeCloseTo(.37, 7);
    output.commit();
    const centered = f.exposure.execute(source, { meteringMask: "center-weighted" }, frame(scope, "center", 1, 8));
    // The 4×3 block is centered at x=.4 and the 1×3 edge block at x=.9.
    // Weight each block's log of average RGB by its sample count and mask.
    const centerLog = (12 * .96 * Math.log2(firstBlock) + 3 * .36 * Math.log2(edgeBlock)) / (12 * .96 + 3 * .36);
    expect(adapt(f.draws).ev).toBeCloseTo(Math.log2(.18) - centerLog, 6);
    centered.commit();
    f.exposure.dispose();
    expect(f.targets.filter(t => t !== source).every(t => t.disposed)).toBe(true);
  });

  it("matches the WebGL block-average-then-log meter for high contrast", () => {
    const f = fixture(), source = f.source(8, 4, .01);
    for (let c = 0; c < 3; c++) source.pixels[c] = 10;
    f.exposure.execute(source, { meteringMask: "average" }, frame({}, "v", 1, 0)).commit();
    const brightBlock = (10 + 15 * .01) / 16;
    const expected = Math.log2(.18) - (Math.log2(brightBlock) + Math.log2(.01)) / 2;
    expect(adapt(f.draws).ev).toBeCloseTo(expected, 6);
    const perPixelLog = Math.log2(.18) - (Math.log2(10) + 31 * Math.log2(.01)) / 32;
    expect(Math.abs(adapt(f.draws).ev! - perPixelLog)).toBeGreaterThan(1);
  });

  it("isolates view/scope histories, uses captured time and keeps same-frame prior state", () => {
    const f = fixture(), a = {}, b = {}, dark = f.source(4, 4, .01), light = f.source(4, 4, 1);
    const a1 = f.exposure.execute(dark, {}, frame(a, "left", 1, 10));
    expect(adapt(f.draws)).toMatchObject({ hasPrev: false, dt: 0 });
    a1.commit();
    const b1 = f.exposure.execute(light, {}, frame(b, "left", 1, 10));
    expect(adapt(f.draws).hasPrev).toBe(false); b1.commit();
    const otherView = f.exposure.execute(light, {}, frame(a, "right", 1, 10));
    expect(adapt(f.draws).hasPrev).toBe(false); otherView.commit();
    const a2 = f.exposure.execute(light, {}, frame(a, "left", 2, 10.25));
    const first = adapt(f.draws);
    expect(first.hasPrev).toBe(true); expect(first.dt).toBeCloseTo(.25, 6);
    const ev = first.ev!; a2.commit();
    const repeated = f.exposure.execute(light, {}, frame(a, "left", 2, 10.25));
    const second = adapt(f.draws);
    expect(second.pass.sources[0]).toBe(first.pass.sources[0]);
    expect(second.ev).toBeCloseTo(ev, 8); repeated.commit();
    expect(() => f.exposure.execute(light, {}, frame(a, "left", 2, 10.3))).toThrow(/frame parameters changed/);
    const b2 = f.exposure.execute(light, {}, frame(b, "left", 2, 10.4));
    expect(adapt(f.draws).dt).toBeCloseTo(.4, 6); b2.commit();
  });

  it("applies center weighting and distinct brightening/darkening speeds", () => {
    const f = fixture(), scope = {}, image = f.source(5, 5, .01);
    for (let c = 0; c < 3; c++) image.pixels[(2 * 5 + 2) * 4 + c] = 10;
    f.exposure.execute(image, { meteringMask: "average" }, frame(scope, "average", 1, 0)).commit();
    const averageEv = adapt(f.draws).ev!;
    f.exposure.execute(image, { meteringMask: "center-weighted" }, frame(scope, "center", 1, 0)).commit();
    expect(adapt(f.draws).ev).toBeLessThan(averageEv);

    const light = f.source(1, 1, 1), dark = f.source(1, 1, .01);
    const opts = { speedUp: 4, speedDown: .5 };
    f.exposure.execute(light, opts, frame(scope, "rise", 1, 1)).commit();
    const riseBefore = adapt(f.draws).ev!;
    f.exposure.execute(dark, opts, frame(scope, "rise", 2, 1.5)).commit();
    const riseAfter = adapt(f.draws).ev!;
    const riseTarget = Math.min(4, Math.log2(.18 / .01));
    expect(riseAfter).toBeCloseTo(riseBefore + (riseTarget - riseBefore) * (1 - Math.exp(-2)), 6);
    f.exposure.execute(dark, opts, frame(scope, "fall", 1, 1)).commit();
    const fallBefore = adapt(f.draws).ev!;
    f.exposure.execute(light, opts, frame(scope, "fall", 2, 1.5)).commit();
    expect(adapt(f.draws).ev).toBeCloseTo(fallBefore + (Math.log2(.18) - fallBefore) * (1 - Math.exp(-.25)), 6);
  });

  it("re-seeds on cuts, resize, clock reversal, failed writes and explicit view reset", () => {
    const f = fixture(), scope = {}, source = f.source(4, 4, .3);
    f.exposure.execute(source, {}, frame(scope, "v", 1, 2)).commit();
    f.exposure.execute(source, {}, frame(scope, "v", 2, 3, true)).commit();
    expect(adapt(f.draws).hasPrev).toBe(false);
    f.exposure.execute(source, {}, frame(scope, "v", 3, 1)).commit();
    expect(adapt(f.draws).hasPrev).toBe(false);
    f.exposure.execute(source, {}, frame(scope, "v", 4, 1.25)).abort();
    f.exposure.execute(source, {}, frame(scope, "v", 5, 1.5)).commit();
    expect(adapt(f.draws).hasPrev).toBe(false);
    f.fail("fs_exposure_mul");
    expect(() => f.exposure.execute(source, {}, frame(scope, "v", 6, 2))).toThrow("draw failed");
    f.fail();
    f.exposure.execute(source, {}, frame(scope, "v", 7, 2.2)).commit();
    expect(adapt(f.draws).hasPrev).toBe(false);
    const resized = f.source(7, 2, .3);
    f.exposure.execute(resized, {}, frame(scope, "v", 8, 2.4)).commit();
    expect(adapt(f.draws).hasPrev).toBe(false);
    f.exposure.resetView(scope, "v");
    f.exposure.execute(resized, {}, frame(scope, "v", 9, 2.6)).commit();
    expect(adapt(f.draws).hasPrev).toBe(false);
  });

  it("caps metering work, reuses per-view allocations and fences lifetimes through host disposal", () => {
    const f = fixture(false), scope = {}, source = f.source(16384, 8192, .2);
    f.exposure.execute(source, {}, frame(scope, "v", 1, 0)).commit();
    const count = f.targets.length, meter = f.draws.find(draw => draw.entryPoint === "fs_exposure_luma_log")!.target;
    expect(meter.width).toBeLessThanOrEqual(WEBGPU_EXPOSURE_METER_EDGE);
    expect(meter.height).toBeLessThanOrEqual(WEBGPU_EXPOSURE_METER_EDGE);
    expect(f.draws.length).toBeLessThanOrEqual(11);
    f.exposure.execute(source, {}, frame(scope, "v", 2, 100)).commit();
    expect(adapt(f.draws).dt).toBe(60);
    expect(f.targets.length).toBe(count);
    f.exposure.resetScope(scope);
    expect(f.targets.filter(t => t !== source).every(t => t.disposed)).toBe(true);
    f.exposure.dispose(); f.exposure.dispose();
  });

  it("retires a replaced device generation without disturbing another scope", () => {
    const f = fixture(), a = {}, b = {}, source = f.source(4, 4, .2);
    const first = f.exposure.execute(source, {}, frame(a, "v", 1, 0)); first.commit();
    const firstTargets = f.targets.filter(target => target !== source);
    const second = f.exposure.execute(source, {}, frame(b, "v", 1, 0)); second.commit();
    const secondTargets = f.targets.filter(target => target !== source && !firstTargets.includes(target));
    f.exposure.execute(source, {}, { ...frame(a, "v", 2, 1), deviceGeneration: 2 }).commit();
    expect(adapt(f.draws).hasPrev).toBe(false);
    expect(firstTargets.every(target => target.disposed)).toBe(true);
    expect(secondTargets.every(target => !target.disposed)).toBe(true);
    f.exposure.resetScope(a);
    expect(secondTargets.every(target => !target.disposed)).toBe(true);
    f.exposure.dispose();
    expect(secondTargets.every(target => target.disposed)).toBe(true);
  });

  it("rejects a stale commit without corrupting the timestamp of a reused history target", () => {
    const f = fixture(), scope = {}, source = f.source(1, 1, .2);
    const stale = f.exposure.execute(source, {}, frame(scope, "v", 1, 0)); stale.commit();
    f.exposure.execute(source, {}, frame(scope, "v", 2, 1)).commit();
    f.exposure.execute(source, {}, frame(scope, "v", 3, 2)).commit();
    expect(() => stale.commit()).toThrow(/STALE_LEASE/);
    f.exposure.execute(source, {}, frame(scope, "v", 4, 3)).commit();
    expect(adapt(f.draws).dt).toBe(1);
  });

  it("attempts every scratch and history release even if a disposer throws", () => {
    const f = fixture(), scope = {}, source = f.source(5, 3, .2);
    f.exposure.execute(source, {}, frame(scope, "v", 1, 0)).commit();
    const oldTargets = f.targets.filter(target => target !== source);
    oldTargets[0]!.failDisposal = true;
    expect(() => f.exposure.resetView(scope, "v")).toThrow(AggregateError);
    expect(oldTargets.every(target => target.disposed)).toBe(true);
    f.exposure.execute(source, {}, frame(scope, "v", 2, 1)).commit();
    expect(adapt(f.draws).hasPrev).toBe(false);
    const newTargets = f.targets.filter(target => target !== source && !oldTargets.includes(target));
    newTargets[0]!.failDisposal = true;
    expect(() => f.exposure.dispose()).toThrow(AggregateError);
    expect(newTargets.every(target => target.disposed)).toBe(true);
    expect(() => f.exposure.dispose()).toThrow(AggregateError);
    oldTargets[0]!.failDisposal = false;
    newTargets[0]!.failDisposal = false;
    expect(() => f.exposure.dispose()).not.toThrow();
    expect(() => f.exposure.dispose()).not.toThrow();
  });

  it("fails malformed inputs before submitting", () => {
    const f = fixture(), scope = {}, source = f.source(1, 1, 1);
    for (const options of [{ minEv: NaN }, { minEv: null }, { speedUp: -1 }, { minEv: 2, maxEv: 1 }, { meteringMask: "spot" }, { meteringMask: null }, null, true, [], new Date()]) {
      expect(() => f.exposure.execute(source, options as never, frame(scope, "v", 1, 0))).toThrow();
    }
    expect(() => f.exposure.execute(source, {}, { ...frame(scope, "v", 1, 0), timeSeconds: NaN })).toThrow(/captured frame time/);
    expect(() => f.exposure.execute({ ...source, sampleCount: 4 }, {}, frame(scope, "v", 1, 0))).toThrow(/single-sample/);
    expect(f.draws).toHaveLength(0);
    expect(normalizeWebGPUAutoExposure({})).toEqual({ minEv: -4, maxEv: 4, speedUp: 3, speedDown: 1, compensationEv: 0, meteringMask: "center-weighted" });
  });
});

const naga = spawnSync("naga", ["--version"], { stdio: "ignore" }).status === 0;
describe("offline exposure WGSL", () => {
  it("declares the exact sampler-free native binding contract", () => {
    for (const code of [EXPOSURE_LUMA_LOG_WGSL, EXPOSURE_REDUCE_WGSL, EXPOSURE_ADAPT_WGSL, EXPOSURE_MUL_WGSL]) {
      expect(code).toContain("@binding(0)"); expect(code).toContain("@binding(2)");
      expect(code).not.toContain("@binding(1)"); expect(code).not.toContain("textureSample");
    }
    expect(EXPOSURE_ADAPT_WGSL).toContain("@binding(3)"); expect(EXPOSURE_MUL_WGSL).toContain("@binding(3)");
  });
  it.runIf(naga)("validates each standalone WGSL fragment with the offline Naga compiler", () => {
    const dir = mkdtempSync(join(tmpdir(), "aura-exposure-wgsl-"));
    try {
      for (const [index, code] of [EXPOSURE_LUMA_LOG_WGSL, EXPOSURE_REDUCE_WGSL, EXPOSURE_ADAPT_WGSL, EXPOSURE_MUL_WGSL].entries()) {
        const file = join(dir, `${index}.wgsl`); writeFileSync(file, code); execFileSync("naga", [file], { encoding: "utf8" });
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
