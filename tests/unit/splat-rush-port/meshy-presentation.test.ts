import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { scene } from "@aura3d/engine";
import { createProductionRuntimeEnvironment } from "../../../packages/engine/src/agent-api/compiler/environment";
import { BACKDROP_ENVIRONMENT_INTENSITY, PIECES, addBackdrop, updateBackdrop } from "../../../examples/splat-rush-port/backdrop";
import { haloId, pickupId, updatePickups } from "../../../examples/splat-rush-port/pickups";
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

  it("every model asset exists, matches its sha256 and the size budget", () => {
    let total = 0;
    for (const [key, ref] of Object.entries(MODELS as unknown as Record<string, { url: string; hash: string }>)) {
      const file = resolve("examples/splat-rush-port/assets/models", ref.url.split("/").pop() as string);
      expect(existsSync(file), `${key} missing`).toBe(true);
      const hash = `sha256-${createHash("sha256").update(readFileSync(file)).digest("hex")}`;
      expect(hash, `${key} hash`).toBe(ref.hash);
      total += statSync(file).size;
    }
    expect(total).toBeLessThan(10 * 1024 * 1024);
  });
});
