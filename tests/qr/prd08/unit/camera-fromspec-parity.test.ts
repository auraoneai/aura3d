/**
 * S4 — legacy parity: `rigs.fromSpec` reproduces `resolveCameraFrame`
 * (index.ts:11078) exactly, over 40 golden tuples and several frame times.
 */
import { describe, expect, it } from "vitest";
import type { AuraCameraSpec, AuraSceneSnapshot } from "@aura3d/engine";
import { resolveCameraFrame, type AuraRuntimeNodeRegistry, createFromSpecRig, type LegacySpecRigDeps } from "@aura3d/engine/lanes";
import type { AuraCameraRigContext, AuraCameraPose } from "@aura3d/engine/contracts";

type V3 = readonly [number, number, number];
const v3 = (x: number, y: number, z: number): V3 => [x, y, z];

interface FakeNode {
  id: string;
  name?: string;
  tags: string[];
  position: V3;
  rotation: V3;
  visible: boolean;
}

function fakeRegistry(nodes: FakeNode[]): AuraRuntimeNodeRegistry {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const handle = (n: FakeNode) => ({
    id: n.id,
    name: n.name,
    tags: n.tags,
    position: n.position as V3,
    rotation: n.rotation as V3,
    visible: n.visible,
    bounds: () => ({ min: n.position, max: n.position })
  });
  return {
    get: (id: string) => {
      const n = byId.get(id);
      return n ? (handle(n) as never) : undefined;
    },
    require: (id: string) => {
      const n = byId.get(id);
      if (!n) throw new Error(`missing ${id}`);
      return handle(n) as never;
    },
    has: (id: string) => byId.has(id),
    ids: () => nodes.map((n) => n.id),
    all: () => nodes.map(handle) as never
  } as AuraRuntimeNodeRegistry;
}

function fakeSnapshot(nodes: readonly object[]): AuraSceneSnapshot {
  return {
    schema: "aura3d-scene-snapshot/1.0",
    background: "#000",
    camera: { mode: "perspective" } as AuraCameraSpec,
    nodes: nodes as never,
    diagnostics: { enabled: false }
  } as AuraSceneSnapshot;
}

const heroById: FakeNode = { id: "rt-hero", name: "hero", tags: [], position: v3(1, 0.5, -2), rotation: v3(0, 0.7, 0), visible: true };
const heroByTag: FakeNode = { id: "rt-tagged", name: "other", tags: ["hero"], position: v3(-3, 1, 4), rotation: v3(0, -0.4, 0), visible: true };
const heroHidden: FakeNode = { id: "rt-hidden", name: "hero", tags: [], position: v3(9, 9, 9), rotation: v3(0, 0, 0), visible: false };
const heroScene = { kind: "primitive", name: "scene-hero", position: v3(2, 1, 2), runtime: undefined };
const heroSceneAsset = { kind: "model", asset: { id: "hero-asset" }, position: v3(-1, 0.5, 3) };

/** Legacy-equivalent deps: runtime (findRuntimeCameraTarget) then scene node. */
function legacyDeps(spec: AuraCameraSpec, registry: AuraRuntimeNodeRegistry | undefined, flatNodes: readonly { kind: string; name?: string; position?: V3; rotation?: V3; runtime?: { id?: string }; asset?: { id?: string } }[]): LegacySpecRigDeps {
  return {
    runtimeTarget: () => {
      if (spec.mode !== "follow" || !spec.targetNode || !registry) return undefined;
      const direct = registry.get(spec.targetNode) as { position: V3; rotation: V3 } | undefined;
      if (direct) return { position: direct.position, rotationY: direct.rotation[1] };
      const named = registry.all().find(
        (h) => (h as { visible?: boolean }).visible !== false && ((h as { name?: string }).name === spec.targetNode || (h as { tags: readonly string[] }).tags.includes(spec.targetNode!))
      ) as { position: V3; rotation: V3 } | undefined;
      return named ? { position: named.position, rotationY: named.rotation[1] } : undefined;
    },
    sceneTarget: () => {
      const node = flatNodes.find(
        (n) =>
          (n.kind === "model" || n.kind === "primitive") &&
          (n.name === spec.targetNode || (n.kind === "model" && n.asset?.id === spec.targetNode) || n.runtime?.id === spec.targetNode)
      );
      return node?.position;
    }
  };
}

function ctx(timeMs: number): AuraCameraRigContext {
  return {
    dt: 1 / 60,
    time: timeMs,
    aspect: 16 / 9,
    previous: { position: [0, 0, 0], target: [0, 0, 0], up: [0, 1, 0], roll: 0, fov: 50, near: 0.1, far: 100 },
    subject: () => undefined,
    probe: { sphereCast: () => ({ hit: false, distance: Infinity }), occluders: () => [] }
  };
}

interface Case {
  name: string;
  spec: AuraCameraSpec;
  registry?: AuraRuntimeNodeRegistry;
  sceneNodes?: readonly ReturnType<typeof Object>[];
  times: readonly number[];
}

const followRegistry = fakeRegistry([heroById, heroByTag]);
const hiddenRegistry = fakeRegistry([heroHidden]);

const cases: Case[] = [
  { name: "perspective explicit", spec: { mode: "perspective", position: v3(1, 2, 3), target: v3(0, 0, 0), fov: 60 }, times: [0, 16.7, 33.4] },
  { name: "perspective defaults", spec: { mode: "perspective" } as AuraCameraSpec, times: [0, 16.7] },
  { name: "orbit dist 4", spec: { mode: "orbit", distance: 4, target: v3(0, 1, 0) }, times: [0, 16.7] },
  { name: "orbit explicit pos", spec: { mode: "orbit", distance: 10, position: v3(5, 5, 5) }, times: [0] },
  { name: "orbit fov/near/far", spec: { mode: "orbit", distance: 2, fov: 35, near: 0.5, far: 200 }, times: [16.7] },
  { name: "follow runtime id no smoothing", spec: { mode: "follow", targetNode: "rt-hero" }, registry: followRegistry, times: [0, 16.7] },
  { name: "follow runtime name", spec: { mode: "follow", targetNode: "hero" }, registry: followRegistry, times: [0, 50] },
  { name: "follow runtime tag", spec: { mode: "follow", targetNode: "hero", distance: 6 }, registry: fakeRegistry([heroByTag]), times: [0] },
  { name: "follow hidden direct-id stays", spec: { mode: "follow", targetNode: "rt-hidden" }, registry: hiddenRegistry, times: [0] },
  { name: "follow miss → spec.target", spec: { mode: "follow", targetNode: "nobody", target: v3(3, 3, 3) }, registry: followRegistry, times: [0, 16.7] },
  { name: "follow scene-node name", spec: { mode: "follow", targetNode: "scene-hero" }, registry: followRegistry, sceneNodes: [heroScene], times: [0, 33] },
  { name: "follow scene-node asset id", spec: { mode: "follow", targetNode: "hero-asset" }, registry: followRegistry, sceneNodes: [heroSceneAsset], times: [0] },
  { name: "follow offset plain", spec: { mode: "follow", targetNode: "rt-hero", offset: v3(0, 2, -4) }, registry: followRegistry, times: [0, 16.7] },
  { name: "follow offset target-yaw", spec: { mode: "follow", targetNode: "rt-hero", offset: v3(0, 2, -4), offsetMode: "target-yaw" }, registry: followRegistry, times: [0, 16.7, 300] },
  { name: "follow targetOffset target-yaw", spec: { mode: "follow", targetNode: "rt-hero", targetOffset: v3(0.5, 1, 0), offsetMode: "target-yaw" }, registry: followRegistry, times: [0, 16.7] },
  { name: "follow smoothing 0.045", spec: { mode: "follow", targetNode: "rt-hero", smoothing: 0.045 }, registry: followRegistry, times: [0, 16.7, 33.4, 50.1] },
  { name: "follow smoothing 0.18 gap snap", spec: { mode: "follow", targetNode: "rt-hero", smoothing: 0.18 }, registry: followRegistry, times: [0, 16.7, 500, 516.7] },
  { name: "follow smoothing same-time reuse", spec: { mode: "follow", targetNode: "rt-hero", smoothing: 0.5 }, registry: followRegistry, times: [100, 100, 116.7] },
  { name: "follow smoothing no registry", spec: { mode: "follow", targetNode: "x", smoothing: 0.5 }, times: [0, 16.7] },
  { name: "follow smoothing scene-target", spec: { mode: "follow", targetNode: "scene-hero", smoothing: 0.3 }, registry: followRegistry, sceneNodes: [heroScene], times: [0, 16.7, 33] },
  { name: "dolly default", spec: { mode: "dolly" }, times: [0, 1000, 3000] },
  { name: "dolly custom", spec: { mode: "dolly", from: v3(0, 0, 0), to: v3(10, 0, 0), seconds: 4 }, times: [0, 1000, 2000, 4000] },
  { name: "path easeInOut", spec: { mode: "path", from: v3(0, 0, 0), to: v3(0, 10, 0), seconds: 5 }, times: [0, 1250, 2500, 5000] },
  { name: "path linear", spec: { mode: "path", from: v3(0, 0, 0), to: v3(0, 10, 0), seconds: 5, easing: "linear" }, times: [0, 1250, 2500, 5000] },
  { name: "path captureTime", spec: { mode: "path", from: v3(0, 0, 0), to: v3(4, 0, 0), seconds: 2, captureTime: 1.0 }, times: [0, 9999] },
  { name: "flythrough", spec: { mode: "flythrough", from: v3(1, 1, 1), to: v3(-1, -1, -1), seconds: 3 }, times: [0, 1500] },
  { name: "orthographicSize passthrough", spec: { mode: "orthographic", position: v3(0, 5, 5), target: v3(0, 0, 0), orthographicSize: 7 } as AuraCameraSpec, times: [0] },
  { name: "isometric", spec: { mode: "isometric", position: v3(4, 4, 4), target: v3(0, 0, 0) }, times: [0] },
  { name: "follow smoothing 0 (clamp)", spec: { mode: "follow", targetNode: "rt-hero", smoothing: 0 }, registry: followRegistry, times: [0, 16.7] },
  { name: "follow smoothing 0.98 (clamp)", spec: { mode: "follow", targetNode: "rt-hero", smoothing: 0.98 }, registry: followRegistry, times: [0, 16.7, 33] },
  { name: "follow smoothing negative", spec: { mode: "follow", targetNode: "rt-hero", smoothing: -0.5 }, registry: followRegistry, times: [0, 16.7] },
  { name: "follow distance default", spec: { mode: "follow", targetNode: "rt-hero" }, registry: followRegistry, times: [16.7] },
  { name: "dolly eased loop wrap", spec: { mode: "dolly", from: v3(0, 0, 0), to: v3(8, 0, 0), seconds: 2 }, times: [0, 500, 1500, 2500, 4500] },
  { name: "orbit target node-follow n/a", spec: { mode: "orbit", distance: 3 }, times: [0, 16.7] },
  { name: "follow targetOffset no mode", spec: { mode: "follow", targetNode: "rt-hero", targetOffset: v3(0, 0.5, 0) }, registry: followRegistry, times: [0, 16.7] },
  { name: "perspective near/far passthrough", spec: { mode: "perspective", position: v3(0, 0, 5), near: 1, far: 50 }, times: [0] },
  { name: "follow offset scene-mode", spec: { mode: "follow", targetNode: "rt-hero", offset: v3(1, 1, 1), offsetMode: "scene" }, registry: followRegistry, times: [0, 16.7] },
  { name: "follow tag hidden skip → scene", spec: { mode: "follow", targetNode: "hero" }, registry: hiddenRegistry, sceneNodes: [heroScene], times: [0] },
  { name: "path seconds tiny clamp", spec: { mode: "path", seconds: 0.0001, from: v3(0, 0, 0), to: v3(2, 0, 0) }, times: [0, 50] },
  { name: "orbit default distance/target", spec: { mode: "orbit" }, times: [0, 16.7, 100] }
];

const EPS = 1e-6;

describe("S4 — fromSpec legacy parity (40 tuples)", () => {
  it(`covers ${cases.length} cases`, () => {
    expect(cases.length).toBeGreaterThanOrEqual(40);
  });

  for (const [i, c] of cases.entries()) {
    it(`${String(i).padStart(2, "0")} ${c.name}`, () => {
      const snapshot = fakeSnapshot(c.sceneNodes ?? []);
      const flat = (c.sceneNodes ?? []) as never[];
      const deps = legacyDeps(c.spec, c.registry, flat as never);
      const rig = createFromSpecRig(c.spec, deps);
      for (const t of c.times) {
        const expected = resolveCameraFrame(snapshot, c.spec, t, c.registry);
        const pose = rig.update(ctx(t));
        for (const [k, a, b] of [
          ["position.x", pose.position[0], expected.eye[0]],
          ["position.y", pose.position[1], expected.eye[1]],
          ["position.z", pose.position[2], expected.eye[2]],
          ["target.x", pose.target[0], expected.target[0]],
          ["target.y", pose.target[1], expected.target[1]],
          ["target.z", pose.target[2], expected.target[2]]
        ] as const) {
          expect(Math.abs(a - b), `${k} @t=${t}`).toBeLessThanOrEqual(EPS);
        }
      }
    });
  }

  it("fov/near/far/ortho fields pass through", () => {
    const spec = { mode: "perspective", fov: 33, near: 0.2, far: 321, orthographicSize: 4 } as AuraCameraSpec;
    const rig = createFromSpecRig(spec, legacyDeps(spec, undefined, []));
    const pose: AuraCameraPose = rig.update(ctx(0));
    expect(pose.fov).toBe(33);
    expect(pose.near).toBe(0.2);
    expect(pose.far).toBe(321);
    expect(pose.orthographicSize).toBe(4);
  });
});
