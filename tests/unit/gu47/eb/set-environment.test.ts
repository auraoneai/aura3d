/**
 * GU47 E-B (WP-2): `app.lighting.setEnvironment(texture, { intensity, background, rotationDeg, crossfadeSeconds })`
 * swaps the scene environment at runtime, and `setEnvironmentRotation(radians)` (bookkeeping only before) reaches the
 * frame: the mounted scene's update puts the yaw on the render source as `environmentProbeRotation`, as it does for an
 * environment node's authored `rotation` (E-A's `environmentRotationDeg` look override).
 */
import { describe, expect, it } from "vitest";
import "@aura3d/engine";
import "../../../../packages/engine/src/lanes/prd02";
import { compileScene, updateCompiledScene } from "@aura3d/engine/contracts";
import type { MountSceneCompileContext } from "../../../../packages/engine/src/agent-api/compiler/compileScene";
import {
  requestRuntimeEnvironmentSwap,
  runtimeEnvironmentIntensity,
  runtimeEnvironmentRotation,
  runtimeEnvironmentSwapState,
  stepRuntimeEnvironment
} from "../../../../packages/engine/src/agent-api/compiler/environment";
import { Prd02LightingRuntime, RUNTIME_ENVIRONMENT_NODE_ID } from "../../../../packages/engine/src/lanes/prd02";
import { StubLightingRuntime } from "../../../../packages/engine/src/contracts/lighting";
import { resolveEnvironment } from "../../../../packages/engine/src/contracts/environment";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import type { AuraAssetRef, AuraSceneNode, AuraSceneSnapshot } from "../../../../packages/engine/src/agent-api/nodes/types";
import type { CollectedLight } from "@aura3d/rendering";

const FLAGS = resolveQrFlags({ options: ["compiler", "lighting"] });

function hdr(url: string): AuraAssetRef<"texture"> {
  return { kind: "aura-asset-ref", type: "texture", id: url, url } as unknown as AuraAssetRef<"texture">;
}

function snapshotWith(nodes: readonly unknown[]): AuraSceneSnapshot {
  return {
    schema: "aura3d-scene-snapshot/1.0",
    background: "#000000",
    camera: { mode: "orbit", position: [0, 2, 5], target: [0, 0, 0] },
    diagnostics: { enabled: false },
    nodes: [{ kind: "primitive", primitive: "box", name: "b", size: 1 }, ...structuredClone(nodes)]
  } as unknown as AuraSceneSnapshot;
}

async function mount(snapshot: AuraSceneSnapshot, owner: object) {
  const { MockRenderDevice } = await import("../../../../packages/rendering/src/RenderDevice");
  const ctx: MountSceneCompileContext = {
    renderer: { device: new MockRenderDevice() } as MountSceneCompileContext["renderer"],
    assets: undefined,
    quality: { tier: "high" } as MountSceneCompileContext["quality"],
    strict: false,
    flags: FLAGS,
    degrade: () => undefined,
    canvas: { width: 800, height: 600 } as unknown as HTMLCanvasElement,
    environmentLighting: () => ({ color: [1, 1, 1], intensity: 1, environmentMapIntensity: 1, environmentMapSpecularIntensity: 1 }),
    collectedLights: [] as readonly CollectedLight[],
    runtimeWarnings: new Set<string>(),
    runtimeNodes: owner as MountSceneCompileContext["runtimeNodes"]
  };
  return compileScene(snapshot, ctx);
}

type FrameSource = { environmentProbeRotation?: number; environmentProbeDiffuseIntensity?: number };

const registryLike = (): object => ({ get: () => undefined });

describe("GU47 E-B setEnvironment crossfade state", () => {
  it("fades out over the first half, swaps, waits for the probe, fades in over the second half", () => {
    const owner = {};
    requestRuntimeEnvironmentSwap(owner, hdr("/hdri/venice_sunset_1k.hdr"), { crossfadeSeconds: 2 });
    let outcome: "ready" | "failed" | undefined;
    const step = (t: number) => stepRuntimeEnvironment(owner, t, () => outcome);
    step(10);
    expect(runtimeEnvironmentSwapState(owner)).toMatchObject({ phase: "fade-out", crossfade: 1 });
    step(10.5);
    expect(runtimeEnvironmentIntensity(owner)).toBeCloseTo(0.5, 6);
    step(11);
    expect(runtimeEnvironmentSwapState(owner)).toMatchObject({ phase: "loading", crossfade: 0, url: "/hdri/venice_sunset_1k.hdr" });
    step(12);
    expect(runtimeEnvironmentSwapState(owner).phase).toBe("loading");
    outcome = "ready";
    step(12.25);
    expect(runtimeEnvironmentSwapState(owner)).toMatchObject({ phase: "fade-in", crossfade: 0 });
    step(12.75);
    expect(runtimeEnvironmentIntensity(owner)).toBeCloseTo(0.5, 6);
    step(13.25);
    expect(runtimeEnvironmentSwapState(owner)).toMatchObject({ phase: "idle", crossfade: 1 });
    expect(runtimeEnvironmentIntensity(owner)).toBe(1);
  });

  it("applies intensity and rotationDeg at the swap; no crossfade swaps on the next frame", () => {
    const owner = {};
    requestRuntimeEnvironmentSwap(owner, hdr("/hdri/rooftop_night_1k.hdr"), { intensity: 0.6, rotationDeg: 90 });
    expect(runtimeEnvironmentRotation(owner)).toBeUndefined();
    stepRuntimeEnvironment(owner, 0, () => undefined);
    expect(runtimeEnvironmentSwapState(owner)).toMatchObject({ phase: "idle", crossfade: 1, url: "/hdri/rooftop_night_1k.hdr" });
    expect(runtimeEnvironmentIntensity(owner)).toBeCloseTo(0.6, 6);
    expect(runtimeEnvironmentRotation(owner)).toBeCloseTo(Math.PI / 2, 9);
  });

  it("a failed or slow probe still fades back in", () => {
    const owner = {};
    requestRuntimeEnvironmentSwap(owner, hdr("/hdri/missing_1k.hdr"), { crossfadeSeconds: 1 });
    stepRuntimeEnvironment(owner, 0, () => undefined);
    stepRuntimeEnvironment(owner, 0.5, () => undefined);
    expect(runtimeEnvironmentSwapState(owner).phase).toBe("loading");
    stepRuntimeEnvironment(owner, 11, () => undefined);
    expect(runtimeEnvironmentSwapState(owner).phase).toBe("fade-in");
    const failedOwner = {};
    requestRuntimeEnvironmentSwap(failedOwner, hdr("/hdri/missing_1k.hdr"), { crossfadeSeconds: 1 });
    stepRuntimeEnvironment(failedOwner, 0, () => "failed");
    stepRuntimeEnvironment(failedOwner, 0.5, () => "failed");
    stepRuntimeEnvironment(failedOwner, 0.6, () => "failed");
    expect(runtimeEnvironmentSwapState(failedOwner).phase).toBe("fade-in");
  });

  it("validates its input", () => {
    const owner = {};
    expect(() => requestRuntimeEnvironmentSwap(owner, {} as AuraAssetRef<"texture">)).toThrow(TypeError);
    expect(() => requestRuntimeEnvironmentSwap(owner, hdr("/a.hdr"), { crossfadeSeconds: -1 })).toThrow(RangeError);
    expect(() => requestRuntimeEnvironmentSwap(owner, hdr("/a.hdr"), { intensity: Number.NaN })).toThrow(RangeError);
    expect(() => new Prd02LightingRuntime(undefined, owner).setEnvironmentRotation(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("GU47 E-B runtime environment reaches the frame", () => {
  it("setEnvironmentRotation puts the yaw on the render source every frame", async () => {
    const owner = registryLike();
    const snapshot = snapshotWith([{ kind: "environment", environment: "hdri", name: "sky", intensity: 1, texture: hdr("/hdri/venice_sunset_1k.hdr"), background: true }]);
    const compiled = await mount(snapshot, owner);
    const before = updateCompiledScene(compiled, snapshot, owner as never, 0) as FrameSource;
    expect(before.environmentProbeRotation).toBeUndefined();
    new Prd02LightingRuntime(FLAGS, owner).setEnvironmentRotation(Math.PI / 2);
    const after = updateCompiledScene(compiled, snapshot, owner as never, 1 / 60) as FrameSource;
    expect(after.environmentProbeRotation).toBeCloseTo(Math.PI / 2, 9);
    compiled.dispose();
  });

  it("an environment node's authored rotation (E-A environmentRotationDeg) reaches the source", async () => {
    const owner = registryLike();
    const snapshot = snapshotWith([{ kind: "environment", environment: "hdri", name: "look hdri", intensity: 1, rotation: 0.75, texture: hdr("/hdri/venice_sunset_1k.hdr") }]);
    const compiled = await mount(snapshot, owner);
    const source = updateCompiledScene(compiled, snapshot, owner as never, 0) as FrameSource;
    expect(source.environmentProbeRotation).toBeCloseTo(0.75, 9);
    compiled.dispose();
  });

  it("setEnvironment swaps the texture the probe resolution requests and keeps the crossfade on the bind", async () => {
    const owner = registryLike();
    const snapshot = snapshotWith([{ kind: "environment", environment: "hdri", name: "sky", intensity: 1, texture: hdr("/hdri/venice_sunset_1k.hdr"), background: true }]);
    const compiled = await mount(snapshot, owner);
    updateCompiledScene(compiled, snapshot, owner as never, 0);
    const probeOf = () => resolveEnvironment(snapshot, "high", FLAGS).probe;
    expect(probeOf()).toEqual({ hdri: "/hdri/venice_sunset_1k.hdr" });
    const runtime = new Prd02LightingRuntime(FLAGS, owner);
    runtime.setEnvironment(hdr("/hdri/rooftop_night_1k.hdr"), { crossfadeSeconds: 1, background: false });
    updateCompiledScene(compiled, snapshot, owner as never, 1);
    const fading = updateCompiledScene(compiled, snapshot, owner as never, 1.25) as FrameSource;
    expect(fading.environmentProbeDiffuseIntensity).toBeCloseTo(0.5, 6);
    expect(probeOf()).toEqual({ hdri: "/hdri/venice_sunset_1k.hdr" });
    updateCompiledScene(compiled, snapshot, owner as never, 1.5);
    const resolution = resolveEnvironment(snapshot, "high", FLAGS);
    expect(resolution.probe).toEqual({ hdri: "/hdri/rooftop_night_1k.hdr" });
    expect(resolution.background).toBe(false);
    const dark = updateCompiledScene(compiled, snapshot, owner as never, 1.6) as FrameSource;
    expect(dark.environmentProbeDiffuseIntensity).toBe(0);
    compiled.dispose();
  });

  it("a scene without an environment node gets an hdri node added", () => {
    const added: AuraSceneNode[] = [];
    const runtime = new Prd02LightingRuntime(FLAGS, {}, { scene: { nodes: [] }, nodes: { add: (node) => added.push(node) } });
    runtime.setEnvironment(hdr("/hdri/warm_bar_1k.hdr"), { rotationDeg: 180 });
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ kind: "environment", environment: "hdri", background: false, runtime: { id: RUNTIME_ENVIRONMENT_NODE_ID } });
    expect((added[0] as { rotation?: number }).rotation).toBeCloseTo(Math.PI, 9);
  });

  it("the stub keeps bookkeeping for flag-off apps", () => {
    const stub = new StubLightingRuntime();
    stub.setEnvironment(hdr("/hdri/warm_bar_1k.hdr"), { intensity: 2, rotationDeg: 45 });
    const diagnostics = stub.diagnostics();
    expect(diagnostics.punctualLights).toBe(0);
    expect(diagnostics.localShadowLights).toBe(0);
  });
});
