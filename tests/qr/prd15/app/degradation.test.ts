/* T4.1 — no silent fallback: the three 15-owned catch sites route through the
 * C-36 degrade() handler instead of only appending to runtimeWarnings.
 *
 *   strict     → degrade throws an AuraRuntimeError carrying code + cause.
 *   non-strict → degrade records once per (code,nodeId) through the C-38
 *                onDegradation hook and warns once; a degraded frame continues.
 *   flag-off   → degrade is not wired; the legacy runtimeWarnings strings are
 *                byte-identical to pre-T4.1 behaviour (§16.1 identity).
 */
import "@aura3d/engine";
import { describe, expect, it, vi } from "vitest";
import { auraAssetRefBrand } from "@aura3d/engine/contracts";
import { createDegradationSink } from "../../../../packages/engine/src/agent-api/app/degradation";
import { AuraRuntimeError } from "../../../../packages/engine/src/agent-api/app/errors";
import { applyProductionActorFootPlanting, applyProductionActorMorphTargets } from "../../../../packages/engine/src/agent-api/compiler/actors";
import { createProductionRuntimeRendererInput } from "../../../../packages/engine/src/agent-api/compiler/renderInput";
import { createAuraRuntimeNodeRegistry } from "../../../../packages/engine/src/agent-api/app/runtimeNodes";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import type { AuraAssetRef, AuraModelNode, AuraSceneSnapshot, ProductionRuntimeActorEntry } from "../../../../packages/engine/src/agent-api/nodes/types";
import type { AuraDegradation } from "../../../../packages/engine/src/contracts/compiler";

const FAKE_MODEL_ASSET = {
  kind: "aura-asset-ref",
  id: "probe-model",
  type: "model",
  source: "probe.glb",
  uri: "probe.glb",
  metadata: { boundsMetadata: { min: [-1, -1, -1], max: [1, 1, 1] } },
  [auraAssetRefBrand]: { type: "model", id: "probe-model" }
} as unknown as AuraAssetRef<"model">;

const CAUSE = new Error("probe failure");

function makeActorEntry(): ProductionRuntimeActorEntry {
  const node = {
    kind: "model",
    asset: FAKE_MODEL_ASSET,
    runtime: { id: "actor-1" }
  } as unknown as AuraModelNode;
  const actor = {
    id: "actor-1",
    pipeline: { asset: { skins: [], meshes: [] }, resources: {}, metadata: {} },
    evidence: {
      clips: [],
      skinningBindingCount: 0,
      lastSkinningPalettesUpdated: 0,
      lastMaterialTracksApplied: 0,
      lastLightTracksApplied: 0,
      lastFootPlantingMissingLegs: []
    },
    animation: { setFootPlanting: () => { throw CAUSE; } },
    applyMorphTargets: () => { throw CAUSE; },
    applyRetargetedPose: () => { throw CAUSE; },
    collectRenderItems: () => []
  };
  return { node, actor } as unknown as ProductionRuntimeActorEntry;
}

const strictSink = () => createDegradationSink({ strict: true });

function recordSink() {
  const recorded: AuraDegradation[] = [];
  const warnings: string[] = [];
  const degrade = createDegradationSink({
    strict: false,
    onDegradation: (d) => recorded.push(d),
    warn: (m) => warnings.push(m)
  });
  return { degrade, recorded, warnings };
}

describe("T4.1 createDegradationSink", () => {
  it("strict throws AuraRuntimeError with code and cause", () => {
    const degrade = strictSink();
    let thrown: unknown;
    try {
      degrade({ code: "pose-apply-failed", nodeId: "n1", message: "boom", cause: CAUSE });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AuraRuntimeError);
    expect((thrown as AuraRuntimeError).code).toBe("pose-apply-failed");
    expect((thrown as AuraRuntimeError).cause).toBe(CAUSE);
  });

  it("non-strict records and warns exactly once after 100 frames", () => {
    const { degrade, recorded, warnings } = recordSink();
    for (let frame = 0; frame < 100; frame += 1) {
      degrade({ code: "morph-apply-failed", nodeId: "actor-1", message: "boom", cause: CAUSE });
    }
    expect(recorded).toHaveLength(1);
    expect(recorded[0].code).toBe("morph-apply-failed");
    expect(recorded[0].nodeId).toBe("actor-1");
    expect(recorded[0].cause).toBe(CAUSE);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("morph-apply-failed");
    expect(warnings[0]).toContain("actor-1");
  });

  it("dedupes per (code,nodeId): different node ids each record", () => {
    const { degrade, recorded } = recordSink();
    degrade({ code: "foot-planting-failed", nodeId: "a", message: "m" });
    degrade({ code: "foot-planting-failed", nodeId: "b", message: "m" });
    degrade({ code: "morph-apply-failed", nodeId: "a", message: "m" });
    expect(recorded).toHaveLength(3);
  });
});

describe("T4.1 catch sites route through degrade", () => {
  it("foot-planting-failed: strict throws, non-strict records once", () => {
    const entry = makeActorEntry();
    const warnings = new Set<string>();
    expect(() =>
      applyProductionActorFootPlanting(entry, undefined, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], warnings, strictSink())
    ).toThrowError(AuraRuntimeError);

    const { degrade, recorded } = recordSink();
    for (let i = 0; i < 100; i += 1) {
      applyProductionActorFootPlanting(entry, undefined, undefined, warnings, degrade);
    }
    expect(recorded).toHaveLength(1);
    expect(recorded[0].code).toBe("foot-planting-failed");
  });

  it("foot-planting-failed: flag-off keeps the legacy warning text", () => {
    const entry = makeActorEntry();
    const warnings = new Set<string>();
    applyProductionActorFootPlanting(entry, undefined, undefined, warnings);
    expect([...warnings]).toEqual(['Typed GLB actor "actor-1" failed to apply foot planting: Error: probe failure']);
  });

  it("morph-apply-failed: strict throws, non-strict records once", () => {
    const entry = makeActorEntry();
    const warnings = new Set<string>();
    expect(() =>
      applyProductionActorMorphTargets(entry, { smile: 1 }, warnings, strictSink())
    ).toThrowError(AuraRuntimeError);

    const { degrade, recorded } = recordSink();
    for (let i = 0; i < 100; i += 1) {
      applyProductionActorMorphTargets(entry, { smile: 1 }, warnings, degrade);
    }
    expect(recorded).toHaveLength(1);
    expect(recorded[0].code).toBe("morph-apply-failed");
  });

  it("morph-apply-failed: flag-off keeps the legacy warning text", () => {
    const entry = makeActorEntry();
    const warnings = new Set<string>();
    applyProductionActorMorphTargets(entry, { smile: 1 }, warnings);
    expect([...warnings]).toEqual(['Typed GLB actor "actor-1" failed to apply morph targets: Error: probe failure']);
  });

  it("pose-apply-failed: strict throws from the frame build", () => {
    const entry = makeActorEntry();
    const snapshot: AuraSceneSnapshot = { nodes: [entry.node], camera: { mode: "orbit", position: [0, 0, 5], target: [0, 0, 0] } };
    const runtimeNodes = createAuraRuntimeNodeRegistry(snapshot);
    runtimeNodes.get("actor-1")?.setAnimationPose({ bones: {} } as never);
    const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
    const warnings = new Set<string>();
    expect(() =>
      createProductionRuntimeRendererInput(
        snapshot,
        canvas,
        [entry],
        [],
        0,
        runtimeNodes,
        warnings,
        {},
        [],
        strictSink()
      )
    ).toThrowError(AuraRuntimeError);
  });

  it("pose-apply-failed: flag-off keeps the legacy warning text", () => {
    const entry = makeActorEntry();
    const snapshot: AuraSceneSnapshot = { nodes: [entry.node], camera: { mode: "orbit", position: [0, 0, 5], target: [0, 0, 0] } };
    const runtimeNodes = createAuraRuntimeNodeRegistry(snapshot);
    runtimeNodes.get("actor-1")?.setAnimationPose({ bones: {} } as never);
    const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
    const warnings = new Set<string>();
    createProductionRuntimeRendererInput(snapshot, canvas, [entry], [], 0, runtimeNodes, warnings, {}, []);
    expect([...warnings]).toContain('Typed GLB actor "actor-1" failed to apply bound pose: Error: probe failure');
  });
});

describe("T4.1 strict flag wiring", () => {
  it("ctx.strict defaults to A3D_QR_STRICT when options.strict is absent", () => {
    const flags = resolveQrFlags({ options: ["strict"] });
    expect(flags.on("A3D_QR_STRICT")).toBe(true);
    expect(resolveQrFlags({}).on("A3D_QR_STRICT")).toBe(false);
  });
});
