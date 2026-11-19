import { describe, expect, it } from "vitest";
import { createAuraRuntimeNodeRegistry, runtimeNodeParentedTransform } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { ShapeShiftSim } from "../../../apps/showcase-shape-shift-sprint/src/sim";
import { buildWorld } from "../../../apps/showcase-shape-shift-sprint/src/world";

/**
 * Regression (production build rendered nothing): the morph mascot's eyes were placed at z = -Infinity on the block and
 * cone forms (an empty vertex band in morphFaceAnchor), and the engine refused to mount (PARENTED_TRANSFORM_NON_FINITE).
 * Every authored and per-frame transform must be finite for every form, and the engine's parented-transform compile
 * must accept every runtime node.
 */
type N = { position?: number[]; rotation?: number[]; scale?: number | number[]; quaternion?: number[]; children?: N[]; runtime?: { id?: string }; name?: string; instances?: { position?: number[]; rotation?: number[]; scale?: number | number[] }[] };
const finite = (v: unknown): boolean => v === undefined || (typeof v === "number" ? Number.isFinite(v) : (v as number[]).every(Number.isFinite));
function assertFiniteTree(nodes: readonly N[]): string[] {
  const ids: string[] = [];
  const walk = (n: N, path: string) => {
    const p = `${path}/${n.runtime?.id ?? n.name ?? "?"}`;
    for (const k of ["position", "rotation", "scale", "quaternion"] as const) expect(finite(n[k]), `${p}.${k}`).toBe(true);
    for (const t of n.instances ?? []) for (const k of ["position", "rotation", "scale"] as const) expect(finite(t[k]), `${p} instance.${k}`).toBe(true);
    if (n.runtime?.id) ids.push(n.runtime.id);
    for (const c of n.children ?? []) walk(c, p);
  };
  for (const n of nodes) walk(n, "");
  return ids;
}

describe("shape-shift-sprint transforms are finite (all forms)", () => {
  it("authored scene, engine parented compile, and live frames for ball / block / cone", () => {
    const sim = new ShapeShiftSim(7);
    const world = buildWorld({ sim, aspect: 16 / 9 } as never);
    const snapshot = world.scene.toJSON() as unknown as { nodes: N[] };
    const ids = assertFiniteTree(snapshot.nodes);
    const registry = createAuraRuntimeNodeRegistry(snapshot as never);
    for (const id of ids) expect(() => runtimeNodeParentedTransform(registry.require(id))).not.toThrow();

    const bad: string[] = [];
    const anything: unknown = new Proxy(function () {}, { get: () => anything, apply: () => anything });
    const handle = (id: string): unknown => new Proxy({}, {
      get(_t, key: string) {
        if (key === "setPosition" || key === "setRotation" || key === "setScale") return (...a: unknown[]) => {
          const flat = a.flat() as unknown[];
          if (!flat.every((v) => typeof v !== "number" || Number.isFinite(v))) bad.push(`${id}.${key}(${JSON.stringify(a)})`);
          return handle(id);
        };
        if (key.startsWith("set")) return () => handle(id);
        return anything;
      }
    });
    const rt = world.bind({ nodes: { require: handle, get: handle }, camera: anything } as never);
    sim.begin();
    for (const shape of [0, 1, 2] as const) {
      (sim.o as { shapeIndex: number }).shapeIndex = shape;
      for (let f = 0; f < 20; f++) { sim.advance(); rt.update(sim, 16 / 9); }
    }
    expect(bad).toEqual([]);
  }, 60_000);
});
