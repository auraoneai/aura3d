import { describe, expect, it } from "vitest";
import { normalizeSceneSnapshot, primitives, scene } from "@aura3d/engine";
import { createPoolFxLayer, fxPoolNodeName, withFxPool } from "../../../packages/game/src/juice/fxPoolLayer";
import { FX_PRESETS, fxKindCapacity } from "../../../packages/game/src/juice/fx";

function fakeHandles() {
  const writes = new Map<string, number[]>();
  const visible = new Map<string, boolean>();
  const node = (id: string) => ({
    setInstanceTransforms: (_m: Float32Array, count: number) => {
      writes.set(id, [...(writes.get(id) ?? []), count]);
    },
    setVisible: (v: boolean) => {
      visible.set(id, v);
    }
  });
  return { writes, visible, node };
}

describe("pool FX layer (PRD-09 §6.7, 16.1-6)", () => {
  it("appends one zero-scaled instanced pool node per kind, once", () => {
    const authored = normalizeSceneSnapshot(scene().add(primitives.box({ name: "floor" })));
    const decorated = withFxPool(authored);
    const kinds = Object.keys(FX_PRESETS);
    const pools = decorated.nodes.filter((n) => (n as { name?: string }).name?.startsWith("a3g-fx-"));
    expect(pools.map((n) => (n as { name?: string }).name)).toEqual(kinds.map((k) => fxPoolNodeName(k as never)));
    for (const n of pools) {
      const node = n as { runtime?: { id?: string }; name?: string; instances?: readonly { scale?: unknown }[]; castShadow?: boolean };
      expect(node.runtime?.id).toBe(node.name);
      expect(node.instances?.length).toBe(fxKindCapacity("high"));
      expect(node.castShadow).toBe(false);
    }
    expect(withFxPool(decorated).nodes.length).toBe(decorated.nodes.length);
  });

  it("hides idle pools, writes live sparks with 1 handle per kind, and hides them when they expire", () => {
    const h = fakeHandles();
    const fx = createPoolFxLayer({ node: h.node, seed: 3 });
    fx.tick(1 / 60);
    expect(h.visible.get("a3g-fx-spark")).toBe(false);

    fx.burst("spark", [0, 0.3, 0], { count: 24, seed: 7 });
    expect(fx.liveCount).toBe(24);
    fx.tick(1 / 60);
    expect(h.writes.get("a3g-fx-spark")?.at(-1)).toBe(24);
    expect(h.visible.get("a3g-fx-spark")).toBe(true);

    // Longest spark life is 0.45 s.
    for (let i = 0; i < 40; i += 1) fx.tick(1 / 60);
    expect(fx.liveCount).toBe(0);
    expect(h.writes.get("a3g-fx-spark")?.at(-1)).toBe(0);
    expect(h.visible.get("a3g-fx-spark")).toBe(false);
  });

  it("freezes on zero dt (hit-stop) and re-resolves handles after reset", () => {
    const h = fakeHandles();
    const fx = createPoolFxLayer({ node: h.node });
    fx.burst("debris", [0, 0, 0], { count: 8, seed: 1 });
    fx.tick(0);
    expect(h.writes.get("a3g-fx-debris")).toBeUndefined();
    fx.tick(1 / 60);
    expect(h.writes.get("a3g-fx-debris")?.at(-1)).toBe(8);
    fx.reset();
    fx.tick(1 / 60);
    expect(h.writes.get("a3g-fx-debris")?.at(-1)).toBe(8);
  });

  it("retries a node that was unavailable during the first frame", () => {
    const h = fakeHandles();
    let ready = false;
    const fx = createPoolFxLayer({ node: (id) => ready ? h.node(id) : undefined });
    fx.tick(1 / 60);
    ready = true;
    fx.burst("spark", [0, 0, 0], { count: 4 });
    fx.tick(1 / 60);
    expect(h.writes.get("a3g-fx-spark")?.at(-1)).toBe(4);
  });

  it("warns once and renders nothing when the pool node lacks C-37", () => {
    const warnings: string[] = [];
    const fx = createPoolFxLayer({ node: () => ({}), warn: (m) => warnings.push(m) });
    fx.burst("spark", [0, 0, 0], { count: 4 });
    fx.tick(1 / 60);
    fx.tick(1 / 60);
    expect(warnings.filter((w) => w.includes("a3g-fx-spark"))).toHaveLength(1);
  });
});
