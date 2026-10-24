import { describe, expect, it } from "vitest";
import { primitives } from "../../../packages/engine/src/agent-api/index.js";

const snap = (b: { toJSON(): unknown }) => b.toJSON() as Record<string, unknown>;

describe("node builder vector arguments", () => {
  it("position accepts three numbers or one array, with the same result", () => {
    expect(snap(primitives.box({ name: "a" }).position(1, 2, 3)).position).toEqual([1, 2, 3]);
    expect(snap(primitives.box({ name: "a" }).position([1, 2, 3])).position).toEqual([1, 2, 3]);
  });

  it("rotate accepts (x, y, z, order) or ([x, y, z], order)", () => {
    const a = snap(primitives.box({ name: "a" }).rotate(0.1, 0.2, 0.3, "YXZ"));
    const b = snap(primitives.box({ name: "a" }).rotate([0.1, 0.2, 0.3], "YXZ"));
    expect(b.rotation).toEqual([0.1, 0.2, 0.3]);
    expect(b.rotationOrder).toBe("YXZ");
    expect(b).toEqual(a);
    expect(snap(primitives.box({ name: "a" }).rotate([0, 1, 0])).rotationOrder).toBeUndefined();
  });

  it("lookAt accepts three numbers or one array", () => {
    expect(snap(primitives.box({ name: "a" }).lookAt(0, 1, 0)).lookAt).toEqual([0, 1, 0]);
    expect(snap(primitives.box({ name: "a" }).lookAt([0, 1, 0])).lookAt).toEqual([0, 1, 0]);
  });

  it("does not alias the caller's array", () => {
    const v: [number, number, number] = [1, 2, 3];
    const node = snap(primitives.box({ name: "a" }).position(v));
    v[0] = 99;
    expect(node.position).toEqual([1, 2, 3]);
  });
});

describe("instanced and batched handles keep the array forms", () => {
  it.each([
    ["instances.mesh", async () => (await import("../../../packages/engine/src/agent-api/index.js")).instances.mesh("box", undefined, 4)],
    ["batched.mesh", async () => (await import("../../../packages/engine/src/agent-api/index.js")).batched.mesh({ maxInstances: 4, maxVertices: 64, maxIndices: 64 })]
  ])("%s position/rotate/lookAt accept arrays and stay chainable", async (_name, make) => {
    const handle = (await make()) as unknown as {
      position(v: readonly [number, number, number]): { rotate(v: readonly [number, number, number], o?: string): { lookAt(v: readonly [number, number, number]): { toJSON(): unknown } } };
    };
    const json = handle.position([1, 2, 3]).rotate([0.1, 0.2, 0.3], "YXZ").lookAt([0, 1, 0]).toJSON() as Record<string, unknown>;
    expect(json.position).toEqual([1, 2, 3]);
    expect(json.rotation).toEqual([0.1, 0.2, 0.3]);
    expect(json.rotationOrder).toBe("YXZ");
    expect(json.lookAt).toEqual([0, 1, 0]);
  });
});
