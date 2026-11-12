import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { scene } from "@aura3d/engine";
import { createProductionRuntimeEnvironment } from "../../../packages/engine/src/agent-api/compiler/environment";
import { BACKDROP_ENVIRONMENT_INTENSITY, PIECES, addBackdrop, updateBackdrop } from "../../../examples/splat-rush-port/backdrop";
import { LOOKS } from "../../../examples/splat-rush-port/look";
import { addPickups, haloId, pickupId, pickupNodeIds, updatePickups } from "../../../examples/splat-rush-port/pickups";
import { MODELS } from "../../../examples/splat-rush-port/models";
import type { Powerup } from "../../../examples/splat-rush-port/sim";

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

describe("Meshy presentation layer (backdrop + pickups)", () => {
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

  it("ships zero static Meshy GLBs on disk and keeps typed procedural descriptors", () => {
    const publicDir = resolve("apps/showcase-splat-rush-port/public/aura-assets");
    const exDir = resolve("examples/splat-rush-port/assets/models");
    expect(existsSync(publicDir)).toBe(false);
    expect(existsSync(exDir)).toBe(false);
    for (const [key, ref] of Object.entries(MODELS as unknown as Record<string, { url: string; hash: string }>)) {
      expect(ref.url.startsWith("/procedural/splat-rush/"), `${key} url`).toBe(true);
      expect(ref.hash.startsWith("sha256-"), `${key} hash`).toBe(true);
    }
  });

  it("mounts zero static GLB model nodes and builds normalized multi-material procedural studio backdrop and pickup groups", () => {
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

    const maxSpanOfGroup = (groupNode: Record<string, unknown>): number => {
      const prims = collectAll([groupNode]).filter((n) => n.kind === "primitive");
      expect(prims.length).toBeGreaterThanOrEqual(2);
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      let allFinite = true;
      const seen = new Set<ArrayLike<number>>();
      for (const p of prims) {
        const geom = p.geometry as { positions: ArrayLike<number> };
        const pos = geom.positions;
        if (seen.has(pos)) continue;
        seen.add(pos);
        for (let i = 0; i < pos.length; i += 3) {
          const x = Number(pos[i]), y = Number(pos[i + 1]), z = Number(pos[i + 2]);
          if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
            allFinite = false;
            break;
          }
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (z < minZ) minZ = z;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          if (z > maxZ) maxZ = z;
        }
      }
      expect(allFinite).toBe(true);
      return Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    };

    for (const look of [LOOKS.original, LOOKS.carnival]) {
      const builder = scene();
      addBackdrop(builder, look);
      addPickups(builder);
      const roots = builder.toJSON().nodes as unknown as Record<string, unknown>[];
      const all = collectAll(roots);
      expect(all.filter((n) => n.kind === "model")).toHaveLength(0);

      for (const p of PIECES) {
        const node = roots.find((n) => (n.runtime as { id?: string } | undefined)?.id === p.id)!;
        expect(node?.kind).toBe("group");
        expect(maxSpanOfGroup(node)).toBeCloseTo(p.size, 3);
      }

      const declaredIds = new Set(roots.map((n) => (n.runtime as { id?: string } | undefined)?.id).filter(Boolean));
      for (const id of pickupNodeIds()) {
        expect(declaredIds.has(id)).toBe(true);
        if (!id.startsWith("pickup-halo-")) {
          const node = roots.find((n) => (n.runtime as { id?: string } | undefined)?.id === id)!;
          expect(node?.kind).toBe("group");
          expect(maxSpanOfGroup(node)).toBeCloseTo(2.1, 3);
        }
      }

      const glassPrims = all.filter((n) => n.kind === "primitive" && String(n.name ?? "").endsWith("-glass"));
      expect(glassPrims.length).toBeGreaterThan(0);
      for (const gp of glassPrims) {
        expect(gp.castShadow).toBe(false);
        expect(gp.receiveShadow).toBe(false);
      }
    }
  });
});
