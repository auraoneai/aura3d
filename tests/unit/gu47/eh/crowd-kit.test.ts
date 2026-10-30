/**
 * GU47 E-H (WP-8) item 7: the crowd kit (`packages/engine/src/instances-model/CrowdKit.ts`).
 * A skinned GLB clip is baked into `poses` static meshes; the crowd draws one instanced node per
 * pose with per-spectator colour, clip phase and held pose index. Acceptance target: 480
 * spectators in <= 4 draws.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bakeCrowdPoses,
  clearCrowdPoseCache,
  createCrowd,
  loadCrowdPoses,
  sampleCrowdPoseSet,
  type AuraCrowdNodeHandle,
  type AuraCrowdSpectator
} from "../../../../packages/engine/src/instances-model/CrowdKit";
import { createTypedGLBActor } from "../../../../packages/engine/src/production-runtime/TypedGLBActor";
import type { AuraCustomGeometrySpec } from "../../../../packages/engine/src/agent-api/RootGeometry";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const translate = (x: number, y: number, z: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

/** A two-vertex-row "arm": vertex 0 on joint 0, vertex 1 on joint 1, vertex 2 split 50/50. */
function armPrimitive() {
  return {
    positions: [[0, 0, 0], [0, 1, 0], [0, 2, 0]] as const,
    normals: [[0, 0, 1], [0, 0, 1], [0, 0, 1]] as const,
    uvs: [[0, 0], [0, 1], [1, 1]] as const,
    indices: [0, 1, 2],
    joints: [[0, 0, 0, 0], [1, 0, 0, 0], [0, 1, 0, 0]] as const,
    weights: [[1, 0, 0, 0], [1, 0, 0, 0], [0.5, 0.5, 0, 0]] as const,
    color: [0.5, 0.25, 1, 1] as const
  };
}

function quadPose(lift: number): AuraCustomGeometrySpec {
  return {
    kind: "aura-custom-geometry",
    positions: new Float32Array([0, lift, 0, 1, lift, 0, 0, lift + 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint16Array([0, 1, 2])
  };
}

function recordingNodes() {
  const calls = new Map<string, { matrices: Float32Array; count: number; rgba?: Float32Array }[]>();
  const visibility = new Map<string, boolean[]>();
  const handle = (id: string): AuraCrowdNodeHandle => ({
    setInstanceMatrices(matrices, count, rgba) {
      const list = calls.get(id) ?? [];
      list.push({ matrices, count, ...(rgba ? { rgba } : {}) });
      calls.set(id, list);
    },
    setVisible(visible) {
      const list = visibility.get(id) ?? [];
      list.push(visible);
      visibility.set(id, list);
    }
  });
  const handles = new Map<string, AuraCrowdNodeHandle>();
  return {
    calls,
    visibility,
    target: { nodes: { get: (id: string) => handles.get(id) ?? (handles.set(id, handle(id)), handles.get(id)) } }
  };
}

function seats(count: number): AuraCrowdSpectator[] {
  const palette = ["#d94141", "#2f6fd6", "#f2c230", "#2fa35b"];
  return Array.from({ length: count }, (_, i) => ({
    position: [(i % 40) * 0.6, Math.floor(i / 40) * 0.45, Math.floor(i / 40) * 0.8] as const,
    yaw: Math.PI,
    color: palette[i % palette.length]!,
    phase: ((i * 7919) % 480) / 480
  }));
}

describe("GU47 E-H crowd kit: bake", () => {
  it("applies linear blend skinning per pose, grounds and scales to targetHeight", () => {
    const frames = [
      { primitives: [{ world: IDENTITY, palette: [...IDENTITY, ...IDENTITY] }] },
      // Pose 1: joint 1 moves +1 on x.
      { primitives: [{ world: IDENTITY, palette: [...IDENTITY, ...translate(1, 0, 0)] }] }
    ];
    const [rest, moved] = bakeCrowdPoses([armPrimitive()], frames, { targetHeight: 4 });
    // Rest pose: height 2 → scale 2, x centred on 0, feet on y = 0.
    expect(Array.from(rest!.positions as Float32Array)).toEqual([0, 0, 0, 0, 2, 0, 0, 4, 0]);
    // Moved pose shares pose 0's ground/centre map: vertex 1 +1 → +2 after scale; vertex 2 half of that.
    expect(Array.from(moved!.positions as Float32Array)).toEqual([0, 0, 0, 2, 2, 0, 1, 4, 0]);
    // Topology, UVs and colours are shared; colours carry the material factor.
    expect(moved!.indices).toBe(rest!.indices);
    expect(Array.from(rest!.colors as Float32Array).slice(0, 4)).toEqual([0.5, 0.25, 1, 1]);
    expect(Array.from(rest!.uvs as Float32Array)).toEqual([0, 0, 0, 1, 1, 1]);
    expect(rest!.bounds).toEqual({ min: [0, 0, 0], max: [0, 4, 0] });
  });

  it("transforms unskinned primitives by their node world matrix and rejects mismatched frames", () => {
    const prop = { positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] as const };
    const [pose] = bakeCrowdPoses([prop], [{ primitives: [{ world: translate(5, 3, 0) }] }]);
    // Grounded + centred on x: x span 5..6 → -0.5..0.5, y 3..4 → 0..1.
    expect(Array.from(pose!.positions as Float32Array)).toEqual([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0]);
    expect(() => bakeCrowdPoses([prop], [{ primitives: [] }])).toThrow(/CROWD_POSE_MISMATCH/);
    expect(() => bakeCrowdPoses([], [{ primitives: [] }])).toThrow(/CROWD_NO_MESH/);
  });
});

describe("GU47 E-H crowd kit: crowd", () => {
  it("draws 480 spectators in 4 instanced draws (one per pose) with per-spectator colour", () => {
    const crowd = createCrowd({ id: "stands", poses: [quadPose(0), quadPose(0.1), quadPose(0.2), quadPose(0.3)], spectators: seats(480) });
    expect(crowd.nodes).toHaveLength(4);
    expect(crowd.nodeIds).toEqual(["stands:pose-0", "stands:pose-1", "stands:pose-2", "stands:pose-3"]);
    const plan = crowd.drawPlan(0);
    expect(plan.draws).toBeLessThanOrEqual(4);
    expect(plan.draws).toBe(4);
    expect(plan.perNode.map((node) => node.count)).toEqual([120, 120, 120, 120]);
    expect(plan.triangles).toBe(480);
    // Each pose node is one instanced custom-geometry primitive carrying every slot of its capacity.
    const json = crowd.nodes[0]!.toJSON() as { kind: string; instances?: readonly unknown[]; instanceColors?: readonly unknown[]; runtime?: { id: string } };
    expect(json.kind).toBe("primitive");
    expect(json.instances).toHaveLength(120);
    expect(json.instanceColors).toHaveLength(120);
    expect(json.runtime?.id).toBe("stands:pose-0");

    const nodes = recordingNodes();
    expect(crowd.update(nodes.target, 0)).toBe(4);
    for (const id of crowd.nodeIds) {
      const [call] = nodes.calls.get(id)!;
      expect(call!.count).toBe(120);
      // Instance colours are linear RGBA, one per slot.
      expect(call!.rgba!.length).toBeGreaterThanOrEqual(120 * 4);
    }
  });

  it("steps each phase group to the next pose node every loop frame, with constant counts and no new buffers", () => {
    const crowd = createCrowd({ id: "c", poses: { poses: [quadPose(0), quadPose(1), quadPose(2), quadPose(3)], clipSeconds: 2, triangles: 1 }, spectators: seats(8) });
    const nodes = recordingNodes();
    crowd.update(nodes.target, 0);
    const firstPose0 = nodes.calls.get("c:pose-0")![0]!;
    const positionsAt = (call: { matrices: Float32Array; count: number }) =>
      Array.from({ length: call.count }, (_, i) => `${call.matrices[i * 16 + 12]},${call.matrices[i * 16 + 14]}`).sort().join(";");
    const group0 = positionsAt(firstPose0);
    // Same frame, nothing dirty: no rewrite.
    crowd.update(nodes.target, 0.1);
    expect(nodes.calls.get("c:pose-0")).toHaveLength(1);
    // Frame 1 (0.5 s of a 2 s loop with 4 poses): group 0 is now on pose node 1.
    expect(crowd.frameAt(0.5)).toBe(1);
    crowd.update(nodes.target, 0.5);
    const pose1AtFrame1 = nodes.calls.get("c:pose-1")![1]!;
    expect(positionsAt(pose1AtFrame1)).toBe(group0);
    // The kit hands the same preallocated arrays every frame and the counts stay constant.
    expect(nodes.calls.get("c:pose-0")![1]!.matrices).toBe(firstPose0.matrices);
    for (const id of crowd.nodeIds) expect(nodes.calls.get(id)!.map((call) => call.count)).toEqual([2, 2]);
  });

  it("held poses stay on their node; empty nodes are hidden instead of drawn", () => {
    const spectators: AuraCrowdSpectator[] = [
      { position: [0, 0, 0], pose: 2, color: "#ffffff" },
      { position: [1, 0, 0], pose: 6, color: "#ffffff" } // 6 mod 4 = 2
    ];
    const crowd = createCrowd({ id: "held", poses: [quadPose(0), quadPose(1), quadPose(2), quadPose(3)], spectators });
    expect(crowd.drawPlan(0).perNode.map((node) => node.count)).toEqual([0, 0, 2, 0]);
    const nodes = recordingNodes();
    expect(crowd.update(nodes.target, 0)).toBe(1);
    expect(nodes.calls.get("held:pose-2")![0]!.count).toBe(2);
    expect(nodes.calls.has("held:pose-0")).toBe(false);
    expect(nodes.visibility.get("held:pose-0")).toEqual([false]);
    expect(nodes.visibility.has("held:pose-2")).toBe(false);
  });

  it("writes T·Ry(yaw)·S matrices, live yaw edits and a per-spectator bob", () => {
    const crowd = createCrowd({ id: "m", poses: [quadPose(0)], spectators: [{ position: [3, 1, -2], yaw: Math.PI / 2, scale: 2, color: "#ffffff" }], bob: 0.1 });
    const nodes = recordingNodes();
    crowd.update(nodes.target, 0);
    const m = nodes.calls.get("m:pose-0")![0]!.matrices;
    expect(m[0]).toBeCloseTo(0, 6);
    expect(m[2]).toBeCloseTo(-2, 6);
    expect(m[8]).toBeCloseTo(2, 6);
    expect(m[5]).toBe(2);
    expect([m[12], m[13], m[14]]).toEqual([3, 1, -2]);
    // Half a loop later the bob is at its top (0.1); bob rewrites every frame.
    crowd.update(nodes.target, 0.5);
    expect(nodes.calls.get("m:pose-0")![1]!.matrices[13]).toBeCloseTo(1.1, 5);
    crowd.setYaw(0, 0);
    crowd.update(nodes.target, 0.5);
    expect(nodes.calls.get("m:pose-0")![2]!.matrices[0]).toBeCloseTo(2, 6);
  });
});

const CESIUM_MAN = new Uint8Array(readFileSync("fixtures/three-compat/assets/corpus/cesium-man.glb"));
const nativeFetch = globalThis.fetch;
let fetches = 0;

describe("GU47 E-H crowd kit: bake from a skinned GLB", () => {
  beforeEach(() => {
    fetches = 0;
    clearCrowdPoseCache();
    globalThis.fetch = (async () => {
      fetches += 1;
      return new Response(new Uint8Array(CESIUM_MAN), { status: 200 });
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = nativeFetch;
  });

  it("samples distinct skinned poses from CesiumMan's clip", async () => {
    const actor = await createTypedGLBActor({ asset: { url: "https://assets.invalid/gu47-eh/crowd-cesium.glb", type: "model", format: "glb" }, id: "crowd-src", width: 1, height: 1, shareTextures: false });
    try {
      const set = sampleCrowdPoseSet(actor, { poses: 4, targetHeight: 1.7 });
      expect(set.poses).toHaveLength(4);
      expect(set.clip).toBeDefined();
      expect(set.clipSeconds).toBeGreaterThan(0);
      expect(set.triangles).toBeGreaterThan(100);
      const height = (pose: AuraCustomGeometrySpec) => pose.bounds!.max[1] - pose.bounds!.min[1];
      expect(height(set.poses[0]!)).toBeCloseTo(1.7, 3);
      // A walk cycle: poses differ.
      const a = set.poses[0]!.positions as Float32Array;
      const b = set.poses[2]!.positions as Float32Array;
      let delta = 0;
      for (let i = 0; i < a.length; i += 1) delta = Math.max(delta, Math.abs(a[i]! - b[i]!));
      expect(delta).toBeGreaterThan(0.01);
      expect(() => sampleCrowdPoseSet(actor, { clip: "Nope" })).toThrow(/CROWD_CLIP_NOT_FOUND/);
    } finally {
      actor.dispose();
    }
  });

  it("loadCrowdPoses bakes once per (asset, clip, poses, height) and feeds createCrowd", async () => {
    const asset = { url: "https://assets.invalid/gu47-eh/crowd-cesium-load.glb", type: "model", format: "glb", hash: "sha256-cesium" };
    const [first, second] = await Promise.all([loadCrowdPoses(asset, { poses: 4 }), loadCrowdPoses(asset, { poses: 4 })]);
    expect(second).toBe(first);
    const fetchesAfterBake = fetches;
    expect(await loadCrowdPoses(asset, { poses: 4 })).toBe(first);
    expect(fetches).toBe(fetchesAfterBake);
    const crowd = createCrowd({ id: "fans", poses: first, spectators: seats(480) });
    expect(crowd.drawPlan(0).draws).toBe(4);
    expect(crowd.drawPlan(0).trianglesPerSpectator).toBe(first.triangles);
  });
});
