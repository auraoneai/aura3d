import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { setQrAnimationFlags, resetQrAnimationFlags } from "../../../packages/engine/src/agent-api/app/actorAnimationHandle";
import {
  createAuraRuntimeNodeRegistry,
  prepareRuntimeNodeRootMotion,
  runtimeNodeHandleForSceneNode,
  runtimeNodeParentedTransform
} from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { applyProductionActorAnimation, resetProductionActorPoseStates, takeClipApplyDegradations } from "../../../packages/engine/src/agent-api/compiler/animation";
import { flattenAuraSceneSnapshot } from "../../../packages/engine/src/agent-api/compiler/sceneGraph";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import type { AuraModelNode, AuraRuntimeNodeHandle, AuraSceneNode, AuraSceneSnapshot, ProductionRuntimeActorEntry } from "../../../packages/engine/src/agent-api/nodes/types";

type Vec3 = readonly [number, number, number];
type Sample = { readonly fromTime: number; readonly toTime: number };
type MotionOptions = { readonly worldFromLocal: readonly number[]; readonly move: (value: Vec3) => Vec3 };

const flags = resolveQrFlags({ options: ["core", "animation"], env: {} });
const parent = (children: readonly AuraSceneNode[], extra: Partial<AuraSceneNode> = {}): AuraSceneNode => ({
  kind: "group", name: "parent", runtime: { id: "parent" },
  position: [3, 0, 0], rotation: [0, 0, Math.PI / 2], scale: [2, 2, 2], children, ...extra
} as AuraSceneNode);
const model = (id: string | undefined, extra: Partial<AuraModelNode> = {}): AuraModelNode => ({
  kind: "model", name: id ?? "anonymous", asset: { id: "independent-fixture" } as AuraModelNode["asset"],
  castShadow: true, receiveShadow: true, visible: true, position: [1, 0, 0],
  animation: { clip: "walk", rootMotion: { mode: "apply" } },
  ...(id === undefined ? {} : { runtime: { id } }), ...extra
});
const snapshot = (nodes: readonly AuraSceneNode[]): AuraSceneSnapshot => ({ ...scene().toJSON(), nodes });

/** A deterministic clip boundary: requested displacement is already in world coordinates. */
function actorEntry(node: AuraModelNode, delta: Vec3 = [2, 0, 0], yawPerSecond = 0) {
  const samples: Sample[] = [];
  const matrices: number[][] = [];
  const actor = {
    id: "fixture-actor",
    animation: {
      resolveClipName: (name: string) => name,
      rootMotionTargetFor: () => "root.translation",
      rootMotionYawDelta: (_clip: string, _bone: string | undefined, from: number, to: number) => yawPerSecond * (to - from)
    },
    playRootMotionClips: (items: readonly Sample[], options: MotionOptions) => {
      const sample = items[0]!;
      samples.push({ fromTime: sample.fromTime, toTime: sample.toTime });
      matrices.push([...options.worldFromLocal]);
      const span = sample.toTime - sample.fromTime;
      const requested: Vec3 = [delta[0] * span, delta[1] * span, delta[2] * span];
      const accepted = options.move(requested);
      return { motion: { requested, accepted, rejected: [requested[0] - accepted[0], requested[1] - accepted[1], requested[2] - accepted[2]] } };
    }
  };
  return { entry: { node, actor } as unknown as ProductionRuntimeActorEntry, samples, matrices };
}

function applyAt(
  entry: ProductionRuntimeActorEntry,
  registry: ReturnType<typeof createAuraRuntimeNodeRegistry> | undefined,
  handle: AuraRuntimeNodeHandle | undefined,
  milliseconds: number,
  warnings = new Set<string>(),
  refresh = () => {}
): Set<string> {
  const matrix = handle && runtimeNodeParentedTransform(handle)?.worldMatrix;
  applyProductionActorAnimation(entry, entry.node, undefined, milliseconds, warnings,
    matrix ? Array.from(matrix) : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], refresh, registry);
  return warnings;
}

function closeVec(actual: readonly number[], expected: readonly number[]) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 5));
}

function dynamicModel(extra: Partial<AuraModelNode> = {}) {
  const initial = snapshot([parent([])]);
  const registry = createAuraRuntimeNodeRegistry(initial, { flags });
  const node = model("hero", extra);
  const handle = registry.add(node, { parent: "parent" });
  return { registry, node, handle, root: registry.require("parent") };
}

afterEach(() => {
  resetQrAnimationFlags();
  resetProductionActorPoseStates();
  takeClipApplyDegradations();
  vi.restoreAllMocks();
});

describe("parented authored root motion", () => {
  it("maps a world delta through a rotated, scaled parent for a dynamically added local-facing node", () => {
    setQrAnimationFlags(flags);
    const { registry, node, handle } = dynamicModel();
    try {
      const { entry, samples, matrices } = actorEntry(node);
      const refresh = vi.fn();
      closeVec(handle.position, [1, 0, 0]);
      closeVec(handle.getWorldPosition(), [3, 2, 0]);
      applyAt(entry, registry, handle, 1000, new Set(), refresh);
      closeVec(handle.position, [1, -1, 0]);
      closeVec(handle.getWorldPosition(), [5, 2, 0]);
      closeVec(matrices[0]!.slice(12, 15), [3, 2, 0]);
      applyAt(entry, registry, handle, 2000, new Set(), refresh);
      applyAt(entry, registry, handle, 2000, new Set(), refresh);
      closeVec(handle.getWorldPosition(), [7, 2, 0]);
      expect(samples).toEqual([{ fromTime: 0, toTime: 1 }, { fromTime: 1, toTime: 2 }, { fromTime: 2, toTime: 2 }]);
      expect(refresh).toHaveBeenCalledTimes(2);
    } finally { registry.dispose(); }
  });

  it("keeps a mounted world-facing handle and its parented local transform aligned", () => {
    setQrAnimationFlags(flags);
    const authoredModel = model("hero");
    const authored = snapshot([parent([authoredModel])]);
    const flattened = flattenAuraSceneSnapshot(authored, true);
    const registry = createAuraRuntimeNodeRegistry(flattened, { flags }, authored);
    try {
      const handle = registry.require("hero");
      const { entry } = actorEntry(flattened.nodes[0] as AuraModelNode);
      closeVec(handle.position, [3, 2, 0]);
      applyAt(entry, registry, handle, 1000);
      closeVec(handle.position, [5, 2, 0]);
      closeVec(handle.getWorldPosition(), [5, 2, 0]);
      closeVec(runtimeNodeParentedTransform(handle)!.localNode.position!, [1, -1, 0]);
    } finally { registry.dispose(); }
  });

  it("uses the private source-node handle for an anonymous model under a live parent", () => {
    setQrAnimationFlags(flags);
    const authoredModel = model(undefined);
    const authored = snapshot([parent([authoredModel])]);
    const flattened = flattenAuraSceneSnapshot(authored, true);
    const registry = createAuraRuntimeNodeRegistry(flattened, { flags }, authored);
    try {
      const handle = runtimeNodeHandleForSceneNode(registry, authoredModel);
      expect(handle).toBeDefined();
      const { entry } = actorEntry(flattened.nodes[0] as AuraModelNode);
      applyAt(entry, registry, handle, 1000);
      closeVec(handle!.getWorldPosition(), [5, 2, 0]);
      expect(entry.rootMotionOffset).toBeUndefined();
      expect(registry.ids()).not.toContain("anonymous");
    } finally { registry.dispose(); }
  });

  it("applies sampled yaw about the model's local Y axis while preserving a pivoted world delta", () => {
    setQrAnimationFlags(flags);
    const x = Math.sin(Math.PI / 8), w = Math.cos(Math.PI / 8), yaw = Math.PI / 3;
    const { registry, node, handle } = dynamicModel({ quaternion: [x, 0, 0, w], pivot: [0.5, 0, 0] });
    try {
      const before = handle.getWorldPosition();
      const { entry } = actorEntry(node, [2, 0, 0], yaw);
      applyAt(entry, registry, handle, 1000);
      closeVec(handle.getWorldPosition(), [before[0] + 2, before[1], before[2]]);
      const q = runtimeNodeParentedTransform(handle)!.localNode.quaternion!;
      closeVec(q, [x * Math.cos(yaw / 2), w * Math.sin(yaw / 2), x * Math.sin(yaw / 2), w * Math.cos(yaw / 2)]);
      expect(entry.rootMotionReport?.yawDelta).toBeCloseTo(yaw, 5);
    } finally { registry.dispose(); }
  });

  it("does not consume or mutate motion when a singular parent fails preflight, and can retry after repair", () => {
    setQrAnimationFlags(flags);
    const { registry, node, handle, root } = dynamicModel();
    try {
      const { entry } = actorEntry(node);
      root.setScale([0, 1, 1]);
      const before = handle.getWorldPosition();
      const warnings = applyAt(entry, registry, handle, 1000);
      closeVec(handle.getWorldPosition(), before);
      expect(entry.rootMotionCursors?.size ?? 0).toBe(0);
      expect([...warnings].join(" ")).toMatch(/singular|WORLD_TRANSFORM/i);
      root.setScale([2, 2, 2]);
      applyAt(entry, registry, handle, 1000);
      closeVec(handle.getWorldPosition(), [5, 2, 0]);
      expect(entry.rootMotionCursors?.get("root-motion:hero:walk")).toBe(1);
    } finally { registry.dispose(); }
  });

  it("reports unsupported parented look-at without consuming or applying the requested delta", () => {
    setQrAnimationFlags(flags);
    const initial = snapshot([parent([], { lookAt: [0, 0, 0] } as Partial<AuraSceneNode>)]);
    const registry = createAuraRuntimeNodeRegistry(initial, { flags });
    try {
      const node = model("hero");
      const handle = registry.add(node, { parent: "parent" });
      const { entry } = actorEntry(node);
      const warnings = new Set<string>();
      applyProductionActorAnimation(entry, entry.node, undefined, 1000, warnings,
        [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], () => {}, registry);
      closeVec(handle.position, [1, 0, 0]);
      expect(entry.rootMotionCursors?.size ?? 0).toBe(0);
      expect([...warnings].join(" ")).toContain("PARENTED_LOOK_AT_UNSUPPORTED");
    } finally { registry.dispose(); }
  });

  it("commits the cursor before a failing post-movement refresh so retry cannot move twice", () => {
    setQrAnimationFlags(flags);
    const { registry, node, handle } = dynamicModel();
    try {
      const { entry, samples } = actorEntry(node);
      const warnings = applyAt(entry, registry, handle, 1000, new Set(), () => { throw new Error("refresh failed"); });
      closeVec(handle.getWorldPosition(), [5, 2, 0]);
      expect([...warnings].join(" ")).toContain("refresh failed");
      applyAt(entry, registry, handle, 1000);
      closeVec(handle.getWorldPosition(), [5, 2, 0]);
      expect(samples).toEqual([{ fromTime: 0, toTime: 1 }, { fromTime: 1, toTime: 1 }]);
    } finally { registry.dispose(); }
  });

  it("rejects a prepared pose if its parent changes before publication without advancing the caller", () => {
    const { registry, handle, root } = dynamicModel();
    try {
      const commit = vi.fn();
      const publish = prepareRuntimeNodeRootMotion(handle, [2, 0, 0], 0);
      expect(publish).toBeDefined();
      root.setPosition(9, 0, 0);
      const before = handle.getWorldPosition();
      expect(() => publish!(commit)).toThrow(/PARENTED_TRANSFORM_SUPERSEDED/);
      expect(commit).not.toHaveBeenCalled();
      closeVec(handle.getWorldPosition(), before);
    } finally { registry.dispose(); }
  });

  it("preserves extract-only and unparented legacy handle behavior", () => {
    setQrAnimationFlags(flags);
    const { registry, node, handle } = dynamicModel({ animation: { clip: "walk", rootMotion: { mode: "extract-only" } } });
    try {
      const { entry } = actorEntry(node);
      applyAt(entry, registry, handle, 1000);
      closeVec(handle.getWorldPosition(), [3, 2, 0]);
      expect(entry.rootMotionReport?.accepted).toEqual([0, 0, 0]);
      expect(entry.rootMotionReport?.rejected).toEqual([2, 0, 0]);
      const translate = vi.fn();
      const rotation = vi.fn();
      const legacyHandle = { translate, setRotation: rotation, rotation: [0, 0, 0] } as unknown as AuraRuntimeNodeHandle;
      const legacy = actorEntry(model("hero"), [2, 0, 0], Math.PI / 4);
      applyProductionActorAnimation(legacy.entry, legacy.entry.node, undefined, 1000, new Set(),
        [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], () => {}, { get: () => legacyHandle } as never);
      expect(translate).toHaveBeenCalledWith(2, 0, 0);
      expect(rotation).toHaveBeenCalledWith(0, Math.PI / 4, 0);
    } finally { registry.dispose(); }
  });
});
