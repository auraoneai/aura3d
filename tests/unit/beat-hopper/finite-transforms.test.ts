import { describe, expect, it } from "vitest";
import { createAuraRuntimeNodeRegistry, runtimeNodeParentedTransform } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { BeatHopperSim } from "../../../apps/showcase-beat-hopper/src/sim";
import { buildWorld } from "../../../apps/showcase-beat-hopper/src/world";

/**
 * Every authored and per-frame transform is finite, and the engine's parented-transform compile accepts every
 * runtime node (a NaN / Infinity makes the production renderer refuse to mount: PARENTED_TRANSFORM_NON_FINITE).
 */
type N = { position?: number[]; rotation?: number[]; scale?: number | number[]; quaternion?: number[]; children?: N[]; runtime?: { id?: string }; name?: string; instances?: { position?: number[]; rotation?: number[]; scale?: number | number[] }[] };
const finite = (v: unknown): boolean => v === undefined || (typeof v === "number" ? Number.isFinite(v) : (v as number[]).every(Number.isFinite));

describe("beat-hopper transforms are finite", () => {
  it("authored scene, engine parented compile, and live frames", () => {
    const sim = new BeatHopperSim(7);
    const world = buildWorld({ sim, aspect: 16 / 9 } as never);
    const snapshot = world.scene.toJSON() as unknown as { nodes: N[] };
    const ids: string[] = [];
    const walk = (n: N, p: string) => {
      const path = `${p}/${n.runtime?.id ?? n.name ?? "?"}`;
      for (const k of ["position", "rotation", "scale", "quaternion"] as const) expect(finite(n[k]), `${path}.${k}`).toBe(true);
      for (const t of n.instances ?? []) for (const k of ["position", "rotation", "scale"] as const) expect(finite(t[k]), `${path} instance.${k}`).toBe(true);
      if (n.runtime?.id) ids.push(n.runtime.id);
      for (const c of n.children ?? []) walk(c, path);
    };
    for (const n of snapshot.nodes) walk(n, "");
    const registry = createAuraRuntimeNodeRegistry(snapshot as never);
    for (const id of ids) expect(() => runtimeNodeParentedTransform(registry.require(id))).not.toThrow();
    const bad: string[] = [];
    const anything: unknown = new Proxy(function () {}, { get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : anything), apply: () => anything });
    const handle = (id: string): unknown => new Proxy({}, {
      get(_t, key: string) {
        if (key === "setPosition" || key === "setRotation" || key === "setScale") return (...a: unknown[]) => {
          if (!(a.flat() as unknown[]).every((v) => typeof v !== "number" || Number.isFinite(v))) bad.push(`${id}.${key}(${JSON.stringify(a)})`);
          return handle(id);
        };
        if (key.startsWith("set")) return () => handle(id);
        return anything;
      }
    });
    const rt = world.bind({ nodes: { require: handle, get: handle }, camera: anything } as never);
    sim.begin();
    for (let f = 0; f < 60; f++) { sim.advance(); rt.update(sim as never, 16 / 9); }
    expect(bad).toEqual([]);
  }, 60_000);
});
