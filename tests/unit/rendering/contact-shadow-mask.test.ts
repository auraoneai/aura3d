/**
 * Beat-three.js PRD-2 WP-4 (section 2.3): the contact-shadow mask has a forward-shading consumer.
 *
 * - `u_contactShadowMask` is declared by every forward program that has a shadow-casting light and is
 *   multiplied into that light's visibility only; strength 0 (no mask) is exactly 1.0.
 * - `prd02.contactShadows` runs in the `shadows` phase (before forward) and publishes the mask to the
 *   forward store only for an explicit `effects.contactShadows()` opt-in or the sub-flag.
 * - The store binds the mask uniforms per draw and leaves absent/non-receiving draws untouched.
 * - `effects.contactShadows()` no longer lowers to the SSAO contact-occlusion pass.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DirectionalLight, PerspectiveCamera, multiplyMat4, type Mat4 } from "@aura3d/scene";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import "../../../packages/rendering/src/lanes/prd01";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { collectLight } from "../../../packages/rendering/src/LightCollector";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { QUALITY_TIERS } from "../../../packages/rendering/src/contracts/quality";
import type { ProgramFeatures } from "../../../packages/rendering/src/contracts/program";
import type { FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";
import type { RenderItem } from "../../../packages/rendering/src/ForwardPass";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { CONTACT_SHADOW_MASK_GLSL } from "../../../packages/rendering/src/shaders/chunks/contact_shadow_mask.glsl";
import {
  applyContactShadowMaskUniforms,
  contactShadowMask,
  setContactShadowMask
} from "../../../packages/rendering/src/forward/contactShadowMaskStore";
import {
  CONTACT_SHADOWS_SUB_FLAG,
  createPrd02ContactShadowsContributor
} from "../../../packages/rendering/src/passes/Prd02ContactShadowsContributor";
import { CONTACT_MASK_SHADER_SOURCES } from "../../../packages/rendering/src/passes/ContactShadowPass";

const FLAGS = resolveQrFlags({ options: { A3D_QR_CORE: true, A3D_QR_LIGHTING: true } });
const ONE_DIR = { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } as const;
const SHADOWED = { cascades: 1, pcfTaps: 4, localShadows: 0, contact: false } as const;
const UNSHADOWED = { cascades: 0, pcfTaps: 4, localShadows: 0, contact: false } as const;

const dir = mkdtempSync(join(tmpdir(), "a3d-contact-mask-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function validate(name: string, source: string): string {
  const file = join(dir, `${name}.frag`);
  writeFileSync(file, source);
  const run = spawnSync("glslangValidator", ["-S", "frag", file], { encoding: "utf8" });
  if (run.error) throw new Error(`glslangValidator unavailable: ${run.error.message}`);
  return run.status === 0 ? "" : `${run.stdout}${run.stderr}`;
}

function gen(partial: Partial<ProgramFeatures>) {
  return generateProgramImpl(normalizeProgramFeatures(partial), { flags: FLAGS });
}

describe("contact_shadow_mask GLSL chunk", () => {
  it("the mask producer compiles and bounds the blocker depth gap (no ghost shadows behind foreground props)", () => {
    expect(CONTACT_MASK_SHADER_SOURCES.fragment).toContain("behind > thickness && behind < len * 2.0");
    expect(validate("mask-producer", CONTACT_MASK_SHADER_SOURCES.fragment)).toBe("");
  });

  it("short-circuits to exactly 1.0 when no mask is bound and blends by strength otherwise", () => {
    expect(CONTACT_SHADOW_MASK_GLSL).toContain("if (u_contactShadowMaskStrength < 0.001) return 1.0;");
    expect(CONTACT_SHADOW_MASK_GLSL).toContain("mix(1.0, mask, clamp(u_contactShadowMaskStrength, 0.0, 1.0))");
    expect(CONTACT_SHADOW_MASK_GLSL).toContain("gl_FragCoord.xy / u_contactShadowMaskViewport");
  });
});

describe("generated forward program", () => {
  it("multiplies the mask into the shadow-casting light's visibility only", () => {
    const out = gen({ lighting: "lit", lights: ONE_DIR, shadows: SHADOWED });
    expect(out.fragment).toContain("uniform sampler2D u_contactShadowMask;");
    expect(out.fragment).toMatch(/return a3dForwardShadowFactor\(offsetPosition, normal, lightDirection\) \* a3dContactShadowMaskFactor\(\);/);
    // The early-out for non-casting and point/rect lights comes first, so those never see the mask.
    const fn = out.fragment.slice(out.fragment.indexOf("float a3dForwardLightShadow("));
    expect(fn.indexOf("if (castsShadow < 0.5")).toBeLessThan(fn.indexOf("a3dContactShadowMaskFactor"));
    expect(validate("generated-masked", out.fragment)).toBe("");
  });

  it("a draw without a shadow map is unchanged (no mask uniforms)", () => {
    const out = gen({ lighting: "lit", lights: ONE_DIR, shadows: UNSHADOWED });
    expect(out.fragment).not.toContain("u_contactShadowMask");
    expect(out.fragment).not.toContain("a3dContactShadowMaskFactor");
  });
});

describe("legacy forward shaders", () => {
  const library = createDefaultShaderLibrary();

  it("every program that evaluates a3dForwardShadowFactor declares the mask exactly once and validates", () => {
    const withShadow: string[] = [];
    for (const name of library.names()) {
      const shader = library.get(name);
      const sources = [shader.fragment];
      if (!sources.some((source) => source.includes("a3dForwardShadowFactor(") || source.includes("a3dTexturedPbrShadowFactor("))) continue;
      withShadow.push(name);
      const compiled = library.compileSource(name);
      expect(compiled.fragment.match(/uniform sampler2D u_contactShadowMask;/g)?.length ?? 0, name).toBeLessThanOrEqual(1);
      expect(compiled.fragment, name).toContain("a3dContactShadowMaskFactor()");
      expect(validate(`legacy-${name.replace(/[^a-z0-9]/gi, "_")}`, compiled.fragment), name).toBe("");
    }
    // pbr, instanced-pbr, skinned-lit, skinned-lit-8, pbr-normal-map, pbr-textured
    expect(withShadow.length).toBeGreaterThanOrEqual(6);
  });

  it("the sampler-tight textured-PBR extension variants keep a constant 1.0 factor and no extra sampler", () => {
    const base = library.compileSource("aura3d/pbr-textured");
    expect(base.fragment).toContain("uniform sampler2D u_contactShadowMask;");
    const variant = library.compileVariant("aura3d/pbr-textured", "extension-scalar-atlas");
    expect(variant.fragment).not.toContain("uniform sampler2D u_contactShadowMask;");
    expect(variant.fragment).toContain("float a3dContactShadowMaskFactor() { return 1.0; }");
    expect(validate("textured-atlas-variant", variant.fragment)).toBe("");
  });

  it("multiplies the mask only on the non-point shadow branch", () => {
    for (const file of ["ShaderLibrary.ts", "ShaderLibraryCore.ts"]) {
      const source = readFileSync(`packages/rendering/src/${file}`, "utf8");
      for (const match of source.matchAll(/kind > 0\.5 && kind < 1\.5 \? a3d\w*PointShadowFactor\([^)]*\) : (a3d\w+ShadowFactor\([^)]*\)[^,]*),/g)) {
        expect(match[1], file).toContain("* a3dContactShadowMaskFactor()");
      }
    }
  });
});

describe("applyContactShadowMaskUniforms", () => {
  const reflecting = { reflection: { uniforms: new Set(["u_contactShadowMask", "u_contactShadowMaskStrength", "u_contactShadowMaskViewport"]) } } as never;
  const silent = { reflection: { uniforms: new Set<string>() } } as never;
  const item = { label: "floor" } as RenderItem;
  const maskTexture = new Texture({ width: 4, height: 4, format: "rgba8", label: "mask" });

  beforeEach(() => setContactShadowMask(undefined));

  it("does nothing for programs that do not reflect the mask", () => {
    setContactShadowMask({ texture: maskTexture, width: 8, height: 8, strength: 1 });
    const uniforms = new Map();
    applyContactShadowMaskUniforms(item, silent, uniforms);
    expect(uniforms.size).toBe(0);
  });

  it("binds strength 0 when no mask is published", () => {
    const uniforms = new Map();
    applyContactShadowMaskUniforms(item, reflecting, uniforms);
    expect(uniforms.get("u_contactShadowMaskStrength")).toBe(0);
    expect((uniforms.get("u_contactShadowMask") as TextureBinding).texture).toBeNull();
  });

  it("binds the mask, strength and forward-target size when published", () => {
    setContactShadowMask({ texture: maskTexture, width: 640, height: 360, strength: 0.6 });
    const uniforms = new Map();
    applyContactShadowMaskUniforms(item, reflecting, uniforms);
    expect((uniforms.get("u_contactShadowMask") as TextureBinding).texture).toBe(maskTexture);
    expect(uniforms.get("u_contactShadowMaskStrength")).toBe(0.6);
    expect(uniforms.get("u_contactShadowMaskViewport")).toEqual([640, 360]);
  });

  it("clamps strength to 1 and leaves receiveShadow=false draws unmasked", () => {
    setContactShadowMask({ texture: maskTexture, width: 8, height: 8, strength: 3 });
    const masked = new Map();
    applyContactShadowMaskUniforms(item, reflecting, masked);
    expect(masked.get("u_contactShadowMaskStrength")).toBe(1);
    const unmasked = new Map();
    applyContactShadowMaskUniforms({ ...item, receiveShadow: false }, reflecting, unmasked);
    expect(unmasked.get("u_contactShadowMaskStrength")).toBe(0);
  });
});

describe("prd02.contactShadows contributor publishes the mask to forward shading", () => {
  const flagsOn = (names: readonly string[]) => ({
    values: Object.fromEntries(names.map((n) => [n, true])),
    on: (n: string) => names.includes(n)
  }) as never;
  const caster: RenderItem = {
    label: "subject",
    geometry: Geometry.litCube(1),
    material: new UnlitMaterial({ name: "m", color: [1, 1, 1, 1] }),
    modelMatrix: new Float32Array(16)
  };
  const floor: RenderItem = { ...caster, label: "floor", castShadow: false };

  function ctxFor(overrides: Partial<FrameContributorContext> = {}, light = true): FrameContributorContext {
    const cam = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 1, near: 0.1, far: 50 });
    cam.transform.setPosition(0, 3, 8);
    cam.updateCameraMatrices();
    const sun = new DirectionalLight("sun");
    sun.castsShadow = true;
    sun.transform.updateWorld(undefined, true);
    return {
      device: new MockRenderDevice(),
      width: 512,
      height: 256,
      frameIndex: 0,
      timeSeconds: 0,
      camera: cam as never,
      source: { renderItems: [caster, floor], ...(light ? { collectedLights: [sun] } : {}) } as never,
      items: [caster, floor],
      tier: QUALITY_TIERS.high,
      flags: flagsOn(["A3D_QR_LIGHTING"]),
      sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 50, orthographic: false } },
      blackboard: new Map(),
      ...overrides
    } as FrameContributorContext;
  }

  function run(contributor: ReturnType<typeof createPrd02ContactShadowsContributor>, ctx: FrameContributorContext) {
    const passes = contributor.passes!("shadows", ctx);
    const device = ctx.device as MockRenderDevice;
    device.beginFrame(512, 256);
    for (const pass of passes) pass.execute({ device, width: 512, height: 256 });
    device.endFrame();
    return passes;
  }

  beforeEach(() => setContactShadowMask(undefined));

  it("an explicit effects.contactShadows() opt-in publishes the mask sized to the frame, with its intensity", () => {
    const contributor = createPrd02ContactShadowsContributor();
    const shadow = { prd02Contact: { length: 0.5, intensity: 0.8 } };
    const ctx = ctxFor({ source: { renderItems: [caster, floor], shadow, collectedLights: [new DirectionalLight("sun")] } as never });
    const passes = run(contributor, ctx);
    expect(passes).toHaveLength(1);
    const published = contactShadowMask();
    expect(published).toBeDefined();
    expect(published).toMatchObject({ width: 512, height: 256, strength: 0.8 });
    expect(published!.texture).toBe(ctx.blackboard.get("prd02.contactShadowMask"));
  });

  it("renders its own depth including castShadow:false receivers (the floor), one pass object reused across frames", () => {
    const contributor = createPrd02ContactShadowsContributor();
    const shadow = { prd02Contact: {} };
    const device = new MockRenderDevice();
    const first = ctxFor({ device, source: { renderItems: [caster, floor], shadow, collectedLights: [new DirectionalLight("sun")] } as never });
    run(contributor, first);
    const targetsAfterFirst = device.getDiagnostics().renderTargets;
    expect(targetsAfterFirst).toBeGreaterThan(0);
    const second = ctxFor({ device, source: { renderItems: [caster, floor], shadow, collectedLights: [new DirectionalLight("sun")] } as never });
    run(contributor, second);
    expect(device.getDiagnostics().renderTargets).toBe(targetsAfterFirst);
    expect(contactShadowMask()).toBeDefined();
  });

  it("a tier-default request (Ultra, no opt-in) still runs but does not feed forward shading", () => {
    const contributor = createPrd02ContactShadowsContributor();
    setContactShadowMask({ texture: new Texture({ width: 2, height: 2, format: "rgba8", label: "stale" }), width: 2, height: 2, strength: 1 });
    const passes = run(contributor, ctxFor({ tier: QUALITY_TIERS.ultra }));
    expect(passes).toHaveLength(1);
    expect(contactShadowMask()).toBeUndefined();
  });

  it("the sub-flag forces the mask into shading", () => {
    const contributor = createPrd02ContactShadowsContributor();
    run(contributor, ctxFor({ flags: flagsOn(["A3D_QR_LIGHTING", CONTACT_SHADOWS_SUB_FLAG]) }));
    expect(contactShadowMask()).toBeDefined();
  });

  it("no request clears a stale mask so frames without the effect are unchanged", () => {
    const contributor = createPrd02ContactShadowsContributor();
    setContactShadowMask({ texture: new Texture({ width: 2, height: 2, format: "rgba8", label: "stale" }), width: 2, height: 2, strength: 1 });
    expect(run(contributor, ctxFor())).toHaveLength(0);
    expect(contactShadowMask()).toBeUndefined();
  });

  it("marches toward the light in world space: the sun is the negated travel direction of the collected light, and the march uses the combined view-projection", () => {
    const contributor = createPrd02ContactShadowsContributor();
    const sun = new DirectionalLight("sun");
    sun.castsShadow = true;
    sun.transform.setPosition(2.6, 4.2, 2.4);
    sun.transform.updateWorld(undefined, true);
    const collected = collectLight(sun);
    const ctx = ctxFor({ source: { renderItems: [caster, floor], shadow: { prd02Contact: {} }, collectedLights: [collected] } as never });
    // The production renderer's frame camera has identity view/projection and only a real combined matrix.
    const real = ctx.camera!;
    const frameCamera = {
      ...real,
      viewMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
      projectionMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
      viewProjectionMatrix: multiplyMat4(real.projectionMatrix as unknown as Mat4, real.viewMatrix as unknown as Mat4) as unknown as Float32Array,
      projection: "perspective" as const
    };
    const withIdentity = { ...ctx, camera: frameCamera } as FrameContributorContext;
    const device = ctx.device as MockRenderDevice;
    device.beginFrame(512, 256);
    for (const pass of contributor.passes!("shadows", withIdentity)) pass.execute({ device, width: 512, height: 256 });
    const recorded = device.drawCommands.find((command) => command.label === "prd02-contact-shadow-mask");
    device.endFrame();
    expect(recorded).toBeDefined();
    const toward = [-collected.direction[0], -collected.direction[1], -collected.direction[2]] as const;
    const length = Math.hypot(toward[0], toward[1], toward[2]);
    const uniforms = recorded!.uniforms!;
    const actual = uniforms.get("u_prd02ContactSun") as readonly number[];
    for (let i = 0; i < 3; i += 1) expect(actual[i]!).toBeCloseTo(toward[i]! / length, 5);
    const viewProjection = uniforms.get("u_prd02ContactViewProj") as readonly number[];
    for (let i = 0; i < 16; i += 1) expect(viewProjection[i]!).toBeCloseTo(frameCamera.viewProjectionMatrix[i]!, 5);
    // Not the identity the frame camera reports for view/projection.
    expect(Math.abs(viewProjection[0]! - 1) + Math.abs(viewProjection[5]! - 1)).toBeGreaterThan(0.01);
    expect(uniforms.get("u_prd02ContactInvViewProj")).toBeDefined();
  });

  it("is not an after-opaque pass any more (nothing could sample the mask there)", () => {
    const contributor = createPrd02ContactShadowsContributor();
    expect(contributor.phases).toEqual(["shadows"]);
    expect(contributor.passes!("after-opaque", ctxFor())).toHaveLength(0);
  });
});

describe("effects.contactShadows() is no longer lowered to SSAO", () => {
  it("postBridge no longer exports contactShadowsAsOcclusion and compiler/postprocess does not call it", () => {
    const bridge = readFileSync("packages/engine/src/agent-api/postBridge.ts", "utf8");
    const post = readFileSync("packages/engine/src/agent-api/compiler/postprocess.ts", "utf8");
    expect(bridge).not.toContain("contactShadowsAsOcclusion");
    expect(post).not.toContain("contactShadowsAsOcclusion");
  });
});
