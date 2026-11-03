import { describe, expect, it } from "vitest";
import { Geometry, type GeometryMorphTarget } from "../../../packages/rendering/src/Geometry";
import { QrPrimitiveGeometryPool } from "../../../packages/engine/src/agent-api/compiler/geometry";
import type { AuraDynamicGeometrySpec } from "../../../packages/engine/src/agent-api/nodes/types";

const positions = () => Float32Array.of(0, 0, 1, 0, 0, 2, 0, 0, 3);
const normals = () => [1, 0, 0, 2, 0, 0, 3, 0, 0];
const tangents = () => Float32Array.of(0, 1, 0, 0, 2, 0, 0, 3, 0);

describe("packed geometry morph channel ownership", () => {
  it("exposes position, normal and tangent delta channels in the dynamic public contract", () => {
    const target = { name: "shape", positions: positions(), normals: normals(), tangents: tangents() } satisfies GeometryMorphTarget;
    const dynamic = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], morphTargets: [target] } satisfies AuraDynamicGeometrySpec;

    expect(dynamic.morphTargets[0]).toBe(target);
    expect(dynamic.morphTargets[0].normals).toEqual(normals());
    expect(dynamic.morphTargets[0].tangents).toEqual(tangents());
  });

  it("gives pooled handles independent copies of every present channel", () => {
    const base = Geometry.triangle();
    const authored = { name: "shape", positions: positions(), normals: normals(), tangents: tangents() };
    base.morphTargets = [authored];
    const pool = new QrPrimitiveGeometryPool();
    const first = pool.acquire("triangle", () => base);
    const second = pool.acquire("triangle", () => { throw new Error("unexpected recreation"); });
    const left = first.morphTargets![0]!;
    const right = second.morphTargets![0]!;

    expect(left.name).toBe("shape");
    expect(left.positions).toBeInstanceOf(Float32Array);
    expect(left.normals).toBeInstanceOf(Array);
    expect(left.tangents).toBeInstanceOf(Float32Array);
    for (const channel of ["positions", "normals", "tangents"] as const) {
      expect(left[channel]).toEqual(authored[channel]);
      expect(right[channel]).toEqual(authored[channel]);
      expect(left[channel]).not.toBe(authored[channel]);
      expect(right[channel]).not.toBe(authored[channel]);
      expect(left[channel]).not.toBe(right[channel]);
    }

    (left.positions as Float32Array)[2] = 11;
    (left.normals as number[])[0] = 12;
    (left.tangents as Float32Array)[1] = 13;
    expect(right.positions[2]).toBe(1);
    expect(right.normals![0]).toBe(1);
    expect(right.tangents![1]).toBe(1);
    expect(authored.positions[2]).toBe(1);
    expect(authored.normals[0]).toBe(1);
    expect(authored.tangents[1]).toBe(1);

    first.dispose();
    expect(pool.refCount("triangle")).toBe(1);
    expect(right.normals![0]).toBe(1);
    second.dispose();
    expect(pool.size).toBe(0);
    expect(authored.positions[2]).toBe(1);
    expect(authored.normals[0]).toBe(1);
    expect(authored.tangents[1]).toBe(1);
  });

  it("preserves independently optional channels and the legacy position-only shape", () => {
    const base = Geometry.triangle();
    base.morphTargets = [
      { name: "position", positions: [0, 0, 1] },
      { name: "normal", positions: positions(), normals: Float32Array.from(normals()) },
      { name: "tangent", positions: positions(), tangents: [...tangents()] }
    ];
    const pool = new QrPrimitiveGeometryPool();
    const acquired = pool.acquire("mixed", () => base);
    const [positionOnly, normalOnly, tangentOnly] = acquired.morphTargets!;

    expect(positionOnly!.positions).toEqual([0, 0, 1]);
    expect(Object.hasOwn(positionOnly!, "normals")).toBe(false);
    expect(Object.hasOwn(positionOnly!, "tangents")).toBe(false);
    expect(normalOnly!.normals).toBeInstanceOf(Float32Array);
    expect(normalOnly!.tangents).toBeUndefined();
    expect(tangentOnly!.normals).toBeUndefined();
    expect(tangentOnly!.tangents).toBeInstanceOf(Array);
    acquired.dispose();
  });

  it("reads each supplied channel once when snapshotting a pooled handle", () => {
    const base = Geometry.triangle();
    let normalReads = 0;
    let tangentReads = 0;
    base.morphTargets = [{
      positions: positions(),
      get normals() { normalReads += 1; return normals(); },
      get tangents() { tangentReads += 1; return tangents(); }
    }];
    const pool = new QrPrimitiveGeometryPool();
    const acquired = pool.acquire("snapshot", () => base);

    expect(normalReads).toBe(1);
    expect(tangentReads).toBe(1);
    expect(acquired.morphTargets![0]!.normals).toEqual(normals());
    expect(acquired.morphTargets![0]!.tangents).toEqual(tangents());
    acquired.dispose();
  });

  it("rolls back a failed channel snapshot without retiring an existing peer", () => {
    const base = Geometry.triangle();
    const buffer = base.vertexBuffer;
    let failSnapshot = false;
    base.morphTargets = [{
      positions: positions(),
      get normals() {
        if (failSnapshot) throw new Error("normal snapshot failed");
        return normals();
      }
    }];
    const pool = new QrPrimitiveGeometryPool();
    const peer = pool.acquire("snapshot", () => base);
    failSnapshot = true;

    expect(() => pool.acquire("snapshot", () => { throw new Error("unexpected recreation"); })).toThrow("normal snapshot failed");
    expect(pool.refCount("snapshot")).toBe(1);
    expect(peer.morphTargets![0]!.normals).toEqual(normals());
    expect(() => buffer.getAttribute(0, "position")).not.toThrow();
    peer.dispose();
    expect(pool.size).toBe(0);
    expect(() => buffer.getAttribute(0, "position")).toThrow(/disposed/i);
  });
});
