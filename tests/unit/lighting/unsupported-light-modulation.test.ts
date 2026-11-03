import { describe, expect, it } from "vitest";
import { lights } from "../../../packages/engine/src/agent-api/nodes/lights";
import type { AuraLightNode, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import type { AuraDegradation } from "../../../packages/engine/src/contracts/compiler";
import { createDegradationSink } from "../../../packages/engine/src/agent-api/compiler/degradation";
import { CompiledSceneImpl, realCompilerImpl, type MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import {
  createProductionRuntimeCollectedLights,
  formatLightModulationWarning,
  unsupportedLightModulationDegradations
} from "../../../packages/engine/src/agent-api/compiler/observations";

const profile = {
  profile: {
    format: "ies-lm63", photometricType: "C", verticalAngles: [0, 180], horizontalAngles: [0],
    candela: [4, 4], symmetry: "rotational"
  }
} as never;
const projection = {
  texture: { kind: "aura-asset-ref", type: "texture", id: "pattern", url: "/pattern.png" }
} as never;
const paths = [
  { name: "legacy", flags: resolveQrFlags({ options: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: false } }) },
  { name: "physical", flags: resolveQrFlags({ options: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true } }) }
] as const;

function snapshot(nodes: readonly AuraLightNode[]): AuraSceneSnapshot {
  return {
    schema: "aura3d-scene-snapshot/1.0",
    background: "#000000",
    camera: { mode: "orbit", position: [0, 2, 5], target: [0, 0, 0] },
    nodes,
    diagnostics: { enabled: false }
  } as AuraSceneSnapshot;
}

function context(flags: (typeof paths)[number]["flags"], strict: boolean, scene: AuraSceneSnapshot, admission = false) {
  const entries: AuraDegradation[] = [];
  const runtimeWarnings = new Set<string>();
  const ctx = {
    renderer: undefined,
    assets: undefined,
    quality: { tier: "high" },
    strict,
    flags,
    photometricProfileAdmissionEnabled: admission,
    degrade: createDegradationSink({
      strict,
      onDegradation: (entry) => entries.push(entry),
      warn: (warning) => runtimeWarnings.add(warning)
    }),
    canvas: { width: 64, height: 64 } as HTMLCanvasElement,
    environmentLighting: () => ({ color: [1, 1, 1], intensity: 0 }),
    collectedLights: createProductionRuntimeCollectedLights(scene, flags),
    runtimeWarnings
  } as unknown as MountSceneCompileContext;
  return { ctx, entries };
}

function unsupportedSpot(): AuraLightNode {
  return lights.spot({
    name: "patterned spot", intensity: 17, target: [1, 0, 0],
    photometricProfile: profile, projectedImage: projection
  }).runtime({ id: "spot" }).toJSON();
}

describe("unsupported punctual light modulation diagnostics", () => {
  it("identifies the actual unsupported fields together and leaves ordinary lights alone", () => {
    const spot = unsupportedSpot();
    const point = lights.point({ name: "profiled point", photometricProfile: profile }).toJSON();
    const projected = lights.spot({ name: "projected spot", projectedImage: projection }).toJSON();
    const ordinary = lights.spot().toJSON();
    const degradations = unsupportedLightModulationDegradations([spot, point, projected, ordinary]);
    expect(degradations).toHaveLength(3);
    expect(degradations[0]).toMatchObject({ code: "capability-degraded", nodeId: "spot" });
    expect(degradations[0]!.message).toContain("photometricProfile and projectedImage");
    expect(degradations[1]!.message).toContain("photometricProfile");
    expect(degradations[2]!.message).toContain("projectedImage");
    expect(formatLightModulationWarning(degradations[0]!)).toContain("LIGHT_MODULATION_UNSUPPORTED");
  });

  it("defers only profile diagnostics when per-view admission is installed", () => {
    const spot = unsupportedSpot();
    const point = lights.point({ photometricProfile: profile }).toJSON();
    const deferred = unsupportedLightModulationDegradations([spot, point], { deferPhotometricProfiles: true });
    expect(deferred).toHaveLength(1);
    expect(deferred[0]!.message).toContain("projectedImage");
    expect(deferred[0]!.message).not.toContain("photometricProfile");
  });

  for (const path of paths) {
    it(`reports the ${path.name} mount fallback and retains the same scalar light`, async () => {
      const authored = unsupportedSpot();
      const scene = snapshot([authored]);
      const { ctx, entries } = context(path.flags, false, scene);
      const withoutOptions = { ...authored, photometricProfile: undefined, projectedImage: undefined };
      const baseline = createProductionRuntimeCollectedLights(snapshot([withoutOptions]), path.flags)[0]!;
      const compiled = await realCompilerImpl.compile(scene, ctx);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ code: "capability-degraded", nodeId: "spot" });
      expect(entries[0]!.message).toContain("photometricProfile and projectedImage");
      expect(compiled.degradations).toContainEqual(entries[0]);
      expect(ctx.collectedLights[0]).toMatchObject({
        kind: baseline.kind, intensity: baseline.intensity, range: baseline.range,
        direction: baseline.direction, castsShadow: baseline.castsShadow
      });
      compiled.dispose();
    });

    it(`rejects an unsupported ${path.name} mount in strict mode`, async () => {
      const scene = snapshot([unsupportedSpot()]);
      const { ctx } = context(path.flags, true, scene);
      await expect(realCompilerImpl.compile(scene, ctx)).rejects.toMatchObject({
        code: "capability-degraded", message: expect.stringContaining("LIGHT_MODULATION_UNSUPPORTED")
      });
    });

    it(`defers only the profile at a strict ${path.name} mount when the renderer admitted the handoff`, async () => {
      const point = lights.point({ name: "profile", photometricProfile: profile }).toJSON();
      const scene = snapshot([point]);
      const { ctx } = context(path.flags, true, scene, true);
      const compiled = await realCompilerImpl.compile(scene, ctx);
      expect(compiled.degradations).toEqual([]);
      compiled.dispose();

      const withProjection = snapshot([unsupportedSpot()]);
      const { ctx: projectionCtx } = context(path.flags, true, withProjection, true);
      await expect(realCompilerImpl.compile(withProjection, projectionCtx)).rejects.toMatchObject({
        code: "capability-degraded", message: expect.stringContaining("projectedImage")
      });
    });

    it(`defers profile-only ${path.name} live additions but still rejects a projected image in strict mode`, () => {
      const { ctx } = context(path.flags, true, snapshot([]), true);
      ctx.collectedLights = [];
      const compiled = new CompiledSceneImpl(1, null, [], new Set(), [], [], [], [], ctx, [], []);
      const point = lights.point({ photometricProfile: profile }).runtime({ id: "profile" }).toJSON();
      compiled.addSubtree(point);
      expect(ctx.collectedLights).toHaveLength(1);
      expect(() => compiled.addSubtree(unsupportedSpot())).toThrow(/projectedImage/);
      expect(ctx.collectedLights).toHaveLength(1);
      compiled.dispose();
    });

    it(`reports a live ${path.name} addition and removes its current diagnostic with the light`, () => {
      const { ctx, entries } = context(path.flags, false, snapshot([]));
      ctx.collectedLights = [];
      const compiled = new CompiledSceneImpl(1, null, [], new Set(), [], [], [], [], ctx, [], []);
      const node = unsupportedSpot();
      compiled.addSubtree(node);
      expect(entries).toHaveLength(1);
      expect(ctx.collectedLights).toHaveLength(1);
      expect(ctx.collectedLights[0]!.intensity).toBe(17);
      expect(unsupportedLightModulationDegradations(compiled.liveNodes)).toHaveLength(1);
      expect(compiled.removeSubtree("spot")).toBe(true);
      expect(unsupportedLightModulationDegradations(compiled.liveNodes)).toEqual([]);
      expect(ctx.collectedLights).toEqual([]);
      compiled.dispose();
    });

    it(`leaves a live ${path.name} scene untouched when strict mode rejects an addition`, () => {
      const { ctx } = context(path.flags, true, snapshot([]));
      ctx.collectedLights = [];
      const compiled = new CompiledSceneImpl(1, null, [], new Set(), [], [], [], [], ctx, [], []);
      expect(() => compiled.addSubtree(unsupportedSpot())).toThrow(/LIGHT_MODULATION_UNSUPPORTED/);
      expect(compiled.liveNodes).toEqual([]);
      expect(ctx.collectedLights).toEqual([]);
      compiled.dispose();
    });
  }
});
