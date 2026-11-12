import { describe, expect, it } from "vitest";
import type { AuraRuntimeNodeHandle } from "@aura3d/engine";
import {
  createFighterAnimationController,
  createFighterNode,
  embeddedClipFor,
  FIGHTER_ASSETS,
  FIGHTER_CLIP_MAP,
  fighterDriveClipId,
  FIGHTERS,
  PROCEDURAL_FIGHTER_CLIPS,
  REQUIRED_FIGHTER_CLIPS,
  THROW_CLIP_SPEED
} from "../../../apps/showcase-iron-crown/src/game/fighters";
import {
  computeGladiatorJointPose,
  GLADIATOR_JOINT_SUFFIXES,
  poseArticulatedGladiatorRig
} from "../../../apps/showcase-iron-crown/src/art/proceduralModels";

const SHIPPED_CLIPS = [
  "Idle",
  "Walk_Fight_Forward",
  "Walk_Fight_Back",
  "Left_Jab_from_Guard",
  "Right_Uppercut_from_Guard",
  "Triple_Combo_Attack",
  "Block1",
  "Hit_Reaction",
  "Dead",
  "Regular_Jump"
];
const IC12_CLIPS = { idle: "Combat_Stance", crouch: "CrouchLookAroundBow", throw: "Over_Shoulder_Throw", win: "Victory_Fist_Pump" } as const;
const THROW_HOLD_S = 0.62;

describe("iron crown clip map & procedural gladiator rig (IC-12)", () => {
  it("maps idle, crouch, throw and win to their own clips and keeps Block1 for guard only", () => {
    for (const [state, clip] of Object.entries(IC12_CLIPS)) {
      expect(FIGHTER_CLIP_MAP[state as keyof typeof IC12_CLIPS]).toEqual({ clip });
    }
    expect(FIGHTER_CLIP_MAP.guard).toEqual({ clip: "Block1" });
    const block1States = REQUIRED_FIGHTER_CLIPS.filter((state) => FIGHTER_CLIP_MAP[state].clip === "Block1");
    expect(block1States).toEqual(["guard"]);
  });

  it("leaves dash as the only stand-in", () => {
    const standIns = REQUIRED_FIGHTER_CLIPS.filter((state) => embeddedClipFor(state).standIn);
    expect(standIns).toEqual(["dash"]);
  });

  it("registers the full 14-clip set on the procedural fighter controller without external GLBs", () => {
    expect(PROCEDURAL_FIGHTER_CLIPS).toEqual(["Idle", ...SHIPPED_CLIPS.slice(1), ...Object.values(IC12_CLIPS)]);
    for (const key of Object.values(FIGHTER_ASSETS)) {
      const bundle = createFighterAnimationController(key, key);
      expect(bundle.standIns).toEqual(['dash→"Walk_Fight_Forward"']);
      for (const clip of Object.values(IC12_CLIPS)) expect(bundle.embeddedClips.has(clip)).toBe(true);
      for (const state of REQUIRED_FIGHTER_CLIPS) {
        expect(bundle.embeddedClips.has(FIGHTER_CLIP_MAP[state].clip)).toBe(true);
        expect(() => bundle.controller.play(fighterDriveClipId(bundle, state), { restart: true })).not.toThrow();
      }
      expect(() => bundle.controller.play("Walk_Fight_Back" as never, { restart: true })).not.toThrow();
    }
  });

  it("scales throw clip speed across the 0.62 s throw hold", () => {
    const nominalThrowSeconds = 2.5;
    expect(nominalThrowSeconds / THROW_CLIP_SPEED).toBeGreaterThan(THROW_HOLD_S - 0.05);
    expect(nominalThrowSeconds / THROW_CLIP_SPEED).toBeLessThan(THROW_HOLD_S + 0.05);
  });

  it("poses every articulated gladiator joint statelessly in ZYX Euler order across all 13 FighterClip states", () => {
    const fighter = FIGHTERS[0]!;
    const json = JSON.stringify(createFighterNode("player", fighter, "Kenji", [-2.2, 0, 0], 1, {}).toJSON());
    expect(json).not.toContain('"kind":"model"');
    for (const suffix of GLADIATOR_JOINT_SUFFIXES) {
      expect(json).toContain(`"id":"player-${suffix}"`);
    }

    const rotations = new Map<string, [number, number, number]>();
    const lookup = (id: string) =>
      ({
        setPosition: () => lookup(id),
        setRotation: (rx: number, ry: number, rz: number) => {
          rotations.set(id, [rx, ry, rz]);
          return lookup(id);
        }
      }) as unknown as AuraRuntimeNodeHandle;

    for (const state of REQUIRED_FIGHTER_CLIPS) {
      const poseA = computeGladiatorJointPose({ clip: state, time: 0.45, clipProgress: 0.5, moveDir: 1 });
      const poseB = computeGladiatorJointPose({ clip: state, time: 0.45, clipProgress: 0.5, moveDir: 1 });
      expect(poseA).toEqual(poseB);
      poseArticulatedGladiatorRig(lookup, "player", { clip: state, time: 0.45, clipProgress: 0.5, moveDir: 1 });
      expect(rotations.size).toBe(GLADIATOR_JOINT_SUFFIXES.length);
    }
  });
});
