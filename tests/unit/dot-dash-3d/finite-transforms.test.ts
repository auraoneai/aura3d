import { describe, expect, it } from "vitest";
import { createAuraRuntimeNodeRegistry, runtimeNodeParentedTransform } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { startRun, st } from "../../../apps/showcase-dot-dash-3d/src/game/sim";
import { bindApp, buildScene, syncVisuals } from "../../../apps/showcase-dot-dash-3d/src/game/world";

/** Every authored transform, every runtime node through the engine's parented compile, and every per-frame write is finite. */
type N = { position?: number[]; rotation?: number[]; scale?: number | number[]; quaternion?: number[]; children?: N[]; runtime?: { id?: string }; name?: string };
const finite = (v: unknown): boolean => v === undefined || (typeof v === "number" ? Number.isFinite(v) : (v as number[]).every(Number.isFinite));

describe("dot-dash-3d transforms are finite", () => {
  it("authored scene, engine parented compile, live frames (pool matrices too)", () => {
    const snapshot = buildScene() as { nodes: N[] };
    const ids: string[] = [];
    const walk = (n: N, p: string) => {
      const path = `${p}/${n.runtime?.id ?? n.name ?? "?"}`;
      for (const k of ["position", "rotation", "scale", "quaternion"] as const) expect(finite(n[k]), `${path}.${k}`).toBe(true);
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
        if (["setPosition", "setRotation", "setScale", "setInstanceTransforms", "setInstances"].includes(key)) return (...a: unknown[]) => {
          const flat = a.flatMap((x) => (x instanceof Float32Array ? Array.from(x) : Array.isArray(x) ? x.flatMap((t) => (typeof t === "object" && t ? Object.values(t).flat() : t)) : [x]));
          if (!flat.every((v) => typeof v !== "number" || Number.isFinite(v))) bad.push(`${id}.${key}`);
          return handle(id);
        };
        if (key.startsWith("set")) return () => handle(id);
        return anything;
      }
    });
    bindApp({ nodes: { require: handle, get: handle }, camera: anything, canvas: null } as never);
    startRun("quick" as never, "classic" as never);
    for (let f = 0; f < 60; f++) { st.time += 1 / 60; syncVisuals(1 / 60); }
    expect(bad).toEqual([]);
  }, 60_000);
});
