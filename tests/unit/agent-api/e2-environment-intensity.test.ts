/**
 * Audit lane E2, wave 2 (handoff from G02, RR-E5): `app.lighting.setEnvironmentIntensity` used to be bookkeeping
 * only. It now scales the live environment term (image-based diffuse and specular) every frame: on the PRD-02
 * probe bind and on the legacy environment-map knob. Lights, the ambient term and the background are untouched.
 */
import { describe, expect, it } from "vitest";
import "@aura3d/engine";
import { compileScene, updateCompiledScene } from "@aura3d/engine/contracts";
import type { MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import {
  runtimeEnvironmentIntensity,
  scaleEnvironmentLighting,
  setRuntimeEnvironmentIntensity
} from "../../../packages/engine/src/agent-api/compiler/environment";
import { Prd02LightingRuntime } from "../../../packages/engine/src/lanes/prd02";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import type { AuraSceneSnapshot, AuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/nodes/types";
import type { CollectedLight, EnvironmentLightingOptions } from "@aura3d/rendering";

const SNAPSHOT = {
  schema: "aura3d-scene-snapshot/1.0",
  background: "#000000",
  camera: { mode: "orbit", position: [0, 2, 5], target: [0, 0, 0] },
  diagnostics: { enabled: false },
  nodes: [
    { kind: "primitive", primitive: "box", name: "b", size: 1 },
    { kind: "light", light: "ambient", name: "amb", intensity: 0.5, color: "#ffffff" }
  ]
} as unknown as AuraSceneSnapshot;

const KNOB: EnvironmentLightingOptions = {
  color: [1, 1, 1],
  intensity: 0.4,
  environmentMapIntensity: 0.8,
  environmentMapSpecularIntensity: 0.6
};

function registry(): AuraRuntimeNodeRegistry {
  return { get: () => undefined } as unknown as AuraRuntimeNodeRegistry;
}

async function mount(flags: ReturnType<typeof resolveQrFlags>) {
  const { MockRenderDevice } = await import("../../../packages/rendering/src/RenderDevice");
  const ctx: MountSceneCompileContext = {
    renderer: { device: new MockRenderDevice() } as MountSceneCompileContext["renderer"],
    assets: undefined,
    quality: { tier: "high" } as MountSceneCompileContext["quality"],
    strict: false,
    flags,
    degrade: () => undefined,
    canvas: { width: 800, height: 600 } as unknown as HTMLCanvasElement,
    environmentLighting: () => KNOB,
    collectedLights: [] as readonly CollectedLight[],
    runtimeWarnings: new Set<string>()
  };
  return compileScene(SNAPSHOT, ctx);
}

type ProbedSource = {
  environmentProbeDiffuseIntensity?: number;
  environmentProbeSpecularIntensity?: number;
  environmentProbeAmbient?: { intensity: number } | null;
  environmentLighting?: EnvironmentLightingOptions;
};

describe("E2 wave 2: app.lighting.setEnvironmentIntensity scales the live environment term", () => {
  it("defaults to 1 and validates its input", () => {
    const owner = {};
    expect(runtimeEnvironmentIntensity(owner)).toBe(1);
    expect(runtimeEnvironmentIntensity(undefined)).toBe(1);
    setRuntimeEnvironmentIntensity(owner, 0.25);
    expect(runtimeEnvironmentIntensity(owner)).toBe(0.25);
    expect(() => setRuntimeEnvironmentIntensity(owner, -1)).toThrow(RangeError);
    expect(() => setRuntimeEnvironmentIntensity(owner, Number.NaN)).toThrow(RangeError);
  });

  it("scaleEnvironmentLighting scales the map terms only and keeps the object at scale 1", () => {
    expect(scaleEnvironmentLighting(KNOB, 1)).toBe(KNOB);
    const half = scaleEnvironmentLighting(KNOB, 0.5);
    expect(half.environmentMapIntensity).toBeCloseTo(0.4);
    expect(half.environmentMapSpecularIntensity).toBeCloseTo(0.3);
    expect(half.intensity).toBe(0.4);
    expect(half.color).toEqual([1, 1, 1]);
    expect("environmentMapIntensity" in scaleEnvironmentLighting({ color: [1, 1, 1], intensity: 1 }, 2)).toBe(false);
  });

  it("the PRD-02 runtime writes the scale for its app's registry", () => {
    const nodes = {};
    const runtime = new Prd02LightingRuntime(undefined, nodes);
    expect(runtime.environmentIntensity()).toBe(1);
    runtime.setEnvironmentIntensity(0.3);
    expect(runtime.environmentIntensity()).toBe(0.3);
    expect(runtimeEnvironmentIntensity(nodes)).toBe(0.3);
    expect(() => runtime.setEnvironmentIntensity(-0.1)).toThrow(RangeError);
    expect(() => new Prd02LightingRuntime().setEnvironmentIntensity(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("the per-frame update multiplies the probe diffuse and specular, not the ambient (compiler + lighting)", async () => {
    const compiled = await mount(resolveQrFlags({ options: ["compiler", "lighting"] }));
    const nodes = registry();
    const before = updateCompiledScene(compiled, SNAPSHOT, nodes, 0) as ProbedSource;
    expect(before.environmentProbeDiffuseIntensity).toBe(1);
    expect(before.environmentProbeSpecularIntensity).toBe(1);
    setRuntimeEnvironmentIntensity(nodes, 0.35);
    const after = updateCompiledScene(compiled, SNAPSHOT, nodes, 1 / 60) as ProbedSource;
    expect(after.environmentProbeDiffuseIntensity).toBeCloseTo(0.35);
    expect(after.environmentProbeSpecularIntensity).toBeCloseTo(0.35);
    expect(after.environmentProbeAmbient?.intensity).toBe(before.environmentProbeAmbient?.intensity);
    setRuntimeEnvironmentIntensity(nodes, 1);
    const back = updateCompiledScene(compiled, SNAPSHOT, nodes, 2 / 60) as ProbedSource;
    expect(back.environmentProbeDiffuseIntensity).toBe(1);
    compiled.dispose();
  });

  it("the legacy knob path (lighting flag off) gets the scaled map intensities", async () => {
    const flags = resolveQrFlags({ options: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: false } });
    expect(flags.on("A3D_QR_LIGHTING")).toBe(false);
    const compiled = await mount(flags);
    const nodes = registry();
    setRuntimeEnvironmentIntensity(nodes, 0.5);
    const source = updateCompiledScene(compiled, SNAPSHOT, nodes, 0) as ProbedSource;
    expect(source.environmentLighting?.environmentMapIntensity).toBeCloseTo(0.4);
    expect(source.environmentLighting?.environmentMapSpecularIntensity).toBeCloseTo(0.3);
    expect(source.environmentLighting?.intensity).toBe(0.4);
    compiled.dispose();
  });
});
