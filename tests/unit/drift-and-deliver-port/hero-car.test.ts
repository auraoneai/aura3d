import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";

const dir = resolve(__dirname, "../../../examples/drift-and-deliver-port/assets/models");
const file = resolve(dir, "courier.glb");

async function load() {
  const doc = await new NodeIO().readBinary(new Uint8Array(readFileSync(file)));
  return doc.getRoot();
}

describe("gridlock courier hero car", () => {
  it("is one closed solid shell, so no interior can show through the body", async () => {
    const root = await load();
    const edges = new Map<string, number>();
    let tris = 0;
    for (const prim of root.listMeshes().flatMap((m) => m.listPrimitives())) {
      const pos = prim.getAttribute("POSITION")!;
      const idx = prim.getIndices()!;
      const v = [0, 0, 0];
      const key = (i: number) => { pos.getElement(i, v); return v.map((c) => Math.round(c * 1e4)).join(","); };
      for (let t = 0; t < idx.getCount(); t += 3) {
        tris += 1;
        const k = [0, 1, 2].map((o) => key(idx.getScalar(t + o)));
        for (let e = 0; e < 3; e++) {
          const a = k[e]!, b = k[(e + 1) % 3]!;
          if (a === b) continue;
          const id = a < b ? `${a}|${b}` : `${b}|${a}`;
          edges.set(id, (edges.get(id) ?? 0) + 1);
        }
      }
    }
    const open = [...edges.values()].filter((c) => c === 1).length;
    expect(open, "open edges").toBe(0);
    expect(tris).toBeLessThanOrEqual(40_000);
  });

  it("is opaque and baked to the port's car convention (+z forward, 1.9 units long, lowest point at y = 0)", async () => {
    const root = await load();
    for (const m of root.listMaterials()) {
      expect(m.getAlphaMode(), m.getName()).toBe("OPAQUE");
      expect(m.getBaseColorFactor()[3], m.getName()).toBe(1);
    }
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const p of root.listMeshes().flatMap((mesh) => mesh.listPrimitives())) {
      const a = p.getAttribute("POSITION")!.getArray()!;
      for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, a[i + k]!); max[k] = Math.max(max[k]!, a[i + k]!); }
    }
    expect(max[2]! - min[2]!).toBeCloseTo(1.9, 1);
    expect(max[2]! - min[2]!).toBeGreaterThan(max[0]! - min[0]!);
    expect(min[1]!).toBeGreaterThan(-0.001);
  });

  it("matches the hash wired in models.ts, and the old see-through car is gone", () => {
    const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
    const models = readFileSync(resolve(__dirname, "../../../examples/drift-and-deliver-port/models.ts"), "utf8");
    expect(models).toContain(`glb("courier.glb", "${hash}")`);
    expect(existsSync(resolve(dir, "hypercar.glb"))).toBe(false);
  });
});
