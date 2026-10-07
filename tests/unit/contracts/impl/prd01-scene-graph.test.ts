/**
 * PRD-01 Phase-1 C-06 real-implementation tests (lane 01). Spec:
 * PRD-01 §15 Phase-1 items (a)–(f).
 *
 * (a) rotated parent [0, π/2, 0] with child at [1,0,0] gives world [0,0,−1]
 * (b) parent scale 6 with child at [1,0,0] gives [6,0,0]
 * (c) translation-only groups identical to the PR 0a stub
 * (d) a three-level nest matches three.js Object3D to 1e-5
 * (e) shear flags SCENE_GRAPH_SHEAR
 * (f) "ZYX" default reproduces legacy rotationXYZ for 100 random Eulers
 * (g) 1,000-node static scene: 1,000 composes on frame 1, 0 on frame 2
 */

import { describe, expect, it } from "vitest";
import * as THREE from "three";

import * as stub from "../../../../packages/engine/src/contracts/sceneGraph";
import {
  SCENE_GRAPH_SHEAR,
  composeWorldMatrix,
  composeWorldMatrixWithLookAt,
  createWorldMatrixCache,
  decomposeMatrix,
  eulerToQuaternion,
  lookAtWorldQuaternion,
  multiplyMat4Into
} from "../../../../packages/engine/src/agent-api/sceneGraph";

const I = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** Legacy index.ts rotationXYZ: Rz·Ry·Rx (column-major). */
function rotationXYZ(rotation: readonly [number, number, number]): Float32Array {
  const [x, y, z] = rotation;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  const rx = new Float32Array([1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1]);
  const ry = new Float32Array([cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1]);
  const rz = new Float32Array([cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const out = new Float32Array(16);
  multiplyMat4Into(out, rz, (() => { const t = new Float32Array(16); multiplyMat4Into(t, ry, rx); return t; })());
  return out;
}

function quatToMatrix(q: readonly [number, number, number, number]): Float32Array {
  const m = new Float32Array(16);
  const out = composeWorldMatrix(null, { quaternion: q }, m);
  return out;
}

function expectClose(actual: ArrayLike<number>, expected: ArrayLike<number>, eps = 1e-6): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i += 1) {
    expect(Math.abs((actual[i] ?? 0) - (expected[i] ?? 0))).toBeLessThan(eps);
  }
}

describe("prd01 C-06 composeWorldMatrix", () => {
  it("(a) rotated parent [0,π/2,0] + child at [1,0,0] gives world [0,0,−1]", () => {
    const parent = composeWorldMatrix(null, { rotation: [0, Math.PI / 2, 0] }, new Float32Array(16));
    const world = composeWorldMatrix(parent, { position: [1, 0, 0] }, new Float32Array(16));
    expectClose([world[12]!, world[13]!, world[14]!], [0, 0, -1], 1e-6);
  });

  it("(b) parent scale 6 + child at [1,0,0] gives world [6,0,0]", () => {
    const parent = composeWorldMatrix(null, { scale: 6 }, new Float32Array(16));
    const world = composeWorldMatrix(parent, { position: [1, 0, 0] }, new Float32Array(16));
    expectClose([world[12]!, world[13]!, world[14]!], [6, 0, 0], 1e-6);
  });

  it("(c) translation-only groups match the PR 0a stub", () => {
    const parent = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, -2, 9, 1]);
    const local = { position: [3, -1, 0.5] as const };
    const real = composeWorldMatrix(parent, local, new Float32Array(16));
    const stubM = stub.composeWorldMatrix(parent, local as never, new Float32Array(16));
    expectClose(real, stubM, 1e-7);
  });

  it("(d) three-level nest matches three.js Object3D within 1e-5", () => {
    const specs = [
      { position: [1, 2, -3] as const, rotation: [0.3, -0.7, 0.9] as const, scale: [2, 1, 0.5] as const },
      { position: [-1, 0.5, 2] as const, rotation: [-1.1, 0.4, 0.2] as const, scale: [0.5, 3, 1] as const },
      { position: [0.25, -4, 1] as const, rotation: [0.9, 0.9, -1.3] as const, scale: [1, 1, 4] as const }
    ];
    // Aura path (ZYX == three.js "ZYX").
    let world = composeWorldMatrix(null, specs[0], new Float32Array(16));
    world = composeWorldMatrix(world, specs[1], new Float32Array(16));
    world = composeWorldMatrix(world, specs[2], new Float32Array(16));
    // three.js path.
    const root = new THREE.Object3D();
    const mid = new THREE.Object3D();
    const leaf = new THREE.Object3D();
    [root, mid, leaf].forEach((node, i) => {
      node.position.set(specs[i]!.position[0], specs[i]!.position[1], specs[i]!.position[2]);
      node.rotation.set(specs[i]!.rotation[0], specs[i]!.rotation[1], specs[i]!.rotation[2], "ZYX");
      node.scale.set(specs[i]!.scale[0], specs[i]!.scale[1], specs[i]!.scale[2]);
    });
    root.add(mid);
    mid.add(leaf);
    root.updateMatrixWorld(true);
    expectClose(Array.from(world), leaf.matrixWorld.elements, 1e-5);
  });

  it("(d') every Euler order matches three.js setFromEuler", () => {
    const orders = ["XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"] as const;
    const eulers = [
      [0.3, -0.7, 0.9],
      [-1.1, 0.4, 0.2],
      [1.57, -2.2, 0.05],
      [0.01, 0.02, 3.1]
    ] as const;
    for (const order of orders) {
      const te = new THREE.Euler();
      const tq = new THREE.Quaternion();
      for (const e of eulers) {
        te.set(e[0], e[1], e[2], order);
        tq.setFromEuler(te);
        const q = eulerToQuaternion(e, order);
        expectClose(q, [tq.x, tq.y, tq.z, tq.w], 1e-6);
      }
    }
  });

  it("(e) decomposeMatrix reports shear for non-orthogonal bases", () => {
    // Shear: column 0 = (1,0,0), column 1 = (1,1,0) — not orthogonal.
    const m = Float32Array.from([1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1]);
    const d = decomposeMatrix(m);
    expect(d.sheared).toBe(true);
    expect(d.position).toEqual([5, 6, 7]);
    expect(SCENE_GRAPH_SHEAR).toBe("SCENE_GRAPH_SHEAR");
    const clean = composeWorldMatrix(null, { rotation: [0.5, -0.2, 1.1], scale: [2, 3, 1] }, new Float32Array(16));
    expect(decomposeMatrix(clean).sheared).toBe(false);
  });

  it("(f) \"ZYX\" default reproduces legacy rotationXYZ for 100 random Eulers", () => {
    let seed = 0x9e3779b9;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed / 0x7fffffff) * Math.PI * 4 - Math.PI * 2;
    };
    for (let i = 0; i < 100; i += 1) {
      const euler: [number, number, number] = [rand(), rand(), rand()];
      const legacy = rotationXYZ(euler);
      const real = quatToMatrix(eulerToQuaternion(euler));
      expectClose(Array.from(real), Array.from(legacy), 1e-6);
    }
  });

  it("(g) 1,000-node static scene: 1,000 composes frame 1, 0 on frame 2", () => {
    const cache = createWorldMatrixCache();
    const nodes = Array.from({ length: 1000 }, (_, i) => ({
      position: [i % 10, i % 7, i % 5] as const,
      rotation: [0, (i % 8) * 0.1, 0] as const
    }));
    const parent = composeWorldMatrix(null, { position: [1, 0, 0] }, new Float32Array(16));
    const out = new Float32Array(16);
    cache.beginFrame();
    for (const node of nodes) cache.world(node, parent, out);
    expect(cache.composed).toBe(1000);
    cache.beginFrame();
    for (const node of nodes) cache.world(node, parent, out);
    expect(cache.composed).toBe(0);
    // Mutating one node recomposes only that node.
    nodes[0]!.position = [9, 9, 9];
    cache.beginFrame();
    for (const node of nodes) cache.world(node, parent, out);
    expect(cache.composed).toBe(1);
    expect([out[12], out[13], out[14]]).not.toEqual([1, 0, 0]);
  });

  it("lookAt orients -Z toward the target in world space", () => {
    // Eye at origin looking down -Z: identity rotation.
    const q0 = lookAtWorldQuaternion([0, 0, 0], [0, 0, -1]);
    const m0 = quatToMatrix(q0);
    // Identity columns.
    expectClose([m0[0]!, m0[1]!, m0[2]!], [1, 0, 0], 1e-6);
    expectClose([m0[4]!, m0[5]!, m0[6]!], [0, 1, 0], 1e-6);
    expectClose([m0[8]!, m0[9]!, m0[10]!], [0, 0, 1], 1e-6);
    // Eye at origin looking at +X: forward column (−Z basis) becomes +X.
    const qx = lookAtWorldQuaternion([0, 0, 0], [1, 0, 0]);
    const mx = quatToMatrix(qx);
    expectClose([mx[8]!, mx[9]!, mx[10]!], [-1, 0, 0], 1e-6);
    // composeWorldMatrixWithLookAt places the node and faces the target.
    const world = composeWorldMatrixWithLookAt(null, { position: [0, 0, 5], lookAt: [0, 0, 0] }, new Float32Array(16));
    expectClose([world[12]!, world[13]!, world[14]!], [0, 0, 5], 1e-6);
  });
});
