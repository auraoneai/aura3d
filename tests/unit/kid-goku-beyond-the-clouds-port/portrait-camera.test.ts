/**
 * Portrait chase camera (GPU QA 2026-11-18, 390x844 `?autoplay=1`): along the whole autoplay route the kid is in frame
 * and at least 10% of the frame height, and the eye stays over the road above him: inside the corridor that every wall,
 * rock and crown keeps clear (pass-through.test.ts), never inside canyon-wall or rock volumes. Landscape is held to the
 * same bar. Entering play from the title or result is a camera cut.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TITLE_FLYOVER_SECONDS, chasePose, titleFlyover, titleOrbit } from "../../../examples/kid-goku-beyond-the-clouds-port/art/camera";
import { FLYER_BOX, IDOL_FLYER_SCALE, flyerPose } from "../../../examples/kid-goku-beyond-the-clouds-port/art/flyerPath";
import { ACTIVE_LOOK } from "../../../examples/kid-goku-beyond-the-clouds-port/art/look";
import { createAutopilot } from "../../../examples/kid-goku-beyond-the-clouds-port/autopilot";
import { CUMULUS_RIDGE as CH } from "../../../examples/kid-goku-beyond-the-clouds-port/chapter";
import { at, frameAt, type V3 } from "../../../examples/kid-goku-beyond-the-clouds-port/course";
import { Game } from "../../../examples/kid-goku-beyond-the-clouds-port/game";
import { RIDE_LOG_TOP } from "../../../examples/kid-goku-beyond-the-clouds-port/idol";
import { smooth } from "../../../examples/kid-goku-beyond-the-clouds-port/sim";
import { CORRIDOR_HALF, ROAD_HALF, groundHeight } from "../../../examples/kid-goku-beyond-the-clouds-port/terrain";

const KID_HEIGHT = 1.54;
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function project(eye: V3, look: V3, fov: number, aspect: number, p: V3): { x: number; y: number; z: number } {
  const f = norm(sub(look, eye)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f), d = sub(p, eye), z = dot(d, f);
  const t = Math.tan((fov * Math.PI) / 360);
  return { x: dot(d, r) / (z * t * aspect), y: dot(d, u) / (z * t), z };
}

function courseOf(p: V3): { s: number; lat: number; h: number } {
  let se = -p[2];
  for (let k = 0; k < 3; k++) { const f = frameAt(se); se += dot(sub(p, f.point), f.forward); }
  const f = frameAt(se), d = sub(p, f.point);
  return { s: se, lat: dot(d, f.right), h: dot(d, f.up) };
}

/** Sight-line samples from the eye to the kid's feet, chest and head that fall inside a flyer's drawn box (+ margin). */
const FLYER_MARGIN = 0.4;
function flyerBlocks(eye: V3, kid: { s: number; lane: number; base: number }, fp: { sp: number; lat: number; hgt: number }, sc: number): number {
  let hits = 0;
  for (const up of [0.2, 1.0, 1.5]) {
    const k = at(kid.s, kid.lane, kid.base + up);
    for (let i = 0; i < 60; i++) {
      const t = i / 60, q = courseOf([eye[0] + (k[0] - eye[0]) * t, eye[1] + (k[1] - eye[1]) * t, eye[2] + (k[2] - eye[2]) * t]);
      const inS = q.s > fp.sp - FLYER_BOX.toward * sc - FLYER_MARGIN && q.s < fp.sp + FLYER_BOX.away * sc + FLYER_MARGIN;
      const inLat = Math.abs(q.lat - fp.lat) < FLYER_BOX.lateral * sc + FLYER_MARGIN;
      const inH = q.h > fp.hgt - FLYER_BOX.below * sc - FLYER_MARGIN && q.h < fp.hgt + FLYER_BOX.above * sc + FLYER_MARGIN;
      if (inS && inLat && inH) hits++;
    }
  }
  return hits;
}

function route(aspect: number) {
  const game = new Game(CH, 0, 0), pilot = createAutopilot(true);
  let frames = 0, small = 0, out = 0, worstShare = 1, eyeBad = 0, flyerHits = 0, flyerFrames = 0, koFrames = 0;
  let clock = 0;
  for (let i = 0; i < 60 * 150 && game.phase !== "result"; i++) {
    pilot.tick(game, 1 / 60);
    game.frame(1 / 60, pilot.input(game));
    if (game.phase !== "playing") continue;
    const s = game.state, n = s.glider;
    const logLift = (1 - smooth(CH.log! - 0.3, CH.log!, s.s)) * RIDE_LOG_TOP;
    const pose = chasePose({ s: s.s, lane: s.lane, jump: s.jump, riding: n.active || n.call > 0, logLift, aspect, speed: s.speed, chase: !!game.chase, danger: game.danger, log: CH.log ?? 0, length: CH.length }, frameAt);
    const feet = at(s.s, s.lane, s.jump + logLift), head = at(s.s, s.lane, s.jump + logLift + KID_HEIGHT);
    const a = project(pose.eye, pose.look, pose.fov, aspect, feet), b = project(pose.eye, pose.look, pose.fov, aspect, head);
    frames++;
    clock += 1 / 60;
    // every diving flyer on screen (world.ts shows it from 70 m before the dive to 26 m after, or 40 m after a knock-out)
    game.enc.dives.forEach((dv, i) => {
      const d = s.s - dv.s;
      const shown = (!dv.hit && d > -70 && d < 26) || (!!dv.ko && dv.hit && d > -70 && d < 40);
      if (!shown) return;
      const fp = flyerPose({ kidS: s.s, diveS: dv.s, target: dv.target, lane: s.lane, ko: dv.hit && dv.ko ? dv.ko : null, clock, index: i, scale: IDOL_FLYER_SCALE });
      flyerFrames++;
      if (dv.ko) koFrames++;
      flyerHits += flyerBlocks(pose.eye, { s: s.s, lane: s.lane, base: s.jump + logLift }, fp, IDOL_FLYER_SCALE);
    });
    if (a.z <= 0 || Math.abs(a.x) > 1 || Math.abs(b.x) > 1 || a.y < -1 || b.y > 1) out++;
    const share = (b.y - a.y) / 2;
    worstShare = Math.min(worstShare, share);
    if (share < 0.1) small++;
    // the eye's place in course space: lateral offset and height over the road
    let se = -pose.eye[2];
    for (let k = 0; k < 3; k++) { const f = frameAt(se); se += dot(sub(pose.eye, f.point), f.forward); }
    const fe = frameAt(se), lat = dot(sub(pose.eye, fe.point), fe.right), h = dot(sub(pose.eye, fe.point), fe.up);
    if (Math.abs(lat) >= CORRIDOR_HALF || Math.abs(lat) >= ROAD_HALF || h < 2.5 || h > 9.5) eyeBad++;
  }
  return { frames, small, out, worstShare, eyeBad, flyerHits, flyerFrames, koFrames, won: game.phase === "result" };
}

describe("Cumulus Dash chase camera is aspect-aware", () => {
  it.each([["portrait 390x844", 390 / 844], ["landscape 1280x720", 1280 / 720]])("%s: the kid is in frame and >= 10%% of its height along the autoplay route; the eye stays over the road", (_, aspect) => {
    const r = route(aspect);
    expect(r.won).toBe(true);
    expect(r.frames).toBeGreaterThan(5000);
    expect(r.out).toBe(0);
    expect(r.small).toBe(0);
    expect(r.worstShare).toBeGreaterThanOrEqual(0.1);
    expect(r.eyeBad).toBe(0);
    // the flyers (all three bonked by the autopilot) never come between the eye and the kid
    expect(r.flyerFrames).toBeGreaterThan(200);
    expect(r.koFrames).toBeGreaterThan(50);
    expect(r.flyerHits).toBe(0);
  }, 60_000);

  it.each([["portrait", 390 / 844], ["landscape", 1280 / 720]])("%s: on every dive path (dodged, grabbed or bonked at any moment, any lane) no flyer bound reaches the eye-to-kid sight line", (_, aspect) => {
    let hits = 0, checks = 0;
    const diveS = 965;
    for (const lane of [-5.1, -2.5, 0, 2.5, 5.1]) for (const koD of [null, -12, -6, -3, 0, 1.4]) for (let d = -70; d < 40; d += 0.5) {
      const kidS = diveS + d;
      const ko = koD !== null && d >= koD ? { at: diveS + koD } : null;
      if (koD !== null && d < koD && d > 1.5) continue;
      const pose = chasePose({ s: kidS, lane, jump: 0, riding: false, logLift: 0, aspect, speed: CH.speed, chase: false, danger: 1, log: CH.log ?? 0, length: CH.length }, frameAt);
      const fp = flyerPose({ kidS, diveS, target: d > -40 ? lane : null, lane, ko, clock: d * 0.07, index: 0, scale: IDOL_FLYER_SCALE });
      hits += flyerBlocks(pose.eye, { s: kidS, lane, base: 0 }, fp, IDOL_FLYER_SCALE);
      checks++;
    }
    expect(checks).toBeGreaterThan(5_000);
    expect(hits).toBe(0);
  }, 60_000);

  it("portrait title: the flyover and the orbit keep the eye >= 4 m from the kid on his log, him in frame at <= 35% of its height", () => {
    const aspect = 390 / 844, base = RIDE_LOG_TOP;
    const feet = at(0, 0, base), head = at(0, 0, base + KID_HEIGHT);
    const poses: { eye: V3; look: V3; fov: number }[] = [];
    for (let t = 0; t < TITLE_FLYOVER_SECONDS; t += 0.1) poses.push(titleFlyover(t, feet, ACTIVE_LOOK.sky.sunDir, false, aspect)!);
    for (let c = 0; c < 60; c += 0.1) {
      const o = titleOrbit(c, 0, 0, base, aspect);
      poses.push({ eye: at(o.eye[0], o.eye[1], o.eye[2]), look: at(o.look[0], o.look[1], o.look[2]), fov: o.fov });
    }
    let worstDist = Infinity, worstShare = 0, outOfFrame = 0, underground = 0;
    for (const p of poses) {
      worstDist = Math.min(worstDist, Math.hypot(...sub(p.eye, at(0, 0, base + 1.0))));
      const a = project(p.eye, p.look, p.fov, aspect, feet), b = project(p.eye, p.look, p.fov, aspect, head);
      worstShare = Math.max(worstShare, Math.abs(b.y - a.y) / 2);
      if (a.z <= 0 || b.z <= 0 || Math.abs(a.x) > 1 || Math.abs(b.x) > 1 || Math.abs(a.y) > 1 || Math.abs(b.y) > 1) outOfFrame++;
      const q = courseOf(p.eye);
      if (q.h < groundHeight(CH, q.s, q.lat) + 1) underground++;
    }
    expect(worstDist).toBeGreaterThanOrEqual(4);
    expect(worstShare).toBeLessThanOrEqual(0.35);
    expect(outOfFrame).toBe(0);
    expect(underground).toBe(0);
  });

  it("entering play from the title flyover or the result orbit cuts the camera instead of easing from there", () => {
    const src = readFileSync("examples/kid-goku-beyond-the-clouds-port/world.ts", "utf8");
    expect(src).toContain('if (camPhase === "menu" || camPhase === "result") cut = true;');
    expect(src).toContain("chasePose({ s: s.s, lane: s.lane");
  });
});
