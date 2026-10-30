import { describe, expect, it } from "vitest";
import { createAuraApp } from "@aura3d/engine";
import { HEADLIGHT_MOTES, MANHOLES, MOTES_AHEAD_M, createGridVfxQueue, headlightMotesSpec, manholeLayout, motesAnchor, type GridVfxShot } from "../../../apps/showcase-teleoperator/src/vfx";
import { buildGridDispatchScene } from "../../../apps/showcase-teleoperator/src/scene";
import { SKY_LOOKS } from "../../../apps/showcase-teleoperator/src/look";

const drain = (q: ReturnType<typeof createGridVfxQueue>, o = { motionOk: true, lowTier: false }): GridVfxShot[] => {
  const shots: GridVfxShot[] = [];
  q.drain(o, (s) => shots.push(s));
  return shots;
};
const emitterCount = (spec: NonNullable<ReturnType<typeof headlightMotesSpec>>): number => Number((spec.layers[0] as { count?: number }).count);

describe("grid dispatch GD-15 steam and headlight motes", () => {
  it("mounts the instanced manhole covers (one node, two covers per crossing)", () => {
    const app = createAuraApp(undefined, { scene: buildGridDispatchScene("night"), autoStart: false });
    expect(app.nodes.has("sf-manholes")).toBe(true);
    app.dispose?.();
    expect(manholeLayout([-100, -220])).toEqual([[-2.7, -87.5], [3.1, -84.5], [-2.7, -207.5], [3.1, -204.5]]);
  });

  it("steam puffs only while nearly stopped, only for manholes ahead within reach, on the interval", () => {
    const q = createGridVfxQueue();
    const manholes: [number, number][] = [[-2.7, -20], [3.1, -200], [0, 10]];
    q.steam({ dt: MANHOLES.steamIntervalS + 0.01, speed: 12, z: 0, manholes });
    expect(q.pending).toBe(0);
    q.steam({ dt: MANHOLES.steamIntervalS / 2, speed: 0.5, z: 0, manholes });
    expect(q.pending).toBe(0);
    q.steam({ dt: MANHOLES.steamIntervalS / 2 + 0.01, speed: 0.5, z: 0, manholes });
    const shots = drain(q);
    expect(shots.map((s) => [s.kind, s.at[0], s.at[2]])).toEqual([["grid-manhole-steam", -2.7, -20]]);
  });

  it("reduced motion and Low tier halve the steam and the motes; noon has no motes", () => {
    const q = createGridVfxQueue();
    const full = () => {
      q.steam({ dt: 1, speed: 0, z: 0, manholes: [[0, -20]] });
    };
    full();
    const normal = drain(q)[0]!.options.count!;
    full();
    const reduced = drain(q, { motionOk: false, lowTier: false })[0]!.options.count!;
    expect(reduced).toBe(Math.round(normal / 2));

    const base = Number((HEADLIGHT_MOTES.layers[0] as { count?: number }).count);
    expect(emitterCount(headlightMotesSpec({ headlights: SKY_LOOKS.night.street.headlights, motionOk: true, lowTier: false })!)).toBe(base);
    expect(emitterCount(headlightMotesSpec({ headlights: 1, motionOk: false, lowTier: false })!)).toBe(Math.round(base / 2));
    expect(emitterCount(headlightMotesSpec({ headlights: 1, motionOk: false, lowTier: true })!)).toBe(Math.round(base / 4));
    expect(headlightMotesSpec({ headlights: SKY_LOOKS.noon.street.headlights, motionOk: true, lowTier: false })).toBeNull();
  });

  it("the mote emitter sits ahead of the nose, inside the cones, and stays specks", () => {
    expect(motesAnchor(3.4, -10, 0)).toEqual([3.4, 0.75, -10 - MOTES_AHEAD_M]);
    const layer = HEADLIGHT_MOTES.layers[0] as { maxScreen?: number; additive?: boolean };
    expect(layer.maxScreen).toBeLessThanOrEqual(0.01);
    expect(layer.additive).toBe(true);
  });
});
