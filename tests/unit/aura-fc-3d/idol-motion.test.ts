import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DIVE_CLIP_SIDE, KICK_CONTACT_FRAC, fcMotionRequest, type FcMotionState } from "../../../apps/showcase-aura-fc-3d/src/game/idolBodies";
import { MOTION_CLIPS } from "../../../apps/showcase-aura-fc-3d/src/game/motion.generated";
import { athleteAnimation } from "../../../apps/showcase-aura-fc-3d/src/game/locomotion";
import { createHumanoidDriver, parseGlbJson, readIdolSkeleton } from "../../../apps/showcase-port-shared/idol/humanoid";
import { createMotionAnimator, eventTime, locomotionTime } from "../../../apps/showcase-port-shared/idol/motion";

const driver = createHumanoidDriver(readIdolSkeleton(parseGlbJson(readFileSync("apps/showcase-aura-fc-3d/assets/idol/fcIdolAwayA.glb"))));
const HIP = driver.map.hipHeight;
const base: FcMotionState = { clip: "Ready", phase: 0, duration: 1.8, metres: 0, now: 0 };
const req = (m: Partial<FcMotionState>) => fcMotionRequest({ ...base, ...m }, HIP);
const clipOf = (m: Partial<FcMotionState>) => { const r = req(m); return "clip" in r ? r.clip : "code"; };
const r = driver.map.roles as Record<string, string>;
const at = (pose: Parameters<typeof driver.modelPositions>[0], role: string) => driver.modelPositions(pose)[r[role]!]!;

describe("Aura FC 3D generated motion (fal hunyuan-motion): state -> clip", () => {
  it("every sim state plays a generated clip (no code pose)", () => {
    expect(clipOf({})).toBe("Idle");
    expect(clipOf({ isKeeper: true })).toBe("KeeperIdle");
    expect(clipOf({ clip: "Walk_Loop" })).toBe("Walk");
    expect(clipOf({ clip: "Walk_Loop", referee: true })).toBe("RefWalk");
    expect(clipOf({ clip: "Run" })).toBe("Run");
    expect(clipOf({ clip: "Sprint_Loop" })).toBe("Sprint");
    for (const k of ["KickTap", "KickPass", "KickShot"]) expect(clipOf({ clip: k, duration: 0.6 })).toBe("Kick");
    expect(clipOf({ clip: "Jump_Loop", isKeeper: true })).toBe("KeeperDive");
    expect(clipOf({ clip: "Attack" })).toBe("SlideTackle");
    expect(clipOf({ clip: "Attack", celebrateT: 1, celebrateKind: 0 })).toBe("KneeSlide");
    expect(clipOf({ clip: "Jump_Loop", celebrateT: 1, celebrateKind: 1 })).toBe("Airplane");
    expect(clipOf({ clip: "Jump_Loop", celebrateT: 1, celebrateKind: 2 })).toBe("Leap");
    expect(clipOf({ clip: "Ready", celebrateT: 1, celebrateKind: 3 })).toBe("HandsHeart");
    const p = { speed: 4, gait: 3, kickT: 0, kickDur: 0.32, kickPower: 0.9, slideT: 0, diveT: 0, celebrateT: 0, isKeeper: false };
    expect(clipOf({ clip: athleteAnimation({ ...p, kickT: 0.2 }, 1, 1.17, "Run").anim.clip })).toBe("Kick");
  });

  it("the right boot meets the ball on the sim's contact frame", () => {
    const contact = Number(MOTION_CLIPS.Kick.meta!.footRPeakTime);
    expect(Number(MOTION_CLIPS.Kick.meta!.footRPeakSpeed)).toBeGreaterThan(Number(MOTION_CLIPS.Kick.meta!.footLPeakSpeed)); // right-footed
    const k = req({ clip: "KickShot", phase: KICK_CONTACT_FRAC * 0.6, duration: 0.6 });
    expect("clip" in k && k.time).toBeCloseTo(contact, 6);
    expect(eventTime(MOTION_CLIPS.Kick, 0.2, KICK_CONTACT_FRAC, "footRPeakTime")).toBeLessThan(contact);
    // the kicking foot is ahead of the hips at contact
    const pose = createMotionAnimator(MOTION_CLIPS).update(0, { clip: "Kick", time: contact, loop: false });
    expect(at(pose, "rightFoot")[2]).toBeGreaterThan(at(pose, "hips")[2]);
  });

  it("keeper dives play toward the dive side (mirrored when the generated dive goes the other way)", () => {
    for (const dir of [1, -1]) {
      const k = req({ clip: "Jump_Loop", isKeeper: true, diveDir: dir, yaw: 0, phase: 0.5, duration: 0.64 });
      const want = dir > 0 ? "right" : "left";
      expect("clip" in k && Boolean(k.mirror)).toBe(want !== DIVE_CLIP_SIDE);
      const pose = createMotionAnimator(MOTION_CLIPS).update(0, k);
      // head leads the dive: the body's right is -X
      const head = at(pose, "head")[0] - at(pose, "hips")[0];
      expect(Math.sign(head)).toBe(want === "right" ? -1 : 1);
    }
  });

  it("locomotion advances by distance, arms hang in idle, bones move over frame time", () => {
    expect(locomotionTime(MOTION_CLIPS.Run, 0.6, HIP)).toBeGreaterThan(0);
    const idle = createMotionAnimator(MOTION_CLIPS).update(0, req({}));
    for (const s of ["left", "right"]) expect(at(idle, `${s}UpperArm`)[1] - at(idle, `${s}Hand`)[1]).toBeGreaterThan(0.3);
    const anim = createMotionAnimator(MOTION_CLIPS);
    const a = anim.update(1 / 60, req({ clip: "Run", metres: 0 })), b = anim.update(1 / 60, req({ clip: "Run", metres: 0.9 }));
    const moved = Math.max(...["leftFoot", "rightFoot", "leftHand", "rightHand"].map((k) => Math.hypot(...at(a, k).map((v, i) => v - at(b, k)[i]!))));
    expect(moved).toBeGreaterThan(0.1);
  });
});
