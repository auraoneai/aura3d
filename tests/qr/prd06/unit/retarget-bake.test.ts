import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createHumanoidRetargetingMap, type HumanoidRigDefinition } from "@aura3d/animation";
import {
  bakeRetargetedClipMap,
  compileClip,
  createTrackCursors,
  detectLimbFlips,
  humanoidRigForSkeleton,
  rigWithRestPose,
  sampleTrackRaw,
  type CompiledClip,
  type SkeletonBinding
} from "@aura3d/animation/lanes";
import { createGLTFSceneAnimationRuntime, GLTFLoader, LoadContext } from "../../../../packages/assets/src";

/**
 * T3.8 (PRD-06 §7.2, Phase-3 exit (a)) — `bakeRetargetedClips`/`addClipsFrom`
 * against real corpora: Soldier Walk → CesiumMan. CesiumMan's joints are the
 * Khronos ordinal scheme (`leg_joint_L_1`…), which name inference cannot map,
 * so the test pins an explicit rig — that's what the `map` option is for; the
 * soldier side is inferred. Bone-level hierarchy (verified against the skin):
 *   Skeleton_torso_joint_1  hips      (legs + torso_2 hang off it)
 *   Skeleton_torso_joint_2  spine      torso_joint_3         chest
 *   Skeleton_neck_joint_1   neck       Skeleton_neck_joint_2 head
 *   Skeleton_arm_joint_*__4_ upperArm  __3_ lowerArm         __2_ hand
 *   Skeleton_arm_joint_R{,__2_,__3_}   right arm upper→lower→hand
 *   leg_joint_{L,R}_1 upperLeg         _2 lowerLeg  _3 foot  _5 toes
 */
const CESIUM_RIG: HumanoidRigDefinition = {
  id: "cesium-man",
  bones: {
    hips: { name: "Skeleton_torso_joint_1" },
    spine: { name: "Skeleton_torso_joint_2" },
    chest: { name: "torso_joint_3" },
    neck: { name: "Skeleton_neck_joint_1" },
    head: { name: "Skeleton_neck_joint_2" },
    leftUpperArm: { name: "Skeleton_arm_joint_L__4_" },
    leftLowerArm: { name: "Skeleton_arm_joint_L__3_" },
    leftHand: { name: "Skeleton_arm_joint_L__2_" },
    rightUpperArm: { name: "Skeleton_arm_joint_R" },
    rightLowerArm: { name: "Skeleton_arm_joint_R__2_" },
    rightHand: { name: "Skeleton_arm_joint_R__3_" },
    leftUpperLeg: { name: "leg_joint_L_1" },
    leftLowerLeg: { name: "leg_joint_L_2" },
    leftFoot: { name: "leg_joint_L_3" },
    leftToes: { name: "leg_joint_L_5" },
    rightUpperLeg: { name: "leg_joint_R_1" },
    rightLowerLeg: { name: "leg_joint_R_2" },
    rightFoot: { name: "leg_joint_R_3" },
    rightToes: { name: "leg_joint_R_5" }
  }
};

async function loadGlb(file: string) {
  const bytes = readFileSync(file);
  const url = `data:model/gltf-binary;base64,${bytes.toString("base64")}`;
  const asset = await new GLTFLoader().load({ url, type: "gltf" }, new LoadContext());
  const scene = asset.createScene();
  const runtime = createGLTFSceneAnimationRuntime({ scene, clips: asset.animations });
  return { runtime, skeleton: runtime.skeletons()[0]!, clips: runtime.compiledClips() };
}

function vec3Of(value: unknown): [number, number, number] {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const v = value as ArrayLike<number>;
    return [v[0]!, v[1]!, v[2]!];
  }
  throw new Error(`expected vector3 value, got ${typeof value}`);
}

describe("T3.8 bakeRetargetedClips — Soldier Walk → CesiumMan", () => {
  it("produces a finite, flip-free clip whose hips height scales by leg ratio", async () => {
    const soldier = await loadGlb("fixtures/threejs-parity/assets/character/soldier.glb");
    const cesium = await loadGlb("fixtures/three-compat/assets/corpus/cesium-man.glb");
    const walk = soldier.clips.get("Walk");
    expect(walk).toBeDefined();

    const soldierRig = humanoidRigForSkeleton(soldier.skeleton, "soldier");
    const cesiumRig = rigWithRestPose(CESIUM_RIG, cesium.skeleton);
    const map = createHumanoidRetargetingMap(soldierRig, cesiumRig, {});
    expect(map.ok).toBe(true);

    const baked = bakeRetargetedClipMap(
      { skeleton: soldier.skeleton, clips: new Map([["Walk", walk!]]) },
      cesium.skeleton,
      { map, hipsScale: "leg-length" }
    );
    const bakedWalk = baked.get("Walk")!;
    expect(bakedWalk.duration).toBeCloseTo(walk!.duration, 3);

    // (a) no NaN anywhere in the baked buffers.
    let keyframes = 0;
    for (const track of bakedWalk.tracks) {
      keyframes += track.keyframeCount;
      for (const v of track.values) expect(Number.isFinite(v)).toBe(true);
    }
    expect(keyframes).toBeGreaterThan(0);

    // (b) hips translation lands on the cesium hips bone and scales by the
    // map's leg-length ratio: baked = tRest + (src − sRest) · scale.
    const hipsTrack = bakedWalk.tracks.find((t) => t.target === "Skeleton_torso_joint_1.translation");
    expect(hipsTrack).toBeDefined();
    const sourceHips = walk!.tracks.find((t) => t.target === "mixamorig:Hips.translation");
    expect(sourceHips).toBeDefined();
    // "leg-length" hips scale = target lower-limb chain / source lower-limb
    // chain, measured in each skeleton's own local units (lowerLeg+foot+toes
    // offsets are segment lengths).
    const legLen = (skel: SkeletonBinding, names: readonly string[]) =>
      names.reduce((sum, name) => {
        const joint = skel.jointIndicesByName.get(name)?.[0];
        if (joint === undefined) return sum;
        const p = skel.restPose.positions;
        return sum + Math.hypot(p[joint * 3]!, p[joint * 3 + 1]!, p[joint * 3 + 2]!);
      }, 0);
    const scale =
      legLen(cesium.skeleton, ["leg_joint_L_2", "leg_joint_L_3", "leg_joint_L_5"]) /
      legLen(soldier.skeleton, ["mixamorig:LeftLeg", "mixamorig:LeftFoot", "mixamorig:LeftToeBase"]);
    // Rest anchors: the animated source node (`mixamorig:Hips`, not the `root`
    // alias inference picked) and the explicit cesium hips binding.
    const restAt = (skel: SkeletonBinding, name: string) => {
      const j = skel.jointIndicesByName.get(name)![0]!;
      const p = skel.restPose.positions;
      return { x: p[j * 3]!, y: p[j * 3 + 1]!, z: p[j * 3 + 2]! };
    };
    const sRest = restAt(soldier.skeleton, "mixamorig:Hips");
    const tRest = restAt(cesium.skeleton, "Skeleton_torso_joint_1");
    const cursors = createTrackCursors(walk!);
    const trackIndex = walk!.tracks.indexOf(sourceHips!);
    const bakedKeyCount = hipsTrack!.keyframeCount;
    let maxErr = 0;
    for (const k of [0, Math.floor(bakedKeyCount / 2), bakedKeyCount - 1]) {
      const t = hipsTrack!.times[k]!;
      const src = vec3Of(sampleTrackRaw(sourceHips!, t, cursors, trackIndex));
      for (let axis = 0; axis < 3; axis += 1) {
        const expected = (tRest as Record<string, number>)[["x", "y", "z"][axis]!]!
          + (src[axis]! - (sRest as Record<string, number>)[["x", "y", "z"][axis]!]!) * scale;
        maxErr = Math.max(maxErr, Math.abs(hipsTrack!.values[k * 3 + axis]! - expected));
      }
    }
    expect(maxErr).toBeLessThan(1e-4);
    // The baked hips is NOT a raw copy — soldier leg length ≠ cesium leg length.
    expect(scale).not.toBeCloseTo(1, 3);

    // (c) limb-flip detector: 0 flips over the full baked clip (Phase-3 exit).
    expect(detectLimbFlips(bakedWalk)).toHaveLength(0);

    console.log("prd06-retarget-bake", JSON.stringify({
      tracks: bakedWalk.tracks.length,
      keyframes,
      legScale: scale,
      flips: detectLimbFlips(bakedWalk).length
    }));
  });

  it("addClipsFrom registers the baked clip on the target runtime and plays it", async () => {
    const soldier = await loadGlb("fixtures/threejs-parity/assets/character/soldier.glb");
    const cesium = await loadGlb("fixtures/three-compat/assets/corpus/cesium-man.glb");
    const soldierRig = humanoidRigForSkeleton(soldier.skeleton, "soldier");
    const cesiumRig = rigWithRestPose(CESIUM_RIG, cesium.skeleton);
    const map = createHumanoidRetargetingMap(soldierRig, cesiumRig, {});

    const names = await cesium.runtime.addClipsFrom(
      { skeleton: soldier.skeleton, clips: soldier.clips },
      { map, cache: false, worker: false }
    );
    expect(names).toEqual(expect.arrayContaining(["Walk", "Idle", "Run", "TPose"]));
    expect(cesium.runtime.compiledClips().has("Walk")).toBe(true);
    // The clip is playable through the normal clip path (raw form registered).
    expect(cesium.runtime.clipNames()).toContain("Walk");
  });

  it("accepts a runtime as source (skeletons + compiledClips)", async () => {
    const soldier = await loadGlb("fixtures/threejs-parity/assets/character/soldier.glb");
    const cesium = await loadGlb("fixtures/three-compat/assets/corpus/cesium-man.glb");
    const names = await cesium.runtime.addClipsFrom(soldier.runtime, { cache: false, worker: false });
    expect(names.length).toBe(4);
    expect(cesium.runtime.compiledClips().has("Run")).toBe(true);
  });
});
