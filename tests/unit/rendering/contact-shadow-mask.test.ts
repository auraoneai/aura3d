/**
 * Beat-three.js PRD-2 WP-4 (section 2.3): the contact-shadow mask has a forward-shading consumer.
 *
 * - `u_contactShadowMask` is declared by every forward program that has a shadow-casting light and is
 *   multiplied into the shadow-casting DIRECTIONAL light's visibility only (kind 0: never spot or point);
 *   strength 0 (no mask) is exactly 1.0.
 * - `prd02.contactShadows` runs in the `shadows` phase (before forward) and publishes the mask to the
 *   forward store only for an explicit `effects.contactShadows()` opt-in or the sub-flag, and only when
 *   the scene has a shadow-casting directional light to march along. Otherwise it says so (diagnostic + one warning).
 * - The tier-default (Ultra, no opt-in) path keeps its pre-WP-4 `after-opaque` slot, scene depth and no publish.
 * - The store is per device and binds only to the draws of the view it was marched for (same device, size, camera).
 * - `effects.contactShadows()` no longer lowers to the SSAO contact-occlusion pass.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DirectionalLight, PerspectiveCamera, SpotLight, multiplyMat4, type Mat4 } from "@aura3d/scene";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { shaderGraph } from "../../../packages/engine/src/agent-api/nodes/shaderGraph";
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
import { ForwardPass, registerForwardDrawHook, type RenderItem } from "../../../packages/rendering/src/ForwardPass";
import { registerShaderFeature } from "../../../packages/rendering/src/contracts/program";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import type { ShaderGraphDocument } from "../../../packages/rendering/src/program/ShaderGraphCompiler";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { CONTACT_SHADOW_MASK_GLSL } from "../../../packages/rendering/src/shaders/chunks/contact_shadow_mask.glsl";
import {
  applyContactShadowMaskUniforms,
  contactShadowMask,
  contactShadowMaskDrawCounters,
  createContactShadowMaskTarget,
  resolveContactShadowMask,
  setContactShadowMask
} from "../../../packages/rendering/src/forward/contactShadowMaskStore";
import {
  CONTACT_SHADOWS_NO_CONSUMER_REASON,
  CONTACT_SHADOWS_NO_SUN_REASON,
  CONTACT_SHADOWS_SUB_FLAG,
  createPrd02ContactShadowsContributor,
  isOrthographicFrameCamera,
  prd02ContactShadowDiagnostics
} from "../../../packages/rendering/src/passes/Prd02ContactShadowsContributor";
import { isContactShadowShadingPass } from "../../../packages/rendering/src/shadows/contactPassTrust";
import { prd02DepthFeatures } from "../../../packages/rendering/src/shadows/Prd02DepthShaderLibrary";
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
    expect(CONTACT_SHADOW_MASK_GLSL).toContain("if (kind > 0.5 || u_contactShadowMaskStrength <= 0.0) return 1.0;");
    expect(CONTACT_SHADOW_MASK_GLSL).toContain("mix(1.0, mask, clamp(u_contactShadowMaskStrength, 0.0, 1.0))");
    expect(CONTACT_SHADOW_MASK_GLSL).toContain("gl_FragCoord.xy / u_contactShadowMaskViewport");
  });
});

describe("generated forward program", () => {
  it("multiplies the mask into the shadow-casting light's visibility only", () => {
    const out = gen({ lighting: "lit", lights: ONE_DIR, shadows: { ...SHADOWED, contact: true } });
    expect(out.fragment).toContain("uniform sampler2D u_contactShadowMask;");
    expect(out.fragment).toContain("if (i == int(u_contactShadowLightIndex) && u_lightData[i * 6 + 3].z > 0.5) radiance *= a3dContactShadowMaskFactor(u_lightData[i * 6 + 2].w);");
    expect(out.fragment).toContain("if (kind > 0.5 || u_contactShadowMaskStrength");
    expect(validate("generated-masked", out.fragment)).toBe("");
  });

  it("also evaluates contact visibility without a cascade map", () => {
    const out = gen({ lighting: "lit", lights: ONE_DIR, shadows: { ...UNSHADOWED, contact: true } });
    expect(out.fragment).toContain("uniform sampler2D u_contactShadowMask;");
    expect(out.fragment).toContain("radiance *= a3dContactShadowMaskFactor");
    expect(validate("generated-contact-without-cascades", out.fragment)).toBe("");
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
      expect(compiled.fragment, name).toContain("a3dContactShadowMaskFactor(kind)");
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
    expect(variant.fragment).toContain("float a3dContactShadowMaskFactor(float kind) { return 1.0; }");
    expect(validate("textured-atlas-variant", variant.fragment)).toBe("");
  });

  it("multiplies the mask only on the non-point shadow branch", () => {
    for (const file of ["ShaderLibrary.ts", "ShaderLibraryCore.ts"]) {
      const source = readFileSync(`packages/rendering/src/${file}`, "utf8");
      for (const match of source.matchAll(/kind > 0\.5 && kind < 1\.5 \? a3d\w*PointShadowFactor\([^)]*\) : (a3d\w+ShadowFactor\([^)]*\)[^,]*),/g)) {
        expect(match[1], file).toContain("lightIndex == int(u_contactShadowLightIndex)");
        expect(match[1], file).toContain("a3dContactShadowMaskFactor(kind)");
      }
    }
  });
});

describe("applyContactShadowMaskUniforms", () => {
  const reflecting = { reflection: { uniforms: new Set(["u_contactShadowMask", "u_contactShadowMaskStrength", "u_contactShadowMaskViewport"]) } } as never;
  const silent = { reflection: { uniforms: new Set<string>() } } as never;
  const item = { label: "floor" } as RenderItem;
  const device = new MockRenderDevice();
  const owner = {};
  const matrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  let texture: Texture;
  let target: ReturnType<MockRenderDevice["createRenderTarget"]>;
  let frame: FrameContributorContext;

  beforeEach(() => {
    setContactShadowMask(device, undefined);
    target = createContactShadowMaskTarget(device, 4, 4);
    texture = target.colorTexture;
    frame = { device, postScopeId: owner, viewId: "main", frameIndex: 1, timeSeconds: 0, width: 8, height: 8, rasterViewportIsFull: true,
      blackboard: new Map(), camera: { position: [0, 3, 8], viewProjectionMatrix: matrix.slice() } } as unknown as FrameContributorContext;
  });
  const publish = (context: FrameContributorContext, strength = 1) => {
    context.blackboard.set("prd02.contactShadowMask", texture);
    setContactShadowMask(context.device,
      { texture, width: context.width, height: context.height, strength, cameraPosition: [0, 3, 8], sourceLight: owner }, context, target);
  };
  const scope = (context: FrameContributorContext = frame) => ({ device: context.device, width: context.width, height: context.height, frame: context });
  const strengthFor = (value: Parameters<typeof applyContactShadowMaskUniforms>[3], draw = item) => {
    const uniforms = new Map();
    applyContactShadowMaskUniforms(draw, reflecting, uniforms, value);
    return uniforms.get("u_contactShadowMaskStrength");
  };

  it("does nothing for programs without the sampler and binds zero when no mask exists", () => {
    const uniforms = new Map();
    applyContactShadowMaskUniforms(item, silent, uniforms, scope());
    expect(uniforms.size).toBe(0);
    expect(strengthFor(scope())).toBe(0);
    expect(strengthFor(undefined)).toBe(0);
  });

  it("binds the live mask, strength and target dimensions for the exact frame", () => {
    frame = { ...frame, width: 640, height: 360 };
    publish(frame, 0.6);
    const uniforms = new Map();
    applyContactShadowMaskUniforms(item, reflecting, uniforms, scope());
    expect(resolveContactShadowMask(scope())?.texture).toBe(texture);
    expect((uniforms.get("u_contactShadowMask") as TextureBinding).texture).toBe(texture);
    expect(uniforms.get("u_contactShadowMaskStrength")).toBe(0.6);
    expect(uniforms.get("u_contactShadowMaskViewport")).toEqual([640, 360]);
  });

  it("clamps strength and honors receiveShadow", () => {
    publish(frame, 3);
    expect(strengthFor(scope())).toBe(1);
    expect(strengthFor(scope(), { ...item, receiveShadow: false })).toBe(0);
  });

  it("rejects another owner, view, frame, blackboard, camera orientation, target size or device", () => {
    publish(frame);
    expect(strengthFor(scope())).toBe(1);
    const rotated = matrix.slice(); rotated[0] = -1; rotated[10] = -1;
    for (const foreign of [
      { ...frame, postScopeId: {} }, { ...frame, viewId: "mirror" }, { ...frame, frameIndex: 2 },
      { ...frame, blackboard: new Map() }, { ...frame, width: 4 },
      { ...frame, camera: { ...frame.camera!, viewProjectionMatrix: rotated } },
      { ...frame, device: new MockRenderDevice() }
    ]) expect(strengthFor(scope(foreign as FrameContributorContext))).toBe(0);
    expect(strengthFor({ ...scope(), width: 4 })).toBe(0);
    expect(strengthFor({ ...scope(), frame: undefined })).toBe(0);
    expect(strengthFor({ ...scope(), viewProjectionMatrix: rotated })).toBe(0);
    const equivalentF64 = Array.from(matrix); equivalentF64[0] = 1 + 1e-9;
    expect(strengthFor({ ...scope(), viewProjectionMatrix: equivalentF64 })).toBe(1);
  });

  it("rejects camera-position or time changes that would move a graph caster after production", () => {
    frame = { ...frame, timeSeconds: 7.25 };
    publish(frame);
    expect(strengthFor({ ...scope(), cameraPosition: [0, 3, 8], timeSeconds: 7.25 })).toBe(1);
    expect(strengthFor({ ...scope(), cameraPosition: [0, 4, 8], timeSeconds: 7.25 })).toBe(0);
    expect(strengthFor({ ...scope(), cameraPosition: [0, 3, 8], timeSeconds: 7.5 })).toBe(0);
    expect(strengthFor(scope({ ...frame, timeSeconds: 7.5 }))).toBe(0);
    expect(strengthFor(scope({ ...frame, camera: { ...frame.camera!, position: [0, 4, 8] } }))).toBe(0);
  });

  it("rejects disposed resources and a changed device generation", () => {
    let generation = 1;
    Object.defineProperty(device, "generation", { configurable: true, get: () => generation });
    target.dispose();
    target = createContactShadowMaskTarget(device, 4, 4);
    texture = target.colorTexture;
    publish(frame);
    expect(strengthFor(scope())).toBe(1);
    generation++;
    expect(strengthFor(scope())).toBe(0);
    publish(frame);
    texture.dispose();
    expect(strengthFor(scope())).toBe(0);
    delete (device as unknown as { generation?: number }).generation;
  });

  it("cannot publish an unregistered target or one registered to another device", () => {
    const other = new MockRenderDevice();
    const foreign = { ...frame, device: other };
    const record = { texture, width: 8, height: 8, strength: 1, cameraPosition: [0, 3, 8] as const, sourceLight: owner };
    foreign.blackboard.set("prd02.contactShadowMask", texture);
    setContactShadowMask(other, record, foreign, target);
    expect(resolveContactShadowMask(scope(foreign))).toBeUndefined();
    const unregistered = other.createRenderTarget({ width: 4, height: 4 });
    foreign.blackboard.set("prd02.contactShadowMask", unregistered.colorTexture);
    setContactShadowMask(other, { ...record, texture: unregistered.colorTexture }, foreign, unregistered);
    expect(resolveContactShadowMask(scope(foreign))).toBeUndefined();
    unregistered.dispose(); other.dispose();
  });

  it("unscoped legacy records cannot bind and replacement revokes the old frame", () => {
    setContactShadowMask(device, { texture, width: 8, height: 8, strength: 1, cameraPosition: [0, 3, 8], sourceLight: owner });
    expect(strengthFor(scope())).toBe(0);
    publish(frame);
    const old = frame;
    frame = { ...frame, frameIndex: 2, blackboard: new Map() };
    publish(frame);
    expect(strengthFor(scope(old))).toBe(0);
    expect(strengthFor(scope())).toBe(1);
    setContactShadowMask(device, undefined);
    expect(strengthFor(scope())).toBe(0);
  });

  it("revokes a publication if its frame blackboard no longer contains that texture", () => {
    publish(frame);
    frame.blackboard.delete("prd02.contactShadowMask");
    expect(resolveContactShadowMask(scope())).toBeUndefined();
    expect(strengthFor(scope())).toBe(0);
  });

  it("counts uniform applications, including replays, and masked applications", () => {
    publish(frame);
    strengthFor(scope());
    strengthFor({ ...scope(), width: 4 });
    applyContactShadowMaskUniforms(item, silent, new Map(), scope());
    expect(contactShadowMaskDrawCounters(device)).toEqual({ calls: 3, reflectingDraws: 2, maskedDraws: 1 });
  });
});

describe("prd02.contactShadows contributor publishes the mask to forward shading", () => {
  const owner = {};
  const flagsOn = (names: readonly string[]) => createTrustedQrFlags(Object.fromEntries(names.map((n) => [n, true])));
  const caster: RenderItem = {
    label: "subject",
    geometry: Geometry.litCube(1),
    material: new UnlitMaterial({ name: "m", color: [1, 1, 1, 1] }),
    modelMatrix: new Float32Array(16)
  };
  const floor: RenderItem = { ...caster, label: "floor", castShadow: false };

  function castingSun() {
    const sun = new DirectionalLight("sun");
    sun.castsShadow = true;
    sun.transform.setPosition(2.6, 4.2, 2.4);
    sun.transform.updateWorld(undefined, true);
    return collectLight(sun);
  }

  function castingSpot() {
    const spot = new SpotLight("spot");
    spot.castsShadow = true;
    spot.transform.setPosition(0, 5, 0);
    spot.transform.updateWorld(undefined, true);
    return collectLight(spot);
  }

  function ctxFor(overrides: Partial<FrameContributorContext> = {}, lights: readonly unknown[] = [castingSun()]): FrameContributorContext {
    const cam = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 1, near: 0.1, far: 50 });
    cam.transform.setPosition(0, 3, 8);
    cam.updateCameraMatrices();
    // The production frame camera also carries its world position (FrameCamera.position).
    Object.defineProperty(cam, "position", { value: [0, 3, 8] as const });
    return {
      device: new MockRenderDevice(),
      postScopeId: owner,
      viewId: "main",
      rasterViewportIsFull: true,
      width: 512,
      height: 256,
      frameIndex: 0,
      timeSeconds: 0,
      camera: cam as never,
      source: { renderItems: [caster, floor], collectedLights: lights } as never,
      items: [caster, floor],
      tier: QUALITY_TIERS.high,
      flags: flagsOn(["A3D_QR_LIGHTING"]),
      sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 50, orthographic: false } },
      blackboard: new Map(),
      ...overrides
    } as FrameContributorContext;
  }

  const sourceWith = (shadow: unknown, lights: readonly unknown[] = [castingSun()]) =>
    ({ renderItems: [caster, floor], shadow, collectedLights: lights }) as never;

  function runPhase(contributor: ReturnType<typeof createPrd02ContactShadowsContributor>, ctx: FrameContributorContext, phase: "shadows" | "after-opaque" = "shadows") {
    const passes = contributor.passes!(phase, ctx);
    const device = ctx.device as MockRenderDevice;
    device.beginFrame(512, 256);
    for (const pass of passes) pass.execute({ device, width: 512, height: 256 });
    device.endFrame();
    return passes;
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("an explicit effects.contactShadows() opt-in publishes the mask sized to the frame, with its intensity and camera", () => {
    const contributor = createPrd02ContactShadowsContributor();
    const ctx = ctxFor({ source: sourceWith({ prd02Contact: { length: 0.5, intensity: 0.8 } }) });
    const passes = runPhase(contributor, ctx);
    expect(passes).toHaveLength(1);
    const published = contactShadowMask(ctx.device);
    expect(published).toBeDefined();
    expect(published).toMatchObject({ width: 512, height: 256, strength: 0.8 });
    expect(published!.cameraPosition).toEqual(Array.from(ctx.camera!.position));
    expect(published!.texture).toBe(ctx.blackboard.get("prd02.contactShadowMask"));
  });

  it("attests only the original unchanged shading pass without inspecting foreign passes", () => {
    const contributor = createPrd02ContactShadowsContributor();
    const ctx = ctxFor({ source: sourceWith({ prd02Contact: {} }) });
    const pass = contributor.passes!("shadows", ctx)[0]!;
    const impostor = new Proxy({}, { get: () => { throw new Error("foreign getter touched"); }, getPrototypeOf: () => { throw new Error("foreign prototype touched"); } });
    try {
      expect(isContactShadowShadingPass(pass)).toBe(true);
      expect(isContactShadowShadingPass(impostor as never)).toBe(false);
      expect(isContactShadowShadingPass({ ...pass } as never)).toBe(false);
      (pass.writes as string[]).push("foreign");
      expect(isContactShadowShadingPass(pass)).toBe(false);
      (pass.writes as string[]).pop();
      Object.defineProperty(pass, "execute", { value: () => undefined, configurable: true });
      expect(isContactShadowShadingPass(pass)).toBe(false);
      delete (pass as { execute?: unknown }).execute;
      expect(isContactShadowShadingPass(pass)).toBe(true);
    } finally { contributor.dispose?.(); (ctx.device as MockRenderDevice).dispose(); }
  });

  it("renders its own depth including castShadow:false receivers (the floor), one pass object reused across frames", () => {
    const contributor = createPrd02ContactShadowsContributor();
    const shadow = { prd02Contact: {} };
    const device = new MockRenderDevice();
    runPhase(contributor, ctxFor({ device, source: sourceWith(shadow) }));
    const targetsAfterFirst = device.getDiagnostics().renderTargets;
    expect(targetsAfterFirst).toBeGreaterThan(0);
    runPhase(contributor, ctxFor({ device, source: sourceWith(shadow) }));
    expect(device.getDiagnostics().renderTargets).toBe(targetsAfterFirst);
    expect(contactShadowMask(device)).toBeDefined();
  });

  it("uses the forward frame time and camera for an animated graph's paired camera-depth vertex", () => {
    const graph: ShaderGraphDocument = {
      version: 1, stage: "material",
      nodes: [
        { id: "position", op: "input", type: "vec3", name: "positionLocal" },
        { id: "camera", op: "input", type: "vec3", name: "cameraPosition" },
        { id: "time", op: "input", type: "f32", name: "time" },
        { id: "motion", op: "construct", type: "vec3", inputs: ["time", "time", "time"] },
        { id: "placed", op: "add", type: "vec3", inputs: ["position", "motion"] },
        { id: "displaced", op: "add", type: "vec3", inputs: ["placed", "camera"] },
        { id: "color", op: "constant", type: "vec3", value: [1, 1, 1] }
      ],
      outputs: { position: "displaced", color: "color" }
    };
    const material = createCustomShaderMaterial(shaderGraph.material({ graph }).custom!);
    const geometry = Geometry.litCube(1);
    const item: RenderItem = { label: "animated-graph", geometry, material };
    const contributor = createPrd02ContactShadowsContributor();
    const device = new MockRenderDevice();
    try {
      for (const timeSeconds of [7.25, 11.5]) {
        const initial = ctxFor({ device, timeSeconds, items: [item], tier: QUALITY_TIERS.ultra, source: sourceWith(undefined) });
        const position: [number, number, number] = timeSeconds === 7.25 ? [0, 3, 8] : [10, -3, 7];
        const camera = { ...initial.camera!, viewMatrix: initial.camera!.viewMatrix, projectionMatrix: initial.camera!.projectionMatrix,
          viewProjectionMatrix: initial.camera!.viewProjectionMatrix, position };
        const ctx = { ...initial, camera } as FrameContributorContext;
        device.beginFrame(ctx.width, ctx.height);
        contributor.passes!("after-opaque", ctx)[0]!.execute({ device, width: ctx.width, height: ctx.height });
        new ForwardPass({ items: [item], timeSeconds, cameraPosition: ctx.camera!.position }).execute({ device, width: ctx.width, height: ctx.height });
        const depth = device.drawCommands.find(command => command.label === "animated-graph:custom-depth")!;
        const forward = device.drawCommands.find(command => command.label === "animated-graph")!;
        expect(depth).toBeDefined();
        expect(forward).toBeDefined();
        expect(depth.uniforms?.get("u_time")).toBe(timeSeconds);
        expect(depth.uniforms?.get("u_cameraPosition")).toEqual(position);
        expect(depth.uniforms?.get("u_time")).toEqual(forward.uniforms?.get("u_time"));
        expect(depth.uniforms?.get("u_cameraPosition")).toEqual(forward.uniforms?.get("u_cameraPosition"));
        expect(contactShadowMask(device)).toBeUndefined();
        device.endFrame();
        setContactShadowMask(device, undefined);
      }
    } finally { contributor.dispose?.(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("blocks an unpaired displaced graph even when a different opaque item receives the mask", () => {
    const graph: ShaderGraphDocument = { version: 1, stage: "material", nodes: [
      { id: "position", op: "input", type: "vec3", name: "positionLocal" },
      { id: "offset", op: "constant", type: "vec3", value: [1, 0, 0] },
      { id: "displaced", op: "add", type: "vec3", inputs: ["position", "offset"] },
      { id: "color", op: "constant", type: "vec3", value: [1, 1, 1] }
    ], outputs: { position: "displaced", color: "color" } };
    const spec = shaderGraph.material({ graph }).custom!;
    const material = createCustomShaderMaterial({ ...spec, castShadow: false });
    const geometry = Geometry.litCube(1);
    const contributor = createPrd02ContactShadowsContributor();
    const ctx = ctxFor({ source: sourceWith({ prd02Contact: {} }), items: [caster, { geometry, material, label: "unpaired" }] });
    const device = ctx.device as MockRenderDevice;
    try {
      expect(material.graphDisplaced).toBe(true);
      expect(material.customDepthShaderKey).toBeUndefined();
      device.beginFrame(ctx.width, ctx.height);
      expect(() => contributor.passes!("shadows", ctx)[0]!.execute({ device, width: ctx.width, height: ctx.height })).toThrow(/unverified custom or graph material/);
      expect(device.drawCommands).toHaveLength(0);
      expect(contactShadowMask(device)).toBeUndefined();
      device.endFrame();
    } finally { contributor.dispose?.(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("blocks a hot-reloaded graph occluder even when it does not receive shadows", () => {
    const graph: ShaderGraphDocument = { version: 1, stage: "material", nodes: [
      { id: "color", op: "constant", type: "vec3", value: [1, 1, 1] }
    ], outputs: { color: "color" } };
    const material = createCustomShaderMaterial(shaderGraph.material({ graph }).custom!);
    const geometry = Geometry.litCube(1);
    const contributor = createPrd02ContactShadowsContributor();
    const ctx = ctxFor({ source: sourceWith({ prd02Contact: {} }), items: [caster, { geometry, material, receiveShadow: false }] });
    const device = ctx.device as MockRenderDevice;
    try {
      material.hotReload(material.sources);
      expect(material.graphSourcesPristine).toBe(false);
      device.beginFrame(ctx.width, ctx.height);
      expect(() => contributor.passes!("shadows", ctx)[0]!.execute({ device, width: ctx.width, height: ctx.height })).toThrow(/unverified custom or graph material/);
      expect(device.drawCommands).toHaveLength(0);
      expect(contactShadowMask(device)).toBeUndefined();
      device.endFrame();
    } finally { contributor.dispose?.(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("draws the original visible geometry instead of a shadow proxy in camera depth", () => {
    const contributor = createPrd02ContactShadowsContributor();
    const proxy = Geometry.triangle();
    const device = new MockRenderDevice();
    try {
      const ctx = ctxFor({ device, source: sourceWith({ prd02Contact: {} }), items: [{ ...caster, shadowGeometry: proxy }] });
      runPhase(contributor, ctx);
      const depth = device.drawCommands.find(command => command.label === "subject:0")!;
      expect(depth.vertexBuffer).toBe(caster.geometry.vertexBuffer.upload(device));
      expect(depth.vertexBuffer).not.toBe(proxy.vertexBuffer.upload(device));
      expect(contactShadowMask(device)).toBeDefined();
    } finally { contributor.dispose?.(); proxy.dispose(); device.dispose(); }
  });

  it("rejects the entire shared mask when another item has incompatible camera-depth coverage, and retries after repair", () => {
    const contributor = createPrd02ContactShadowsContributor();
    const device = new MockRenderDevice();
    const blended = new UnlitMaterial({ renderState: { blend: true, depthWrite: false } });
    const blendMode = new UnlitMaterial({ renderState: { blendMode: "alpha" } });
    const noWrite = new UnlitMaterial({ renderState: { depthWrite: false } });
    const noTest = new UnlitMaterial({ renderState: { depthTest: false } });
    const cutout = new UnlitMaterial({ alphaTest: 0.5 });
    const stencil = new UnlitMaterial({ renderState: { stencil: { compare: "equal" } } });
    const overridden = new UnlitMaterial();
    const getParameter = vi.fn(() => 0);
    Object.defineProperty(overridden, "getParameter", { value: getParameter, configurable: true });
    const transformed = new Float32Array([2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const unsafe: RenderItem[] = [
      { ...floor, label: "blended", material: blended, castShadow: true },
      { ...floor, label: "blend-mode", material: blendMode },
      { ...floor, label: "no-write", material: noWrite },
      { ...floor, label: "no-test", material: noTest },
      { ...floor, label: "cutout", material: cutout },
      { ...floor, label: "stencil", material: stencil },
      { ...floor, label: "material-override", material: overridden },
      { ...floor, label: "fade", cameraFade: 0.5 },
      { ...floor, label: "lod", lodFade: 0.5 },
      { ...floor, label: "callback", onBeforeRender: () => undefined },
      { ...floor, label: "geometry-matrix", geometryMatrix: transformed },
      { ...floor, label: "clipping", materialClipping: { planes: [[1, 0, 0, 0]] } } as RenderItem
    ];
    try {
      runPhase(contributor, ctxFor({ device, source: sourceWith({ prd02Contact: {} }) }));
      expect(contactShadowMask(device)).toBeDefined();
      for (const item of unsafe) {
        const ctx = ctxFor({ device, source: sourceWith({ prd02Contact: {} }), items: [caster, item] });
        device.beginFrame(ctx.width, ctx.height);
        expect(() => contributor.passes!("shadows", ctx)[0]!.execute({ device, width: ctx.width, height: ctx.height }), item.label).toThrow(/camera depth cannot represent/i);
        expect(device.drawCommands, item.label).toHaveLength(0);
        expect(contactShadowMask(device), item.label).toBeUndefined();
        expect(ctx.blackboard.has("prd02.contactShadowMask"), item.label).toBe(false);
        device.endFrame();
      }
      runPhase(contributor, ctxFor({ device, source: sourceWith({ prd02Contact: {} }), items: [caster, floor] }));
      expect(contactShadowMask(device)).toBeDefined();
      expect(getParameter).not.toHaveBeenCalled();
    } finally { contributor.dispose?.(); for (const material of [blended, blendMode, noWrite, noTest, cutout, stencil, overridden]) material.dispose(); device.dispose(); }
  });

  it("blocks a selected forward deformation feature before it can corrupt another receiver's mask", () => {
    const unregister = registerShaderFeature({
      id: "test.contact-vertex-deform", owner: "prd02", flag: "A3D_QR_LIGHTING", chunks: [], hooks: ["vertex:deform"],
      select: ({ item }) => item.label === "changed" ? true : undefined, defines: () => ({})
    });
    const contributor = createPrd02ContactShadowsContributor();
    const ctx = ctxFor({ source: sourceWith({ prd02Contact: {} }), items: [caster, { ...floor, label: "changed" }] });
    const device = ctx.device as MockRenderDevice;
    try {
      device.beginFrame(ctx.width, ctx.height);
      expect(() => contributor.passes!("shadows", ctx)[0]!.execute({ device, width: ctx.width, height: ctx.height })).toThrow(/verified forward shader providers/);
      expect(device.drawCommands).toHaveLength(0);
      expect(contactShadowMask(device)).toBeUndefined();
      device.endFrame();
    } finally { unregister(); contributor.dispose?.(); device.dispose(); }
  });

  it("rejects registered forward draw hooks before publishing camera depth", () => {
    const unregister = registerForwardDrawHook({ id: "test.contact-depth-hook", bind: () => undefined });
    const contributor = createPrd02ContactShadowsContributor();
    const ctx = ctxFor({ source: sourceWith({ prd02Contact: {} }) });
    const device = ctx.device as MockRenderDevice;
    try {
      device.beginFrame(ctx.width, ctx.height);
      expect(() => contributor.passes!("shadows", ctx)[0]!.execute({ device, width: ctx.width, height: ctx.height })).toThrow(/forward draw hooks/);
      expect(device.drawCommands).toHaveLength(0);
      expect(contactShadowMask(device)).toBeUndefined();
      device.endFrame();
    } finally { unregister(); contributor.dispose?.(); device.dispose(); }
  });

  it("does not call mutable registered shadow-depth features while producing camera depth", () => {
    const feature = prd02DepthFeatures()[0]!;
    const select = Object.getOwnPropertyDescriptor(feature, "select")!;
    const callback = vi.fn(() => { throw new Error("unexpected shadow-depth callback"); });
    Object.defineProperty(feature, "select", { ...select, value: callback });
    const contributor = createPrd02ContactShadowsContributor();
    const transforms = new Float32Array(65 * 16);
    for (let i = 0; i < 65; i++) transforms.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], i * 16);
    const ctx = ctxFor({ source: sourceWith({ prd02Contact: {} }), items: [{ ...caster, instanceTransforms: transforms }] });
    try {
      runPhase(contributor, ctx);
      expect(callback).not.toHaveBeenCalled();
      expect(contactShadowMask(ctx.device)).toBeDefined();
      expect((ctx.device as MockRenderDevice).drawCommands.filter(draw => draw.label?.startsWith("subject:"))
        .map(draw => draw.instanceCount)).toEqual([64, 1]);
    } finally {
      Object.defineProperty(feature, "select", select);
      contributor.dispose?.(); (ctx.device as MockRenderDevice).dispose();
    }
  });

  it("the sub-flag forces the mask into shading", () => {
    const contributor = createPrd02ContactShadowsContributor();
    const ctx = ctxFor({ flags: flagsOn(["A3D_QR_LIGHTING", CONTACT_SHADOWS_SUB_FLAG]) });
    runPhase(contributor, ctx);
    expect(contactShadowMask(ctx.device)).toBeDefined();
  });

  it("no request clears a stale mask so frames without the effect are unchanged", () => {
    const contributor = createPrd02ContactShadowsContributor();
    const ctx = ctxFor();
    setContactShadowMask(ctx.device, { texture: new Texture({ width: 2, height: 2, format: "rgba8", label: "stale" }), width: 2, height: 2, strength: 1, cameraPosition: [0, 0, 0], sourceLight: owner });
    expect(runPhase(contributor, ctx)).toHaveLength(0);
    expect(contactShadowMask(ctx.device)).toBeUndefined();
  });

  it("marches toward the light in world space: the sun is the negated travel direction of the collected light, and the march uses the combined view-projection", () => {
    const contributor = createPrd02ContactShadowsContributor();
    const collected = castingSun();
    const ctx = ctxFor({ source: sourceWith({ prd02Contact: {} }, [collected]) });
    // The production renderer's frame camera has identity view/projection and only a real combined matrix.
    const real = ctx.camera!;
    const frameCamera = {
      ...real,
      position: real.position,
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

  it("uses the late jittered raster matrix for both the producer and scope identity", () => {
    const contributor = createPrd02ContactShadowsContributor();
    const base = ctxFor({ source: sourceWith({ prd02Contact: {} }) });
    const raster = new Float32Array(base.camera!.viewProjectionMatrix);
    const ctx = { ...base, rasterViewProjectionMatrix: raster };
    const pass = contributor.passes!("shadows", ctx)[0]!;
    // Renderer chooses jitter after the graph has been assembled.
    raster[8] = raster[8]! + 0.0125;
    const device = ctx.device as MockRenderDevice;
    device.beginFrame(ctx.width, ctx.height);
    pass.execute({ device, width: ctx.width, height: ctx.height });
    const command = device.drawCommands.find(draw => draw.label === "prd02-contact-shadow-mask")!;
    expect(Array.from(command.uniforms!.get("u_prd02ContactViewProj") as readonly number[])).toEqual(Array.from(raster));
    const scope = { device, width: ctx.width, height: ctx.height, frame: ctx, viewProjectionMatrix: raster };
    expect(resolveContactShadowMask(scope)).toBeDefined();
    expect(resolveContactShadowMask({ ...scope, viewProjectionMatrix: base.camera!.viewProjectionMatrix })).toBeUndefined();
    device.endFrame(); contributor.dispose?.();
  });

  it("rejects an unverified or partial viewport before producing a mask", () => {
    for (const full of [false, undefined]) {
      const contributor = createPrd02ContactShadowsContributor();
      const ctx = ctxFor({ source: sourceWith({ prd02Contact: {} }), rasterViewportIsFull: full });
      const device = ctx.device as MockRenderDevice;
      device.beginFrame(ctx.width, ctx.height);
      expect(() => contributor.passes!("shadows", ctx)[0]!.execute({ device, width: ctx.width, height: ctx.height })).toThrow(/verified full raster viewport/i);
      expect(contactShadowMask(device)).toBeUndefined();
      expect(device.drawCommands).toHaveLength(0);
      device.endFrame(); contributor.dispose?.();
    }
  });

  describe("only a shadow-casting directional light can feed the mask", () => {
    it("a scene with only a shadow-casting spot light runs no pass, publishes nothing, and says why (no marching along a made-up up vector)", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const contributor = createPrd02ContactShadowsContributor();
      const ctx = ctxFor({ source: sourceWith({ prd02Contact: {} }, [castingSpot()]) });
      setContactShadowMask(ctx.device, { texture: new Texture({ width: 2, height: 2, format: "rgba8", label: "stale" }), width: 2, height: 2, strength: 1, cameraPosition: [0, 0, 0], sourceLight: owner });
      const passes = runPhase(contributor, ctx);
      expect(passes).toHaveLength(0);
      expect(contactShadowMask(ctx.device)).toBeUndefined();
      expect((ctx.device as MockRenderDevice).drawCommands.some((command) => command.label === "prd02-contact-shadow-mask")).toBe(false);
      expect(prd02ContactShadowDiagnostics().contactShadows).toMatchObject({ passExecuted: false, unavailable: CONTACT_SHADOWS_NO_SUN_REASON });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain("no shadow-casting directional light");
    });

    it("a scene with no light, or only a sun that does not cast, is the same", () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const contributor = createPrd02ContactShadowsContributor();
      const noCast = new DirectionalLight("sun");
      noCast.castsShadow = false;
      noCast.transform.updateWorld(undefined, true);
      for (const lights of [[], [collectLight(noCast)]]) {
        const ctx = ctxFor({ source: sourceWith({ prd02Contact: {} }, lights) });
        expect(runPhase(contributor, ctx)).toHaveLength(0);
        expect(contactShadowMask(ctx.device)).toBeUndefined();
      }
    });

    it("sun plus spot: the mask is marched along the sun only, never the spot", () => {
      const contributor = createPrd02ContactShadowsContributor();
      const sun = castingSun();
      const ctx = ctxFor({ source: sourceWith({ prd02Contact: {} }, [castingSpot(), sun]) });
      const device = ctx.device as MockRenderDevice;
      device.beginFrame(512, 256);
      for (const pass of contributor.passes!("shadows", ctx)) pass.execute({ device, width: 512, height: 256 });
      const recorded = device.drawCommands.find((command) => command.label === "prd02-contact-shadow-mask");
      device.endFrame();
      const actual = recorded!.uniforms!.get("u_prd02ContactSun") as readonly number[];
      const length = Math.hypot(...sun.direction);
      for (let i = 0; i < 3; i += 1) expect(actual[i]!).toBeCloseTo(-sun.direction[i]! / length, 5);
    });

    it("publishes the exact first visible casting directional identity even when a second sun has the same direction", () => {
      const contributor = createPrd02ContactShadowsContributor();
      const first = castingSun(), second = castingSun();
      const ctx = ctxFor({ source: sourceWith({ prd02Contact: {} }, [first, second]) });
      runPhase(contributor, ctx);
      const mask = resolveContactShadowMask({ device: ctx.device, width: ctx.width, height: ctx.height, frame: ctx });
      expect(mask?.sourceLight).toBe(first.source);
      expect(mask?.sourceLight).not.toBe(second.source);
      contributor.dispose?.();
    });

    it("rejects a selected light without source identity before drawing", () => {
      const contributor = createPrd02ContactShadowsContributor();
      const ctx = ctxFor({ source: sourceWith({ prd02Contact: {} }, [{ ...castingSun(), source: undefined }]) });
      const device = ctx.device as MockRenderDevice;
      device.beginFrame(ctx.width, ctx.height);
      expect(() => contributor.passes!("shadows", ctx)[0]!.execute({ device, width: ctx.width, height: ctx.height })).toThrow(/identifiable directional light/i);
      expect(contactShadowMask(device)).toBeUndefined();
      expect(device.drawCommands).toHaveLength(0);
      device.endFrame(); contributor.dispose?.();
    });

    it("the warning is printed once per message, not every frame", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const contributor = createPrd02ContactShadowsContributor();
      for (let i = 0; i < 3; i += 1) runPhase(contributor, ctxFor({ source: sourceWith({ prd02Contact: {} }, []) }));
      // The earlier tests in this file may already have printed this exact message.
      expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
    });
  });

  describe("tier-default requests (Ultra, no opt-in) keep their pre-WP-4 behaviour", () => {
    it("run in after-opaque, not in shadows, and never feed forward shading", () => {
      const contributor = createPrd02ContactShadowsContributor();
      const ctx = ctxFor({ tier: QUALITY_TIERS.ultra });
      setContactShadowMask(ctx.device, { texture: new Texture({ width: 2, height: 2, format: "rgba8", label: "stale" }), width: 2, height: 2, strength: 1, cameraPosition: [0, 0, 0], sourceLight: owner });
      expect(runPhase(contributor, ctx, "shadows")).toHaveLength(0);
      expect((ctx.device as MockRenderDevice).drawCommands).toHaveLength(0);
      expect(contactShadowMask(ctx.device)).toBeUndefined();
      const passes = runPhase(contributor, ctx, "after-opaque");
      expect(passes).toHaveLength(1);
      expect(contactShadowMask(ctx.device)).toBeUndefined();
      expect(ctx.blackboard.get("prd02.contactShadowMask")).toBeTruthy();
    });

    it("an opt-in scene does not also run the tier-default pass (no second mask pass per frame)", () => {
      const contributor = createPrd02ContactShadowsContributor();
      const ctx = ctxFor({ source: sourceWith({ prd02Contact: {} }) });
      expect(runPhase(contributor, ctx, "shadows")).toHaveLength(1);
      expect(contributor.passes!("after-opaque", ctx)).toHaveLength(0);
    });

    it("renders no extra opaque-scene depth pass before forward (draws only after-opaque, as before)", () => {
      const contributor = createPrd02ContactShadowsContributor();
      const ctx = ctxFor({ tier: QUALITY_TIERS.ultra });
      runPhase(contributor, ctx, "shadows");
      expect((ctx.device as MockRenderDevice).drawCommands).toHaveLength(0);
    });
  });

  describe("a published mask that no drawn program samples is reported", () => {
    it("flags the next frame's diagnostics and warns once when forward drew but nothing bound the mask", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const contributor = createPrd02ContactShadowsContributor();
      const device = new MockRenderDevice();
      const source = sourceWith({ prd02Contact: {} });
      const first = ctxFor({ device, source });
      runPhase(contributor, first);
      expect(prd02ContactShadowDiagnostics().contactShadows.unavailable).toBeUndefined();
      // Forward draws a program that does not reflect the mask (a textured-PBR extension variant, an unlit material, ...).
      const silent = { reflection: { uniforms: new Set<string>() } } as never;
      applyContactShadowMaskUniforms({ label: "glb" } as RenderItem, silent, new Map(), { device, width: 512, height: 256, frame: first });
      runPhase(contributor, ctxFor({ device, source }));
      expect(prd02ContactShadowDiagnostics().contactShadows.unavailable).toBe(CONTACT_SHADOWS_NO_CONSUMER_REASON);
      expect(warn.mock.calls.some((call) => String(call[0]).includes("no drawn program samples the mask"))).toBe(true);
    });

    it("stays quiet when a draw bound the mask", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const contributor = createPrd02ContactShadowsContributor();
      const device = new MockRenderDevice();
      const source = sourceWith({ prd02Contact: {} });
      const first = ctxFor({ device, source });
      runPhase(contributor, first);
      const reflecting = { reflection: { uniforms: new Set(["u_contactShadowMask"]) } } as never;
      const position = first.camera!.position;
      applyContactShadowMaskUniforms({ label: "floor" } as RenderItem, reflecting, new Map(), { device, width: 512, height: 256, cameraPosition: position, frame: first });
      runPhase(contributor, ctxFor({ device, source }));
      expect(prd02ContactShadowDiagnostics().contactShadows.unavailable).toBeUndefined();
      expect(warn.mock.calls.some((call) => String(call[0]).includes("no drawn program samples the mask"))).toBe(false);
    });
  });

  describe("orthographic cameras are recognised from the view-projection, not from a projection field that is not there", () => {
    // Column-major: clip.w = m[3]*x + m[7]*y + m[11]*z + m[15]. Orthographic leaves w at 1, perspective takes w from -z.
    const orthoVp = new Float32Array([0.3, 0, 0, 0, 0, 0.4, 0, 0, 0, 0, -0.02, 0, 0.1, -0.2, -1.1, 1]);
    const perspectiveVp = new Float32Array([1.8, 0, 0, 0, 0, 2.5, -0.36, -0.36, 0, -0.99, -0.93, -0.93, -1.8, 4.9, 4.8, 4.97]);

    it("an orthographic matrix is orthographic even when the frame camera calls itself perspective (OrthographicCamera has no `projection` field)", () => {
      expect(isOrthographicFrameCamera({ projection: "perspective", viewProjectionMatrix: orthoVp })).toBe(true);
      expect(isOrthographicFrameCamera({ projection: "orthographic", viewProjectionMatrix: perspectiveVp })).toBe(true);
      expect(isOrthographicFrameCamera({ projection: "perspective", viewProjectionMatrix: perspectiveVp })).toBe(false);
      expect(isOrthographicFrameCamera({ projection: "perspective", viewProjectionMatrix: new Float32Array(4) })).toBe(false);
    });

    it("the mask draw gets the orthographic flag from the matrix", () => {
      const contributor = createPrd02ContactShadowsContributor();
      const ctx = ctxFor({ source: sourceWith({ prd02Contact: {} }) });
      const frameCamera = { ...ctx.camera!, position: ctx.camera!.position, projection: "perspective" as const, viewProjectionMatrix: orthoVp };
      const device = ctx.device as MockRenderDevice;
      device.beginFrame(512, 256);
      for (const pass of contributor.passes!("shadows", { ...ctx, camera: frameCamera } as FrameContributorContext)) pass.execute({ device, width: 512, height: 256 });
      const recorded = device.drawCommands.find((command) => command.label === "prd02-contact-shadow-mask");
      device.endFrame();
      expect((recorded!.uniforms!.get("u_prd02ContactNearFar") as readonly number[])[2]).toBe(1);
    });

    it("a perspective camera keeps the perspective branch", () => {
      const contributor = createPrd02ContactShadowsContributor();
      const ctx = ctxFor({ source: sourceWith({ prd02Contact: {} }) });
      const device = ctx.device as MockRenderDevice;
      device.beginFrame(512, 256);
      for (const pass of contributor.passes!("shadows", ctx)) pass.execute({ device, width: 512, height: 256 });
      const recorded = device.drawCommands.find((command) => command.label === "prd02-contact-shadow-mask");
      device.endFrame();
      expect((recorded!.uniforms!.get("u_prd02ContactNearFar") as readonly number[])[2]).toBe(0);
    });

    it("the producer measures the orthographic depth gap in world space along the view direction (near/far are not trusted)", () => {
      expect(CONTACT_MASK_SHADER_SOURCES.fragment).toContain("float a3d_prd02ContactBehind(");
      expect(CONTACT_MASK_SHADER_SOURCES.fragment).toContain("dot(p - blockerPos, viewDir)");
      expect(CONTACT_MASK_SHADER_SOURCES.fragment).not.toContain("a3d_prd02ContactViewDepth");
    });
  });

  it("is a shadows-phase pass (nothing could sample the mask from after-opaque) plus the tier-default after-opaque slot", () => {
    const contributor = createPrd02ContactShadowsContributor();
    expect(contributor.phases).toEqual(["shadows", "after-opaque"]);
    expect(contributor.passes!("after-opaque", ctxFor({ source: sourceWith({ prd02Contact: {} }) }))).toHaveLength(0);
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
