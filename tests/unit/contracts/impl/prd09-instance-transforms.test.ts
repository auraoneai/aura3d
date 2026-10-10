import { describe, expect, it } from "vitest";
import {
  decomposeInstanceMatrix,
  instanceTransformsExtension,
  stubSetInstanceTransforms
} from "../../../../packages/engine/src/agent-api/nodes/game/instanceTransforms";
import { nodeHandleExtensionFor } from "../../../../packages/engine/src/contracts/runtimeNodes";
import "../../../../packages/engine/src/lanes/prd09";

function appWith(nodes: unknown[], qrFlags: readonly string[] = ["A3D_QR_GAME"]) {
  return {
    scene: { nodes },
    diagnostics: () => ({ qrFlags })
  } as never;
}

function instancedNode(id = "pool"): {
  kind: string;
  primitive: string;
  runtime: { id: string };
  instances: { position: number[]; quaternion?: number[] }[];
  instanceColors?: string[];
} {
  return {
    kind: "primitive",
    primitive: "sphere",
    runtime: { id },
    instances: [
      { position: [0, 0, 0] },
      { position: [1, 0, 0] },
      { position: [2, 0, 0] },
      { position: [3, 0, 0] }
    ]
  };
}

const handle = { id: "pool", kind: "primitive" } as never;

function translationMatrix(x: number, y: number, z: number): Float32Array {
  const m = new Float32Array(16);
  m.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
  return m;
}

describe("prd09 setInstanceTransforms (PRD-09 1749)", () => {
  it("is registered as a C-37 node-handle extension for instanced kinds", () => {
    const ext = nodeHandleExtensionFor("setInstanceTransforms");
    expect(ext).toBe(instanceTransformsExtension);
    expect(ext?.flag).toBe("A3D_QR_GAME");
    expect(ext?.appliesTo).toContain("primitive");
  });

  it("stub path rewrites node.instances from matrices (position extract)", () => {
    const node = instancedNode();
    const m = new Float32Array(32);
    m.set(translationMatrix(5, 6, 7), 0);
    m.set(translationMatrix(-1, -2, -3), 16);
    stubSetInstanceTransforms(handle, appWith([node]), m, 2);
    expect(node.instances[0].position).toEqual([5, 6, 7]);
    expect(node.instances[1].position).toEqual([-1, -2, -3]);
    // count < capacity (#617): capacity survives; slots past `count` are
    // zero-scaled (hidden), so a later larger count stays within capacity.
    expect(node.instances).toHaveLength(4);
    expect((node.instances[2] as { scale?: number[] }).scale).toEqual([0, 0, 0]);
    expect((node.instances[3] as { scale?: number[] }).scale).toEqual([0, 0, 0]);
    expect(node.instances[0].quaternion).toEqual([0, 0, 0, 1]);
  });

  it("writes instanceColors from rgb triples", () => {
    const node = instancedNode();
    const colors = new Float32Array([1, 0, 0, 0, 1, 0]);
    stubSetInstanceTransforms(handle, appWith([node]), new Float32Array(32).fill(0), 2, colors);
    // Hidden capacity slots keep their previous colour (none here -> #000000).
    expect(node.instanceColors).toEqual(["#ff0000", "#00ff00", "#000000", "#000000"]);
  });

  it("throws INSTANCE_NODE_REQUIRED on non-instanced kinds", () => {
    const plain = { kind: "primitive", primitive: "box", runtime: { id: "pool" } };
    const handle2 = { id: "pool" } as never;
    expect(() => stubSetInstanceTransforms(handle2, appWith([plain]), new Float32Array(16), 1)).toThrow(/INSTANCE_NODE_REQUIRED/);
    const group = { kind: "group", runtime: { id: "pool" }, children: [] };
    expect(() => stubSetInstanceTransforms(handle2, appWith([group]), new Float32Array(16), 1)).toThrow(/INSTANCE_NODE_REQUIRED/);
  });

  it("throws INSTANCE_CAPACITY_EXCEEDED when count > capacity", () => {
    const node = instancedNode();
    expect(() => stubSetInstanceTransforms(handle, appWith([node]), new Float32Array(16 * 5), 5)).toThrow(/INSTANCE_CAPACITY_EXCEEDED/);
  });

  it("validates matrix/color buffer sizes", () => {
    const node = instancedNode();
    expect(() => stubSetInstanceTransforms(handle, appWith([node]), new Float32Array(8), 1)).toThrow(/matrices\.length/);
    expect(() => stubSetInstanceTransforms(handle, appWith([node]), new Float32Array(16), 1, new Float32Array(1))).toThrow(/colors\.length/);
  });

  it("flag-off: the created member is the stub path (same observable behaviour)", () => {
    const node = instancedNode();
    const member = instanceTransformsExtension.create(handle, appWith([node], []));
    const m = translationMatrix(9, 9, 9);
    member(m, 1);
    expect(node.instances[0].position).toEqual([9, 9, 9]);
  });

  it("decomposeInstanceMatrix: scale and rotation round-trip", () => {
    // 90° rotation about Z, uniform scale 2: position (1,2,3)
    const s = 2, c = Math.cos(Math.PI / 2), sn = Math.sin(Math.PI / 2);
    const m = new Float32Array([
      s * c, s * sn, 0, 0,
      -s * sn, s * c, 0, 0,
      0, 0, s, 0,
      1, 2, 3, 1
    ]);
    const spec = decomposeInstanceMatrix(m, 0);
    expect(spec.position).toEqual([1, 2, 3]);
    expect(spec.scale).toEqual([2, 2, 2]);
    const q = spec.quaternion!;
    // quat for +90° about z: (0,0,sin45,cos45)
    expect(Math.abs(q[2])).toBeCloseTo(Math.SQRT1_2, 5);
    expect(Math.abs(q[3])).toBeCloseTo(Math.SQRT1_2, 5);
  });
});
