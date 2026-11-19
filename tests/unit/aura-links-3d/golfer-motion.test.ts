import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  BALL_SHOT, SKELETON_ATHLETE, evaluateSwing, makeRoot, solveSwing, toModel, unit, useSkeleton, vAdd, vDist, vScale, vSub,
  type SwingPosePhase
} from "../../../apps/showcase-aura-links-3d/src/game/swingMath";
import { PALM_PAST_HAND } from "../../../apps/showcase-aura-links-3d/src/game/golferRetarget";
import { IDOL_BINDS, IDOL_CADDIE_BIND } from "../../../apps/showcase-aura-links-3d/src/game/idolBinds";
import { idolForwardKinematics, idolProfile, mapIdolRoles, retargetIdol } from "../../../apps/showcase-aura-links-3d/src/game/idolHumanoid";
import { MOTION_CLIPS } from "../../../apps/showcase-aura-links-3d/src/game/motion.generated";
import {
  caddieIdleDeltas, celebrateDeltas, clipForPhase, golferMotionDeltas, strokeKeys, strokeTime, type GolferMotionPhase
} from "../../../apps/showcase-aura-links-3d/src/game/golferMotion";

const STATES: Array<[GolferMotionPhase, number]> = [
  ["address", 0], ["walk", 0], ["backswing", 0.3], ["backswing", 0.7], ["top", 0], ["downswing", 0.5], ["downswing", 1],
  ["follow", 0.4], ["follow", 1], ["putt-address", 0], ["putt-back", 1], ["putt-through", 0.5], ["putt-through", 1]
];
const rotDiff = (a: Record<string, { rotation: { x: number; y: number; z: number; w: number } }>, b: typeof a) =>
  Math.max(...Object.keys(a).map((k) => { const p = a[k]!.rotation, q = b[k]!.rotation; return Math.min(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z, p.w - q.w), Math.hypot(p.x + q.x, p.y + q.y, p.z + q.z, p.w + q.w)); }));

describe("Links golfer and caddie on text-to-motion clips (fal hunyuan-motion) with the solve as club / arm IK", () => {
  afterAll(() => useSkeleton(SKELETON_ATHLETE));

  it("plays the right clip in every state", () => {
    expect(Object.keys(MOTION_CLIPS).sort()).toEqual(["Address", "CaddieIdle", "Celebrate", "Putt", "Shuffle", "Swing"]);
    const want: Record<string, string> = {
      address: "Address", idle: "Address", walk: "Shuffle", backswing: "Swing", top: "Swing", downswing: "Swing", follow: "Swing",
      "putt-address": "Putt", "putt-back": "Putt", "putt-through": "Putt", celebrate: "Celebrate"
    };
    for (const [phase, clip] of Object.entries(want)) expect(clipForPhase(phase as GolferMotionPhase), phase).toBe(clip);
  });

  it("warps each stroke clip's impact frame onto the solve's (the sim's) contact", () => {
    const bind = Object.values(IDOL_BINDS)[0]!;
    useSkeleton(idolProfile(bind));
    const swing = strokeKeys("Swing", bind), putt = strokeKeys("Putt", bind);
    expect(swing.start).toBeLessThan(swing.top);
    expect(swing.top).toBeLessThan(swing.impact);
    expect(swing.impact).toBeLessThan(swing.end);
    expect(strokeTime("downswing", 1, bind)).toBe(swing.impact);
    expect(strokeTime("follow", 0, bind)).toBe(swing.impact);
    expect(strokeTime("putt-through", 0.5, bind)).toBe(putt.impact);
    expect(putt.top).toBeLessThan(putt.impact);
    // the solve's club head is on the ball at exactly those phase times
    const root = makeRoot(0);
    expect(vDist(solveSwing(evaluateSwing("downswing", 1), root).clubHead, BALL_SHOT)).toBeLessThan(0.03);
    expect(vDist(solveSwing(evaluateSwing("putt-through", 0.5), root).clubHead, BALL_SHOT)).toBeLessThan(0.05);
  });

  for (const [key, bind] of Object.entries(IDOL_BINDS)) {
    it(`${key}: palms on the solved grip in every state, feet down, and the body moves through the swing`, () => {
      useSkeleton(idolProfile(bind));
      const roles = mapIdolRoles(bind);
      const root = makeRoot(0);
      for (const [phase, t] of STATES) {
        const s = solveSwing(evaluateSwing((phase === "walk" ? "address" : phase) as SwingPosePhase, t), root);
        const fk = idolForwardKinematics(bind, retargetIdol(bind, golferMotionDeltas(bind, key, s, root, phase, t, 0.5)));
        const palm = (fore: string, hand: string) => { const f = fk.get(fore)!.pos, h = fk.get(hand)!.pos; return vAdd(h, vScale(unit(vSub(h, f)), PALM_PAST_HAND)); };
        expect(vDist(palm(roles.foreArmR, roles.handR), toModel(root, s.grip)), `R ${phase}@${t}`).toBeLessThan(0.04);
        expect(vDist(palm(roles.foreArmL, roles.handL), toModel(root, s.leftPalm)), `L ${phase}@${t}`).toBeLessThan(0.04);
        expect(Math.min(fk.get(roles.footL)!.pos[1], fk.get(roles.footR)!.pos[1]), `feet ${phase}@${t}`).toBeLessThan(0.25);
        expect(fk.get(roles.head)!.pos[1], `head ${phase}@${t}`).toBeGreaterThan(1.1);
      }
      const pose = (phase: GolferMotionPhase, t: number) =>
        retargetIdol(bind, golferMotionDeltas(bind, key, solveSwing(evaluateSwing(phase as SwingPosePhase, t), root), root, phase, t, 0.5));
      expect(rotDiff(pose("backswing", 0.2), pose("top", 0))).toBeGreaterThan(0.1);
      expect(rotDiff(pose("top", 0), pose("follow", 1))).toBeGreaterThan(0.1);
    });
  }

  it("the loops move over time: re-aim shuffle, celebrate, caddie idle", () => {
    const bind = Object.values(IDOL_BINDS)[0]!;
    useSkeleton(idolProfile(bind));
    const root = makeRoot(0);
    const s = solveSwing(evaluateSwing("address", 0), root);
    const walk = (c: number) => retargetIdol(bind, golferMotionDeltas(bind, "k", s, root, "walk", 0, c));
    expect(rotDiff(walk(0.2), walk(0.9))).toBeGreaterThan(0.03);
    expect(rotDiff(retargetIdol(bind, celebrateDeltas(bind, 0.3)), retargetIdol(bind, celebrateDeltas(bind, 1.1)))).toBeGreaterThan(0.05);
    const cad = (c: number) => retargetIdol(IDOL_CADDIE_BIND, caddieIdleDeltas(IDOL_CADDIE_BIND, c));
    expect(rotDiff(cad(1.0), cad(1.7))).toBeGreaterThan(0.005);
    // the caddie's arms hang (wrists well below the shoulders)
    const r = mapIdolRoles(IDOL_CADDIE_BIND), fk = idolForwardKinematics(IDOL_CADDIE_BIND, cad(2));
    expect(fk.get(r.upperArmL)!.pos[1] - fk.get(r.handL)!.pos[1]).toBeGreaterThan(0.35);
  });

  it("no motion from the old third-party clip service remains in Links code (fal clips only)", () => {
    const banned = new RegExp(["me", "shy"].join(""), "i");
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|mjs|json|html)$/.test(f) ? [p] : [];
    });
    const files = [...walk("apps/showcase-aura-links-3d/src"), ...walk("apps/showcase-aura-links-3d/scripts"), ...walk("apps/showcase-aura-links-3d/art"),
      ...walk("tests/unit/aura-links-3d"), "tools/idol/motion-specs/aura-links-3d.json"];
    for (const f of files) expect(banned.test(readFileSync(f, "utf8")), f).toBe(false);
  });
});
