/**
 * Idol grounding sweep: every Idol placement sits on the surface under it.
 *  - trees, blossom trees and bushes: 0.1-0.2 m into the ground under their footprint (meadow strip top 0.12 for
 *    |x| < STRIP_W / 2, world floor -0.16 beyond it) - never floating, never buried;
 *  - river rafts and logs: deck at 0.22 with the underside in the water (top 0); lily pads: top 0.12, underside just
 *    in the water; lava stones: top 0.16, underside below the lava top (0);
 *  - vehicle wheels stand on their road / tram / rail top; bodies ride the measured wheel lift above it;
 *  - the player stands on the meadow top.
 * Measured on the real pool submissions of several runs across every theme and look.
 */
import { describe, expect, it } from "vitest";
import { bindApp, lane, setLookMode, setP4Dress, startRun, step, syncVisuals } from "../../../apps/showcase-cross-hop/src/game/core";
import { IDOL_POOL_ASSET, idolBodyLift, idolHeight, type IdolPoolKey } from "../../../apps/showcase-cross-hop/src/game/idolModels";
import { LANE_D, STRIP_W } from "../../../apps/showcase-cross-hop/src/game/themes";

type Spec = { position: number[]; rotation: number[]; scale: number[] };
const STRIP_TOP = 0.12, FLOOR_TOP = -0.16, WATER_TOP = 0, LAVA_TOP = 0;
const ROAD_TOP: Record<string, number> = { road: 0.12, tram: 0.128, rail: 0.13 };

function capture(look: "vivid" | "diorama" | "original", theme: number, seed: number, frames = 1) {
  const pools: Record<string, Spec[]> = {};
  const player: number[][] = [];
  const mk = (id: string) => ({
    setPosition(x: number, y: number, z: number) { if (id === "player") player.push([x, y, z]); },
    setScale() {}, setRotation() {}, setAnimation() {}, setVisible() {}, setMaterial() {}, setAnimationPose() {},
    setInstances(specs: Spec[]) {
      pools[id] = specs.filter((s) => s.position[1] > -900).map((s) => ({ position: [...s.position], rotation: [...s.rotation], scale: [...s.scale] }));
    }
  });
  const handles = new Map<string, ReturnType<typeof mk>>();
  const get = (id: string) => { if (!handles.has(id)) handles.set(id, mk(id)); return handles.get(id)!; };
  setLookMode(look);
  setP4Dress(look !== "diorama");
  bindApp({ nodes: { add() {}, remove() {}, require: get, get }, camera: { setPose() {} }, output: { setOutputOverlay() {} }, effects: { burst() {} } } as never);
  startRun("tour", null, seed, theme);
  for (let f = 0; f < frames; f++) { for (let s = 0; s < 20; s++) step(1 / 60, { buffered: () => false }); syncVisuals(1); }
  // lane types of this run (the lane cache belongs to the current run, so read them now)
  const types = new Map<number, string>();
  for (let row = 0; row < 80; row++) types.set(row, lane(row).type);
  return { pools, player, types };
}

const h = (k: IdolPoolKey) => idolHeight(IDOL_POOL_ASSET[k]);

describe("cross hop Idol grounding", () => {
  const runs = [] as ReturnType<typeof capture>[];
  for (const look of ["vivid", "diorama", "original"] as const) for (let theme = 0; theme < 6; theme++) runs.push(capture(look, theme, 101 + theme * 7, 3));
  const all = (k: string) => runs.flatMap((r) => r.pools[`pool-${k}`] ?? []);
  const withLane = (k: string) => runs.flatMap((r) => (r.pools[`pool-${k}`] ?? []).map((s) => ({ s, type: r.types.get(Math.round(-s.position[2]! / LANE_D))! })));

  it("trees, blossom trees and bushes stand 0.1-0.2 m into the ground under them", () => {
    let n = 0;
    for (const k of ["tree", "treeB", "bush"] as const) {
      const fw = IDOL_POOL_ASSET[k].bounds[0] / 2;
      for (const s of all(k)) {
        const x = s.position[0]!, r = fw * s.scale[0]!;
        // the whole footprint is on one surface (no trunk straddling the strip edge)
        const inside = Math.abs(x) < STRIP_W / 2;
        expect(inside ? Math.abs(x) + r : Math.abs(x) - r, `${k} at x=${x.toFixed(2)} straddles the strip edge`)[inside ? "toBeLessThanOrEqual" : "toBeGreaterThanOrEqual"](STRIP_W / 2);
        const sink = (inside ? STRIP_TOP : FLOOR_TOP) - s.position[1]!;
        expect(sink, `${k} at x=${x.toFixed(2)}`).toBeGreaterThanOrEqual(0.1 - 1e-6);
        expect(sink, `${k} at x=${x.toFixed(2)}`).toBeLessThanOrEqual(0.2 + 1e-6);
        n++;
      }
    }
    expect(n).toBeGreaterThan(100);
  });

  it("rafts and logs carry their deck at 0.22 with the underside in the water; lily pads and lava stones sit at their waterline", () => {
    const seen: Record<string, number> = {};
    for (const k of ["raft", "raftCandy", "log"] as const) for (const s of all(k)) {
      const bottom = s.position[1]!, top = bottom + h(k) * s.scale[1]!;
      expect(top, k).toBeCloseTo(0.22, 3);
      expect(bottom, k).toBeLessThan(WATER_TOP);
      expect(bottom, k).toBeGreaterThan(-0.6);
      seen[k] = (seen[k] ?? 0) + 1;
    }
    for (const s of all("pad")) {
      const bottom = s.position[1]!, top = bottom + h("pad") * s.scale[1]!;
      expect(top).toBeCloseTo(0.12, 3);
      expect(bottom).toBeLessThanOrEqual(WATER_TOP);
      expect(bottom).toBeGreaterThan(WATER_TOP - 0.05);
      seen.pad = (seen.pad ?? 0) + 1;
    }
    for (const s of all("stone")) {
      const bottom = s.position[1]!, top = bottom + h("stone") * s.scale[1]!;
      expect(top).toBeCloseTo(0.16, 3);
      expect(bottom).toBeLessThan(LAVA_TOP);
      seen.stone = (seen.stone ?? 0) + 1;
    }
    for (const k of ["raft", "log", "pad", "stone"]) expect(seen[k] ?? 0, `${k} placements checked`).toBeGreaterThan(0);
  });

  it("vehicle wheels stand on their road, tram or rail top and bodies ride the wheel lift", () => {
    let wheels = 0, bodies = 0;
    for (const k of ["wheel", "railWheel"] as const) {
      const wh = h(k);
      for (const { s, type } of withLane(k)) {
        const top = ROAD_TOP[type];
        expect(top, `wheel on a ${type} lane at z=${s.position[2]!.toFixed(3)} row ${(-s.position[2]! / LANE_D).toFixed(2)}`).toBeDefined();
        const bottom = s.position[1]! - (wh * s.scale[1]!) / 2; // wheel GLBs are centred on their hub
        expect(Math.abs(bottom - top!), `${k} on ${type}`).toBeLessThan(0.006);
        wheels++;
      }
    }
    for (const k of ["car", "hatch", "suv", "taxi", "van", "pickup", "truck", "tram", "train", "coach"] as const) {
      for (const { s, type } of withLane(k)) {
        expect(s.position[1]! - ROAD_TOP[type]!, `${k} body lift`).toBeCloseTo(idolBodyLift(k), 4);
        bodies++;
      }
    }
    expect(wheels).toBeGreaterThan(40);
    expect(bodies).toBeGreaterThan(10);
  });

  it("the player stands on the meadow top at the start of a run", () => {
    for (const r of runs) expect(r.player[0]![1]).toBeCloseTo(STRIP_TOP, 4);
  });
});
