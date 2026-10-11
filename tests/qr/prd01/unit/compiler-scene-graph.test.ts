/**
 * 01-S2 / 01-T1.5 — compiler/sceneGraph.ts (C-06 under A3D_QR_CORE).
 *
 * - flag off: flatten + model matrix are the legacy sceneMath bodies, verbatim
 * - flag on, root nodes, default "ZYX": model matrices bit-identical to legacy
 *   (50 random TRS)
 * - six Euler orders match three.js Object3D within 1e-5
 * - quaternion wins over rotation
 * - groups compose world = parent · local (rotated/scaled parents, 3-level nest
 *   vs three.js), shear -> SCENE_GRAPH_SHEAR + full world matrix
 * - S(size ⊙ fit) is the innermost factor
 * - option rows `transform.rotationOrder` / `transform.quaternion` change the
 *   RenderSource (createProductionRuntimeRendererInput) only with the flag on
 */

import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  SCENE_GRAPH_SHEAR,
  createModelMatrixV2,
  flattenAuraSceneNodes,
  flattenAuraSceneSnapshot,
  flattenSceneNodesV2,
  modelMatrixFor,
  quaternionToEulerZYX,
  worldTransformOf,
  type Prd01SceneGraphDegradation
} from "../../../../packages/engine/src/agent-api/compiler/sceneGraph";
import { createModelMatrix, flattenSceneNodes, flattenSceneSnapshot } from "../../../../packages/engine/src/agent-api/sceneMath";
import { createModelMatrixCache, eulerToQuaternion } from "../../../../packages/engine/src/agent-api/sceneGraph";
import { createProductionRuntimeRendererInput, setPrd01ModelMatrixCache } from "../../../../packages/engine/src/agent-api/compiler/renderInput";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import type { AuraEulerOrder } from "../../../../packages/engine/src/contracts/sceneGraph";
import type {
  AuraGroupNode,
  AuraPrimitiveNode,
  AuraSceneNode,
  AuraSceneSnapshot,
  AuraTransformSpec,
  AuraVec3,
  ProductionRuntimePrimitiveEntry
} from "../../../../packages/engine/src/agent-api/nodes/types";

/** Flattened nodes all carry transform fields (pass-through kinds are not inspected here). */
type FlatNode = AuraTransformSpec & { readonly kind: string };
const flatV2 = (nodes: readonly AuraSceneNode[], options?: Parameters<typeof flattenSceneNodesV2>[1]): FlatNode[] =>
  flattenSceneNodesV2(nodes, options) as unknown as FlatNode[];
const flatLegacy = (nodes: readonly AuraSceneNode[]): FlatNode[] => flattenSceneNodes(nodes) as unknown as FlatNode[];

const UNIT_BOUNDS = { min: [-0.5, -0.5, -0.5] as AuraVec3, max: [0.5, 0.5, 0.5] as AuraVec3 };
const ORDERS: readonly AuraEulerOrder[] = ["XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"];

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function box(extra: Partial<AuraPrimitiveNode> = {}): AuraPrimitiveNode {
  return { kind: "primitive", primitive: "box", ...extra } as AuraPrimitiveNode;
}

function group(children: readonly AuraSceneNode[], extra: Partial<AuraGroupNode> = {}): AuraGroupNode {
  return { kind: "group", children, ...extra } as AuraGroupNode;
}

function expectClose(actual: ArrayLike<number>, expected: ArrayLike<number>, eps = 1e-5): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i += 1) {
    expect(Math.abs((actual[i] ?? 0) - (expected[i] ?? 0)), `index ${i}`).toBeLessThan(eps);
  }
}

function threeOrder(order: AuraEulerOrder): THREE.EulerOrder {
  // Aura order "ABC" = Ra·Rb·Rc (column vectors) = three.js Euler order "ABC".
  return order as THREE.EulerOrder;
}

/** Fixture scenes covering every flatten branch (groups, nesting, lookAt, pass-through kinds). */
function fixtureScenes(): readonly (readonly AuraSceneNode[])[] {
  return [
    [box()],
    [box({ position: [1, 2, 3], rotation: [0.1, 0.2, 0.3], scale: 2 })],
    [group([box({ position: [1, 0, 0] })], { position: [0, 1, 0] })],
    [group([box({ position: [1, 0, 0], rotation: [0, 0.5, 0] })], { rotation: [0, Math.PI / 2, 0] })],
    [group([group([box({ scale: [1, 2, 3] })], { scale: 2 })], { position: [3, 0, 0], rotation: [0.2, 0, 0] })],
    [group([{ kind: "light", light: "spot", position: [0, 2, 0] } as unknown as AuraSceneNode], { lookAt: [0, 0, 0], position: [1, 0, 0] })],
    [group([{ kind: "effect", effect: "bloom" } as unknown as AuraSceneNode, box()], { position: [0, 0, 1] })],
    [group([box({ position: [0.5, 0.5, 0.5] })])]
  ];
}

describe("01-S2 compiler/sceneGraph — flag off is the legacy path, verbatim", () => {
  it("flattenAuraSceneNodes(flag off) deep-equals legacy flattenSceneNodes on every fixture", () => {
    for (const nodes of fixtureScenes()) {
      expect(flattenAuraSceneNodes(nodes, false)).toEqual(flatLegacy(nodes));
      expect(flattenAuraSceneNodes(nodes, resolveQrFlags({}))).toEqual(flatLegacy(nodes));
    }
  });

  it("flattenAuraSceneSnapshot(flag off) deep-equals legacy flattenSceneSnapshot", () => {
    const snapshot = {
      schema: "aura3d-scene-snapshot/1.0",
      background: "#000000",
      diagnostics: { enabled: false },
      nodes: fixtureScenes().flat(),
      camera: { mode: "orbit", position: [0, 0, 5], target: [0, 0, 0] }
    } as unknown as AuraSceneSnapshot;
    expect(flattenAuraSceneSnapshot(snapshot, false)).toEqual(flattenSceneSnapshot(snapshot));
  });

  it("modelMatrixFor(flag off) is the legacy createModelMatrix itself", () => {
    expect(modelMatrixFor(false)).toBe(createModelMatrix);
    expect(modelMatrixFor(resolveQrFlags({}))).toBe(createModelMatrix);
  });

  it("flag-off ignores rotationOrder/quaternion (legacy behaviour unchanged)", () => {
    const a = createModelMatrix(box({ rotation: [0.3, 0.5, 0.7] }), UNIT_BOUNDS, false);
    const b = createModelMatrix(box({ rotation: [0.3, 0.5, 0.7], rotationOrder: "XYZ", quaternion: [0, 1, 0, 0] }), UNIT_BOUNDS, false);
    expect(Array.from(b)).toEqual(Array.from(a));
  });
});

describe("01-S2 compiler/sceneGraph — flag on, single nodes", () => {
  it("root nodes with the default \"ZYX\" order are bit-identical to legacy for 50 random TRS", () => {
    const random = rng(0x5eed01);
    for (let i = 0; i < 50; i += 1) {
      const node = box({
        position: [random() * 20 - 10, random() * 20 - 10, random() * 20 - 10],
        rotation: [random() * 6.28 - 3.14, random() * 6.28 - 3.14, random() * 6.28 - 3.14],
        scale: [0.1 + random() * 3, 0.1 + random() * 3, 0.1 + random() * 3],
        size: [0.5 + random(), 0.5 + random(), 0.5 + random()]
      });
      const normalize = i % 2 === 0;
      const bounds = { min: [-random(), -random(), -random()] as AuraVec3, max: [random(), random(), random()] as AuraVec3 };
      expect(Array.from(createModelMatrixV2(node, bounds, normalize, 0))).toEqual(Array.from(createModelMatrix(node, bounds, normalize, 0)));
    }
  });

  it("animated root nodes stay bit-identical to legacy (turntable, float, orbit)", () => {
    for (const clip of ["turntable", "float", "orbit"] as const) {
      const node = box({ position: [1, 0, 2], rotation: [0.1, 0.2, 0.3], animation: { clip, speed: 1.5 } } as Partial<AuraPrimitiveNode>);
      for (const time of [0, 0.5, 2.25]) {
        expect(Array.from(createModelMatrixV2(node, UNIT_BOUNDS, false, time))).toEqual(Array.from(createModelMatrix(node, UNIT_BOUNDS, false, time)));
      }
    }
  });

  it("the six Euler orders match three.js Object3D within 1e-5", () => {
    const random = rng(0xe0e0);
    for (const order of ORDERS) {
      for (let i = 0; i < 10; i += 1) {
        const rotation: AuraVec3 = [random() * 6 - 3, random() * 6 - 3, random() * 6 - 3];
        const position: AuraVec3 = [random() * 4 - 2, random() * 4 - 2, random() * 4 - 2];
        const object = new THREE.Object3D();
        object.position.set(...position);
        object.rotation.set(rotation[0], rotation[1], rotation[2], threeOrder(order));
        object.scale.set(1.5, 0.75, 2);
        object.updateMatrixWorld(true);
        const node = box({ position, rotation, rotationOrder: order, scale: [1.5, 0.75, 2] });
        expectClose(createModelMatrixV2(node, UNIT_BOUNDS, false), object.matrixWorld.elements);
      }
    }
  });

  it("quaternion wins over rotation", () => {
    const q = [0, Math.SQRT1_2, 0, Math.SQRT1_2] as const;
    const withBoth = createModelMatrixV2(box({ rotation: [1, 2, 3], quaternion: q }), UNIT_BOUNDS, false);
    const object = new THREE.Object3D();
    object.quaternion.set(q[0], q[1], q[2], q[3]);
    object.updateMatrixWorld(true);
    expectClose(withBoth, object.matrixWorld.elements);
  });

  it("quaternionToEulerZYX round-trips through eulerToQuaternion(\"ZYX\")", () => {
    const random = rng(42);
    for (let i = 0; i < 25; i += 1) {
      const euler: AuraVec3 = [random() * 3 - 1.5, random() * 3 - 1.5, random() * 3 - 1.5];
      const back = quaternionToEulerZYX(eulerToQuaternion(euler, "ZYX"));
      expectClose(back, euler, 1e-5);
    }
  });

  it("writes into the caller-supplied output", () => {
    const out = new Float32Array(16);
    expect(createModelMatrixV2(box({ position: [1, 2, 3] }), UNIT_BOUNDS, false, 0, out)).toBe(out);
    expect(out[12]).toBe(1);
  });
});

describe("01-S2 compiler/sceneGraph — flag on, groups", () => {
  it("rotated parent [0, π/2, 0] moves a child at [1,0,0] to world [0,0,−1]", () => {
    const [child] = flatV2([group([box({ position: [1, 0, 0] })], { rotation: [0, Math.PI / 2, 0] })]);
    expectClose(child!.position!, [0, 0, -1], 1e-6);
    // legacy additive composition leaves it at [1,0,0]
    expect(flatLegacy([group([box({ position: [1, 0, 0] })], { rotation: [0, Math.PI / 2, 0] })])[0]!.position).toEqual([1, 0, 0]);
  });

  it("parent scale 6 moves a child at [1,0,0] to [6,0,0]", () => {
    const [child] = flatV2([group([box({ position: [1, 0, 0] })], { scale: 6 })]);
    expectClose(child!.position!, [6, 0, 0], 1e-6);
  });

  it("a three-level nest matches three.js matrixWorld within 1e-5 (every order)", () => {
    for (const order of ORDERS) {
      const a = new THREE.Object3D();
      const b = new THREE.Object3D();
      const c = new THREE.Object3D();
      a.position.set(1, 2, 3); a.rotation.set(0.3, -0.4, 0.5, threeOrder(order)); a.scale.setScalar(2);
      b.position.set(-1, 0.5, 0); b.rotation.set(-0.2, 0.9, 0.1, threeOrder(order)); b.scale.setScalar(0.5);
      c.position.set(0.25, -0.5, 1); c.rotation.set(1.1, 0.2, -0.7, threeOrder(order)); c.scale.set(1, 1.5, 0.5);
      a.add(b); b.add(c); a.updateMatrixWorld(true);
      const nodes = [group([group([box({ position: [0.25, -0.5, 1], rotation: [1.1, 0.2, -0.7], rotationOrder: order, scale: [1, 1.5, 0.5] })], {
        position: [-1, 0.5, 0], rotation: [-0.2, 0.9, 0.1], rotationOrder: order, scale: 0.5
      })], { position: [1, 2, 3], rotation: [0.3, -0.4, 0.5], rotationOrder: order, scale: 2 })];
      const [leaf] = flatV2(nodes);
      expectClose(createModelMatrixV2(leaf as AuraPrimitiveNode, UNIT_BOUNDS, false), c.matrixWorld.elements);
      expect(worldTransformOf(leaf)?.sheared).toBe(false);
    }
  });

  it("decomposed world TRS is written back for legacy consumers (\"ZYX\" Euler + quaternion)", () => {
    const [leaf] = flatV2([group([box({ rotation: [0, 0.5, 0] })], { rotation: [0, 0.25, 0], position: [0, 1, 0] })]);
    expect(leaf!.rotationOrder).toBe("ZYX");
    expectClose(leaf!.rotation!, [0, 0.75, 0], 1e-6);
    expectClose(leaf!.position!, [0, 1, 0], 1e-6);
    expect(leaf!.quaternion).toBeDefined();
  });

  it("shear: non-uniform parent scale + rotated child reports SCENE_GRAPH_SHEAR and keeps the full world matrix", () => {
    const degradations: Prd01SceneGraphDegradation[] = [];
    const a = new THREE.Object3D();
    const b = new THREE.Object3D();
    a.scale.set(1, 3, 1); b.rotation.set(0, 0, 0.7, "ZYX"); b.position.set(1, 1, 0);
    a.add(b); a.updateMatrixWorld(true);
    const [leaf] = flatV2([group([box({ name: "sheared", position: [1, 1, 0], rotation: [0, 0, 0.7] } as Partial<AuraPrimitiveNode>)], { scale: [1, 3, 1] })], {
      onDegradation: (d) => degradations.push(d)
    });
    expect(degradations.map((d) => d.code)).toEqual([SCENE_GRAPH_SHEAR]);
    expect(degradations[0]!.nodeId).toBe("sheared");
    expect(worldTransformOf(leaf)?.sheared).toBe(true);
    expectClose(leaf!.position!, [1, 3, 0], 1e-6);
    expectClose(createModelMatrixV2(leaf as AuraPrimitiveNode, UNIT_BOUNDS, false), b.matrixWorld.elements);
  });

  it("S(size ⊙ fit) is the innermost factor under a rotated, scaled parent", () => {
    const a = new THREE.Object3D();
    const b = new THREE.Object3D();
    a.rotation.set(0, 0.6, 0.2, "ZYX"); a.scale.setScalar(1.5);
    b.position.set(0, 1, 0); b.rotation.set(0.3, 0, 0, "ZYX");
    a.add(b); a.updateMatrixWorld(true);
    const expected = b.matrixWorld.clone().multiply(new THREE.Matrix4().makeScale(2, 0.5, 3));
    const [leaf] = flatV2([group([box({ position: [0, 1, 0], rotation: [0.3, 0, 0], size: [2, 0.5, 3] })], { rotation: [0, 0.6, 0.2], scale: 1.5 })]);
    expectClose(createModelMatrixV2(leaf as AuraPrimitiveNode, UNIT_BOUNDS, false), expected.elements);
  });

  it("transform-free groups and pass-through kinds stay byte-identical to legacy", () => {
    const nodes = [group([box({ position: [0.5, 0.5, 0.5] })]), group([{ kind: "effect", effect: "bloom" } as unknown as AuraSceneNode], { position: [0, 0, 1] })];
    expect(flatV2(nodes)).toEqual(flatLegacy(nodes));
  });
});

describe("01-T1.5 option rows change the RenderSource only with the flag on", () => {
  afterEach(() => setPrd01ModelMatrixCache(null));

  function renderModelMatrix(node: AuraPrimitiveNode): number[] {
    const snapshot = {
      schema: "aura3d-scene-snapshot/1.0",
      background: "#000000",
      diagnostics: { enabled: false },
      nodes: [node],
      camera: { mode: "orbit", position: [0, 0, 5], target: [0, 0, 0] }
    } as unknown as AuraSceneSnapshot;
    const entry = {
      node,
      resources: [{ geometry: { topology: "triangles" }, material: { renderState: {} }, bounds: UNIT_BOUNDS, name: "box", sdfText: null }],
      currentLodIndex: 0
    } as unknown as ProductionRuntimePrimitiveEntry;
    const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
    const input = createProductionRuntimeRendererInput(snapshot, canvas, [], [entry], 0, undefined, new Set(), { color: [0, 0, 0], intensity: 0 }, []);
    const items = [...(input.source.collectRenderItems?.() ?? [])];
    expect(items).toHaveLength(1);
    return Array.from(items[0]!.modelMatrix as ArrayLike<number>);
  }

  const rotation: AuraVec3 = [0.3, 0.5, 0.7];

  it("flag off: rotationOrder and quaternion are ignored (legacy)", () => {
    setPrd01ModelMatrixCache(null);
    const base = renderModelMatrix(box({ rotation }));
    expect(renderModelMatrix(box({ rotation, rotationOrder: "XYZ" }))).toEqual(base);
    expect(renderModelMatrix(box({ rotation, quaternion: [0, Math.SQRT1_2, 0, Math.SQRT1_2] }))).toEqual(base);
  });

  it("flag on: transform.rotationOrder \"ZYX\" -> \"XYZ\" changes the RenderSource model matrix", () => {
    setPrd01ModelMatrixCache(createModelMatrixCache(modelMatrixFor(resolveQrFlags({ options: ["core"] }))));
    const zyx = renderModelMatrix(box({ rotation, rotationOrder: "ZYX" }));
    const xyz = renderModelMatrix(box({ rotation, rotationOrder: "XYZ" }));
    expect(xyz).not.toEqual(zyx);
    // default "ZYX" is still the legacy matrix
    setPrd01ModelMatrixCache(null);
    expect(renderModelMatrix(box({ rotation }))).toEqual(zyx);
  });

  it("flag on: transform.quaternion [0,0,0,1] -> 90° yaw changes the RenderSource model matrix", () => {
    setPrd01ModelMatrixCache(createModelMatrixCache(modelMatrixFor(resolveQrFlags({ options: ["core"] }))));
    const identity = renderModelMatrix(box({ quaternion: [0, 0, 0, 1] }));
    const yawed = renderModelMatrix(box({ quaternion: [0, Math.SQRT1_2, 0, Math.SQRT1_2] }));
    expect(yawed).not.toEqual(identity);
    expectClose(yawed.slice(0, 3), [0, 0, -1], 1e-6);
  });
});
