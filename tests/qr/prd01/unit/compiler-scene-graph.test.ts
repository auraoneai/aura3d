/**
 * 01-S2 / 01-T1.5 — compiler/sceneGraph.ts (C-06 under A3D_QR_CORE).
 *
 * - flag off: flatten + model matrix are the legacy sceneMath bodies, verbatim
 * - flag on, root nodes, default "ZYX": model matrices bit-identical to legacy
 *   (50 random TRS)
 * - six Euler orders match independently calculated TRS matrices within 1e-5
 * - quaternion wins over rotation
 * - groups compose world = parent · local (rotated/scaled parents, 3-level nest
 *   checked by transforming basis points), shear -> SCENE_GRAPH_SHEAR + full world matrix
 * - S(size ⊙ fit) is the innermost factor
 * - option rows `transform.rotationOrder` / `transform.quaternion` change the
 *   RenderSource (createProductionRuntimeRendererInput) only with the flag on
 */

import { afterEach, describe, expect, it } from "vitest";

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

type ReferenceTransform = {
  readonly position?: AuraVec3;
  readonly rotation?: AuraVec3;
  readonly rotationOrder?: AuraEulerOrder;
  readonly scale?: AuraVec3;
};

/**
 * Apply TRS directly to a point, using right-handed axis rotations. For order
 * ABC the matrix is Ra · Rb · Rc, so the point encounters C first. Keeping
 * this reference in point form avoids using the engine's matrix/quaternion
 * helpers to calculate the expected result.
 */
function referencePoint(point: AuraVec3, transform: ReferenceTransform): AuraVec3 {
  const scale: AuraVec3 = transform.scale ?? [1, 1, 1];
  const rotation: AuraVec3 = transform.rotation ?? [0, 0, 0];
  let result: AuraVec3 = [point[0] * scale[0], point[1] * scale[1], point[2] * scale[2]];
  for (const axis of [...(transform.rotationOrder ?? "ZYX")].reverse()) {
    const [x, y, z] = result;
    const angle = axis === "X" ? rotation[0] : axis === "Y" ? rotation[1] : rotation[2];
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    if (axis === "X") result = [x, c * y - s * z, s * y + c * z];
    else if (axis === "Y") result = [c * x + s * z, y, -s * x + c * z];
    else result = [c * x - s * y, s * x + c * y, z];
  }
  const position: AuraVec3 = transform.position ?? [0, 0, 0];
  return [result[0] + position[0], result[1] + position[1], result[2] + position[2]];
}

/** Transforms are applied from leaf to root; matrix columns are transformed basis vectors. */
function referenceMatrix(...transforms: readonly ReferenceTransform[]): number[] {
  const point = (p: AuraVec3): AuraVec3 => transforms.reduce(referencePoint, p);
  const origin = point([0, 0, 0]);
  const x = point([1, 0, 0]);
  const y = point([0, 1, 0]);
  const z = point([0, 0, 1]);
  return [
    x[0] - origin[0], x[1] - origin[1], x[2] - origin[2], 0,
    y[0] - origin[0], y[1] - origin[1], y[2] - origin[2], 0,
    z[0] - origin[0], z[1] - origin[1], z[2] - origin[2], 0,
    origin[0], origin[1], origin[2], 1
  ];
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
      expect(flattenAuraSceneNodes(nodes, resolveQrFlags({ env: { A3D_QR: "none" } }))).toEqual(flatLegacy(nodes));
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
    expect(modelMatrixFor(resolveQrFlags({ env: { A3D_QR: "none" } }))).toBe(createModelMatrix);
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

  it("the six Euler orders match independently transformed basis points within 1e-5", () => {
    const random = rng(0xe0e0);
    for (const order of ORDERS) {
      for (let i = 0; i < 10; i += 1) {
        const rotation: AuraVec3 = [random() * 6 - 3, random() * 6 - 3, random() * 6 - 3];
        const position: AuraVec3 = [random() * 4 - 2, random() * 4 - 2, random() * 4 - 2];
        const node = box({ position, rotation, rotationOrder: order, scale: [1.5, 0.75, 2] });
        expectClose(createModelMatrixV2(node, UNIT_BOUNDS, false), referenceMatrix({ position, rotation, rotationOrder: order, scale: [1.5, 0.75, 2] }));
      }
    }
  });

  it("distinguishes Euler order with known right-angle rotations", () => {
    const rotation: AuraVec3 = [Math.PI / 2, Math.PI / 2, Math.PI / 2];
    expectClose(createModelMatrixV2(box({ rotation, rotationOrder: "XYZ" }), UNIT_BOUNDS, false), [
      0, 0, 1, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1
    ], 1e-6);
    expectClose(createModelMatrixV2(box({ rotation, rotationOrder: "ZYX" }), UNIT_BOUNDS, false), [
      0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1
    ], 1e-6);
  });

  it("quaternion wins over rotation", () => {
    const q = [0, Math.SQRT1_2, 0, Math.SQRT1_2] as const;
    const withBoth = createModelMatrixV2(box({ rotation: [1, 2, 3], quaternion: q }), UNIT_BOUNDS, false);
    // A 90° yaw maps +X to -Z, leaves +Y fixed, and maps +Z to +X.
    expectClose(withBoth, [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1]);
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

  it("a three-level nest matches independently composed basis points within 1e-5 (every order)", () => {
    for (const order of ORDERS) {
      const nodes = [group([group([box({ position: [0.25, -0.5, 1], rotation: [1.1, 0.2, -0.7], rotationOrder: order, scale: [1, 1.5, 0.5] })], {
        position: [-1, 0.5, 0], rotation: [-0.2, 0.9, 0.1], rotationOrder: order, scale: 0.5
      })], { position: [1, 2, 3], rotation: [0.3, -0.4, 0.5], rotationOrder: order, scale: 2 })];
      const [leaf] = flatV2(nodes);
      expectClose(createModelMatrixV2(leaf as AuraPrimitiveNode, UNIT_BOUNDS, false), referenceMatrix(
        { position: [0.25, -0.5, 1], rotation: [1.1, 0.2, -0.7], rotationOrder: order, scale: [1, 1.5, 0.5] },
        { position: [-1, 0.5, 0], rotation: [-0.2, 0.9, 0.1], rotationOrder: order, scale: [0.5, 0.5, 0.5] },
        { position: [1, 2, 3], rotation: [0.3, -0.4, 0.5], rotationOrder: order, scale: [2, 2, 2] }
      ));
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
    const [leaf] = flatV2([group([box({ name: "sheared", position: [1, 1, 0], rotation: [0, 0, 0.7] } as Partial<AuraPrimitiveNode>)], { scale: [1, 3, 1] })], {
      onDegradation: (d) => degradations.push(d)
    });
    expect(degradations.map((d) => d.code)).toEqual([SCENE_GRAPH_SHEAR]);
    expect(degradations[0]!.nodeId).toBe("sheared");
    expect(worldTransformOf(leaf)?.sheared).toBe(true);
    expectClose(leaf!.position!, [1, 3, 0], 1e-6);
    const c = Math.cos(0.7);
    const s = Math.sin(0.7);
    expectClose(createModelMatrixV2(leaf as AuraPrimitiveNode, UNIT_BOUNDS, false), [
      c, 3 * s, 0, 0, -s, 3 * c, 0, 0, 0, 0, 1, 0, 1, 3, 0, 1
    ]);
  });

  it("S(size ⊙ fit) is the innermost factor under a rotated, scaled parent", () => {
    const [leaf] = flatV2([group([box({ position: [0, 1, 0], rotation: [0.3, 0, 0], size: [2, 0.5, 3] })], { rotation: [0, 0.6, 0.2], scale: 1.5 })]);
    expectClose(createModelMatrixV2(leaf as AuraPrimitiveNode, UNIT_BOUNDS, false), referenceMatrix(
      { position: [0, 1, 0], rotation: [0.3, 0, 0], scale: [2, 0.5, 3] },
      { rotation: [0, 0.6, 0.2], scale: [1.5, 1.5, 1.5] }
    ));
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
      resources: [{ geometry: { topology: "triangles" }, material: { renderState: {}, getParameter: () => undefined }, bounds: UNIT_BOUNDS, name: "box", sdfText: null }],
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
