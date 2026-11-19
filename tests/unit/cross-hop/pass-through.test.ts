/**
 * Pass-through pass (owner, 2026-11-18: "it just runs right through rather than stopping").
 *  - No standing dressing (trees, bushes, fence, signs, lamps, bollards, tram poles, reeds, level-crossing posts and
 *    their lowered arms) reaches the hop corridor: the hop columns plus the critter's half-width, or the whole carry
 *    range on river / lava rows. Measured on the real pool submissions in every look and theme.
 *  - Every drawn traffic vehicle and river / lava platform sits on a sim mover with a hitbox of about its drawn length.
 *  - A car that reaches the critter while it hops off the road kills it mid-hop (it used to drive through it).
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  CRITTER_HIT_HALF, DRILLS, RAIL_ARM_REACH, RAIL_SIGNAL_X, SIM_STEP, bindApp, lane, renderTime, setLookMode, setP4Dress,
  startRun, st, step, syncVisuals
} from "../../../apps/showcase-cross-hop/src/game/core";
import { IDOL_POOL_ASSET, type IdolPoolKey } from "../../../apps/showcase-cross-hop/src/game/idolModels";
import { laneMovers, moverHalf } from "../../../apps/showcase-cross-hop/src/game/world";
import { COL_MAX, COL_W, FIELD_HALF, LANE_D } from "../../../apps/showcase-cross-hop/src/game/themes";

type Spec = { position: number[]; rotation: number[]; scale: number[] };
/** Half the widest Idol critter footprint (hopCritterHop 0.963 x 1.028). */
const CRITTER_HALF = 0.52;
const STANDING = ["tree", "treeB", "bush", "trunk", "dressB", "glowS", "detail", "glow"] as const;
const VEHICLES = ["car", "hatch", "suv", "taxi", "van", "pickup", "hover", "truck", "tram"] as const;

function capture(look: "vivid" | "diorama" | "original", theme: number, seed: number, frames: number) {
  const out: { pools: Record<string, Spec[]>; types: Map<number, string>; tr: number; lanes: Map<number, ReturnType<typeof lane>> }[] = [];
  let pools: Record<string, Spec[]> = {};
  const mk = (id: string) => ({
    setPosition() {}, setScale() {}, setRotation() {}, setAnimation() {}, setVisible() {}, setMaterial() {}, setAnimationPose() {},
    setInstances(specs: Spec[]) {
      pools[id] = specs.filter((s) => s.position[1]! > -900).map((s) => ({ position: [...s.position], rotation: [...s.rotation], scale: [...s.scale] }));
    }
  });
  const handles = new Map<string, ReturnType<typeof mk>>();
  const get = (id: string) => { if (!handles.has(id)) handles.set(id, mk(id)); return handles.get(id)!; };
  setLookMode(look);
  setP4Dress(look !== "diorama");
  bindApp({ nodes: { add() {}, remove() {}, require: get, get }, camera: { setPose() {} }, output: { setOutputOverlay() {} }, effects: { burst() {} } } as never);
  st.autopilot = true;
  startRun("tour", null, seed, theme);
  for (let f = 0; f < frames; f++) {
    for (let s = 0; s < 45; s++) step(SIM_STEP, { buffered: () => false });
    pools = { ...pools };
    syncVisuals(1);
    const types = new Map<number, string>();
    const lanes = new Map<number, ReturnType<typeof lane>>();
    for (let row = 0; row < st.playerRow + 30; row++) { types.set(row, lane(row).type); lanes.set(row, lane(row)); }
    out.push({ pools, types, tr: renderTime(1), lanes });
  }
  st.autopilot = false;
  return out;
}

const runs = [] as ReturnType<typeof capture>;
for (const look of ["vivid", "diorama", "original"] as const) for (let theme = 0; theme < 6; theme++) runs.push(...capture(look, theme, 301 + theme * 11, 4));

describe("cross hop pass-through: nothing solid stands in the hop corridor", () => {
  it("the level-crossing arm, lowered, ends beyond the outer hop column", () => {
    expect(RAIL_SIGNAL_X - RAIL_ARM_REACH).toBeGreaterThan(COL_MAX * COL_W + CRITTER_HALF);
  });

  it("no standing prop's footprint reaches the hop columns (or the carry range on river / lava rows)", () => {
    let checked = 0;
    for (const r of runs) {
      for (const k of STANDING) {
        for (const s of r.pools[`pool-${k}`] ?? []) {
          const [x, y, z] = s.position as [number, number, number];
          const row = Math.round(-z / LANE_D);
          const type = r.types.get(row);
          if (!type) continue;
          // Idol models are grounded at y = 0 (bounds give the size); primitive pools are unit boxes centred on y.
          const idol = k === "tree" || k === "treeB" || k === "bush";
          const b = idol ? IDOL_POOL_ASSET[k as IdolPoolKey].bounds : [1, 1, 1];
          const sx = b[0] * s.scale[0]!, sy = b[1] * s.scale[1]!, sz = b[2] * s.scale[2]!;
          const top = idol ? y + sy : y + sy / 2;
          // Flat paint, kerbs, ground strips and warning stripes are walked over; the train's window strip rides the train.
          if (top <= 0.3 || sx >= 20) continue;
          if (type === "rail" && k === "detail" && Math.abs(y - 0.47) < 0.02) continue;
          const rz = s.rotation[2] ?? 0;
          const halfX = idol ? Math.max(sx, sz) / 2 : (Math.abs(Math.cos(rz)) * sx + Math.abs(Math.sin(rz)) * sy) / 2;
          const corridor = (type === "river" || type === "lava" ? FIELD_HALF : COL_MAX * COL_W) + CRITTER_HALF;
          expect(Math.abs(x) - halfX, `${k} at x=${x.toFixed(2)} row ${row} (${type})`).toBeGreaterThan(corridor);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe("cross hop pass-through: hazards are drawn at their hitboxes", () => {
  it("every drawn vehicle, raft, log, pad and lava stone sits on a sim mover of about its drawn length", () => {
    let checked = 0;
    for (const r of runs) {
      const xs = new Float32Array(32);
      const pools: [string, "length" | "x" | "z"][] = [...VEHICLES.map((k) => [k, "length"] as [string, "length"]), ["log", "length"], ["raft", "length"], ["raftCandy", "length"], ["pad", "x"], ["stone", "x"]];
      for (const [k] of pools) {
        const b = IDOL_POOL_ASSET[k as IdolPoolKey].bounds;
        for (const s of r.pools[`pool-${k}`] ?? []) {
          const [x, , z] = s.position as [number, number, number];
          const row = Math.round(-z / LANE_D);
          const l = r.lanes.get(row);
          if (!l || l.moverKind === "none") continue;
          const n = laneMovers(l, r.tr, xs);
          let best = Infinity;
          for (let i = 0; i < n; i++) best = Math.min(best, Math.abs(xs[i]! - x));
          expect(best, `${k} at x=${x.toFixed(2)} row ${row} is not on a sim mover`).toBeLessThan(0.02);
          // Drawn half-length along the lane (GLB +Z turned onto X for the movers that travel along it).
          const drawnHalf = (k === "pad" || k === "stone" ? Math.max(b[0] * s.scale[0]!, b[2] * s.scale[2]!) : b[2] * s.scale[2]!) / 2;
          const hit = moverHalf(l);
          expect(hit - drawnHalf, `${k} hitbox vs drawn (row ${row})`).toBeGreaterThanOrEqual(-0.06);
          expect(hit - drawnHalf, `${k} hitbox vs drawn (row ${row})`).toBeLessThanOrEqual(0.2);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });
});

describe("cross hop pass-through: cars hit a critter mid-hop", () => {
  beforeEach(() => {
    st.profile = { best: 0, coins: 0, unlocked: ["hop"], selected: "hop", drills: [], seenIntro: true };
    st.autopilot = false;
    st.banked = true;
  });

  it("a car reaching the critter as it hops off the road squashes it instead of driving through it", () => {
    const drill = DRILLS.find((d) => d.id === "traffic-gaps")!;
    const roadRow = drill.script.indexOf("road");
    const xs = new Float32Array(32);
    let found = false;
    for (let attempt = 0; attempt < 600 && !found; attempt++) {
      startRun("drill", drill, 1);
      const l = lane(roadRow);
      // A start time where the road is clear at the critter (x = 0) for the hop-start frame but a car arrives within
      // the hop's first half (2..4 frames later).
      const t0 = 3 + attempt * SIM_STEP;
      const clearAt = (t: number) => { const n = laneMovers(l, t, xs); for (let i = 0; i < n; i++) if (Math.abs(xs[i]!) < moverHalf(l) + CRITTER_HIT_HALF) return false; return true; };
      if (!clearAt(t0) || !clearAt(t0 + SIM_STEP) || clearAt(t0 + 3 * SIM_STEP)) continue;
      found = true;
      st.time = t0;
      st.playerRow = roadRow;
      st.playerCol = 0;
      st.idle = 0;
      const pressed = new Set(["up"]);
      const input = { buffered: (d: string) => pressed.has(d), consume: (d: string) => pressed.delete(d) };
      step(SIM_STEP, input);
      expect(st.hop.active, "hop started").toBe(true);
      for (let i = 0; i < 6 && !st.dead; i++) step(SIM_STEP, input);
      expect(st.dead?.kind).toBe("squashed");
      expect(st.playerRow, "dies on the road it was leaving").toBe(roadRow);
    }
    expect(found).toBe(true);
  });
});
