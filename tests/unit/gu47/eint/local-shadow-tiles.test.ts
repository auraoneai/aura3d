/**
 * GU47 eint EB-3 (E-B handoff, `shadows/Prd02ShadowBridge.ts`): multi-caster shadows on the default path.
 *
 * E-B's selection (`resolveProductionShadowCasterIndices`) marks up to the tier's `localShadowLights` spot / point
 * lights as casters, but the bridge rendered the sun only, and the forward programs gated every shadow-casting
 * directional OR spot light onto the one bound map (the sun's). The bridge now renders the local lights' PRD-02 atlas
 * tiles in the same update and hands them over as `ForwardShadowMapOptions.localShadows`; the forward pass clears the
 * spot / point gate and packs the light's first tile + 1 into `right.w`; the generated program samples it
 * (`shadow_local`). Legacy programs leave local lights unshadowed instead of sun-shadowed.
 */
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import "../../../../packages/rendering/src/lanes/prd01";
import "../../../../packages/rendering/src/lanes/prd02";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { PerspectiveCamera, identityMat4 } from "@aura3d/scene";
import { MockRenderDevice, type DrawCommand, type RenderShaderProgram, type UniformValue } from "../../../../packages/rendering/src/RenderDevice";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../../packages/rendering/src/PBRMaterial";
import { Renderer } from "../../../../packages/rendering/src/Renderer";
import { LightUniforms } from "../../../../packages/rendering/src/LightUniforms";
import { createClusteredForwardLighting } from "../../../../packages/rendering/src/ClusteredForwardLighting";
import type { CollectedLight } from "../../../../packages/rendering/src/LightCollector";
import type { RenderItem } from "../../../../packages/rendering/src/contracts/renderItem";
import type { FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import type { ProgramFeatures } from "../../../../packages/rendering/src/contracts/program";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { TextureBinding } from "../../../../packages/rendering/src/TextureBinding";
import {
  MAX_FORWARD_LOCAL_SHADOW_TILES,
  forwardPassFeatureAxes,
  forwardShadedLights,
  type ForwardLocalShadowOptions,
  type ForwardShadowMapOptions
} from "../../../../packages/rendering/src/ForwardPass";
import { applyForwardLocalShadowUniforms } from "../../../../packages/rendering/src/forward/Lighting";
import { executePrd02BridgedShadowMap, prd02LocalShadowLights, prd02ShadowBridgeReason } from "../../../../packages/rendering/src/shadows/Prd02ShadowBridge";
import { createPrd02ShadowsContributor, prd02ShadowDiagnostics } from "../../../../packages/rendering/src/shadows/Prd02ShadowsContributor";
import { generateProgramImpl } from "../../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures";

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
const BASE = resolveQrFlags({ options: ["none"] });
afterEach(() => setRendererQrFlags(BASE));

const PRD02_SHADOWS = {
  enabled: true, mapSize: 1024, cascades: 2, maxDistance: 150, splitLambda: 0.75, blend: 0.1,
  filter: "pcf", strength: 1, bias: 0, normalBias: 1.5, sceneRadius: 20
};

function light(kind: CollectedLight["kind"], name: string, overrides: Partial<CollectedLight> = {}): CollectedLight {
  return {
    kind, color: [1, 1, 1], intensity: kind === "directional" ? 2 : 40, position: [0, 10, 0],
    direction: kind === "directional" ? [-0.5, -0.7, -0.5] : [0, -1, 0], range: kind === "directional" ? 0 : 30,
    spotAngle: kind === "spot" ? 0.6 : 0, penumbra: 0, castsShadow: true, layerMask: 1,
    source: { id: name, name, visible: true },
    ...overrides
  } as unknown as CollectedLight;
}

const sun = light("directional", "sun", { position: [6, 12, 4] });
const flood0 = light("spot", "flood-0", { position: [-8, 10, -8], direction: [0.55, -0.64, 0.55] });
const flood1 = light("spot", "flood-1", { position: [8, 10, -8], direction: [-0.55, -0.64, 0.55] });
const unshadowedFlood = light("spot", "flood-2", { castsShadow: false, position: [8, 10, 8] });
const bulb = light("point", "bulb", { position: [0, 3, 0], range: 12 });

function camera(): PerspectiveCamera {
  const cam = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 1, near: 0.1, far: 80 });
  cam.transform.setPosition(0, 12, 24);
  cam.updateCameraMatrices();
  return cam;
}

const caster = (): RenderItem => ({ geometry: Geometry.triangle(), modelMatrix: identityMat4(), label: "caster" }) as RenderItem;

function source(lights: readonly CollectedLight[], extra: Record<string, unknown> = {}) {
  return { shadow: { enabled: true, prd02Shadows: PRD02_SHADOWS, ...extra }, collectedLights: lights } as never;
}

function bridge(lights: readonly CollectedLight[], extra: Record<string, unknown> = {}) {
  const device = new MockRenderDevice();
  const labels: string[] = [];
  const create = device.createRenderTarget.bind(device);
  vi.spyOn(device, "createRenderTarget").mockImplementation((descriptor) => {
    labels.push(descriptor.label ?? "");
    return create(descriptor);
  });
  device.beginFrame(256, 256);
  const map = executePrd02BridgedShadowMap({ device, source: source(lights, extra), items: [caster()], camera: camera(), flags: FLAGS_ON });
  device.endFrame();
  return { device, labels, map };
}

/** Publish the bridged frame through the `prd02.shadows` pass and read its diagnostics rows. */
function publishedRows(device: MockRenderDevice, lights: readonly CollectedLight[]) {
  const ctx = {
    device, items: [caster()], source: source(lights), camera: camera(), flags: FLAGS_ON, tier: QUALITY_TIERS.high,
    blackboard: { get: () => undefined, set: () => undefined }
  } as unknown as FrameContributorContext;
  const passes = createPrd02ShadowsContributor().passes!("shadows", ctx) as readonly { execute(context: unknown): void }[];
  passes[0]!.execute({});
  return prd02ShadowDiagnostics()?.shadows ?? [];
}

describe("GU47 eint EB-3: the bridge renders local tiles", () => {
  it("sun + two shadowed floodlights: both spots get a tile next to the sun cascades, and two sampled local rows", () => {
    const lights = [sun, flood0, unshadowedFlood, flood1];
    const { device, labels, map } = bridge(lights);
    expect(map).toBeDefined();
    expect(map!.cascades).toHaveLength(2);
    expect(labels).toContain("prd02-local-shadow-atlas");
    const local = map!.localShadows!;
    expect([...local.slots.entries()]).toEqual([[flood0, 0], [flood1, 1]]);
    expect(local.texture?.name).toBe("u_localShadowAtlas");
    expect(local.texture?.sampler.compare).toBe("less-equal");
    expect(local.atlasSize).toBe(1024);
    // Spot tiles: 256 px of the 1024 atlas, fov = 2 x outer angle.
    expect(local.rects[2]).toBeCloseTo(0.25, 6);
    expect(local.texelScale[0]).toBeCloseTo((2 * Math.tan(0.6)) / 256, 6);
    expect(local.texelScale[1]).toBeCloseTo((2 * Math.tan(0.6)) / 256, 6);
    expect(local.texelScale[2]).toBe(0);
    expect([...local.matrices.subarray(0, 32)].every(Number.isFinite)).toBe(true);
    expect(local.strength).toBe(1);
    const rows = publishedRows(device, lights);
    expect(rows.map((row) => row.light)).toEqual(["sun", "local-0", "local-1"]);
    expect(rows.every((row) => row.sampled)).toBe(true);
  });

  it("a scene whose only casters are local lights binds a strength-0 sun map plus the tiles (it bailed with no-sun before)", () => {
    const { map } = bridge([light("directional", "moon", { castsShadow: false }), flood0]);
    expect(prd02ShadowBridgeReason()).toBe("rendered");
    expect(map).toBeDefined();
    expect(map!.strength).toBe(0);
    expect([...map!.lightMatrix]).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(map!.cascades).toBeUndefined();
    expect(map!.texture.texture).toBe(map!.localShadows!.texture!.texture);
    expect([...map!.localShadows!.slots.values()]).toEqual([0]);
  });

  it("a shadowed point light owns six consecutive tiles (cube faces, 90 degree fov)", () => {
    const { map } = bridge([sun, bulb]);
    const local = map!.localShadows!;
    expect(local.slots.get(bulb)).toBe(0);
    for (let face = 0; face < 6; face += 1) expect(local.texelScale[face]).toBeCloseTo(2 / 256, 6);
  });

  it("with the atlas kill switch the frame still marks the map as the sun's, with no tile", () => {
    const { labels, map } = bridge([sun, flood0], { prd02KillSwitches: { atlas: false } });
    expect(prd02LocalShadowLights(source([sun, flood0], { prd02KillSwitches: { atlas: false } }))).toEqual([]);
    expect(map!.localShadows).toBeDefined();
    expect(map!.localShadows!.slots.size).toBe(0);
    expect(map!.localShadows!.texture).toBeUndefined();
    expect(labels).not.toContain("prd02-local-shadow-atlas");
  });

  it("no sun and no local caster still allocates nothing", () => {
    const { labels, map } = bridge([light("directional", "moon", { castsShadow: false }), unshadowedFlood]);
    expect(map).toBeUndefined();
    expect(prd02ShadowBridgeReason()).toBe("no-sun");
    expect(labels).toEqual([]);
  });
});

function localOptions(slots: ReadonlyMap<CollectedLight, number>): ForwardLocalShadowOptions {
  return {
    slots,
    ...(slots.size > 0 ? { texture: new TextureBinding({ name: "u_localShadowAtlas", required: false }) } : {}),
    atlasSize: 1024,
    matrices: new Float32Array(MAX_FORWARD_LOCAL_SHADOW_TILES * 16),
    rects: new Float32Array(MAX_FORWARD_LOCAL_SHADOW_TILES * 4),
    texelScale: new Float32Array(8),
    strength: 1,
    biasTexels: 1,
    slopeBiasTexels: 0.5,
    normalBiasTexels: 1
  };
}

describe("GU47 eint EB-3: the forward pass packs local casters", () => {
  const lights = [sun, flood0, bulb, unshadowedFlood];
  const local = localOptions(new Map([[flood0, 0]]));

  it("frames without localShadows keep the lights array itself", () => {
    expect(forwardShadedLights(lights, undefined)).toBe(lights);
    expect(forwardShadedLights(undefined, local)).toEqual([]);
    expect(forwardShadedLights([sun, unshadowedFlood], local)).toEqual([sun, unshadowedFlood]);
  });

  it("a bridge frame clears every spot / point gate and stamps the tile; the sun keeps the forward map", () => {
    const shaded = forwardShadedLights(lights, local);
    expect(shaded[0]).toBe(sun);
    expect(shaded[3]).toBe(unshadowedFlood);
    expect(shaded[1]).toMatchObject({ castsShadow: false, localShadowSlot: 0, source: flood0.source });
    expect(shaded[2]).toMatchObject({ castsShadow: false, source: bulb.source });
    expect("localShadowSlot" in shaded[2]!).toBe(false);
  });

  it("u_lightData: z gates only the sun, right.w carries tile + 1", () => {
    const packed = LightUniforms.pack(forwardShadedLights(lights, local));
    const z = (i: number) => packed.data[i * 24 + 14];
    const slot = (i: number) => packed.data[i * 24 + 19];
    expect([z(0), z(1), z(2), z(3)]).toEqual([1, 0, 0, 0]);
    expect([slot(0), slot(1), slot(2), slot(3)]).toEqual([0, 1, 0, 0]);
    // Outside a bridge frame the packing is unchanged (right.w = 0).
    const plain = LightUniforms.pack(lights);
    expect([0, 1, 2, 3].map((i) => plain.data[i * 24 + 19])).toEqual([0, 0, 0, 0]);
    expect([0, 1, 2, 3].map((i) => plain.data[i * 24 + 14])).toEqual([1, 1, 1, 0]);
  });

  it("the clustered light texture carries the same right.w", () => {
    const clustered = createClusteredForwardLighting(forwardShadedLights(lights, local), 64, 64);
    const data = clustered.lightData.texture!.mipLevels[0]!.data as Float32Array;
    expect(data[1 * 24 + 19]).toBe(1);
    expect(data[1 * 24 + 14]).toBe(0);
    expect(data[0 * 24 + 14]).toBe(1);
    clustered.dispose();
  });

  it("program features: one localShadows variant when a tile is bound, none otherwise", () => {
    const shadowMap = (localShadows?: ForwardLocalShadowOptions) => ({
      texture: new TextureBinding({ name: "u_shadowMapTexture", required: false }),
      lightMatrix: identityMat4(),
      ...(localShadows ? { localShadows } : {})
    }) as ForwardShadowMapOptions;
    expect(forwardPassFeatureAxes({ lights, shadowMap: shadowMap(local) }, false).shadows.localShadows).toBe(MAX_FORWARD_LOCAL_SHADOW_TILES);
    expect(forwardPassFeatureAxes({ lights, shadowMap: shadowMap(localOptions(new Map())) }, false).shadows.localShadows).toBe(0);
    expect(forwardPassFeatureAxes({ lights, shadowMap: shadowMap() }, false).shadows.localShadows).toBe(0);
  });

  it("binds the atlas only to programs that declare it; receiveShadow false binds strength 0", () => {
    setRendererQrFlags(FLAGS_ON);
    const shader = (names: readonly string[]) => ({ reflection: { uniforms: new Map(names.map((n) => [n, {}])) } }) as unknown as RenderShaderProgram;
    const item = { label: "pitch" } as RenderItem;
    const none = new Map<string, UniformValue>();
    applyForwardLocalShadowUniforms(local, item, shader(["u_shadowMapTexture"]), none);
    expect(none.size).toBe(0);
    const bound = new Map<string, UniformValue>();
    applyForwardLocalShadowUniforms(local, item, shader(["u_localShadowAtlas"]), bound);
    expect(bound.get("u_localShadowAtlas")).toBe(local.texture);
    expect(bound.get("u_localShadowParams")).toEqual([1, 1, 0.5, 1]);
    expect(bound.get("u_localShadowAtlasTexel")).toEqual([1 / 1024, 1 / 1024]);
    const optedOut = new Map<string, UniformValue>();
    applyForwardLocalShadowUniforms(local, { ...item, receiveShadow: false } as RenderItem, shader(["u_localShadowAtlas"]), optedOut);
    expect((optedOut.get("u_localShadowParams") as number[])[0]).toBe(0);
  });
});

const GEN_FLAGS = resolveQrFlags({ options: { A3D_QR_CORE: true, A3D_QR_LIGHTING: true } });
const ONE_DIR_TWO_SPOTS = { dir: 1, point: 0, spot: 2, rect: 0, clustered: false, hemisphere: false } as const;
const CLUSTERED = { dir: 2, point: 8, spot: 8, rect: 0, clustered: true, hemisphere: false } as const;
const LOCAL = { cascades: 2, pcfTaps: 4, localShadows: MAX_FORWARD_LOCAL_SHADOW_TILES, contact: false } as const;
const SUN_ONLY = { cascades: 2, pcfTaps: 4, localShadows: 0, contact: false } as const;

function gen(partial: Partial<ProgramFeatures>) {
  return generateProgramImpl(normalizeProgramFeatures(partial), { flags: GEN_FLAGS });
}

const glslDir = mkdtempSync(join(tmpdir(), "a3d-eint-local-shadow-"));
afterAll(() => rmSync(glslDir, { recursive: true, force: true }));
const glslang = spawnSync("glslangValidator", ["--version"], { encoding: "utf8" }).error ? null : "glslangValidator";

function validate(name: string, fragment: string): string {
  const file = join(glslDir, `${name}.frag`);
  writeFileSync(file, fragment);
  const run = spawnSync("glslangValidator", ["-S", "frag", file], { encoding: "utf8" });
  return run.status === 0 ? "" : `${run.stdout}${run.stderr}`;
}

describe("GU47 eint EB-3: the generated program samples the tiles", () => {
  it("a localShadows draw declares the atlas and scales each light by its tile", () => {
    const fragment = gen({ lighting: "lit", lights: ONE_DIR_TWO_SPOTS, shadows: LOCAL }).fragment;
    for (const name of ["u_localShadowAtlas", "u_localShadowMatrices", "u_localShadowRects", "u_localShadowTexelScale", "u_localShadowParams"]) {
      expect(fragment).toContain(name);
    }
    expect(fragment).toContain("radiance *= a3dLocalLightShadow(u_lightData[i * 6 + 2].w, u_lightData[i * 6 + 4].w, u_lightData[i * 6 + 1].xyz, v_worldPosition, N, L);");
    expect(fragment.indexOf("a3dForwardLightShadow(u_lightData")).toBeLessThan(fragment.indexOf("a3dLocalLightShadow(u_lightData"));
  });

  it("sun-only and unshadowed draws are unchanged", () => {
    expect(gen({ lighting: "lit", lights: ONE_DIR_TWO_SPOTS, shadows: SUN_ONLY }).fragment).not.toContain("a3dLocalLightShadow");
    expect(gen({ lighting: "lit", lights: ONE_DIR_TWO_SPOTS, shadows: { ...LOCAL, cascades: 0 } }).fragment).not.toContain("u_localShadowAtlas");
    expect(gen({ pass: "depth", shadows: LOCAL }).fragment).not.toContain("a3dLocalLightShadow");
  });

  it("the clustered loop reads the slot from the cluster texture", () => {
    expect(gen({ lighting: "lit", lights: CLUSTERED, shadows: LOCAL }).fragment).toContain("texelFetch(u_clusterLightData, ivec2(4, lightIndex), 0).w");
  });

  it.runIf(glslang !== null).each([
    ["bucketed", ONE_DIR_TWO_SPOTS],
    ["clustered", CLUSTERED]
  ] as const)("%s local-shadow fragment compiles (glslangValidator)", (name, lights) => {
    expect(validate(`local-${name}`, gen({ lighting: "lit", lights, shadows: LOCAL }).fragment)).toBe("");
  });
});

describe("GU47 eint EB-3: a Renderer frame (mock device, generated programs)", () => {
  it("the lit draws bind the atlas and pack the floodlights' tiles; the sun keeps the forward map", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 160, height: 90, qrFlags: GEN_FLAGS });
    try {
      const material = new PBRMaterial({ name: "pitch" });
      const items = [
        { geometry: Geometry.litPlane(), material, modelMatrix: Float32Array.from([40, 0, 0, 0, 0, 1, 0, 0, 0, 0, 40, 0, 0, 0, 0, 1]), label: "pitch", castShadow: false, receiveShadow: true },
        { geometry: Geometry.litCube(1), material, modelMatrix: Float32Array.from(identityMat4()), label: "player", castShadow: true, receiveShadow: true }
      ] as unknown as RenderItem[];
      const cam = camera();
      renderer.render({ ...(source([sun, flood0, flood1]) as object), renderItems: items } as never, { viewProjectionMatrix: cam.viewProjectionMatrix } as never);
      const draws = (renderer.device as unknown as { drawCommands: DrawCommand[] }).drawCommands;
      const lit = draws.filter((draw) => (draw.uniforms as ReadonlyMap<string, unknown> | undefined)?.has("u_localShadowAtlas"));
      expect(lit.length, draws.map((d) => d.label).join(",")).toBeGreaterThan(0);
      for (const draw of lit) {
        const uniforms = draw.uniforms as ReadonlyMap<string, unknown>;
        expect((uniforms.get("u_localShadowAtlas") as TextureBinding).texture).toBeDefined();
        const data = uniforms.get("u_lightData") as Float32Array;
        expect([data[14], data[24 + 14], data[48 + 14]]).toEqual([1, 0, 0]);
        expect([data[19], data[24 + 19], data[48 + 19]]).toEqual([0, 1, 2]);
      }
    } finally {
      renderer.dispose();
    }
  });

  it("a sun-only scene (no local caster) binds no local uniforms and packs the lights as before", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 160, height: 90, qrFlags: GEN_FLAGS });
    try {
      const material = new PBRMaterial({ name: "pitch" });
      const items = [
        { geometry: Geometry.litPlane(), material, modelMatrix: Float32Array.from([40, 0, 0, 0, 0, 1, 0, 0, 0, 0, 40, 0, 0, 0, 0, 1]), label: "pitch", castShadow: false, receiveShadow: true },
        { geometry: Geometry.litCube(1), material, modelMatrix: Float32Array.from(identityMat4()), label: "player", castShadow: true, receiveShadow: true }
      ] as unknown as RenderItem[];
      const cam = camera();
      const lights = [sun, unshadowedFlood];
      renderer.render({ ...(source(lights) as object), renderItems: items } as never, { viewProjectionMatrix: cam.viewProjectionMatrix } as never);
      const draws = (renderer.device as unknown as { drawCommands: DrawCommand[] }).drawCommands;
      const withLights = draws.filter((draw) => (draw.uniforms as ReadonlyMap<string, unknown> | undefined)?.has("u_lightData"));
      expect(withLights.length).toBeGreaterThan(0);
      const expected = LightUniforms.pack(lights).data;
      for (const draw of draws) {
        const uniforms = draw.uniforms as ReadonlyMap<string, unknown> | undefined;
        expect([...(uniforms?.keys() ?? [])].some((name) => name.startsWith("u_localShadow"))).toBe(false);
      }
      for (const draw of withLights) {
        expect([...((draw.uniforms as ReadonlyMap<string, unknown>).get("u_lightData") as Float32Array)]).toEqual([...expected]);
      }
    } finally {
      renderer.dispose();
    }
  });
});
