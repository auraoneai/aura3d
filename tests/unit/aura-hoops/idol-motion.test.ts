import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hoopsMotionRequest, type HoopsMotion } from "../../../apps/showcase-aura-hoops-3d/src/idolBodies";
import { MOTION_CLIPS } from "../../../apps/showcase-aura-hoops-3d/src/motion.generated";
import { createHumanoidDriver, parseGlbJson, readIdolSkeleton } from "../../../apps/showcase-port-shared/idol/humanoid";
import { airTime, createMotionAnimator } from "../../../apps/showcase-port-shared/idol/motion";

const driver = createHumanoidDriver(readIdolSkeleton(parseGlbJson(readFileSync("apps/showcase-aura-hoops-3d/assets/idol/hoopsIdolOrange.glb"))));
const HIP = driver.map.hipHeight;
const base: HoopsMotion = { t: 0, clip: "Ready", vx: 0, vz: 0, action: false, ballArms: false };
const pick = (m: Partial<HoopsMotion>, yaw = 0) => { const r = hoopsMotionRequest({ ...base, ...m }, yaw, HIP); return "clip" in r ? r.clip : "code"; };

describe("Aura Hoops 3D generated motion (fal hunyuan-motion): state -> clip", () => {
  it("every state, ball handling included, plays a generated clip", () => {
    expect(pick({})).toBe("Idle");
    expect(pick({ clip: "Walk_Loop", vz: 1.2 })).toBe("Walk");
    expect(pick({ clip: "Run", vz: 3.5 })).toBe("Run");
    expect(pick({ clip: "Sprint_Loop", vz: 6 })).toBe("Sprint");
    expect(pick({ clip: "Walk_Loop", vx: 1.5 })).toBe("ShuffleLeft");
    expect(pick({ ballArms: true })).toBe("DribbleStand");
    expect(pick({ ballArms: true, clip: "Run", vz: 3.5 })).toBe("DribbleMove");
    expect(pick({ ballArms: true, clip: "Attack", action: true, actionLeft: 0.2 })).toBe("Crossover");
    expect(pick({ clip: "Shoot", action: true, shooting: true, jumping: true, y: 0.3, vy: 1 })).toBe("JumpShot");
    expect(pick({ clip: "Load", action: true, shooting: true })).toBe("SetShot");
    expect(pick({ clip: "Contest", action: true, jumping: true, y: 0.3, vy: 2 })).toBe("Block");
    expect(pick({ clip: "Jump_Loop", action: true, jumping: true, y: 0.3, vy: -1 })).toBe("Rebound");
    expect(pick({ clip: "Jump_Loop", action: true, dunkU: 0.4 })).toBe("Dunk");
    expect(pick({ passAge: 0.2 })).toBe("ChestPass");
  });

  it("the defensive shuffle mirrors to the travel side; facing +X running is not a shuffle", () => {
    const l = hoopsMotionRequest({ ...base, clip: "Walk_Loop", vx: 1.5 }, 0, HIP), rr = hoopsMotionRequest({ ...base, clip: "Walk_Loop", vx: -1.5 }, 0, HIP);
    expect("clip" in l && "clip" in rr && Boolean(l.mirror) !== Boolean(rr.mirror)).toBe(true);
    expect(pick({ clip: "Run", vx: 3.5 }, Math.PI / 2)).toBe("Run");
  });

  it("generated jumps follow the sim's ballistic arc (take-off -> apex -> landing, monotonic)", () => {
    const g = -10.4, v0 = 5.4, c = MOTION_CLIPS.Block;
    let prev = -1;
    for (let t = 0; t <= 2 * v0 / -g; t += 0.04) {
      const time = airTime(c, v0 * t + 0.5 * g * t * t, v0 + g * t, g, 0.2);
      expect(time).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = time;
    }
    expect(airTime(c, v0 * v0 / (-2 * g), 0, g, 0.2)).toBeCloseTo(Number(c.meta!.apexTime), 3);
  });

  it("the dribble moves the hands and the block raises both arms above the head", () => {
    const r = driver.map.roles as Record<string, string>;
    const pos = (p: any) => driver.modelPositions(p);
    const anim = createMotionAnimator(MOTION_CLIPS);
    const a = pos(anim.update(1 / 60, { clip: "DribbleStand", time: 0.1 })), b = pos(anim.update(1 / 60, { clip: "DribbleStand", time: 0.5 }));
    expect(Math.hypot(...a[r.rightHand!]!.map((v, i) => v - b[r.rightHand!]![i]!))).toBeGreaterThan(0.05);
    const blk = pos(createMotionAnimator(MOTION_CLIPS).update(0, { clip: "Block", time: Number(MOTION_CLIPS.Block.meta!.apexTime), loop: false }));
    for (const s of ["left", "right"]) expect(blk[r[`${s}Hand`]!]![1]).toBeGreaterThan(blk[r.head!]![1]);
  });
});

describe("Aura Hoops 3D Idol bodies: render-only spacing", () => {
  it("draws crowded players at least 0.8 m apart, keeps the ball handler pinned, and never moves sim positions", async () => {
    const { visualSeparation, VISUAL_SEPARATION } = await import("../../../apps/showcase-aura-hoops-3d/src/idolBodies");
    const bodies = [{ x: 0, z: 0, pinned: true }, { x: 0.3, z: 0.1 }, { x: -0.25, z: 0.2 }, { x: 0.1, z: -0.35 }, { x: 4, z: 4 }];
    const before = JSON.stringify(bodies);
    const off = visualSeparation(bodies);
    expect(JSON.stringify(bodies)).toBe(before); // sim positions untouched
    expect(off[0]).toEqual([0, 0]); // ball handler pinned
    expect(off[4]).toEqual([0, 0]); // far player unaffected
    const drawn = bodies.map((b, i) => [b.x + off[i]![0], b.z + off[i]![1]]);
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      expect(Math.hypot(drawn[i]![0]! - drawn[j]![0]!, drawn[i]![1]! - drawn[j]![1]!)).toBeGreaterThan(VISUAL_SEPARATION - 0.06);
    }
  });
});
