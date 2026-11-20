import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { scene } from "@aura3d/engine";
import { createProductionRuntimeEnvironment } from "../../../packages/engine/src/agent-api/compiler/environment";
import { BACKDROP_ENVIRONMENT_INTENSITY, ISLAND_KEY, PIECES, addBackdrop, pieceModel, updateBackdrop } from "../../../examples/splat-rush-port/backdrop";
import { IDOL_DIMS, type IdolKey } from "../../../examples/splat-rush-port/idol";
import { LOOKS } from "../../../examples/splat-rush-port/look";
import { addPickups, haloId, pickupId, pickupNodeIds, updatePickups } from "../../../examples/splat-rush-port/pickups";
import { MODELS } from "../../../examples/splat-rush-port/models";
import { SplatRushSim, type Powerup } from "../../../examples/splat-rush-port/sim";
import { buildWorld } from "../../../examples/splat-rush-port/world";

interface Call { visible?: boolean; position?: [number, number, number]; scale?: number }
function recorder() {
  const calls = new Map<string, Call>();
  const node = (id: string) => {
    const c: Call = calls.get(id) ?? {};
    calls.set(id, c);
    const h = {
      setVisible(v: boolean) { c.visible = v; return h; },
      setPosition(x: number, y: number, z: number) { c.position = [x, y, z]; return h; },
      setRotation() { return h; },
      setScale(s: number) { c.scale = s; return h; }
    };
    return h as never;
  };
  return { calls, node };
}

describe("Idol presentation layer (backdrop + pickups)", () => {
  it("backdrop layout is deterministic with unique ids on both sides of the road", () => {
    expect(new Set(PIECES.map((p) => p.id)).size).toBe(PIECES.length);
    expect(PIECES.some((p) => p.side === -1) && PIECES.some((p) => p.side === 1)).toBe(true);
    for (const p of PIECES) expect(p.offset).toBeGreaterThan(12);
  });

  it("backdrop stays clear of the road, fades in at the far end and out near the camera", () => {
    for (const distance of [0, 37.5, 410.2, 1999]) {
      const { calls, node } = recorder();
      updateBackdrop(node, distance, 3.1);
      for (const p of PIECES) {
        const c = calls.get(p.id) as Call;
        const [x, , z] = c.position as [number, number, number];
        expect(z).toBeLessThanOrEqual(12.001);
        expect(z).toBeGreaterThanOrEqual(-138.001);
        expect(Math.abs(x)).toBeGreaterThan(8);
        expect(c.scale).toBeGreaterThan(0);
        expect(c.scale).toBeLessThanOrEqual(1);
      }
    }
  });

  it("backdrop authors a neutral-room environment so the GLBs keep their IBL under authored-lights (LIGHT-01)", () => {
    const builder = scene();
    addBackdrop(builder);
    const snapshot = builder.toJSON();
    const envs = snapshot.nodes.filter((n) => n.kind === "environment") as unknown as { environment: string; intensity: number; background?: unknown }[];
    expect(envs).toHaveLength(1);
    expect(envs[0]).toMatchObject({ environment: "neutral", intensity: BACKDROP_ENVIRONMENT_INTENSITY, background: false });
    expect(BACKDROP_ENVIRONMENT_INTENSITY).toBeGreaterThan(0.7);
    expect(BACKDROP_ENVIRONMENT_INTENSITY).toBeLessThan(0.95);
    // The hemisphere and both directionals stay authored next to it.
    expect(snapshot.nodes.filter((n) => n.kind === "light").map((n) => (n as { light: string }).light).sort()).toEqual(["directional", "directional", "hemisphere"]);
    // The renderer's lights-only path (implicitFill false) no longer applies: the scene resolves to an environment preset.
    const resolved = createProductionRuntimeEnvironment(snapshot, undefined, { implicitFill: false });
    expect(resolved.preset).not.toBe("authored-lights");
    expect(resolved.lighting.environmentMapIntensity ?? 0).toBeGreaterThan(0);
  });

  it("pickups map each type to its own pool, hide the rest and cap at four per type", () => {
    const mk = (type: Powerup["type"], i: number): Powerup => ({ type, x: i, y: 0.5, z: -i, laneX: i, baseY: 0.5 });
    const list = [mk("shield", 1), mk("shield", 2), mk("x2", 3), ...Array.from({ length: 6 }, (_, i) => mk("rainbow", i + 10))];
    const { calls, node } = recorder();
    updatePickups(node, list, 1);
    expect(calls.get(pickupId("shield", 0))?.visible).toBe(true);
    expect(calls.get(pickupId("shield", 1))?.visible).toBe(true);
    expect(calls.get(pickupId("shield", 2))?.visible).toBe(false);
    expect(calls.get(pickupId("x2", 0))?.visible).toBe(true);
    expect(calls.get(pickupId("switch", 0))?.visible).toBe(false);
    expect(calls.get(haloId("shield", 1))?.visible).toBe(true);
    expect(calls.get(haloId("shield", 2))?.visible).toBe(false);
    expect(calls.get(haloId("shield", 0))?.position?.[1]).toBeLessThan(0.1);
    expect([0, 1, 2, 3].map((k) => calls.get(pickupId("rainbow", k))?.visible)).toEqual([true, true, true, true]);
  });

  it("ships zero legacy static GLBs on disk and keeps typed procedural descriptors", () => {
    const publicDir = resolve("apps/showcase-splat-rush-port/public/aura-assets");
    const exDir = resolve("examples/splat-rush-port/assets/models");
    expect(existsSync(publicDir)).toBe(false);
    expect(existsSync(exDir)).toBe(false);
    for (const [key, ref] of Object.entries(MODELS as unknown as Record<string, { url: string; hash: string }>)) {
      expect(ref.url.startsWith("/procedural/splat-rush/"), `${key} url`).toBe(true);
      expect(ref.hash.startsWith("sha256-"), `${key} hash`).toBe(true);
    }
  });

  it("mounts the Idol vinyl-toy GLBs as grouped typed models normalised to each piece size", () => {
    const collectAll = (nodes: readonly Record<string, unknown>[]): Record<string, unknown>[] => {
      const out: Record<string, unknown>[] = [];
      const visit = (n: Record<string, unknown>): void => {
        out.push(n);
        if (Array.isArray(n.children)) {
          for (const child of n.children as Record<string, unknown>[]) visit(child);
        }
      };
      for (const n of nodes) visit(n);
      return out;
    };
    /** Rendered max dimension of a group's single Idol model child (GLB dims x child scale). */
    const modelSpan = (groupNode: Record<string, unknown>): { key: string; span: number } => {
      const models = collectAll([groupNode]).filter((n) => n.kind === "model");
      expect(models).toHaveLength(1);
      const m = models[0] as { asset?: { id?: string }; scale?: number | readonly number[]; scaleMode?: string };
      expect(m.scaleMode).toBe("world");
      const key = String(m.asset?.id ?? "") as IdolKey;
      const s = typeof m.scale === "number" ? m.scale : Number((m.scale as readonly number[] | undefined)?.[0] ?? 1);
      return { key, span: Math.max(...IDOL_DIMS[key]) * s };
    };

    for (const look of [LOOKS.original, LOOKS.carnival]) {
      const builder = scene();
      addBackdrop(builder, look);
      addPickups(builder);
      const roots = builder.toJSON().nodes as unknown as Record<string, unknown>[];

      for (const p of PIECES) {
        const node = roots.find((n) => (n.runtime as { id?: string } | undefined)?.id === p.id)!;
        expect(node?.kind).toBe("group");
        const { key, span } = modelSpan(node);
        expect(key).toBe(ISLAND_KEY[pieceModel(look, p)]);
        expect(span).toBeCloseTo(p.size, 3);
      }

      const declaredIds = new Set(roots.map((n) => (n.runtime as { id?: string } | undefined)?.id).filter(Boolean));
      for (const id of pickupNodeIds()) {
        expect(declaredIds.has(id)).toBe(true);
        if (!id.startsWith("pickup-halo-")) {
          const node = roots.find((n) => (n.runtime as { id?: string } | undefined)?.id === id)!;
          expect(node?.kind).toBe("group");
          expect(modelSpan(node).span).toBeCloseTo(2.1, 3);
        }
      }
    }
  });
  it("every Idol model node in the full carnival world (instanced arches/sweepers included) renders at world scale", () => {
    const g = globalThis as Record<string, unknown>;
    const had = "document" in g;
    if (!had) g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => undefined }) }) };
    try {
      const nodes = buildWorld({ sim: new SplatRushSim(7), aspect: 16 / 9, look: LOOKS.carnival }).scene.toJSON().nodes as unknown as Record<string, unknown>[];
      const all: Record<string, unknown>[] = [];
      const visit = (n: Record<string, unknown>): void => { all.push(n); for (const c of (n.children as Record<string, unknown>[] | undefined) ?? []) visit(c); };
      nodes.forEach(visit);
      const models = all.filter((n) => n.kind === "model");
      const keys = new Set(models.map((n) => String((n.asset as { id?: string } | undefined)?.id)));
      for (const k of ["splatRunnerRig", "splatFinishArch", "splatSweeperBot", "splatIslandTree", "splatPickupSwitch"]) expect(keys.has(k), k).toBe(true);
      for (const m of models) expect((m as { scaleMode?: string }).scaleMode, String(m.name)).toBe("world");
    } finally { if (!had) delete g.document; }
  });
});
