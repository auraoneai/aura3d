import { describe, expect, it } from "vitest";
import { ATHLETE_IDS, buildFcScene } from "../../../apps/showcase-aura-fc-3d/src/game/scene";
import { athleteNodes, athleteTargetHeight } from "../../../apps/showcase-aura-fc-3d/src/game/rig";
import {
  footballerHumanoidPose,
  idolBodiesEnabled,
  idolKeyForAthlete,
  recordFootballerPose
} from "../../../apps/showcase-aura-fc-3d/src/game/idolBodies";
import { computeFootballerJointPose, poseArticulatedPitchFan } from "../../../apps/showcase-aura-fc-3d/src/art/proceduralModels";
import { createHumanoidDriver, quatAxisAngle, readIdolSkeleton } from "../../../apps/showcase-port-shared/idol/humanoid";
import { PILOT_BONES } from "../idol-humanoid/pilotSkeleton";

const driver = createHumanoidDriver(readIdolSkeleton({
  nodes: [
    { name: "auraRoot", children: [1], rotation: [...quatAxisAngle([0, 1, 0], -Math.PI / 2)], scale: [2.2, 2.2, 2.2], translation: [0, 1.06, 0] },
    ...PILOT_BONES.map(([children, t, r], i) => ({ name: `bone_${i}`, children: children.map((c) => c + 1), translation: t, rotation: r }))
  ],
  skins: [{ joints: PILOT_BONES.map((_, i) => i + 1) }]
}));

describe("aura-fc-3d Idol bodies", () => {
  it("is on by default and off with ?idol=off", () => {
    expect(idolBodiesEnabled("")).toBe(true);
    expect(idolBodiesEnabled("?idol=off")).toBe(false);
  });

  it("every athlete mounts one rigged Idol model in its kit at its rendered height, plus shadow and ring", () => {
    for (const id of ATHLETE_IDS) {
      const nodes = athleteNodes(id, undefined, undefined, true).map((n: any) => JSON.parse(JSON.stringify(n)));
      expect(nodes.map((n: any) => n.name).sort()).toEqual([`${id}-body`, `${id}-ring`, `${id}-shadow`]);
      const body = nodes.find((n: any) => n.name === `${id}-body`);
      expect(body.kind).toBe("model");
      expect(body.asset.url).toContain(idolKeyForAthlete(id));
      expect(body.scale[1]).toBeCloseTo(athleteTargetHeight(id) / 2.22, 2);
    }
    expect(idolKeyForAthlete("h-gk")).toBe("fcIdolKeeperHome");
    expect(idolKeyForAthlete("a-gk")).toBe("fcIdolKeeperAway");
    expect(new Set(ATHLETE_IDS.map(idolKeyForAthlete)).size).toBe(6);
  });

  it("every mounted Idol model renders at its authored metres (scaleMode world, never the 1 m normalisation)", () => {
    const out: any[] = [];
    const walk = (n: any) => { out.push(n); for (const c of n.children ?? []) walk(c); };
    (JSON.parse(JSON.stringify(buildFcScene("munich", { idol: true }))).nodes as any[]).forEach(walk);
    const idol = out.filter((n) => n.kind === "model" && /fcIdol/.test(n.asset?.url ?? ""));
    expect(idol.length).toBeGreaterThanOrEqual(10 + 1 + 6 + 2 + 2 + 1 + 2); // athletes, referee, fans, dugouts, cranes, trophy, balls
    for (const n of idol) expect(n.scaleMode, n.name).toBe("world");
  }, 20_000);

  it("the Idol match ball spins about its centre: grounded at y=0, centred, 2 x BALL_VIS_R tall (main.ts pivot maths)", async () => {
    const { NodeIO, getBounds } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
    const { BALL_VIS_R } = await import("../../../apps/showcase-aura-fc-3d/src/game/dims");
    const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read("apps/showcase-aura-fc-3d/assets/idol/fcIdolBall.glb");
    const b = getBounds(doc.getRoot().listScenes()[0]!);
    expect(b.min[1]).toBeCloseTo(0, 3);
    expect(b.max[1]).toBeCloseTo(2 * BALL_VIS_R, 2);
    expect(Math.abs(b.min[0] + b.max[0]) / 2).toBeLessThan(0.01);
    expect(Math.abs(b.min[2] + b.max[2]) / 2).toBeLessThan(0.01);
  });

  it("the procedural rest pose maps to the canonical rest (identity joints, no hip offset)", () => {
    const p = footballerHumanoidPose({
      pelvisOffsetY: 0.96, pelvisOffsetZ: 0, pelvis: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0],
      armL: [0, 0, 0], forearmL: [0, 0, 0], armR: [0, 0, 0], forearmR: [0, 0, 0],
      legL: [0, 0, 0], calfL: [0, 0, 0], bootL: [0, 0, 0], legR: [0, 0, 0], calfR: [0, 0, 0], bootR: [0, 0, 0]
    });
    expect(p.hipsOffset).toEqual([0, 0, 0]);
    for (const q of Object.values(p.rotations)) expect(q![3]).toBeCloseTo(1, 12);
  });

  it("drives a planted run cycle: the stance foot stays on the ground side, the swing knee flexes", () => {
    const r = driver.map.roles as Record<string, string>;
    for (let i = 0; i < 8; i++) {
      const pose = computeFootballerJointPose({ clip: "Run", phase: (i / 8) * 0.56, duration: 0.56 });
      const pos = driver.modelPositions(footballerHumanoidPose(pose));
      for (const v of Object.values(pos)) v.forEach((c) => expect(Number.isFinite(c)).toBe(true));
      const lowest = Math.min(pos[r.leftFoot!]![1], pos[r.rightFoot!]![1]);
      expect(lowest).toBeLessThan(pos[r.hips!]![1] - 0.6 * driver.map.hipHeight);
    }
  });

  it("a keeper dive drops and rolls the hips", () => {
    const r = driver.map.roles as Record<string, string>;
    const stand = driver.modelPositions(footballerHumanoidPose(computeFootballerJointPose({ clip: "Ready", phase: 0, duration: 1.8, isKeeper: true })));
    const dive = driver.modelPositions(footballerHumanoidPose(computeFootballerJointPose({ clip: "Jump_Loop", phase: 0.4, duration: 0.64, isKeeper: true, diveDir: 1, yaw: 0 })));
    expect(dive[r.hips!]![1]).toBeLessThan(stand[r.hips!]![1] - 0.15 * driver.map.hipHeight);
    // both gloves reach above the head
    expect(dive[r.leftHand!]![1]).toBeGreaterThan(dive[r.head!]![1] - 0.05);
  });

  it("records the fan pose code's joint writes (cheer raises the arms)", () => {
    const idle = recordFootballerPose("fc-fan-0", (lk) => poseArticulatedPitchFan(lk as any, 0, "idle", 3));
    const cheer = recordFootballerPose("fc-fan-0", (lk) => poseArticulatedPitchFan(lk as any, 0, "cheer", 3));
    expect(cheer.armR[0]).toBeLessThan(idle.armR[0] - 1.2);
    expect(idle.pelvisOffsetY).toBeGreaterThan(0.9);
  });
});
