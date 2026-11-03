import { describe, expect, it } from "vitest";
import "../../../packages/engine/src/lanes/prd02";
import { lights } from "../../../packages/engine/src/agent-api/nodes/lights";
import { group } from "../../../packages/engine/src/agent-api/nodes/groups";
import type { AuraLightNode, AuraSceneNode, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import type { AuraPhotometricProfile } from "../../../packages/engine/src/contracts/lighting";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { flattenNodesWithLineWorldMatrices } from "../../../packages/engine/src/agent-api/compiler/sceneGraph";
import { flattenTaggingMountedRoots } from "../../../packages/engine/src/agent-api/compiler/mountedRoots";
import { realCompilerImpl, asRuntimeImpl, type MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { createProductionRuntimeCollectedLights, createRuntimeAddedCollectedLights } from "../../../packages/engine/src/agent-api/compiler/observations";
import { queueRuntimeLightPatch } from "../../../packages/engine/src/agent-api/compiler/lights";
import { LightUniforms } from "../../../packages/rendering/src/LightUniforms";
import { buildPhotometricProfileBindings } from "../../../packages/rendering/src/lighting/PhotometricProfileBindings";

const paths = [
  { name: "legacy", flags: resolveQrFlags({ options: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: false } }) },
  { name: "physical", flags: resolveQrFlags({ options: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true } }) }
] as const;

function fixture() {
  const source = {
    profile: {
      format: "ies-lm63", photometricType: "C", symmetry: "quadrant",
      verticalAngles: [0, 90, 180], horizontalAngles: [0, 90],
      candela: [10, 20, 30, 40, 50, 60]
    },
    scale: 2,
    rotation: 0.25
  };
  return { source, profile: source as unknown as AuraPhotometricProfile };
}

function snapshot(nodes: readonly AuraSceneNode[]): AuraSceneSnapshot {
  return {
    schema: "aura3d-scene-snapshot/1.0",
    background: "#000000",
    camera: { mode: "orbit", position: [0, 2, 5], target: [0, 0, 0] },
    nodes,
    diagnostics: { enabled: false }
  } as AuraSceneSnapshot;
}

async function mount(authored: AuraSceneSnapshot, flags: (typeof paths)[number]["flags"]) {
  // Match app initialization: render nodes are flattened, while the registry
  // also receives the original tree to retain parent links and visibility.
  const render = { ...authored, nodes: flattenTaggingMountedRoots(authored.nodes, flattenNodesWithLineWorldMatrices) };
  const registry = createAuraRuntimeNodeRegistry(render, { flags }, authored);
  const collected = createProductionRuntimeCollectedLights(render, flags, { hemisphereAsEnvironment: true });
  const ctx = {
    renderer: undefined,
    assets: undefined,
    quality: { tier: "high" },
    strict: false,
    flags,
    degrade: () => undefined,
    canvas: { width: 64, height: 64 } as HTMLCanvasElement,
    environmentLighting: () => ({ color: [1, 1, 1], intensity: 0 }),
    collectedLights: collected,
    runtimeWarnings: new Set<string>(),
    runtimeNodes: registry
  } as unknown as MountSceneCompileContext;
  const compiled = await realCompilerImpl.compile(render, ctx);
  registry.attachCompiled(compiled);
  return {
    ctx, registry, compiled,
    frame: (time: number) => realCompilerImpl.update(compiled, render, registry, time),
    dispose: () => { compiled.dispose(); registry.dispose(); }
  };
}

describe("punctual profile metadata propagation", () => {
  for (const path of paths) {
    for (const kind of ["point", "spot"] as const) {
      it(`${kind} snapshots the distribution during ${path.name} mount and runtime addition`, () => {
        const { source, profile } = fixture();
        const options = { name: "lamp", intensity: 0, photometricProfile: profile };
        const node = (kind === "point" ? lights.point(options) : lights.spot(options)).toJSON();
        const collected = createProductionRuntimeCollectedLights(snapshot([node]), path.flags);
        const added = createRuntimeAddedCollectedLights([node], path.flags);
        expect(collected).toHaveLength(1);
        expect(added).toHaveLength(1);
        const light = collected[0]!;
        const profileCopy = light.photometricProfile!;
        expect(profileCopy).toEqual({ profile: source.profile, scale: 2, rotation: 0.25 });
        expect(added[0]!.lights[0]!.photometricProfile).toEqual(profileCopy);
        expect(profileCopy.profile.candela).not.toBe(source.profile.candela);
        expect(Object.isFrozen(profileCopy)).toBe(true);
        expect(Object.isFrozen(profileCopy.profile)).toBe(true);
        expect(Object.isFrozen(profileCopy.profile.candela)).toBe(true);
        expect(Object.keys(light)).toContain("photometricProfile");
        expect(light.photometricDimmer).toBe(1);
        expect(light.photometricVisible).toBeUndefined();
        expect(light.intensity).toBe(0);
        source.profile.candela[0] = 999;
        source.profile.verticalAngles[1] = 45;
        source.scale = 7;
        expect(profileCopy.profile.candela[0]).toBe(10);
        expect(profileCopy.profile.verticalAngles[1]).toBe(90);
        expect(profileCopy.scale).toBe(2);
      });
    }

    it(`revalidates caller mutations before ${path.name} mount and runtime addition`, () => {
      const { source, profile } = fixture();
      const node = lights.spot({ photometricProfile: profile }).toJSON();
      source.profile.candela[2] = Number.NaN;
      expect(() => createProductionRuntimeCollectedLights(snapshot([node]), path.flags)).toThrow(/photometricProfile/);
      expect(() => createRuntimeAddedCollectedLights([node], path.flags)).toThrow(/photometricProfile/);
    });

    it(`tracks an anonymous nested light and parent-only visibility in the ${path.name} compiled path`, async () => {
      const { profile } = fixture();
      const lightNode = lights.spot({ name: "anonymous", intensity: 0, position: [1, 2, 0], target: [0, 0, 0], photometricProfile: profile }).toJSON();
      const plain = lights.point({ name: "plain", intensity: 5 }).runtime({ id: "plain" }).toJSON();
      const parent = group("parent", [lightNode, plain], { position: [3, 0, 0] }).runtime({ id: "parent" }).toJSON();
      const mounted = await mount(snapshot([parent]), path.flags);
      const light = mounted.ctx.collectedLights.find((entry) => entry.source.name === "anonymous")!;
      const other = mounted.ctx.collectedLights.find((entry) => entry.source.name === "plain")!;
      expect(light.photometricVisible).toBe(true);
      expect(light.photometricDimmer).toBe(1);
      expect(light.intensity).toBe(0);
      expect(mounted.registry.ids()).toEqual(expect.arrayContaining(["parent", "plain"]));
      expect(mounted.registry.ids().some((id) => id.startsWith("__aura_anonymous_"))).toBe(false);
      const oldPosition = [...light.position];
      const oldOtherPosition = [...other.position];

      mounted.registry.require("parent").setVisible(false);
      mounted.frame(1000);
      expect(light.photometricVisible).toBe(false);
      expect(light.photometricDimmer).toBe(1);
      expect(other.intensity).toBe(5);
      mounted.registry.require("parent").setVisible(true);
      mounted.registry.require("parent").setPosition(5, 0, 0);
      mounted.frame(2000);
      expect(light.photometricVisible).toBe(true);
      expect(light.position[0]).toBeCloseTo(oldPosition[0]! + 2);
      expect(other.position).toEqual(oldOtherPosition);
      mounted.dispose();
    });

    it(`updates an explicitly identified profile light in the ${path.name} compiled path without treating scalar intensity as its dimmer`, async () => {
      const { profile } = fixture();
      const lightNode = lights.point({ name: "profiled", intensity: 0, position: [1, 2, 3], target: [4, 6, 3], photometricProfile: profile }).runtime({ id: "profiled" }).toJSON();
      const mounted = await mount(snapshot([lightNode]), path.flags);
      const light = mounted.ctx.collectedLights[0]!;
      const handle = mounted.registry.require("profiled");
      const retainedProfile = light.photometricProfile;
      expect(light.photometricVisible).toBe(true);
      expect(light.intensity).toBe(0);
      const zeroScalarPacket = buildPhotometricProfileBindings(mounted.ctx.collectedLights, LightUniforms.packWithSelection(mounted.ctx.collectedLights));
      expect(zeroScalarPacket.status).toBe("ready");
      if (zeroScalarPacket.status !== "ready") throw new Error("Expected a profile packet");
      expect(zeroScalarPacket.meta[2]).toBe(2);
      zeroScalarPacket.dispose();
      queueRuntimeLightPatch(handle, { intensity: 4 });
      handle.setPosition(4, 3, 3);
      mounted.frame(1000);
      expect(light.position).toEqual([4, 3, 3]);
      expect(light.direction[1]).toBeCloseTo(1);
      expect(light.intensity).toBe(4);
      expect(light.photometricDimmer).toBe(1);
      expect(light.photometricProfile).toBe(retainedProfile);
      handle.setVisible(false);
      mounted.frame(2000);
      expect(light.photometricVisible).toBe(false);
      expect(light.intensity).toBe(0);
      const hiddenPacket = buildPhotometricProfileBindings(mounted.ctx.collectedLights, LightUniforms.packWithSelection(mounted.ctx.collectedLights));
      expect(hiddenPacket.status).toBe("ready");
      if (hiddenPacket.status !== "ready") throw new Error("Expected a hidden profile packet");
      expect(hiddenPacket.meta[2]).toBe(0);
      hiddenPacket.dispose();
      handle.setVisible(true);
      mounted.frame(3000);
      expect(light.photometricVisible).toBe(true);
      expect(light.intensity).toBe(4);
      expect(light.photometricDimmer).toBe(1);
      mounted.dispose();
    });

    it(`rejects a mutated runtime-added profile before publishing a ${path.name} subtree`, async () => {
      const mounted = await mount(snapshot([]), path.flags);
      const { source, profile } = fixture();
      const node = lights.point({ name: "bad", photometricProfile: profile }).runtime({ id: "bad" }).toJSON();
      source.profile.verticalAngles[1] = source.profile.verticalAngles[0]!;
      const impl = asRuntimeImpl(mounted.compiled)!;
      const before = [...impl.liveNodes];
      expect(() => mounted.registry.add(node)).toThrow(/photometricProfile/);
      expect(impl.liveNodes).toEqual(before);
      expect(mounted.registry.has("bad")).toBe(false);
      mounted.dispose();
    });

    it(`uses the live world pose for a ${path.name} profile added under a rotated and hidden mounted parent`, async () => {
      const { profile } = fixture();
      const parent = group("parent", [], { position: [3, 0, 0], rotation: [0, Math.PI / 2, 0] }).runtime({ id: "parent" }).toJSON();
      const mounted = await mount(snapshot([parent]), path.flags);
      mounted.registry.require("parent").setVisible(false);
      mounted.registry.add(lights.spot({ name: "late", position: [1, 2, 0], target: [0, 0, 0], intensity: 4, photometricProfile: profile }).runtime({ id: "late" }), { parent: "parent" });
      const light = mounted.ctx.collectedLights.find((entry) => entry.source.name === "late")!;
      expect(light.photometricVisible).toBeUndefined();
      mounted.frame(1000);
      expect(light.photometricVisible).toBe(false);
      expect(light.position[0]).toBeCloseTo(3);
      expect(light.position[1]).toBeCloseTo(2);
      expect(light.position[2]).toBeCloseTo(-1);
      mounted.registry.require("parent").setVisible(true);
      mounted.registry.require("parent").setPosition(5, 0, 0);
      mounted.frame(2000);
      expect(light.photometricVisible).toBe(true);
      expect(light.position[0]).toBeCloseTo(5);
      expect(light.position[1]).toBeCloseTo(2);
      expect(light.position[2]).toBeCloseTo(-1);
      expect(mounted.registry.remove("late")).toBe(true);
      expect(mounted.ctx.collectedLights).not.toContain(light);
      mounted.dispose();
    });

    it(`fails closed when the ${path.name} scene reuses one profile node in multiple groups`, async () => {
      const { profile } = fixture();
      const shared = lights.point({ photometricProfile: profile }).toJSON();
      const first = group("first", [shared], { position: [1, 0, 0] }).runtime({ id: "first" }).toJSON();
      const second = group("second", [shared], { position: [2, 0, 0] }).runtime({ id: "second" }).toJSON();
      const mounted = await mount(snapshot([first, second]), path.flags);
      expect(mounted.ctx.collectedLights).toHaveLength(2);
      expect(mounted.ctx.collectedLights.every((light) => light.photometricVisible === undefined)).toBe(true);
      const packet = buildPhotometricProfileBindings(mounted.ctx.collectedLights, LightUniforms.packWithSelection(mounted.ctx.collectedLights));
      expect(packet).toMatchObject({ status: "unsupported", reason: "visibility-unavailable" });
      mounted.dispose();
    });
  }
});
