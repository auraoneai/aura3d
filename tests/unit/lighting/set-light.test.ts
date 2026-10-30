/**
 * GU47 E-B (WP-2): runtime light control. `handle.setLight(patch, { transitionSeconds })` blends per frame, every light
 * node follows its handle's per-frame `setPosition`, and `setVisible(false)` removes the light and its shadow caster.
 * Before this, the mounted scene shaded with the light list built once at mount; only TransientLightPool lights moved.
 */
import { describe, expect, it } from "vitest";
import "@aura3d/engine";
import "../../../packages/engine/src/lanes/prd02";
import { compileScene, updateCompiledScene } from "@aura3d/engine/contracts";
import type { MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { createProductionRuntimeCollectedLights } from "../../../packages/engine/src/agent-api/compiler/observations";
import {
  evaluateLightChannel,
  lightPowerToIntensity,
  queueRuntimeLightPatch,
  runtimeLightStats,
  updateRuntimeLight
} from "../../../packages/engine/src/agent-api/compiler/lights";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { Prd02LightingRuntime } from "../../../packages/engine/src/lanes/prd02";
import { groups } from "../../../packages/engine/src/agent-api/nodes/groups";
import { collectShadowSystemLights } from "../../../packages/rendering/src/shadows/Prd02ShadowsContributor";
import type { AuraLightNode, AuraRuntimeNodeHandle, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import type { CollectedLight } from "@aura3d/rendering";
import type { FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";

const FLAGS = resolveQrFlags({ options: ["compiler", "lighting"] });

function snapshotWith(nodes: readonly unknown[]): AuraSceneSnapshot {
  return {
    schema: "aura3d-scene-snapshot/1.0",
    background: "#000000",
    camera: { mode: "orbit", position: [0, 4, 9], target: [0, 0, 0] },
    diagnostics: { enabled: false },
    nodes: [{ kind: "primitive", primitive: "box", name: "floor", size: 1 }, ...nodes]
  } as unknown as AuraSceneSnapshot;
}

const SUN = { kind: "light", light: "directional", name: "sun", position: [4, 8, 4], intensity: 2, color: "#ffffff", runtime: { id: "sun" } };
const LAMP = { kind: "light", light: "point", name: "lamp", position: [1, 2, 0], intensity: 8, distance: 6, color: "#ffffff", runtime: { id: "lamp" } };
const SPOT = { kind: "light", light: "spot", name: "spot", position: [0, 5, 0], lookAt: [0, 0, 0], angle: 0.5, intensity: 40, distance: 12, color: "#ffffff", shadow: true, runtime: { id: "spot" } };
const AMBIENT = { kind: "light", light: "ambient", name: "amb", intensity: 0.4, color: "#ffffff", runtime: { id: "amb" } };

interface Mounted {
  readonly snapshot: AuraSceneSnapshot;
  readonly lights: readonly CollectedLight[];
  readonly nodes: ReturnType<typeof createAuraRuntimeNodeRegistry>;
  readonly frame: (t: number) => readonly CollectedLight[];
  readonly dispose: () => void;
}

/** The mount + per-frame path `compiler/renderer.ts` runs: mount-time collected lights, compiled update each frame. */
async function mount(nodes: readonly unknown[]): Promise<Mounted> {
  // Handles mutate the snapshot's node objects, so every mount gets its own copies.
  const snapshot = snapshotWith(structuredClone(nodes));
  const lights = createProductionRuntimeCollectedLights(snapshot, FLAGS, { hemisphereAsEnvironment: true });
  const registry = createAuraRuntimeNodeRegistry(snapshot, { flags: FLAGS });
  const { MockRenderDevice } = await import("../../../packages/rendering/src/RenderDevice");
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
  return {
    snapshot,
    lights,
    nodes: registry,
    frame: (t) => [...((updateCompiledScene(compiled, snapshot, registry, t) as { collectedLights?: Iterable<CollectedLight> }).collectedLights ?? [])],
    dispose: () => compiled.dispose()
  };
}

const named = (lights: readonly CollectedLight[], name: string): CollectedLight => {
  const light = lights.find((candidate) => candidate.source?.name === name);
  if (!light) throw new Error(`no collected light ${name}`);
  return light;
};

function handle(mounted: Mounted, id: string): AuraRuntimeNodeHandle {
  return mounted.nodes.require(id);
}

describe("GU47 E-B setLight blend math", () => {
  it("a channel blends linearly from the value shown when it starts", () => {
    const channel = { from: undefined as number | undefined, to: 10, seconds: 2, t0: undefined as number | undefined };
    const mix = (a: number, b: number, t: number) => a + (b - a) * t;
    expect(evaluateLightChannel(channel, 5, 2, mix)).toBe(2);
    expect(evaluateLightChannel(channel, 6, 99, mix)).toBe(6);
    expect(evaluateLightChannel(channel, 6.5, 99, mix)).toBe(8);
    expect(evaluateLightChannel(channel, 7, 99, mix)).toBe(10);
    expect(evaluateLightChannel(channel, 30, 99, mix)).toBe(10);
    const instant = { from: undefined as number | undefined, to: 3, seconds: 0, t0: undefined as number | undefined };
    expect(evaluateLightChannel(instant, 1, 0, mix)).toBe(3);
  });

  it("power converts with the light kind (three.js r185 units)", () => {
    expect(lightPowerToIntensity("point", 4 * Math.PI * 10)).toBeCloseTo(10);
    expect(lightPowerToIntensity("spot", Math.PI * 30)).toBeCloseTo(30);
    expect(lightPowerToIntensity("rect", Math.PI * 2 * 3 * 5, 2, 3)).toBeCloseTo(5);
    expect(lightPowerToIntensity("directional", 3)).toBe(3);
  });

  it("validates the patch at the call site", () => {
    const owner = {};
    expect(() => queueRuntimeLightPatch(owner, { intensity: -1 })).toThrow(RangeError);
    expect(() => queueRuntimeLightPatch(owner, { distance: Number.NaN })).toThrow(RangeError);
    expect(() => queueRuntimeLightPatch(owner, { direction: [0, 0, 0] })).toThrow(RangeError);
    expect(() => queueRuntimeLightPatch(owner, { position: [1, 2] as unknown as [number, number, number] })).toThrow(RangeError);
    expect(() => queueRuntimeLightPatch(owner, { intensity: 1 }, { transitionSeconds: -2 })).toThrow(RangeError);
    expect(() => queueRuntimeLightPatch(owner, { color: "not-a-colour" })).toThrow();
  });
});

describe("GU47 E-B light nodes follow their runtime handle every frame", () => {
  it("light handles expose setLight (handle extension, A3D_QR_LIGHTING)", async () => {
    const mounted = await mount([SUN, LAMP]);
    expect(typeof handle(mounted, "lamp").setLight).toBe("function");
    expect(typeof handle(mounted, "sun").setLight).toBe("function");
    mounted.dispose();
  });

  it("untouched lights keep their mount objects and values", async () => {
    const mounted = await mount([SUN, LAMP, SPOT]);
    const before = mounted.lights.map((light) => ({ position: light.position, intensity: light.intensity, color: light.color, direction: light.direction }));
    const frame = mounted.frame(0.5);
    for (const [index, light] of mounted.lights.entries()) {
      expect(frame).toContain(light);
      expect(light.position).toBe(before[index]!.position);
      expect(light.intensity).toBe(before[index]!.intensity);
      expect(light.color).toBe(before[index]!.color);
      expect(light.direction).toBe(before[index]!.direction);
    }
    mounted.dispose();
  });

  it("a point light follows setPosition every frame", async () => {
    const mounted = await mount([SUN, LAMP]);
    const lamp = handle(mounted, "lamp");
    for (let frame = 1; frame <= 4; frame += 1) {
      lamp.setPosition(frame, 2, -frame);
      const light = named(mounted.frame(frame / 60), "lamp");
      expect(light.position).toEqual([frame, 2, -frame]);
      const world = light.source.transform.worldMatrix;
      expect([world[12], world[13], world[14]]).toEqual([frame, 2, -frame]);
    }
    mounted.dispose();
  });

  it("a moved spot re-aims at its authored target; the shadow pass reads the live pose", async () => {
    const mounted = await mount([SPOT]);
    handle(mounted, "spot").setPosition(3, 4, 0);
    const lights = mounted.frame(1 / 60);
    const spot = named(lights, "spot");
    const expected = [-3 / 5, -4 / 5, 0];
    spot.direction.forEach((value, axis) => expect(value).toBeCloseTo(expected[axis]!, 6));
    const shadow = collectShadowSystemLights({ source: { collectedLights: lights } } as unknown as FrameContributorContext);
    expect(shadow.localLights).toHaveLength(1);
    expect(shadow.localLights[0]!.position).toEqual([3, 4, 0]);
    mounted.dispose();
  });

  it("setVisible(false) removes the light and its shadow caster; setVisible(true) restores both", async () => {
    const mounted = await mount([SUN, SPOT]);
    const spotHandle = handle(mounted, "spot");
    const visibleFrame = mounted.frame(0);
    expect(collectShadowSystemLights({ source: { collectedLights: visibleFrame } } as unknown as FrameContributorContext).localLights).toHaveLength(1);
    spotHandle.setVisible(false);
    const hidden = mounted.frame(1 / 60);
    const spot = named(hidden, "spot");
    expect(spot.intensity).toBe(0);
    expect(spot.source.visible).toBe(false);
    expect(collectShadowSystemLights({ source: { collectedLights: hidden } } as unknown as FrameContributorContext).localLights).toHaveLength(0);
    spotHandle.setVisible(true);
    const shown = mounted.frame(2 / 60);
    expect(named(shown, "spot").intensity).toBe(40);
    expect(named(shown, "spot").source.visible).toBe(true);
    expect(collectShadowSystemLights({ source: { collectedLights: shown } } as unknown as FrameContributorContext).localLights).toHaveLength(1);
    mounted.dispose();
  });
});

describe("GU47 E-B setLight transitions", () => {
  it("a directional colour ramp over 2 s blends in linear light, frame by frame", async () => {
    const mounted = await mount([SUN]);
    mounted.frame(0);
    handle(mounted, "sun").setLight!({ color: "#ff0000" }, { transitionSeconds: 2 });
    const red = (t: number) => named(mounted.frame(t), "sun").color;
    expect(red(1)).toEqual([1, 1, 1]);
    const mid = red(2);
    expect(mid[0]).toBeCloseTo(1, 6);
    expect(mid[1]).toBeCloseTo(0.5, 6);
    expect(mid[2]).toBeCloseTo(0.5, 6);
    expect(red(3)).toEqual([1, 0, 0]);
    expect(red(10)).toEqual([1, 0, 0]);
    mounted.dispose();
  });

  it("intensity, power and distance apply on the next frame without a transition", async () => {
    const mounted = await mount([LAMP]);
    const lamp = handle(mounted, "lamp");
    lamp.setLight!({ intensity: 2, distance: 3 });
    let light = named(mounted.frame(0.1), "lamp");
    expect(light.intensity).toBe(2);
    expect(light.range).toBe(3);
    lamp.setLight!({ power: 4 * Math.PI * 5 });
    light = named(mounted.frame(0.2), "lamp");
    expect(light.intensity).toBeCloseTo(5);
    mounted.dispose();
  });

  it("a position blend writes through setPosition; a later setPosition wins", async () => {
    const mounted = await mount([LAMP]);
    const lamp = handle(mounted, "lamp");
    mounted.frame(0);
    lamp.setLight!({ position: [5, 2, 0] }, { transitionSeconds: 1 });
    expect(named(mounted.frame(1), "lamp").position).toEqual([1, 2, 0]);
    expect(named(mounted.frame(1.5), "lamp").position).toEqual([3, 2, 0]);
    expect(lamp.position).toEqual([3, 2, 0]);
    lamp.setPosition(-1, 1, -1);
    expect(named(mounted.frame(1.75), "lamp").position).toEqual([-1, 1, -1]);
    expect(named(mounted.frame(3), "lamp").position).toEqual([-1, 1, -1]);
    mounted.dispose();
  });

  it("an explicit direction holds while the light moves", async () => {
    const mounted = await mount([SPOT]);
    const spot = handle(mounted, "spot");
    spot.setLight!({ direction: [0, -1, 1] });
    let light = named(mounted.frame(0.1), "spot");
    expect(light.direction[1]).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(light.direction[2]).toBeCloseTo(Math.SQRT1_2, 6);
    spot.setPosition(2, 5, 0);
    light = named(mounted.frame(0.2), "spot");
    expect(light.direction[1]).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(light.position).toEqual([2, 5, 0]);
    mounted.dispose();
  });

  it("ambient lights take colour and intensity on the node the environment resolution reads", () => {
    const node = { ...AMBIENT } as unknown as AuraLightNode;
    const owner = { id: "amb", visible: true, position: [0, 0, 0] as [number, number, number], setPosition: () => undefined };
    queueRuntimeLightPatch(owner, { intensity: 1.2, color: "#000000" }, { transitionSeconds: 2 });
    updateRuntimeLight(node, owner, [], 0);
    expect(node.intensity).toBeCloseTo(0.4);
    updateRuntimeLight(node, owner, [], 1);
    expect(node.intensity).toBeCloseTo(0.8);
    updateRuntimeLight(node, owner, [], 2);
    expect(node.intensity).toBeCloseTo(1.2);
    expect(node.color).toBe("#000000");
    const hidden = { ...owner, visible: false };
    updateRuntimeLight(node, hidden, [], 3);
    expect(node.intensity).toBe(0);
  });
});

describe("GU47 E-B lighting diagnostics count the frame's lights", () => {
  it("punctualLights / localShadowLights follow setVisible", async () => {
    const mounted = await mount([SUN, LAMP, SPOT, AMBIENT]);
    const runtime = new Prd02LightingRuntime(FLAGS, mounted.nodes);
    mounted.frame(0);
    expect(runtime.diagnostics().punctualLights).toBe(3);
    expect(runtime.diagnostics().localShadowLights).toBe(1);
    handle(mounted, "spot").setVisible(false);
    mounted.frame(1 / 60);
    expect(runtime.diagnostics().punctualLights).toBe(2);
    expect(runtime.diagnostics().localShadowLights).toBe(0);
    expect(runtimeLightStats(undefined)).toEqual({ punctualLights: 0, localShadowLights: 0 });
    mounted.dispose();
  });

  it("the flattened light nodes are the objects the handles mutate (top-level lights)", () => {
    const snapshot = snapshotWith([LAMP]);
    const flat = groups.flatten(snapshot.nodes);
    expect(flat).toContain(snapshot.nodes[1]);
  });
});
