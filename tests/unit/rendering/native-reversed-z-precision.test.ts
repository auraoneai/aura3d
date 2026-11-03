import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Matrix4 } from "@aura3d/math";
import { identityMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { createCameraProjection as createRootCameraProjection } from "../../../packages/engine/src/agent-api/RootRuntimeSupport.js";
import { resolveProductionCameraDepth } from "../../../packages/engine/src/agent-api/compiler/cameraDepth.js";
import {
  classifyDepthPrecision,
  encodeViewDepth,
  linearizeDepth,
  negotiateDepthConvention,
  reconstructViewPosition,
  toStandardWindowDepth,
  zeroToOneReversedProjection
} from "../../../packages/rendering/src/DepthConvention";
import {
  applyFrameDepthConvention,
  recordFrameDepthStorage,
  standardizeDepthReadback,
  withStandardDeviceDepth,
  zeroToOneReversedRasterCamera
} from "../../../packages/rendering/src/renderer/FrameDepthConvention";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { registerFrameContributor, type FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";
import type { WebGPUDeviceLike, WebGPULike } from "../../../packages/rendering/src/WebGPUDevice";
import { createRenderDevice } from "../../../packages/rendering/src";
import { normalizeProgramFeatures, PROGRAM_LOG_DEPTH_FEATURE } from "../../../packages/rendering/src/program/ProgramFeatures";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { createGeneratedPbrProgram, GENERATED_PBR_MATERIAL_OFFSETS, packGeneratedPbrMaterialUniforms } from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";
import { createGeneratedUnlitProgram, GENERATED_UNLIT_MATERIAL_OFFSETS, packGeneratedUnlitMaterialUniforms } from "../../../packages/rendering/src/webgpu/GeneratedUnlitProgram";
import { impostorDepthUniforms, impostorShaderSources } from "../../../packages/rendering/src/world/vegetation/ImpostorMaterial";
import { fakeWebGLCanvas } from "./static-unlit-fake-webgl";
import { createProofWebGPU } from "./webgpu-rtt-mock";

const near = 0.1;
const far = 10_000;
const production = (mode: "standard" | "reversed", kind: "perspective" | "orthographic" = "perspective") =>
  resolveProductionCameraDepth({ mode: kind, fov: 50, orthographicSize: 3, near, far, depth: { mode } });

/** GPU-style evaluation of stored window depth with every operation rounded to f32. */
function f32WindowDepth(projection: ArrayLike<number>, distance: number, clip: "minus-one-to-one" | "zero-to-one", remap: boolean): number {
  const f = Math.fround;
  const z = f(-distance);
  const clipZ = f(f(f(projection[10]!) * z) + f(projection[14]!));
  const clipW = f(f(f(projection[11]!) * z) + f(projection[15]!));
  // WebGPU programs remap a minus-one-to-one projection: (z + w) / 2.
  const rasterZ = remap ? f(f(clipZ + clipW) * 0.5) : clipZ;
  const ndc = f(rasterZ / clipW);
  return clip === "minus-one-to-one" && !remap ? f(f(ndc * 0.5) + 0.5) : ndc;
}
const fixed24 = (depth: number): number => Math.round(depth * 16_777_215) / 16_777_215;
const float32 = (depth: number): number => Math.fround(depth);

describe("zero-to-one reversed encoding (CPU numerical reference)", () => {
  it("rebuilds the exact zero-to-one reversed projection and round-trips depth", () => {
    for (const kind of ["perspective", "orthographic"] as const) {
      const { projectionCamera, projectionMetadata } = production("reversed", kind);
      const reversed = createRootCameraProjection(projectionCamera, 1.5);
      const standard = createRootCameraProjection(production("standard", kind).projectionCamera, 1.5);
      const zeroToOne = zeroToOneReversedProjection(reversed, projectionMetadata);
      // Near -> 1 and far -> 0 in a native zero-to-one clip range; x/y unchanged.
      const ndcZ = (d: number) => (zeroToOne[10]! * -d + zeroToOne[14]!) / (zeroToOne[11]! * -d + zeroToOne[15]!);
      expect(ndcZ(near)).toBeCloseTo(1, 6);
      expect(ndcZ(far)).toBeCloseTo(0, 6);
      for (const index of [0, 1, 4, 5, 8, 9, 3, 7, 11, 15]) expect(zeroToOne[index]).toBe(Math.fround(reversed[index]!));
      // Exact rows, not (row2 + row3) / 2 of rounded coefficients.
      const exact = kind === "perspective" ? [near / (far - near), far * near / (far - near)] : [1 / (far - near), far / (far - near)];
      expect(zeroToOne[10]).toBe(Math.fround(exact[0]!));
      expect(zeroToOne[14]).toBe(Math.fround(exact[1]!));

      const convention = negotiateDepthConvention({ mode: "reversed" }, { clipRange: "zero-to-one", reversed: true, logarithmic: true });
      const inverse = new Matrix4(Array.from(zeroToOne) as unknown as Matrix4["elements"]).inverse().elements;
      for (const distance of [0.1, 0.5, 3, 40, 900, 9_999]) {
        const stored = Math.min(1, Math.max(0, encodeViewDepth(distance, zeroToOne, convention)));
        // Window depth is identical to the minus-one-to-one reversed encoding: 1 - standard.
        const standardWindow = encodeViewDepth(distance, standard, negotiateDepthConvention({}, { clipRange: "minus-one-to-one", reversed: true, logarithmic: true }));
        expect(stored).toBeCloseTo(1 - standardWindow, 6);
        expect(toStandardWindowDepth(stored, convention, { kind, near, far })).toBeCloseTo(standardWindow, 6);
        expect(linearizeDepth(stored, inverse, convention) / distance).toBeCloseTo(1, 2);
        expect(-reconstructViewPosition(stored, 0.2, -0.3, inverse, convention)[2] / distance).toBeCloseTo(1, 2);
      }
      // CPU readback standardization is clip-range independent for reversed depth.
      const values = new Float32Array([1, 0.25, 0]);
      expect(Array.from(standardizeDepthReadback(values, convention))).toEqual([0, 0.75, 1]);
    }
  });

  it("falls back to (row2 + row3) / 2 for custom or mismatched projections", () => {
    const { projectionCamera, projectionMetadata } = production("reversed");
    const reversed = createRootCameraProjection(projectionCamera, 1);
    const custom = zeroToOneReversedProjection(reversed, { ...projectionMetadata, near: 1, far: 50 });
    expect(custom[10]).toBe(Math.fround((reversed[10]! + reversed[11]!) / 2));
    expect(custom[14]).toBe(Math.fround((reversed[14]! + reversed[15]!) / 2));
    expect(() => zeroToOneReversedProjection([1, 2, 3])).toThrow(/4x4/);
  });

  it("delivers float precision only with a zero-to-one projection into float depth", () => {
    const { projectionCamera, projectionMetadata } = production("reversed");
    const reversed = createRootCameraProjection(projectionCamera, 1);
    const zeroToOne = zeroToOneReversedProjection(reversed, projectionMetadata);
    // Stored-depth error against the exact reversed window depth n(f - d) / ((f - n)d)
    // for surfaces 1-9 km away (stored values ~1e-5).
    const surfaces = Array.from({ length: 40 }, (_, index) => 1_000 + index * 200.37);
    const exact = (d: number) => near * (far - d) / ((far - near) * d);
    const maxError = (encode: (distance: number) => number) => Math.max(...surfaces.map((d) => Math.abs(encode(d) - exact(d))));
    const full = maxError((d) => float32(f32WindowDepth(zeroToOne, d, "zero-to-one", false)));
    expect(full).toBeLessThan(1e-10);
    // Fixed point quantizes to ~6e-8; a minus-one-to-one projection (native or
    // remapped in-shader) loses it to f32 rounding or cancellation near 1 / at w.
    expect(maxError((d) => fixed24(f32WindowDepth(zeroToOne, d, "zero-to-one", false)))).toBeGreaterThan(100 * full);
    expect(maxError((d) => float32(f32WindowDepth(reversed, d, "minus-one-to-one", false)))).toBeGreaterThan(100 * full);
    expect(maxError((d) => float32(f32WindowDepth(reversed, d, "zero-to-one", true)))).toBeGreaterThan(100 * full);
  });

  it("classifies precision honestly", () => {
    expect(classifyDepthPrecision("standard", { zeroToOneProjection: false, depthStorage: "fixed" })).toEqual({ precision: "standard" });
    expect(classifyDepthPrecision("logarithmic", { zeroToOneProjection: false, depthStorage: "fixed" }).precision).toBe("extended");
    expect(classifyDepthPrecision("reversed", { zeroToOneProjection: true, depthStorage: "float" }).precision).toBe("full");
    const fixed = classifyDepthPrecision("reversed", { zeroToOneProjection: true, depthStorage: "fixed" });
    expect(fixed).toMatchObject({ precision: "reduced" });
    expect(fixed.precisionReason).toMatch(/fixed point/);
    const clip = classifyDepthPrecision("reversed", { zeroToOneProjection: false, depthStorage: "float", reason: "EXT_clip_control is unavailable" });
    expect(clip.precision).toBe("reduced");
    expect(clip.precisionReason).toMatch(/minus-one-to-one.*EXT_clip_control/);
  });
});

function precisionMock(zeroToOneReversed = true): MockRenderDevice {
  const device = new MockRenderDevice();
  device.depthPrecisionSupport = { standardClipRange: "minus-one-to-one", zeroToOneReversed, floatDepth: true, floatDepthStencil: true };
  return device;
}

describe("frame convention negotiation and scoped resets", () => {
  it("selects zero-to-one reversed depth, refines precision by attachment and resets for standard passes", () => {
    const device = precisionMock();
    const full = applyFrameDepthConvention(device, "reversed")!;
    expect(full).toMatchObject({ mode: "reversed", clipRange: "zero-to-one", clearValue: 0, precision: "full", depthStorage: "float" });
    expect(recordFrameDepthStorage(device, "fixed")).toMatchObject({ clipRange: "zero-to-one", precision: "reduced", depthStorage: "fixed" });
    expect(recordFrameDepthStorage(device, "float")?.precision).toBe("full");
    // Shadow, probe and mirror passes use the standard minus-one-to-one range.
    expect(withStandardDeviceDepth(device, () => device.getDepthConvention())).toMatchObject({ mode: "standard", clipRange: "minus-one-to-one" });
    expect(device.getDepthConvention()).toMatchObject({ mode: "reversed", clipRange: "zero-to-one" });
    expect(applyFrameDepthConvention(device, "standard")).toMatchObject({ mode: "standard", clipRange: "minus-one-to-one", precision: "standard" });
    // Without zero-to-one rasterization, reversed stays minus-one-to-one and reduced.
    const portable = precisionMock(false);
    expect(applyFrameDepthConvention(portable, "reversed")).toMatchObject({ clipRange: "minus-one-to-one", precision: "reduced", depthStorage: "fixed" });
    expect(() => portable.setDepthConvention(full)).toThrow(/invalid/);
  });

  it("rebuilds the frame camera coherently for zero-to-one raster clip control", () => {
    const { projectionCamera, projectionMetadata, depthConvention } = production("reversed");
    const projection = createRootCameraProjection(projectionCamera, 1) as unknown as Mat4;
    const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.5, -1, -20, 1] as Mat4;
    const camera = { viewProjectionMatrix: multiplyMat4(projection, view), shaderViewMatrix: view, shaderProjectionMatrix: projection, projectionMetadata, depthConvention };
    const raster = zeroToOneReversedRasterCamera(camera);
    expect(raster.projectionMetadata).toMatchObject({ mode: "reversed", clipRange: "zero-to-one" });
    expect(raster.depthConvention).toMatchObject({ mode: "reversed", clipRange: "zero-to-one" });
    expect(Array.from(raster.shaderProjectionMatrix!)).toEqual(Array.from(zeroToOneReversedProjection(projection, projectionMetadata)));
    const expected = multiplyMat4(raster.shaderProjectionMatrix!, view);
    expect(Array.from(raster.viewProjectionMatrix)).toEqual(Array.from(expected));
    const inverse = (raster as { readonly projectionMatrixInverse?: Mat4 }).projectionMatrixInverse!;
    const product = multiplyMat4(inverse, raster.shaderProjectionMatrix!);
    product.forEach((value, index) => expect(value).toBeCloseTo(identityMat4()[index]!, 5));
    // Idempotent for an already zero-to-one camera and a no-op for other modes.
    expect(zeroToOneReversedRasterCamera(raster)).toBe(raster);
    const standard = { ...camera, projectionMetadata: production("standard").projectionMetadata, depthConvention: production("standard").depthConvention };
    expect(zeroToOneReversedRasterCamera(standard)).toBe(standard);
  });

  it("renders a reversed frame with the zero-to-one projection and reports precision per raster target", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: resolveQrFlags({ options: { A3D_QR_CORE: true } }) });
    const device = renderer.device as MockRenderDevice;
    device.depthPrecisionSupport = { standardClipRange: "minus-one-to-one", zeroToOneReversed: true, floatDepth: true, floatDepthStencil: true };
    const geometry = Geometry.triangle();
    const material = new UnlitMaterial();
    try {
      const { projectionCamera, projectionMetadata, depthConvention } = production("reversed");
      const projection = createRootCameraProjection(projectionCamera, 1) as unknown as Mat4;
      const camera = { viewProjectionMatrix: projection, viewMatrix: identityMat4(), projectionMatrix: projection, projectionMetadata, depthConvention };
      // Observe the frame camera every contributor and depth consumer receives.
      let observed: FrameContributorContext | undefined;
      const unregister = registerFrameContributor({
        id: "test.reversedZFrameCamera", owner: "prd01", flag: "A3D_QR_CORE", phases: ["after-opaque"],
        passes: (_phase, context) => { observed = context; return []; }
      });
      const float = device.createRenderTarget({ width: 8, height: 8, depth: "texture", depthPrecision: "float" });
      expect(float.depthStorage).toBe("float");
      renderer.render({ renderItems: [{ geometry, material, label: "reversed" }], renderTarget: float, cameraPolicy: "require" }, camera);
      expect(renderer.getDepthConvention()).toMatchObject({ mode: "reversed", clipRange: "zero-to-one", precision: "full", depthStorage: "float" });
      const draw = device.drawCommands.find((command) => command.label === "reversed")!;
      const zeroToOne = Array.from(zeroToOneReversedProjection(projection, projectionMetadata));
      expect(observed?.camera?.depth).toMatchObject({ mode: "reversed", clipRange: "zero-to-one" });
      Array.from(observed!.camera!.projectionMatrix).forEach((value, index) => expect(value).toBeCloseTo(zeroToOne[index]!, 6));
      Array.from(observed!.camera!.viewProjectionMatrix).forEach((value, index) => expect(value).toBeCloseTo(zeroToOne[index]!, 6));
      expect(draw.renderState).toMatchObject({ depthCompareV2: "greater-equal" });

      const fixed = device.createRenderTarget({ width: 8, height: 8, depth: "texture" });
      renderer.render({ renderItems: [{ geometry, material, label: "fixed" }], renderTarget: fixed, cameraPolicy: "require" }, camera);
      // The core output route rasterizes into the renderer-owned HDR scene
      // target (float depth) and only encodes into the fixed caller target.
      expect(renderer.getDepthConvention()).toMatchObject({ clipRange: "zero-to-one", precision: "full", depthStorage: "float" });

      renderer.render({ renderItems: [{ geometry, material, label: "standard" }], renderTarget: fixed, cameraPolicy: "identity" });
      expect(renderer.getDepthConvention()).toMatchObject({ mode: "standard", clipRange: "minus-one-to-one" });
      float.dispose(); fixed.dispose();
      unregister();
    } finally { geometry.dispose(); material.dispose(); renderer.dispose(); }
  });
});

function fakeClipControlWebGL(withExtension: boolean) {
  const fixture = fakeWebGLCanvas();
  const gl = fixture.gl as unknown as Record<string, unknown> & WebGL2RenderingContext;
  const clipCalls: [number, number][] = [];
  const storage: { readonly name: string; readonly internalFormat: number; readonly format?: number; readonly type?: number }[] = [];
  const attachments: number[] = [];
  const extension = { LOWER_LEFT_EXT: 0x8ca1, NEGATIVE_ONE_TO_ONE_EXT: 0x935e, ZERO_TO_ONE_EXT: 0x935f,
    clipControlEXT: (origin: number, depth: number) => { clipCalls.push([origin, depth]); } };
  const original = gl.getExtension.bind(gl);
  gl.getExtension = ((name: string) => name === "EXT_clip_control" ? (withExtension ? extension : null) : original(name)) as never;
  gl.texImage2D = ((_target: number, _level: number, internalFormat: number, _w: number, _h: number, _border: number, format: number, type: number) => {
    storage.push({ name: "texImage2D", internalFormat, format, type });
  }) as never;
  gl.renderbufferStorage = ((_target: number, internalFormat: number) => { storage.push({ name: "renderbufferStorage", internalFormat }); }) as never;
  gl.renderbufferStorageMultisample = ((_target: number, _samples: number, internalFormat: number) => { storage.push({ name: "renderbufferStorageMultisample", internalFormat }); }) as never;
  const framebufferTexture2D = gl.framebufferTexture2D.bind(gl);
  gl.framebufferTexture2D = ((target: number, attachment: number, textureTarget: number, texture: WebGLTexture | null, level: number) => {
    attachments.push(attachment);
    framebufferTexture2D(target, attachment, textureTarget, texture, level);
  }) as never;
  const device = WebGL2Device.create({ canvas: fixture.canvas });
  return { ...fixture, gl, device, extension, clipCalls, storage, attachments };
}

describe("WebGL2 float depth and EXT_clip_control (mock device)", () => {
  it("sets zero-to-one clip control for reversed frames and resets it for standard and scoped passes", () => {
    const f = fakeClipControlWebGL(true);
    try {
      expect(f.device.getDepthPrecisionSupport()).toEqual({ standardClipRange: "minus-one-to-one", zeroToOneReversed: true, floatDepth: true, floatDepthStencil: true });
      expect(applyFrameDepthConvention(f.device, "reversed")).toMatchObject({ clipRange: "zero-to-one", precision: "full" });
      expect(f.clipCalls.at(-1)).toEqual([f.extension.LOWER_LEFT_EXT, f.extension.ZERO_TO_ONE_EXT]);
      withStandardDeviceDepth(f.device, () => {
        expect(f.clipCalls.at(-1)).toEqual([f.extension.LOWER_LEFT_EXT, f.extension.NEGATIVE_ONE_TO_ONE_EXT]);
      });
      expect(f.clipCalls.at(-1)).toEqual([f.extension.LOWER_LEFT_EXT, f.extension.ZERO_TO_ONE_EXT]);
      const calls = f.clipCalls.length;
      applyFrameDepthConvention(f.device, "reversed");
      expect(f.clipCalls).toHaveLength(calls);
      applyFrameDepthConvention(f.device, "logarithmic", { near, far, kind: "perspective" });
      expect(f.device.getDepthConvention()).toMatchObject({ mode: "logarithmic", clipRange: "minus-one-to-one" });
      expect(f.clipCalls.at(-1)).toEqual([f.extension.LOWER_LEFT_EXT, f.extension.NEGATIVE_ONE_TO_ONE_EXT]);
      applyFrameDepthConvention(f.device, "reversed");
      applyFrameDepthConvention(f.device, "standard");
      expect(f.clipCalls.at(-1)).toEqual([f.extension.LOWER_LEFT_EXT, f.extension.NEGATIVE_ONE_TO_ONE_EXT]);
    } finally { f.device.dispose(); }
  });

  it("keeps the minus-one-to-one path and reports reduced precision without EXT_clip_control", () => {
    const f = fakeClipControlWebGL(false);
    try {
      expect(f.device.getDepthPrecisionSupport().zeroToOneReversed).toBe(false);
      expect(applyFrameDepthConvention(f.device, "reversed")).toMatchObject({ clipRange: "minus-one-to-one", precision: "reduced" });
      expect(f.device.getDepthConvention().precisionReason).toMatch(/EXT_clip_control is unavailable/);
      const zeroToOne = negotiateDepthConvention({ mode: "reversed" }, { clipRange: "zero-to-one", reversed: true, logarithmic: true });
      expect(() => f.device.setDepthConvention(zeroToOne)).toThrow(/clip range/);
      expect(f.clipCalls).toHaveLength(0);
    } finally { f.device.dispose(); }
  });

  it("allocates DEPTH32F_STENCIL8 or DEPTH_COMPONENT32F for float targets and keeps DEPTH24_STENCIL8 otherwise", () => {
    const f = fakeClipControlWebGL(true);
    const gl = f.gl;
    try {
      const fixed = f.device.createRenderTarget({ width: 4, height: 4, depth: "texture" });
      expect(f.storage.at(-1)).toEqual({ name: "texImage2D", internalFormat: gl.DEPTH24_STENCIL8, format: gl.DEPTH_STENCIL, type: gl.UNSIGNED_INT_24_8 });
      expect(fixed.depthStorage).toBeUndefined();
      const float = f.device.createRenderTarget({ width: 4, height: 4, depth: "texture", depthPrecision: "float" });
      expect(f.storage.at(-1)).toEqual({ name: "texImage2D", internalFormat: gl.DEPTH32F_STENCIL8, format: gl.DEPTH_STENCIL, type: gl.FLOAT_32_UNSIGNED_INT_24_8_REV });
      expect(f.attachments.at(-1)).toBe(gl.DEPTH_STENCIL_ATTACHMENT);
      expect(float.depthStorage).toBe("float");
      const depthOnly = f.device.createRenderTarget({ width: 4, height: 4, depth: "texture", depthPrecision: "float", stencil: false });
      expect(f.storage.at(-1)).toEqual({ name: "texImage2D", internalFormat: gl.DEPTH_COMPONENT32F, format: gl.DEPTH_COMPONENT, type: gl.FLOAT });
      expect(f.attachments.at(-1)).toBe(gl.DEPTH_ATTACHMENT);
      f.device.createRenderTarget({ width: 4, height: 4, depth: true, depthPrecision: "float" });
      expect(f.storage.at(-1)).toEqual({ name: "renderbufferStorage", internalFormat: gl.DEPTH32F_STENCIL8 });
      f.device.createRenderTarget({ width: 4, height: 4, depth: true, sampleCount: 1, depthPrecision: "float", colorAttachments: [{ format: "rgba8" }, { format: "rgba8" }] });
      expect(f.storage.filter((entry) => entry.name !== "texImage2D" || entry.internalFormat !== gl.RGBA8).at(-1)?.internalFormat).toBe(gl.DEPTH32F_STENCIL8);
      expect(() => f.device.createRenderTarget({ width: 4, height: 4, depthPrecision: "double" as never })).toThrow(/depthPrecision/);
      for (const target of [fixed, float, depthOnly]) target.dispose();
    } finally { f.device.dispose(); }
  });
});

describe("WebGPU float depth formats (mock device)", () => {
  it("selects depth32float, depth32float-stencil8 with the feature, else depth24plus-stencil8", async () => {
    const mock = createProofWebGPU();
    const device = await createRenderDevice({ backend: "webgpu", webgpu: mock.webgpu });
    const features = new Set<string>();
    Object.defineProperty(mock.native, "features", { configurable: true, value: features });
    try {
      const depthFormat = () => mock.textures.at(-1)!.format;
      expect(device.getDepthPrecisionSupport?.()).toEqual({ standardClipRange: "zero-to-one", zeroToOneReversed: true, floatDepth: true, floatDepthStencil: false });
      const fixed = device.createRenderTarget({ width: 4, height: 4, depth: "texture" });
      expect(depthFormat()).toBe("depth24plus-stencil8");
      expect(fixed.depthStorage).toBeUndefined();
      const fallback = device.createRenderTarget({ width: 4, height: 4, depth: "texture", depthPrecision: "float" });
      expect(depthFormat()).toBe("depth24plus-stencil8");
      expect(fallback.depthStorage).toBeUndefined();
      const depthOnly = device.createRenderTarget({ width: 4, height: 4, depth: "texture", depthPrecision: "float", stencil: false });
      expect(depthFormat()).toBe("depth32float");
      expect(depthOnly.depthStorage).toBe("float");
      features.add("depth32float-stencil8");
      expect(device.getDepthPrecisionSupport?.().floatDepthStencil).toBe(true);
      const stencil = device.createRenderTarget({ width: 4, height: 4, depth: "texture", depthPrecision: "float" });
      expect(depthFormat()).toBe("depth32float-stencil8");
      expect(stencil.depthStorage).toBe("float");
      // Reversed frames hand WGSL programs a native zero-to-one projection
      // (no in-shader remap) and float depth with a stencil aspect is available.
      expect(applyFrameDepthConvention(device, "reversed")).toMatchObject({ clipRange: "zero-to-one", projectionClipRange: "zero-to-one", precision: "full", depthStorage: "float" });
      expect(recordFrameDepthStorage(device, "fixed")).toMatchObject({ projectionClipRange: "zero-to-one", precision: "reduced" });
      expect(device.getDepthConvention?.()?.precisionReason).toMatch(/fixed point/);
      // Standard passes inside the frame return to minus-one-to-one projections.
      expect(withStandardDeviceDepth(device, () => device.getDepthConvention?.())?.projectionClipRange).toBeUndefined();
      expect(() => device.setDepthConvention?.({ ...negotiateDepthConvention({}, { clipRange: "zero-to-one", reversed: false, logarithmic: false }), projectionClipRange: "zero-to-one" })).toThrow(/unsupported/);
      // Logarithmic frames are accepted now that generated WGSL writes frag_depth.
      expect(applyFrameDepthConvention(device, "logarithmic", { near, far, kind: "perspective" })).toMatchObject({ mode: "logarithmic", clipRange: "zero-to-one" });
      for (const target of [fixed, fallback, depthOnly, stencil]) target.dispose();
    } finally { device.dispose(); }
  });
});

const wgslFlags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true, A3D_PARITY_LINES: true });
const lights = { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } as const;
function wgslProgram(lighting: "lit" | "unlit", logDepth: boolean, extra: Record<string, unknown> = {}) {
  return generateProgramImpl(normalizeProgramFeatures({
    target: "wgsl", lighting, alphaMode: "opaque", ...(lighting === "lit" ? { lights } : {}),
    features: { ...(logDepth ? { [PROGRAM_LOG_DEPTH_FEATURE]: true } : {}), ...(lighting === "unlit" ? { "a3d.nativePrimitive": "triangles" } : {}), ...extra }
  }), { flags: wgslFlags });
}

describe("WebGPU logarithmic depth WGSL", () => {
  it("writes @builtin(frag_depth) with the WebGL2 ln(d / near) / ln(far / near) encoding", () => {
    for (const lighting of ["lit", "unlit"] as const) {
      const generated = wgslProgram(lighting, true);
      expect(generated.defines.A3D_LOG_DEPTH).toBe(true);
      const program = lighting === "lit" ? createGeneratedPbrProgram(generated.descriptor!) : createGeneratedUnlitProgram(generated.descriptor!);
      expect(program.logarithmicDepth).toBe(true);
      expect(program.fragment).toContain("@builtin(frag_depth) depth: f32");
      expect(program.fragment).toMatch(/let distance = -\(material\.logDepthView \* vec4f\(world, 1\.0\)\)\.z;/);
      expect(program.fragment).toContain("clamp(log(max(distance, range.x) / range.x) / log(range.y / range.x), 0.0, 1.0)");
      expect(program.fragment).toMatch(/return GeneratedLogDepthOutput\(.*LogFragmentDepth\(input\.world/);
      const ordinary = lighting === "lit" ? createGeneratedPbrProgram(wgslProgram(lighting, false).descriptor!) : createGeneratedUnlitProgram(wgslProgram(lighting, false).descriptor!);
      expect(ordinary.logarithmicDepth).toBe(false);
      expect(ordinary.fragment).not.toContain("frag_depth");
    }
    // The WebGL2 generated program uses the same formula.
    const glsl = generateProgramImpl(normalizeProgramFeatures({ lighting: "lit", alphaMode: "opaque", lights, features: { [PROGRAM_LOG_DEPTH_FEATURE]: true } }), { flags: wgslFlags });
    expect(glsl.fragment).toContain("log(max(v_a3dLogDepth, u_a3dLogDepthRange.x) / u_a3dLogDepthRange.x)");
    expect(glsl.fragment).toContain("/ log(u_a3dLogDepthRange.y / u_a3dLogDepthRange.x)");
  });

  it("binds the same view and near/far data into the material uniforms", () => {
    const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 3, -4, 1];
    const uniforms = new Map<string, unknown>([["u_a3dLogDepthView", new Float32Array(view)], ["u_a3dLogDepthRange", [near, far]]]);
    for (const [pack, offsets] of [
      [(u: Map<string, unknown>) => packGeneratedPbrMaterialUniforms(u as never), GENERATED_PBR_MATERIAL_OFFSETS],
      [(u: Map<string, unknown>) => packGeneratedUnlitMaterialUniforms(u as never), GENERATED_UNLIT_MATERIAL_OFFSETS]
    ] as const) {
      const bytes = pack(uniforms);
      const floats = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
      expect(Array.from(floats.slice(offsets.logDepthView! / 4, offsets.logDepthView! / 4 + 16))).toEqual(view);
      expect(Array.from(floats.slice(offsets.logDepthRange! / 4, offsets.logDepthRange! / 4 + 2))).toEqual([Math.fround(near), far]);
    }
  });

  it("keeps refusing depth coverage with logarithmic depth precisely", () => {
    expect(() => wgslProgram("unlit", true, { "a3d.depthCoverage": true })).toThrow(/GENERATED_DEPTH_COVERAGE_UNSUPPORTED: logarithmic/);
  });

  const nagaAvailable = spawnSync("naga", ["--version"], { stdio: "ignore" }).status === 0;
  it.runIf(nagaAvailable)("validates the logarithmic WGSL stages offline", () => {
    const directory = mkdtempSync(join(tmpdir(), "aura-log-depth-wgsl-"));
    try {
      for (const [index, program] of [createGeneratedPbrProgram(wgslProgram("lit", true).descriptor!), createGeneratedUnlitProgram(wgslProgram("unlit", true).descriptor!)].entries()) {
        for (const stage of ["vertex", "fragment"] as const) {
          const file = join(directory, `${index}-${stage}.wgsl`);
          writeFileSync(file, program[stage]);
          expect(() => execFileSync("naga", [file], { encoding: "utf8" })).not.toThrow();
        }
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});

describe("legacy impostor fragment depth follows the frame convention", () => {
  /** CPU mirror of a3dImpostorFrameDepth. */
  const frameDepth = (mode: number, stored: number, offset: number, n = near, f = far, ortho = false): number => {
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    if (mode === 1) return clamp(1 - clamp((1 - stored) + offset));
    const standard = clamp(stored + offset);
    if (mode !== 2) return standard;
    const d = ortho ? n + standard * (f - n) : f * n / Math.max(f - standard * (f - n), 1e-30);
    return clamp(Math.log(Math.max(d, n) / n) / Math.log(f / n));
  };

  it("converts the standard-sense parallax offset into each convention", () => {
    const sources = impostorShaderSources();
    expect(sources.fragment).toContain("gl_FragDepth = a3dImpostorFrameDepth(gl_FragCoord.z, u_impostorWriteDepth > 0.5 ? -(depth - 0.5) * 0.02 : 0.0);");
    expect(sources.fragment).toContain("uniform float u_a3dDepthMode;");
    expect(impostorDepthUniforms()).toEqual(new Map<string, unknown>([["u_a3dDepthMode", 0], ["u_a3dLogDepthRange", [1, 2]], ["u_a3dLogDepthOrthographic", 0]]));
    expect(impostorDepthUniforms({ mode: "reversed", clipRange: "zero-to-one" }).get("u_a3dDepthMode")).toBe(1);
    expect(impostorDepthUniforms({ mode: "logarithmic", logRange: { near, far, kind: "perspective" } }).get("u_a3dLogDepthRange")).toEqual([near, far]);
    expect(() => impostorDepthUniforms({ mode: "logarithmic", logRange: { near, far } })).toThrow(/projection kind/);
    expect(() => impostorDepthUniforms({ mode: "standard", clipRange: "zero-to-one" })).toThrow(/zero-to-one/);
    // A nearer offset (negative standard offset) is nearer in every convention.
    const standard = 0.6, offset = -0.004;
    expect(frameDepth(0, standard, offset)).toBeCloseTo(standard + offset, 12);
    expect(frameDepth(1, 1 - standard, offset)).toBeCloseTo(1 - (standard + offset), 12);
    const { projectionCamera } = production("standard");
    const projection = createRootCameraProjection(projectionCamera, 1);
    const distance = 40;
    const window = ((projection[10]! * -distance + projection[14]!) / (projection[11]! * -distance + projection[15]!) + 1) / 2;
    expect(frameDepth(2, window, 0)).toBeCloseTo(Math.log(distance / near) / Math.log(far / near), 6);
    expect(frameDepth(2, window, offset)).toBeLessThan(frameDepth(2, window, 0));
  });
});

/** f32 evaluation of the WGSL raster depth `select(z * 0.5 + w * 0.5, z, a3dZeroToOneProjection) / w`. */
function wgslRasterDepth(projection: ArrayLike<number>, distance: number, zeroToOneOverride: boolean): number {
  const f = Math.fround;
  const z = f(-distance);
  const clipZ = f(f(f(projection[10]!) * z) + f(projection[14]!));
  const clipW = f(f(f(projection[11]!) * z) + f(projection[15]!));
  const rasterZ = zeroToOneOverride ? clipZ : f(f(clipZ * 0.5) + f(clipW * 0.5));
  return f(rasterZ / clipW);
}

describe("WebGPU reversed Z with a native zero-to-one projection", () => {
  it("specializes every generated scene program through the a3dZeroToOneProjection override", () => {
    for (const lighting of ["lit", "unlit"] as const) {
      const generated = wgslProgram(lighting, false);
      const program = lighting === "lit" ? createGeneratedPbrProgram(generated.descriptor!) : createGeneratedUnlitProgram(generated.descriptor!);
      expect(program.vertex).toContain("override a3dZeroToOneProjection: bool = false;");
      expect(program.vertex).toContain("select(clip.z * 0.5 + clip.w * 0.5, clip.z, a3dZeroToOneProjection)");
      expect(program.vertex).not.toMatch(/\(clip\.z \+ clip\.w\) \* 0\.5|vec4f\(clip\.xy, clip\.z \* 0\.5 \+ clip\.w \* 0\.5/);
    }
  });

  it("keeps the float32 reversed-Z gain only when the override passes clip z through (CPU reference)", () => {
    const { projectionCamera, projectionMetadata } = production("reversed");
    const reversed = createRootCameraProjection(projectionCamera, 1);
    const zeroToOne = zeroToOneReversedProjection(reversed, projectionMetadata);
    const surfaces = Array.from({ length: 40 }, (_, index) => 1_000 + index * 200.37);
    const exact = (d: number) => near * (far - d) / ((far - near) * d);
    const maxError = (encode: (distance: number) => number) => Math.max(...surfaces.map((d) => Math.abs(encode(d) - exact(d))));
    // Reversed frame: zero-to-one projection with the override set, into depth32float.
    const native = maxError((d) => float32(wgslRasterDepth(zeroToOne, d, true)));
    expect(native).toBeLessThan(1e-10);
    // The previous WebGPU path (minus-one-to-one projection remapped in WGSL) and
    // a fixed-point attachment both lose two or more orders of magnitude.
    expect(maxError((d) => float32(wgslRasterDepth(reversed, d, false)))).toBeGreaterThan(100 * native);
    expect(maxError((d) => fixed24(wgslRasterDepth(zeroToOne, d, true)))).toBeGreaterThan(100 * native);
    // Far surfaces 1 cm apart keep strictly decreasing reversed depth on the native path.
    const far1cm = Array.from({ length: 200 }, (_, index) => float32(wgslRasterDepth(zeroToOne, 8_000 + index * 0.01, true)));
    for (let index = 1; index < far1cm.length; index++) expect(far1cm[index]!).toBeLessThan(far1cm[index - 1]!);
    // Standard frames keep the remap: a minus-one-to-one projection still maps near -> 0, far -> 1.
    const standard = createRootCameraProjection(production("standard").projectionCamera, 1);
    expect(wgslRasterDepth(standard, near, false)).toBeCloseTo(0, 5);
    expect(wgslRasterDepth(standard, far, false)).toBeCloseTo(1, 5);
  });

  it("renders a reversed WebGPU frame with the specialized pipeline, float depth and a full precision report", async () => {
    const pipelines: Array<Record<string, any>> = [];
    const textures: Array<Record<string, unknown>> = [];
    const native = {
      features: new Set(["depth32float-stencil8"]),
      queue: { submit() {}, writeBuffer() {}, onSubmittedWorkDone: async () => {} },
      createBuffer: () => ({ destroy() {} }),
      createTexture: (descriptor: Record<string, unknown>) => { textures.push(descriptor); return { createView: () => ({}), destroy() {} }; },
      createSampler: () => ({}),
      createShaderModule: (descriptor: object) => descriptor,
      createBindGroupLayout: (descriptor: object) => descriptor,
      createPipelineLayout: (descriptor: object) => descriptor,
      createRenderPipeline: (descriptor: Record<string, any>) => { pipelines.push(descriptor); return { getBindGroupLayout: (index: number) => ({ index }) }; },
      createBindGroup: (descriptor: object) => descriptor,
      createCommandEncoder: () => ({ beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, setIndexBuffer() {},
        setViewport() {}, setScissorRect() {}, setBlendConstant() {}, setStencilReference() {}, draw() {}, drawIndexed() {}, end() {} }),
        copyTextureToTexture() {}, copyBufferToBuffer() {}, finish: () => ({}) }),
      destroy() {}
    };
    const requestDevice = vi.fn(async () => native as unknown as WebGPUDeviceLike);
    const webgpu = { requestAdapter: async () => ({ features: new Set(["depth32float-stencil8"]), requestDevice }) } as unknown as WebGPULike;
    const renderer = await Renderer.create({ backend: "webgpu", webgpu, width: 8, height: 8, qrFlags: resolveQrFlags({ options: { A3D_QR_CORE: true } }) });
    // The optional float depth-stencil feature is requested when the adapter offers it.
    expect(requestDevice).toHaveBeenCalledWith(expect.objectContaining({ requiredFeatures: ["depth32float-stencil8"] }));
    const geometry = Geometry.triangle();
    const material = new UnlitMaterial();
    const target = renderer.device.createRenderTarget({ width: 8, height: 8, format: "rgba8", depth: "texture", depthPrecision: "float" });
    try {
      expect(target.depthStorage).toBe("float");
      const { projectionCamera, projectionMetadata, depthConvention } = production("reversed");
      const projection = createRootCameraProjection(projectionCamera, 1) as unknown as Mat4;
      const camera = { viewProjectionMatrix: projection, viewMatrix: identityMat4(), projectionMatrix: projection, projectionMetadata, depthConvention };
      const source = { renderItems: [{ geometry, material, label: "reversed" }], renderTarget: target, cameraPolicy: "require" as const, frustumCulling: false, shadow: { enabled: false } };
      renderer.render(source, camera);
      expect(renderer.getDepthConvention()).toMatchObject({ mode: "reversed", clipRange: "zero-to-one", projectionClipRange: "zero-to-one", precision: "full", depthStorage: "float" });
      const reversedScene = pipelines.filter((pipeline) => pipeline.depthStencil?.depthCompare === "greater-equal");
      expect(reversedScene.length).toBeGreaterThan(0);
      for (const pipeline of reversedScene) {
        expect(pipeline.vertex.constants).toEqual({ a3dZeroToOneProjection: 1 });
        expect(pipeline.vertex.module.code).toContain("override a3dZeroToOneProjection: bool = false;");
      }
      expect(textures.some((texture) => texture.format === "depth32float-stencil8")).toBe(true);

      pipelines.length = 0;
      renderer.render({ ...source, cameraPolicy: "identity" as const });
      expect(renderer.getDepthConvention()).toMatchObject({ mode: "standard" });
      expect(renderer.getDepthConvention()?.projectionClipRange).toBeUndefined();
      const standardScene = pipelines.filter((pipeline) => pipeline.depthStencil?.depthCompare === "less-equal");
      expect(standardScene.length).toBeGreaterThan(0);
      for (const pipeline of standardScene) expect(pipeline.vertex.constants).toBeUndefined();
    } finally { target.dispose(); geometry.dispose(); material.dispose(); renderer.dispose(); }
  });
});
