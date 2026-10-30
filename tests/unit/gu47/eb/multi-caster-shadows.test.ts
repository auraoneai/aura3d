/**
 * GU47 E-B (WP-2): multi-caster shadows. `resolveProductionShadowCasterIndices` keeps the single N1 caster (one-caster
 * scenes unchanged) and adds explicitly shadowed spot / point lights up to the tier's `localShadowLights`
 * (low 0, medium 1, high 2, ultra 4). A 4-spot stadium at High reports 2 sampled spot shadow rows from the PRD-02
 * shadow pass, and `setVisible(false)` on a shadowed spot removes its row.
 */
import { describe, expect, it } from "vitest";
import "@aura3d/engine";
import "../../../../packages/engine/src/lanes/prd02";
import "../../../../packages/rendering/src/lanes/prd02";
import { compileScene, updateCompiledScene } from "@aura3d/engine/contracts";
import type { MountSceneCompileContext } from "../../../../packages/engine/src/agent-api/compiler/compileScene";
import {
  createProductionRuntimeCollectedLights,
  resolveProductionShadowCasterIndex,
  resolveProductionShadowCasterIndices
} from "../../../../packages/engine/src/agent-api/compiler/observations";
import { createAuraRuntimeNodeRegistry } from "../../../../packages/engine/src/agent-api/app/runtimeNodes";
import { Prd02LightingRuntime } from "../../../../packages/engine/src/lanes/prd02";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { UnlitMaterial } from "../../../../packages/rendering/src/UnlitMaterial";
import { createPrd02ShadowsContributor, prd02ShadowDiagnostics } from "../../../../packages/rendering/src/lanes/prd02";
import type { FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import type { RenderItem } from "../../../../packages/rendering/src/contracts/renderItem";
import type { AuraSceneSnapshot } from "../../../../packages/engine/src/agent-api/nodes/types";
import type { CollectedLight } from "@aura3d/rendering";
import { PerspectiveCamera, identityMat4 } from "@aura3d/scene";

const FLAGS = resolveQrFlags({ options: ["compiler", "lighting"] });

type Desc = { kind: string; shadowPriority: number; shadowRequested: boolean; shadowDisabled?: boolean; intensity: number };
const sun = (requested = true, intensity = 3): Desc => ({ kind: "directional", shadowPriority: 3, shadowRequested: requested, intensity });
const spot = (requested = true, intensity = 30, disabled = false): Desc => ({ kind: "spot", shadowPriority: 2, shadowRequested: requested, shadowDisabled: disabled, intensity });
const point = (requested = true, intensity = 8): Desc => ({ kind: "point", shadowPriority: 1, shadowRequested: requested, intensity });

describe("GU47 E-B resolveProductionShadowCasterIndices", () => {
  it("one-caster scenes keep exactly the N1 caster", () => {
    for (const scene of [[sun()], [spot()], [sun(false), spot(false)], [sun(), spot(false), point(false)], [spot(), sun(false)]]) {
      const single = resolveProductionShadowCasterIndex(scene);
      expect(resolveProductionShadowCasterIndices(scene, 4)).toEqual(single < 0 ? [] : [single]);
    }
    // An authored `shadow: false` with no explicit request is the scene-level opt-out (N1 returns -1).
    expect(resolveProductionShadowCasterIndices([sun(false), spot(false, 30, true)], 4)).toEqual([]);
  });

  it("sun plus the tier's local casters (low 0 / medium 1 / high 2 / ultra 4)", () => {
    const stadium = [spot(true, 20), spot(true, 50), sun(), spot(true, 40), spot(true, 30)];
    expect(resolveProductionShadowCasterIndices(stadium, QUALITY_TIERS.low.shadow.localShadowLights)).toEqual([2]);
    expect(resolveProductionShadowCasterIndices(stadium, QUALITY_TIERS.medium.shadow.localShadowLights)).toEqual([1, 2]);
    expect(resolveProductionShadowCasterIndices(stadium, QUALITY_TIERS.high.shadow.localShadowLights)).toEqual([1, 2, 3]);
    expect(resolveProductionShadowCasterIndices(stadium, QUALITY_TIERS.ultra.shadow.localShadowLights)).toEqual([0, 1, 2, 3, 4]);
  });

  it("without a requested sun the N1 spot keeps its slot and counts toward the cap", () => {
    const spots = [spot(true, 10), spot(true, 40), spot(true, 30), point(true)];
    expect(resolveProductionShadowCasterIndices(spots, 0)).toEqual([1]);
    expect(resolveProductionShadowCasterIndices(spots, 2)).toEqual([1, 2]);
    expect(resolveProductionShadowCasterIndices(spots, 4)).toEqual([0, 1, 2, 3]);
  });

  it("never adds unrequested, disabled or second directional lights", () => {
    const scene = [sun(), sun(true, 1), spot(false), spot(true, 9, true), point(true)];
    expect(resolveProductionShadowCasterIndices(scene, 4)).toEqual([0, 4]);
  });
});

const STADIUM_SPOTS = [
  { position: [-8, 10, -8], intensity: 60 },
  { position: [8, 10, -8], intensity: 55 },
  { position: [-8, 10, 8], intensity: 50 },
  { position: [8, 10, 8], intensity: 45 }
].map((spec, index) => ({
  kind: "light",
  light: "spot",
  name: `floodlight-${index}`,
  position: spec.position,
  lookAt: [0, 0, 0],
  angle: 0.6,
  distance: 30,
  intensity: spec.intensity,
  color: "#ffffff",
  shadow: true,
  runtime: { id: `floodlight-${index}` }
}));

function stadiumSnapshot(): AuraSceneSnapshot {
  return {
    schema: "aura3d-scene-snapshot/1.0",
    background: "#000000",
    camera: { mode: "orbit", position: [0, 12, 24], target: [0, 0, 0] },
    diagnostics: { enabled: false },
    nodes: [
      { kind: "primitive", primitive: "box", name: "pitch", size: 1 },
      { kind: "light", light: "directional", name: "sun", position: [6, 12, 4], intensity: 2, color: "#ffffff", shadow: true },
      ...structuredClone(STADIUM_SPOTS)
    ]
  } as unknown as AuraSceneSnapshot;
}

/** A receiver whose program declares the PRD-02 lookup chunk, so the `prd02.shadows` pass renders sun + local tiles. */
function lookupReceiver(): RenderItem {
  const material = new UnlitMaterial({ name: "lookup-receiver" });
  Object.defineProperty(material, "requiredUniforms", { value: ["u_prd02CascadeCompare0"] });
  return { geometry: Geometry.triangle(), modelMatrix: identityMat4(), label: "pitch", material } as unknown as RenderItem;
}

function camera() {
  const cam = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 1, near: 0.5, far: 80 });
  cam.transform.setPosition(0, 12, 24);
  cam.updateCameraMatrices();
  return { viewProjectionMatrix: cam.viewProjectionMatrix, near: cam.near, far: cam.far };
}

/** Run the `prd02.shadows` frame pass over a frame's collected lights; returns the observed shadow rows. */
function shadowRows(lights: readonly CollectedLight[]): readonly { readonly light: string; readonly sampled: boolean }[] {
  const device = new MockRenderDevice();
  device.beginFrame(512, 512);
  const blackboard = new Map<string, unknown>();
  const ctx = {
    device,
    items: [lookupReceiver()],
    source: { collectedLights: lights },
    camera: camera(),
    flags: FLAGS,
    tier: QUALITY_TIERS.high,
    blackboard: { get: (key: string) => blackboard.get(key), set: (key: string, value: unknown) => blackboard.set(key, value) }
  } as unknown as FrameContributorContext;
  const passes = createPrd02ShadowsContributor().passes!("shadows", ctx) as readonly { execute(context: unknown): void }[];
  expect(passes).toHaveLength(1);
  passes[0]!.execute({});
  device.endFrame();
  return prd02ShadowDiagnostics()?.shadows ?? [];
}

describe("GU47 E-B a 4-spot stadium at High", () => {
  it("selects the sun plus 2 spots and reports 2 sampled spot shadow rows", () => {
    const lights = createProductionRuntimeCollectedLights(stadiumSnapshot(), FLAGS, { hemisphereAsEnvironment: true, shadowTier: "high" });
    expect(lights.filter((light) => light.castsShadow).map((light) => light.source.name)).toEqual(["sun", "floodlight-0", "floodlight-1"]);
    const rows = shadowRows(lights);
    expect(rows.map((row) => row.light)).toEqual(["sun", "local-0", "local-1"]);
    expect(rows.filter((row) => row.light.startsWith("local-") && row.sampled)).toHaveLength(2);
  });

  it("Low keeps the sun only; Ultra takes all four floodlights", () => {
    const low = createProductionRuntimeCollectedLights(stadiumSnapshot(), FLAGS, { shadowTier: "low" });
    expect(low.filter((light) => light.castsShadow).map((light) => light.source.name)).toEqual(["sun"]);
    const ultra = createProductionRuntimeCollectedLights(stadiumSnapshot(), FLAGS, { shadowTier: "ultra" });
    expect(ultra.filter((light) => light.castsShadow)).toHaveLength(5);
  });

  it("setVisible(false) on a shadowed floodlight removes its row and its count", async () => {
    const snapshot = stadiumSnapshot();
    const lights = createProductionRuntimeCollectedLights(snapshot, FLAGS, { hemisphereAsEnvironment: true, shadowTier: "high" });
    const registry = createAuraRuntimeNodeRegistry(snapshot, { flags: FLAGS });
    const ctx: MountSceneCompileContext = {
      renderer: { device: new MockRenderDevice() } as MountSceneCompileContext["renderer"],
      assets: undefined,
      quality: { tier: "high" } as MountSceneCompileContext["quality"],
      strict: false,
      flags: FLAGS,
      degrade: () => undefined,
      canvas: { width: 800, height: 600 } as unknown as HTMLCanvasElement,
      environmentLighting: () => ({ color: [1, 1, 1], intensity: 0, environmentMapIntensity: 0, environmentMapSpecularIntensity: 0 }),
      collectedLights: lights,
      runtimeWarnings: new Set<string>(),
      runtimeNodes: registry
    };
    const compiled = await compileScene(snapshot, ctx);
    const frame = (t: number) => [...((updateCompiledScene(compiled, snapshot, registry, t) as { collectedLights?: Iterable<CollectedLight> }).collectedLights ?? [])];
    const runtime = new Prd02LightingRuntime(FLAGS, registry);
    expect(shadowRows(frame(0)).map((row) => row.light)).toEqual(["sun", "local-0", "local-1"]);
    expect(runtime.diagnostics().localShadowLights).toBe(2);
    registry.require("floodlight-1").setVisible(false);
    expect(shadowRows(frame(1 / 60)).map((row) => row.light)).toEqual(["sun", "local-0"]);
    expect(runtime.diagnostics().localShadowLights).toBe(1);
    expect(runtime.diagnostics().punctualLights).toBe(4);
    compiled.dispose();
  });
});
