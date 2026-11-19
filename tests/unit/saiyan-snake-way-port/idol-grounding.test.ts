/**
 * Idol grounding sweep (Serpentine): every Idol model that stands on the serpent's back sits on it under its whole
 * footprint — the base is at or below the body surface at each footprint point (along the local up, in the road frame
 * under that point) and never more than 0.5 m below the lowest of those points. Road entities in every lane and girth,
 * the roadside lanterns (now on the flank, they hung in open air 10.4 m out), the torii feet and the gatehouse feet
 * over the body. Exempt by design: sky islands, the serpent head, the planetlet, the tail monument at the tail tip,
 * floating pickups, and the gatehouse wing towers that reach past the body over the cloud sea.
 * Also F3 GPU QA: the runner stays in frame through the start-of-run intro and the chase camera has landed by 1.5 s.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildRoadSamples, frameAt, type RoadFrame, type V3 } from "../../../examples/saiyan-snake-way-port/road";
import { LANE_WIDTH, ROAD_LENGTH, STAGES } from "../../../examples/saiyan-snake-way-port/sim";
import {
  BODY_HALF_WIDTH, ENTITY_HALF_WIDTH, GATEHOUSE_FEET, LANTERN_FOOT, LANTERN_LATERAL, RUNNER_CORRIDOR_HALF, TORII_FEET, TORII_FOOT_FIT, groundedBase,
  surfaceHeight, toriiClearsLanes, toriiInnerPost
} from "../../../examples/saiyan-snake-way-port/art/grounding";
import { GATEHOUSE_SCALE } from "../../../examples/saiyan-snake-way-port/art/idolModels";
import { INTRO_SECONDS, createShotDirector } from "../../../examples/saiyan-snake-way-port/art/shots";
import { CHASE_CAMERA, ENTITY_BEHIND_CUTOFF, applyShot } from "../../../examples/saiyan-snake-way-port/world";

const samples = buildRoadSamples();
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Checks a footprint (lateral span [x0, x1] about the frame, depth +-dz along the road) against the body surface. */
function check(f: RoadFrame, s: number, base: V3, x0: number, x1: number, dz: number): { float: number; sink: number } {
  let float = -Infinity, lowest = Infinity, baseUp = Infinity;
  for (const z of [-dz, 0, dz]) {
    const fz = frameAt(samples, Math.max(0, Math.min(ROAD_LENGTH, s + z)));
    for (let k = 0; k <= 8; k++) {
      const x = x0 + ((x1 - x0) * k) / 8;
      const P: V3 = [base[0] + f.R[0] * (x - dot(sub(base, f.p), f.R)) + f.F[0] * z, base[1] + f.R[1] * (x - dot(sub(base, f.p), f.R)) + f.F[1] * z, base[2] + f.R[2] * (x - dot(sub(base, f.p), f.R)) + f.F[2] * z];
      const d = sub(P, fz.p);
      const surf = surfaceHeight(fz.girth, dot(d, fz.R));
      const u = dot(d, fz.U);
      float = Math.max(float, u - surf);
      lowest = Math.min(lowest, surf);
      baseUp = Math.min(baseUp, u);
    }
  }
  return { float, sink: lowest - baseUp };
}

describe("Serpentine Idol props sit on the serpent's back", () => {
  const stageS = STAGES.map((st) => st.from + 40).filter((s) => s < ROAD_LENGTH);

  it("road entities (barrier, arch, oni, chariot, feast) in every lane and girth", () => {
    expect(new Set(STAGES.map((st) => st.girth)).size).toBeGreaterThan(1);
    for (const s of stageS) {
      const f = frameAt(samples, s);
      for (const [type, hw] of Object.entries(ENTITY_HALF_WIDTH)) {
        for (const lane of [-2.3, 0, 2.3]) {
          const r = check(f, s, groundedBase(f, lane, hw), lane - hw, lane + hw, 1);
          expect(r.float, `${type} s${s} lane${lane}`).toBeLessThanOrEqual(0.03);
          expect(r.sink, `${type} s${s} lane${lane}`).toBeLessThanOrEqual(0.5);
        }
      }
    }
  });

  it("roadside lanterns stand on the flank (not in open air beside the body)", () => {
    for (const s of stageS) {
      const f = frameAt(samples, s);
      for (const side of [-1, 1]) {
        const x = side * LANTERN_LATERAL * f.girth;
        expect(Math.abs(x) + LANTERN_FOOT).toBeLessThan(BODY_HALF_WIDTH * f.girth);
        const r = check(f, s, groundedBase(f, x, LANTERN_FOOT), x - LANTERN_FOOT, x + LANTERN_FOOT, LANTERN_FOOT);
        expect(r.float).toBeLessThanOrEqual(0.03);
        expect(r.sink).toBeLessThanOrEqual(0.5 + 0.05);
      }
    }
  });

  it("torii feet and the gatehouse feet over the body stand on it", () => {
    for (const s of stageS) {
      const f = frameAt(samples, s);
      const x0 = TORII_FEET[0] * TORII_FOOT_FIT * f.girth, x1 = TORII_FEET[1] * TORII_FOOT_FIT * f.girth;
      expect(x1).toBeLessThanOrEqual(BODY_HALF_WIDTH * f.girth);
      const base = groundedBase(f, (x0 + x1) / 2, (x1 - x0) / 2, 0, 0);
      expect(Math.abs(dot(sub(base, f.p), f.R)), `torii centred s${s}`).toBeLessThan(1e-6);
      for (const side of [-1, 1]) {
        const r = check(f, s, [base[0] + f.R[0] * (side - 1) * ((x0 + x1) / 2), base[1] + f.R[1] * (side - 1) * ((x0 + x1) / 2), base[2] + f.R[2] * (side - 1) * ((x0 + x1) / 2)], side * x0, side * x1, 1.9);
        expect(r.float).toBeLessThanOrEqual(0.03);
      }
    }
    const g = frameAt(samples, 28);
    const gx0 = GATEHOUSE_FEET[0] * GATEHOUSE_SCALE[0], gx1 = Math.min(BODY_HALF_WIDTH * g.girth, GATEHOUSE_FEET[1] * GATEHOUSE_SCALE[0]);
    const gb = groundedBase(g, (gx0 + gx1) / 2, (gx1 - gx0) / 2, 0, 0);
    expect(Math.abs(dot(sub(gb, g.p), g.R)), "gatehouse centred").toBeLessThan(1e-6);
    expect(check(g, 28, gb, gx0, gx1, 3).float).toBeLessThanOrEqual(0.05);
  });

  it("world.ts places the Idol entities, lanterns, torii and gatehouse with the grounding helpers", () => {
    const src = readFileSync("examples/saiyan-snake-way-port/world.ts", "utf8");
    expect(src).toContain("groundedBase(f, lateral, groundW)");
    expect(src).toContain("groundedBase(lf, side * LANTERN_LATERAL * lf.girth, LANTERN_FOOT)");
    expect(src).toContain("TORII_FOOT_FIT * toriiGirth[i]!");
    expect(src).toContain("groundedBase(gf0,");
  });
});

describe("Serpentine pass-through (owner QA 2026-11-18: the runner ran straight through a torii post)", () => {
  const src = readFileSync("examples/saiyan-snake-way-port/world.ts", "utf8");

  it("torii and gatehouse are placed centred on the road (lateral 0), not at their right feet", () => {
    expect(src).toMatch(/groundedBase\(gf, \(TORII_FEET\[0\] \+ TORII_FEET\[1\]\) \/ 2 \* TORII_FOOT_FIT \* gf\.girth, [^;]*, 0, 0\)/);
    expect(src).toMatch(/groundedBase\(gf0, \(gx0 \+ gx1\) \/ 2, \(gx1 - gx0\) \/ 2, 0, 0\)/);
    expect(src).toContain("if (idol && !toriiClearsLanes(gf.girth)) continue;");
  });

  it("no decor footprint intersects the runner's corridor anywhere on the road", () => {
    expect(RUNNER_CORRIDOR_HALF).toBeGreaterThanOrEqual(LANE_WIDTH + 0.45);
    let gates = 0;
    for (let s = 0; s <= ROAD_LENGTH; s += 6) {
      const f = frameAt(samples, s);
      // roadside lanterns: pedestal inner edge
      expect(LANTERN_LATERAL * f.girth - LANTERN_FOOT, `lantern s${s}`).toBeGreaterThanOrEqual(RUNNER_CORRIDOR_HALF);
      // torii: either its inner posts clear the corridor or no gate is raised there
      if (toriiClearsLanes(f.girth)) { gates++; expect(toriiInnerPost(f.girth)).toBeGreaterThanOrEqual(RUNNER_CORRIDOR_HALF); }
    }
    expect(gates).toBeGreaterThan(0);
    // the gatehouse's inner feet clear the corridor
    expect(GATEHOUSE_FEET[0] * GATEHOUSE_SCALE[0]).toBeGreaterThanOrEqual(RUNNER_CORRIDOR_HALF);
  });

  it("road hazards' drawn half-width matches the sim's 1.2 m lateral hit reach, and crashed plates/ribs stop being drawn", () => {
    for (const [type, hw] of Object.entries(ENTITY_HALF_WIDTH)) expect(Math.abs(hw - 1.2), type).toBeLessThanOrEqual(0.45);
    expect(src).toContain("if (ent.hit && HIT_BREAKS.has(ent.type)) continue;");
    // passed entities stop drawing before they reach the chase eye (no camera inside a soul / chariot)
    expect(ENTITY_BEHIND_CUTOFF).toBeLessThan(CHASE_CAMERA.backBase - 1);
    expect(src).toContain("ent.punt ? 12 : ENTITY_BEHIND_CUTOFF");
  });
});

describe("Serpentine start-of-run intro keeps the runner in frame (F3 GPU QA)", () => {
  it("the intro swing runs on a render clock through the countdown (GPU QA: held at its first pose for 3.6 s)", () => {
    const src = readFileSync("examples/saiyan-snake-way-port/world.ts", "utf8");
    expect(src).toContain("if (!title) introClock += dt;");
    expect(src).toMatch(/resetCamera\(\) \{[^}]*introClock = 0;/);
  });

  it("the runner stays inside the view through the intro and the chase camera has landed by 1.5 s", () => {
    expect(INTRO_SECONDS).toBeLessThanOrEqual(1.5);
    const d = createShotDirector();
    const runner: V3 = [0, 0, 0], F: V3 = [0, 0, -1], U: V3 = [0, 1, 0], R: V3 = [1, 0, 0];
    const back = CHASE_CAMERA.backBase + CHASE_CAMERA.backSpeedMax;
    const eye0: V3 = [R[0] * 0.16, CHASE_CAMERA.rise, back];
    const look0: V3 = [-0.04, CHASE_CAMERA.aim, -CHASE_CAMERA.ahead];
    const tanV = Math.tan((62 / 2) * (Math.PI / 180)), tanH = tanV * (16 / 9);
    for (let t = 0; t <= 2; t += 0.05) {
      const shot = d.step({ S: { time: t, s: t * 40, leg: "out", speed: 40, surge: "off", phase: "run" }, dt: 0.05, lean: 0, outro: 0, reducedMotion: false });
      if (t >= 1.5) expect(shot.name, `t=${t.toFixed(2)}`).not.toBe("intro");
      const [e, l, u] = applyShot(shot, eye0, look0, runner, F, U);
      const dv = sub(l, e), dn = Math.hypot(...dv);
      const fwd: V3 = [dv[0] / dn, dv[1] / dn, dv[2] / dn];
      const rt: V3 = [fwd[1] * u[2] - fwd[2] * u[1], fwd[2] * u[0] - fwd[0] * u[2], fwd[0] * u[1] - fwd[1] * u[0]];
      const rl = Math.hypot(...rt);
      const right: V3 = [rt[0] / rl, rt[1] / rl, rt[2] / rl];
      const camUp: V3 = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
      for (const h of [0.2, 1.0, 1.8]) { // feet, middle and head of the runner
        const v = sub([0, h, 0], e);
        const z = dot(v, fwd);
        expect(z, `t=${t.toFixed(2)} h=${h}`).toBeGreaterThan(0.5);
        expect(Math.abs(dot(v, camUp) / z), `t=${t.toFixed(2)} h=${h}`).toBeLessThanOrEqual(tanV);
        expect(Math.abs(dot(v, right) / z), `t=${t.toFixed(2)} h=${h}`).toBeLessThanOrEqual(tanH);
      }
    }
  });
});
