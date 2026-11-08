/**
 * Reversed-depth consumers: every pass that reads or targets the camera depth buffer decodes it in the frame's
 * convention (standard stays byte-for-byte the historical path).
 *
 *  1. Contact shadows: the mask accepts reversed depth (either clip range) instead of refusing to mount.
 *  2. Sky: the far-plane triangle sits at the convention's far plane.
 *  3. Soft depth (fog apply, particles, ribbons, beams, low-res composite): `u_depthLinearize.w` flags reversed depth.
 *  4. WebGL2 post (SSAO, SSR, depth of field): depth-convention uniforms.
 *  5. Shadows: the cascade fitter re-expresses a reversed camera matrix in standard depth.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PerspectiveCamera } from "@aura3d/scene";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Texture } from "../../../packages/rendering/src/Texture";
import { negotiateDepthConvention, sceneDepthLinearizeUniform, type DepthConvention } from "../../../packages/rendering/src/DepthConvention";
import { CONTACT_MASK_SHADER_SOURCES, ContactShadowPass, contactShadowDepthMode } from "../../../packages/rendering/src/passes/ContactShadowPass";
import { SKY_STANDARD_CLIP_Z, skyClipZ, skyClipZLiteral, skyVertexSource } from "../../../packages/rendering/src/atmosphere/sky.glsl";
import { contextViewProjection } from "../../../packages/rendering/src/atmosphere/SkyBackgroundPass";
import { GRADIENT_SKY_FOG_WGSL, GRADIENT_SKY_WGSL, gradientSkyWgsl } from "../../../packages/rendering/src/atmosphere/sky.wgsl";
import { legacyPostDepthUniforms } from "../../../packages/rendering/src/webgl2/LegacyPost";
import { clipRangeFromViewProjection, fitDirectionalCascades, standardViewProjection } from "../../../packages/rendering/src/shadows/DirectionalCascadeFitter";
import { zeroToOneReversedRasterCamera } from "../../../packages/rendering/src/renderer/FrameDepthConvention";
import { volumetricApplyFragmentSource } from "../../../packages/rendering/src/atmosphere/shaders/volumetric-apply.glsl";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import { customShaderInverseViewProjection } from "../../../packages/rendering/src/ForwardPass";

const glslangAvailable = !spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).error;
const dir = mkdtempSync(join(tmpdir(), "a3d-reversed-consumers-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const convention = (mode: "standard" | "reversed", clipRange: "minus-one-to-one" | "zero-to-one"): DepthConvention =>
  negotiateDepthConvention({ mode }, { clipRange, reversed: true, logarithmic: false });

function camera(depth?: { mode: "reversed" }) {
  const cam = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 16 / 9, near: 0.5, far: 120, ...(depth ? { depth } : {}) });
  cam.transform.setPosition(2, 5, 12);
  cam.updateCameraMatrices();
  return cam;
}

describe("1. contact shadows under reversed depth", () => {
  it("maps conventions to the shader mode and refuses logarithmic depth", () => {
    expect(contactShadowDepthMode(undefined)).toEqual([0, 0]);
    expect(contactShadowDepthMode(convention("standard", "minus-one-to-one"))).toEqual([0, 0]);
    expect(contactShadowDepthMode(convention("reversed", "minus-one-to-one"))).toEqual([1, 0]);
    expect(contactShadowDepthMode(convention("reversed", "zero-to-one"))).toEqual([1, 1]);
    expect(() => contactShadowDepthMode({ mode: "logarithmic", clipRange: "minus-one-to-one" })).toThrow(/CONTACT_SHADOW|standard or reversed/);
  });

  it.each([
    ["standard", "minus-one-to-one", [0, 0]],
    ["reversed", "minus-one-to-one", [1, 0]],
    ["reversed", "zero-to-one", [1, 1]]
  ] as const)("executes with %s %s depth and binds the decode mode", (mode, clipRange, expected) => {
    const device = new MockRenderDevice();
    device.beginFrame(256, 256);
    const cam = camera();
    const depth = convention(mode, clipRange);
    const pass = new ContactShadowPass({
      sunDirection: [0.3, 0.8, 0.5],
      camera: { viewMatrix: cam.viewMatrix as unknown as Float32Array, projectionMatrix: cam.projectionMatrix as unknown as Float32Array, near: 0.5, far: 120, depth },
      sceneDepth: { texture: new Texture({ width: 128, height: 128, format: "rgba8", label: "sceneDepth" }), available: true, linearize: { near: 0.5, far: 120, orthographic: false, depth } }
    });
    pass.execute({ device, width: 256, height: 256 });
    expect(pass.passExecuted()).toBe(true);
    const draw = device.drawCommands.find((command) => command.label === "prd02-contact-shadow-mask");
    expect(draw?.uniforms?.get("u_prd02ContactDepthMode")).toEqual(expected);
    device.endFrame();
  });

  it("standard sky tests are unchanged and reversed sky tests use the 0 far plane", () => {
    expect(CONTACT_MASK_SHADER_SOURCES.fragment).toContain("u_prd02ContactDepthMode.x > 0.5 ? z <= 0.000001 : z >= 0.999999");
    expect(CONTACT_MASK_SHADER_SOURCES.webgpu?.fragment).toContain("return z >= 0.999999;");
    expect(CONTACT_MASK_SHADER_SOURCES.portableBindings?.some((binding) => binding.name === "u_prd02ContactDepthMode")).toBe(true);
  });

  it.runIf(glslangAvailable)("mask fragment compiles with glslangValidator", () => {
    const file = join(dir, "contact-mask.frag");
    writeFileSync(file, CONTACT_MASK_SHADER_SOURCES.fragment);
    const run = spawnSync("glslangValidator", ["-S", "frag", file], { encoding: "utf8" });
    expect(run.status === 0 ? "" : `${run.stdout}${run.stderr}`).toBe("");
  });
});

describe("2. sky far plane follows the depth convention", () => {
  it("derives the clip z from the convention", () => {
    expect(skyClipZ(undefined)).toBe(SKY_STANDARD_CLIP_Z);
    expect(skyClipZ(convention("standard", "minus-one-to-one"))).toBe(0.999999);
    expect(skyClipZ(convention("reversed", "zero-to-one"))).toBe(1e-6);
    expect(skyClipZ(convention("reversed", "minus-one-to-one"))).toBe(-0.999999);
    expect(skyClipZLiteral(1e-6)).toBe("0.000001");
  });

  it("keeps the standard sources identical and bakes the reversed far plane", () => {
    expect(skyVertexSource()).toContain("gl_Position = vec4(a_pos, 0.999999, 1.0);");
    expect(skyVertexSource(1e-6)).toContain("gl_Position = vec4(a_pos, 0.000001, 1.0);");
    expect(skyVertexSource(-0.999999)).toContain("gl_Position = vec4(a_pos, -0.999999, 1.0);");
    expect(gradientSkyWgsl(false, "0.999999")).toBe(GRADIENT_SKY_WGSL);
    expect(gradientSkyWgsl(true, "0.999999")).toBe(GRADIENT_SKY_FOG_WGSL);
    expect(gradientSkyWgsl(false, "0.000001").vertex).toContain("vec4<f32>(position, 0.000001, 1.0)");
  });
});

describe("2b. sky view direction under a reversed camera", () => {
  it("hands the sky a standard-depth view-projection (clip z = 1 is the far plane again)", () => {
    const standard = camera();
    const reversed = camera({ mode: "reversed" });
    const ctx = (cam: ReturnType<typeof camera>, depth?: DepthConvention) => ({ camera: { viewProjectionMatrix: cam.viewProjectionMatrix, ...(depth ? { depth } : {}) } }) as never;
    const vp = standard.viewProjectionMatrix as unknown as Float32Array;
    expect(contextViewProjection(ctx(standard, convention("standard", "minus-one-to-one")))).toBe(vp);
    const actual = contextViewProjection(ctx(reversed, convention("reversed", "minus-one-to-one")));
    for (let i = 0; i < 16; i++) expect(actual[i]!).toBeCloseTo(vp[i]!, 4);
  });
});

describe("3. soft-depth linearization", () => {
  it("flags reversed depth in u_depthLinearize.w and leaves standard at 0", () => {
    expect(sceneDepthLinearizeUniform({ near: 0.1, far: 100, orthographic: false })).toEqual([0.1, 100, 0, 0]);
    expect(sceneDepthLinearizeUniform({ near: 0.1, far: 100, orthographic: true, depth: convention("standard", "minus-one-to-one") })).toEqual([0.1, 100, 1, 0]);
    expect(sceneDepthLinearizeUniform({ near: 0.1, far: 100, orthographic: false, depth: convention("reversed", "zero-to-one") })).toEqual([0.1, 100, 0, 1]);
  });

  it("the fog apply shader flips reversed samples back to standard window depth", () => {
    expect(volumetricApplyFragmentSource()).toContain("if (u_depthLinearize.w > 0.5) depth = 1.0 - depth;");
  });
});

describe("4. WebGL2 depth-reading post kernels", () => {
  it("binds the convention as uniforms (standard 0/0)", () => {
    expect(legacyPostDepthUniforms(undefined)).toEqual({ reversed: 0, zeroToOne: 0 });
    expect(legacyPostDepthUniforms(convention("standard", "minus-one-to-one"))).toEqual({ reversed: 0, zeroToOne: 0 });
    expect(legacyPostDepthUniforms(convention("reversed", "minus-one-to-one"))).toEqual({ reversed: 1, zeroToOne: 0 });
    expect(legacyPostDepthUniforms(convention("reversed", "zero-to-one"))).toEqual({ reversed: 1, zeroToOne: 1 });
  });
});

describe("5. shadow cascade fit under a reversed camera", () => {
  const close = (a: ArrayLike<number>, b: ArrayLike<number>, tolerance: number) => {
    for (let i = 0; i < a.length; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThanOrEqual(tolerance * Math.max(1, Math.abs(b[i]!)));
  };
  const caster = {
    geometry: { bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] } },
    modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0.5, 2, 1]),
    label: "caster"
  } as unknown as RenderItem;

  it("standardizes reversed matrices in both clip ranges and leaves standard ones untouched", () => {
    const standard = camera();
    const reversed = camera({ mode: "reversed" });
    const raster = zeroToOneReversedRasterCamera({
      viewProjectionMatrix: reversed.viewProjectionMatrix, viewMatrix: reversed.viewMatrix, projectionMatrix: reversed.projectionMatrix,
      projectionMetadata: reversed.projectionMetadata as never
    });
    expect(standardViewProjection(standard.viewProjectionMatrix, standard.projectionMetadata)).toBe(standard.viewProjectionMatrix);
    close(standardViewProjection(reversed.viewProjectionMatrix, reversed.projectionMetadata), standard.viewProjectionMatrix, 1e-5);
    close(standardViewProjection(raster.viewProjectionMatrix, { mode: "reversed", clipRange: "zero-to-one" }), standard.viewProjectionMatrix, 1e-4);
    const eye = [2, 5, 12] as const;
    const range = clipRangeFromViewProjection(reversed.viewProjectionMatrix, eye, reversed.projectionMetadata);
    expect(range?.near).toBeCloseTo(0.5, 3);
    expect(range?.far).toBeCloseTo(120, 0);
  });

  it.each([false, true])("fits the same cascades for a reversed camera as for the standard one (legacy fit %s)", (legacy) => {
    const standard = camera();
    const reversed = camera({ mode: "reversed" });
    const raster = zeroToOneReversedRasterCamera({
      viewProjectionMatrix: reversed.viewProjectionMatrix, viewMatrix: reversed.viewMatrix, projectionMatrix: reversed.projectionMatrix,
      projectionMetadata: reversed.projectionMetadata as never
    });
    const fit = (cam: { viewProjectionMatrix: ArrayLike<number> & Iterable<number>; depth?: { mode: string; clipRange: string } }) => fitDirectionalCascades({
      camera: { viewProjectionMatrix: Array.from(cam.viewProjectionMatrix), near: 0.5, far: 120, ...(cam.depth ? { depth: cam.depth } : {}) },
      lightDirection: [-0.3, -1, -0.2], casters: [caster], mapSize: 1024, cascadeCount: 2, maxDistance: 60, legacy
    });
    const expected = fit({ viewProjectionMatrix: standard.viewProjectionMatrix });
    for (const actual of [
      fit({ viewProjectionMatrix: reversed.viewProjectionMatrix, depth: { mode: "reversed", clipRange: "minus-one-to-one" } }),
      fit({ viewProjectionMatrix: raster.viewProjectionMatrix, depth: { mode: "reversed", clipRange: "zero-to-one" } })
    ]) {
      expect(actual).toHaveLength(expected.length);
      actual.forEach((cascade, index) => {
        expect(cascade.radius).toBeCloseTo(expected[index]!.radius, 2);
        close(cascade.center, expected[index]!.center, 1e-2);
      });
    }
  });
});

describe("6. material.custom a3dFragWorldPosition under reversed depth", () => {
  // The chunk decodes vec4(ndc, gl_FragCoord.z * 2 - 1, 1) through u_a3dInverseViewProjection.
  const decode = (inverse: ArrayLike<number>, ndc: readonly [number, number], fragZ: number) => {
    const v = [ndc[0], ndc[1], fragZ * 2 - 1, 1];
    const o = [0, 1, 2, 3].map((r) => v.reduce((sum, value, c) => sum + inverse[c * 4 + r]! * value, 0));
    return [o[0]! / o[3]!, o[1]! / o[3]!, o[2]! / o[3]!];
  };
  const project = (vp: ArrayLike<number>, p: readonly number[]) =>
    [0, 1, 2, 3].map((r) => vp[r]! * p[0]! + vp[4 + r]! * p[1]! + vp[8 + r]! * p[2]! + vp[12 + r]!);
  const world = [1, 0.5, -3] as const;

  it("standard and reversed minus-one-to-one keep inverse(P * V); reversed zero-to-one decodes clip z / w as window depth", () => {
    const standard = camera();
    const options = { cameraViewMatrix: standard.viewMatrix, auraFrameCamera: { projectionMatrix: standard.projectionMatrix } } as never;
    expect(Array.from(customShaderInverseViewProjection(options, { mode: "standard", clipRange: "minus-one-to-one" }))).toEqual(Array.from(customShaderInverseViewProjection(options)));
    const reversed = camera({ mode: "reversed" });
    const raster = zeroToOneReversedRasterCamera({
      viewProjectionMatrix: reversed.viewProjectionMatrix, viewMatrix: reversed.viewMatrix, projectionMatrix: reversed.projectionMatrix,
      projectionMetadata: reversed.projectionMetadata as never
    });
    for (const [vp, view, projection, depth, window] of [
      [reversed.viewProjectionMatrix, reversed.viewMatrix, reversed.projectionMatrix, { mode: "reversed", clipRange: "minus-one-to-one" }, (c: number[]) => (c[2]! / c[3]! + 1) / 2],
      [raster.viewProjectionMatrix, raster.viewMatrix!, raster.projectionMatrix!, { mode: "reversed", clipRange: "zero-to-one" }, (c: number[]) => c[2]! / c[3]!]
    ] as const) {
      const clip = project(vp, world);
      const inverse = customShaderInverseViewProjection({ cameraViewMatrix: view, auraFrameCamera: { projectionMatrix: projection } } as never, depth);
      const decoded = decode(inverse, [clip[0]! / clip[3]!, clip[1]! / clip[3]!], window(clip));
      decoded.forEach((value, i) => expect(value).toBeCloseTo(world[i]!, 2));
    }
  });
});
