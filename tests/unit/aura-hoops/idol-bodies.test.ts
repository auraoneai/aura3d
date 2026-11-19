import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  IDOL_BODY_ASSETS,
  IDOL_KITS,
  hoopsHumanoidPose,
  idolBodiesEnabled,
  idolBodyScale,
  idolKeyForKit
} from "../../../apps/showcase-aura-hoops-3d/src/idolBodies";
import { HOME_ALT_JERSEY, AWAY_ALT_JERSEY } from "../../../apps/showcase-aura-hoops-3d/src/rules";
import { HOOPS_BIG_HEIGHT, HOOPS_GUARD_HEIGHT, computeHoopsAthleteJointPose } from "../../../apps/showcase-aura-hoops-3d/src/art/proceduralModels";
import { createHumanoidDriver, eulerZYX, quatAxisAngle, quatMul, readIdolSkeleton, rotateVec, type Quat, type Vec3 } from "../../../apps/showcase-port-shared/idol/humanoid";
import { PILOT_BONES } from "../idol-humanoid/pilotSkeleton";

const MAIN = readFileSync(path.resolve(__dirname, "../../../apps/showcase-aura-hoops-3d/src/main.ts"), "utf8");

describe("Aura Hoops Idol athlete bodies", () => {
  it("every squad colour, Studio fit and alternate jersey maps to a generated kit", () => {
    const squads: Record<string, string> = {
      "#ff7a1a": "hoopsIdolOrange", "#ffd257": "hoopsIdolGold", "#39d7ff": "hoopsIdolCyan", "#66e37f": "hoopsIdolGreen",
      "#e26bff": "hoopsIdolViolet", "#7dfcff": "hoopsIdolCyan", "#ff3b5c": "hoopsIdolRed", "#f2f0e2": "hoopsIdolCream"
    };
    for (const [jersey, key] of Object.entries(squads)) expect(idolKeyForKit(jersey, false)).toBe(key);
    expect(idolKeyForKit(HOME_ALT_JERSEY, false)).toBe("hoopsIdolCharcoal");
    expect(idolKeyForKit(AWAY_ALT_JERSEY, false)).toBe("hoopsIdolCream");
    expect(idolKeyForKit("#ff7a1a", true)).toBe("hoopsIdolOrangeBig");
    expect(idolKeyForKit("#e26bff", true)).toBe("hoopsIdolVioletBig");
    expect(idolKeyForKit("#66e37f", true)).toBe("hoopsIdolGreen");
  });

  it("every body key is a model in the route manifest and renders at the procedural rig heights", () => {
    for (const kit of IDOL_KITS) expect((IDOL_BODY_ASSETS as Record<string, { type: string }>)[kit.key]?.type).toBe("model");
    expect(idolBodyScale("hoopsIdolOrange", false) * 1.92).toBeCloseTo(HOOPS_GUARD_HEIGHT, 6);
    expect(idolBodyScale("hoopsIdolOrange", true) * 1.92).toBeCloseTo(HOOPS_BIG_HEIGHT, 6);
    expect(idolBodyScale("hoopsIdolOrangeBig", true) * 1.99).toBeCloseTo(HOOPS_BIG_HEIGHT, 6);
  });

  it("is on by default and ?idol=off keeps the procedural rigs", () => {
    expect(idolBodiesEnabled("")).toBe(true);
    expect(idolBodiesEnabled("?idol=off")).toBe(false);
    expect(MAIN).toMatch(/idolBodiesEnabled\(\)/);
    expect(MAIN).toMatch(/driveIdolAthlete\(r\.root/);
  });

  it("drives an Idol skeleton so its limbs follow the procedural joint pose", () => {
    const bones = PILOT_BONES.map(([children, t, r], i) => ({ name: `bone_${i}`, children: children.map((c) => c + 1), translation: t, rotation: r }));
    const driver = createHumanoidDriver(readIdolSkeleton({
      nodes: [{ name: "auraRoot", children: [1], rotation: [...quatAxisAngle([0, 1, 0], -Math.PI / 2)], scale: [1.9, 1.9, 1.9] }, ...bones],
      skins: [{ joints: bones.map((_, i) => i + 1) }]
    }));
    const roles = driver.map.roles as Record<string, string>;
    for (const clip of ["Run", "Sprint_Loop", "Jump_Loop", "Ready"]) {
      const solved = computeHoopsAthleteJointPose({ id: "p0", clip, time: 0.37, speed: clip === "Ready" ? 0 : 5, x: 0, y: 0, z: 0, yaw: 0 });
      const input = hoopsHumanoidPose(solved, false);
      const p = driver.modelPositions(input);
      const e = (s: keyof typeof solved.rotations): Quat => eulerZYX(...solved.rotations[s]);
      const dir = (a: string, b: string): Vec3 => {
        const v: Vec3 = [p[roles[b]!]![0] - p[roles[a]!]![0], p[roles[b]!]![1] - p[roles[a]!]![1], p[roles[b]!]![2] - p[roles[a]!]![2]];
        const l = Math.hypot(...v);
        return [v[0] / l, v[1] / l, v[2] / l];
      };
      const chain = (...q: Quat[]) => rotateVec(q.reduce((a, b) => quatMul(a, b)), [0, -1, 0]);
      const chest = quatMul(quatMul(e("hips"), e("spine")), e("chest"));
      const checks: [string, string, Vec3][] = [
        ["rightUpperArm", "rightLowerArm", chain(chest, e("arm-r"))],
        ["leftLowerArm", "leftHand", chain(chest, e("arm-l"), e("forearm-l"))],
        ["leftUpperLeg", "leftLowerLeg", chain(e("hips"), e("leg-l"))],
        ["rightLowerLeg", "rightFoot", chain(e("hips"), e("leg-r"), e("calf-r"))]
      ];
      for (const [a, b, want] of checks) {
        const got = dir(a, b);
        expect(got[0] * want[0] + got[1] * want[1] + got[2] * want[2]).toBeGreaterThan(0.999);
      }
    }
  });
});
