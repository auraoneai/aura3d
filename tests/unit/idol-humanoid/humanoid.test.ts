import { describe, expect, it } from "vitest";
import { eulerToQuaternion } from "../../../packages/engine/src/agent-api/sceneGraph";
import {
  createHumanoidDriver,
  eulerZYX,
  mapHumanoid,
  parseGlbJson,
  quatAxisAngle,
  quatMul,
  readIdolSkeleton,
  rotateVec,
  type GltfJsonLike,
  type HumanoidPoseInput,
  type Quat,
  type Vec3
} from "../../../apps/showcase-port-shared/idol/humanoid";
import { PILOT_BONES } from "./pilotSkeleton";

/** The pilot rig as the generator writes it: an `auraRoot` wrapper (yaw -90 deg so it faces +Z, scale, grounding). */
function pilotGltf(normalised: boolean): GltfJsonLike {
  const bones = PILOT_BONES.map(([children, t, r], i) => ({ name: `bone_${i}`, children: children.map((c) => c + 1), translation: t, rotation: r }));
  const yaw = quatAxisAngle([0, 1, 0], -Math.PI / 2);
  const root = normalised ? { name: "auraRoot", children: [1], rotation: [...yaw], scale: [2.2, 2.2, 2.2], translation: [0.01, 1.05, -0.02] } : { name: "world", children: [1] };
  return { nodes: [root, ...bones], skins: [{ joints: bones.map((_, i) => i + 1) }] };
}

const dirOf = (p: Record<string, Vec3>, a: string, b: string): Vec3 => {
  const v: Vec3 = [p[b]![0] - p[a]![0], p[b]![1] - p[a]![1], p[b]![2] - p[a]![2]];
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const DOWN: Vec3 = [0, -1, 0];

describe("idol humanoid mapping", () => {
  it("maps the pilot rig's unnamed bones to humanoid roles", () => {
    const map = mapHumanoid(readIdolSkeleton(pilotGltf(true)));
    expect(map.ok).toBe(true);
    expect(map.roles).toMatchObject({
      hips: "bone_0", spine: "bone_1", chest: "bone_3", neck: "bone_4", head: "bone_5",
      leftShoulder: "bone_6", leftUpperArm: "bone_7", leftLowerArm: "bone_8", leftHand: "bone_9",
      rightShoulder: "bone_13", rightUpperArm: "bone_14", rightLowerArm: "bone_15", rightHand: "bone_16",
      leftUpperLeg: "bone_20", leftLowerLeg: "bone_21", leftFoot: "bone_22",
      rightUpperLeg: "bone_24", rightLowerLeg: "bone_25", rightFoot: "bone_26"
    });
    expect(map.spineChain).toEqual(["bone_1", "bone_2", "bone_3"]);
    expect(map.neckChain).toEqual(["bone_4", "bone_5"]);
  });

  it("maps the raw (+X facing) rig identically when told its facing", () => {
    const raw = mapHumanoid(readIdolSkeleton(pilotGltf(false)), { facing: "+x" });
    expect(raw.roles.leftUpperArm).toBe("bone_7");
    expect(raw.roles.leftUpperLeg).toBe("bone_20");
  });

  it("reads the JSON chunk of a GLB", () => {
    const json = new TextEncoder().encode(JSON.stringify(pilotGltf(true)).padEnd(4 * Math.ceil(JSON.stringify(pilotGltf(true)).length / 4)));
    const buf = new Uint8Array(20 + json.length);
    const dv = new DataView(buf.buffer);
    dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, buf.length, true);
    dv.setUint32(12, json.length, true); dv.setUint32(16, 0x4e4f534a, true);
    buf.set(json, 20);
    expect(readIdolSkeleton(parseGlbJson(buf)).bones).toHaveLength(28);
  });
});

describe("idol humanoid driver", () => {
  const driver = createHumanoidDriver(readIdolSkeleton(pilotGltf(true)));
  const r = driver.map.roles as Record<string, string>;

  it("eulerZYX matches the engine's setRotation convention", () => {
    for (const e of [[0.3, -0.7, 1.1], [-2.4, 0.2, 0.05], [0, 0, 0]] as const) {
      const a = eulerZYX(e[0], e[1], e[2]);
      const b = eulerToQuaternion([e[0], e[1], e[2]], "ZYX");
      const s = Math.sign(a[3] * b[3] + a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) || 1;
      a.forEach((v, i) => expect(v * s).toBeCloseTo(b[i]!, 9));
    }
  });

  it("turns the T-pose into the canonical rest: arms and legs hang straight down", () => {
    const p = driver.modelPositions({ rotations: {} });
    for (const [a, b] of [["leftUpperArm", "leftLowerArm"], ["leftLowerArm", "leftHand"], ["rightUpperArm", "rightLowerArm"],
      ["rightLowerArm", "rightHand"], ["leftUpperLeg", "leftLowerLeg"], ["leftLowerLeg", "leftFoot"], ["rightUpperLeg", "rightLowerLeg"]]) {
      expect(dot(dirOf(p, r[a!]!, r[b!]!), DOWN)).toBeGreaterThan(0.9999);
    }
    // the character's left is +X once normalised to face +Z
    expect(p[r.leftHand!]![0]).toBeGreaterThan(p[r.rightHand!]![0]);
  });

  it("reproduces the source limb directions for arbitrary joint poses", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2.4;
    for (let n = 0; n < 25; n++) {
      const q: Record<string, Quat> = {};
      for (const role of ["hips", "spine", "chest", "leftUpperArm", "leftLowerArm", "rightUpperArm", "rightLowerArm", "leftUpperLeg", "leftLowerLeg", "rightUpperLeg", "rightLowerLeg"]) {
        q[role] = eulerZYX(rnd(), rnd() * 0.5, rnd() * 0.5);
      }
      const input: HumanoidPoseInput = { rotations: q };
      const p = driver.modelPositions(input);
      const chest = quatMul(quatMul(q.hips!, q.spine!), q.chest!);
      const want = (chain: Quat[]) => rotateVec(chain.reduce((a, b) => quatMul(a, b)), DOWN);
      const checks: [string, string, Vec3][] = [
        ["leftUpperArm", "leftLowerArm", want([chest, q.leftUpperArm!])],
        ["leftLowerArm", "leftHand", want([chest, q.leftUpperArm!, q.leftLowerArm!])],
        ["rightUpperArm", "rightLowerArm", want([chest, q.rightUpperArm!])],
        ["rightLowerArm", "rightHand", want([chest, q.rightUpperArm!, q.rightLowerArm!])],
        ["leftUpperLeg", "leftLowerLeg", want([q.hips!, q.leftUpperLeg!])],
        ["leftLowerLeg", "leftFoot", want([q.hips!, q.leftUpperLeg!, q.leftLowerLeg!])],
        ["rightLowerLeg", "rightFoot", want([q.hips!, q.rightUpperLeg!, q.rightLowerLeg!])]
      ];
      for (const [a, b, w] of checks) expect(dot(dirOf(p, r[a]!, r[b]!), w)).toBeGreaterThan(0.9999);
      // torso: the top spine segment (chest -> neck) turns by the full source hips * spine * chest rotation
      const rest = driver.modelPositions({ rotations: {} });
      const want2 = rotateVec(chest, sub(rest[r.neck!]!, rest[r.chest!]!));
      const got = sub(p[r.neck!]!, p[r.chest!]!);
      got.forEach((v, i) => expect(v).toBeCloseTo(want2[i]!, 4));
    }
  });

  it("moves the hips by hipsOffset in hip heights and writes every bone", () => {
    const base = driver.modelPositions({ rotations: {} });
    const low = driver.modelPositions({ rotations: {}, hipsOffset: [0, -0.25, 0.1] });
    const h = driver.map.hipHeight;
    expect(low[r.hips!]![1] - base[r.hips!]![1]).toBeCloseTo(-0.25 * h, 6);
    expect(low[r.hips!]![2] - base[r.hips!]![2]).toBeCloseTo(0.1 * h, 6);
    const pose = driver.pose({ rotations: { chest: eulerZYX(0.2, 0, 0) } });
    expect(pose.mode).toBe("replace");
    expect(Object.keys(pose.bones)).toHaveLength(28);
    expect(pose.bones[r.hips!]!.position).toBeDefined();
    for (const b of Object.values(pose.bones)) expect(Math.hypot(b.rotation.x, b.rotation.y, b.rotation.z, b.rotation.w)).toBeCloseTo(1, 9);
  });

  it("drives a raw +X-facing rig in its own frame", () => {
    const raw = createHumanoidDriver(readIdolSkeleton(pilotGltf(false)), { facing: "+x" });
    const rr = raw.map.roles as Record<string, string>;
    const p = raw.modelPositions({ rotations: { leftUpperArm: eulerZYX(-Math.PI / 2, 0, 0) } });
    expect(dot(dirOf(p, rr.leftUpperArm!, rr.leftLowerArm!), [1, 0, 0])).toBeGreaterThan(0.9999);
  });
});

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
