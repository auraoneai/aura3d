import { describe, expect, it } from "vitest";
import { FIGHTERS } from "../../../apps/showcase-iron-crown/src/game/fighters";
import { REQUIRED_FIGHTER_CLIPS } from "../../../apps/showcase-iron-crown/src/game/fighters";
import { readFileSync } from "node:fs";
import { heldPropTransform, idolFighterPose, simHitFraction } from "../../../apps/showcase-iron-crown/src/game/idolFighters";
import { attackClipTime, fighterClip, mocapClip, mocapClipNames, stateClip, FIGHTER_MOCAP_CLIPS } from "../../../apps/showcase-iron-crown/src/game/idolMocap";
import { IC_IDOL_RIGS } from "../../../apps/showcase-iron-crown/src/game/idol-rigs";
import { moveFor } from "../../../apps/showcase-iron-crown/src/game/moves";

const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const state = (clip: string, extra: Record<string, number> = {}) => ({ clip, time: extra.time ?? 1, clipProgress: extra.p ?? 0.5, clipTime: extra.clipTime ?? 0.5, hold: extra.hold ?? 0.5, moveDir: extra.moveDir ?? 1 }) as never;

describe("Iron Crown Idol fighters play generated motion clips (owner: real hand and weapon motion)", () => {
  it("ships the fal text-to-motion set; every fighter maps every logical state to a shipped clip, with its own moves", () => {
    // invariant: the fighter clip table must stay fal text-to-motion provenance (owner rule); the toContain checks are on the exported clip-name list.
    const src = readFileSync("apps/showcase-iron-crown/src/game/idol-mocap.ts", "utf8");
    expect(src).toMatch(/fal-ai\/hunyuan-motion/);
    expect(mocapClipNames().length).toBe(26);
    for (const f of FIGHTERS) {
      for (const s of REQUIRED_FIGHTER_CLIPS) {
        const sc = stateClip({ clip: s, fighter: f.id, time: 0.3, clipTime: 0.3, clipProgress: 0.4, moveDir: 1 });
        expect(mocapClipNames(), `${f.id} ${s}`).toContain(sc.clip);
      }
      expect(FIGHTER_MOCAP_CLIPS[f.id], f.id).toBeDefined();
    }
    expect(fighterClip("seraph", "heavy")).toBe("SpearThrust");
    expect(fighterClip("sovereign", "guard")).toBe("ShieldBlock");
    expect(fighterClip("kenji", "heavy")).toBe("RoundhouseKick");
    expect(fighterClip("volt", "light")).toBe("Jab");
    expect(stateClip({ clip: "walk", time: 0, clipTime: 0, clipProgress: 0, moveDir: -1 }).clip).toBe("WalkBack");
    expect(stateClip({ clip: "walk", time: 0, clipTime: 0, clipProgress: 0, moveDir: 1 }).clip).toBe("WalkForward");
  });

  it("attack clips are time-warped so each fighter's strike frame lands on the sim's first active frame", () => {
    for (const f of FIGHTERS) {
      for (const [kind, hold] of [["light", 0.38], ["heavy", 0.56], ["special", 0.78], ["throw", 0.58]] as const) {
        const h = simHitFraction(f.id, kind, hold)!;
        expect(h).toBeCloseTo(((moveFor(kind, f).activeFrames?.[0] ?? 1) / 60) / hold, 6);
        const clip = mocapClip(fighterClip(f.id, kind));
        expect(clip.contact, `${f.id} ${kind}`).toBeGreaterThan(0);
        expect(attackClipTime(kind, h, h, f.id)).toBeCloseTo(clip.contact, 6);
        expect(attackClipTime(kind, 1, h, f.id)).toBeCloseTo(clip.duration, 6);
        expect(attackClipTime(kind, 0, h, f.id)).toBe(0);
      }
    }
  });

  it("jumps play their airborne span and holds settle (crouch, guard, shield block)", () => {
    const jump = mocapClip("Jump");
    expect(jump.span[0]).toBeGreaterThan(0);
    expect(jump.span[1]).toBeGreaterThan(jump.span[0]);
    expect(stateClip({ clip: "jump", time: 0, clipTime: 0, clipProgress: 0, moveDir: 1 }).t).toBeCloseTo(jump.span[0], 6);
    expect(stateClip({ clip: "jump", time: 0, clipTime: 0, clipProgress: 1, moveDir: 1 }).t).toBeCloseTo(jump.span[1], 6);
    for (const name of ["Crouch", "Guard", "ShieldBlock"]) {
      const c = mocapClip(name);
      expect(c.span[1], name).toBeGreaterThan(0.1);
      expect(c.span[1], name).toBeLessThan(c.duration);
    }
  });

  for (const key of ["icKenjiP1", "icSovereignP2", "icSeraphP1"]) {
    const skel = IC_IDOL_RIGS[key]!;
    const r = skel.roles;
    it(`${key}: every state moves the bones over time, arms are never in T-pose, feet stay near the floor`, () => {
      for (const clip of ["idle", "walk", "dash", "crouch", "guard", "light", "heavy", "special", "throw", "hitstun", "ko", "win", "jump"]) {
        const fighter = key.replace(/^ic/, "").replace(/P[12]$/, "").toLowerCase() as never;
        const a = idolFighterPose(skel, fighter, state(clip, { time: 0.4, p: 0.15, clipTime: 0.2 })).solved;
        const b = idolFighterPose(skel, fighter, state(clip, { time: 0.9, p: 0.65, clipTime: 0.8 })).solved;
        const moved = Math.max(...[r.handL, r.handR, r.footL, r.footR, r.head].map((i) => dist(a.worldT[i]!, b.worldT[i]!)));
        expect(moved, clip).toBeGreaterThan(0.02);
        for (const s of [a, b]) {
          for (const [sh, hd] of [[r.upperArmL, r.handL], [r.upperArmR, r.handR]] as const) {
            const shoulder = s.worldT[sh]!, hand = s.worldT[hd]!;
            // T-pose: hand level with the shoulder and far out to the side. Captured motion never holds that.
            expect(Math.abs(hand[0] - shoulder[0]) > 0.6 && Math.abs(hand[1] - shoulder[1]) < 0.1, `${clip} T-pose`).toBe(false);
          }
          if (clip !== "jump" && clip !== "ko") expect(Math.min(s.worldT[r.footL]![1], s.worldT[r.footR]![1]), clip).toBeLessThan(0.45);
        }
      }
    });
  }

  it("the jab extends a fist forward on the sim's hit frame; the roundhouse lifts a foot high on its hit frame", () => {
    const skel = IC_IDOL_RIGS.icKenjiP1!;
    const r = skel.roles;
    const idle = idolFighterPose(skel, "kenji", state("idle", { time: 0 })).solved;
    const jab = idolFighterPose(skel, "kenji", state("light", { p: simHitFraction("kenji", "light", 0.38)!, hold: 0.38 })).solved;
    const reach = (s: typeof idle) => Math.max(s.worldT[r.handL]![2], s.worldT[r.handR]![2]);
    expect(reach(jab)).toBeGreaterThan(reach(idle) + 0.25);
    const kick = idolFighterPose(skel, "kenji", state("heavy", { p: simHitFraction("kenji", "heavy", 0.56)!, hold: 0.56 })).solved;
    expect(Math.max(kick.worldT[r.footL]![1], kick.worldT[r.footR]![1])).toBeGreaterThan(0.7);
  });

  it("held weapons follow the hand through an attack (sword tip sweeps with the wrist)", () => {
    const skel = IC_IDOL_RIGS.icSovereignP1!;
    const tipAt = (p: number) => {
      const solved = idolFighterPose(skel, "sovereign", state("heavy", { p, hold: 0.56 })).solved;
      const w = heldPropTransform(skel, solved, "weapon");
      const [x, y, z, ww] = w.rot;
      // blade +Z rotated by the weapon quaternion, 1.2 m out from the grip
      const bz = [2 * (x * z + ww * y), 2 * (y * z - ww * x), 1 - 2 * (x * x + y * y)];
      const hand = solved.worldT[skel.roles.handR]!;
      expect(dist(w.pos, hand)).toBeLessThan(0.25);
      return [w.pos[0] + bz[0]! * 1.2, w.pos[1] + bz[1]! * 1.2, w.pos[2] + bz[2]! * 1.2];
    };
    expect(dist(tipAt(0.05), tipAt(0.3))).toBeGreaterThan(0.2);
  });
});
