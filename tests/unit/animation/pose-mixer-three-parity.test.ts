/**
 * PRD-06 T1.3 — Phase 1 parity bar: PoseMixer output must reproduce three.js
 * r185 `AnimationMixer`/`PropertyMixer` results within 1e-4 (quats compared up
 * to sign) on the four fixture rigs, stepping both sides through an identical
 * dt sequence (1/60 × 120 frames).
 *
 * Aura clips are built by converting the three-side `AnimationClip`s
 * byte-for-byte (same times/values/tangents), so only blend semantics differ.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { AnimationClip } from "../../../packages/animation/src/AnimationClip.js";
import { AnimationTrack } from "../../../packages/animation/src/AnimationTrack.js";
import { bindSkeleton, type SkeletonBinding } from "../../../packages/animation/src/pose/SkeletonBinding.js";
import { createPoseBuffer, type PoseBuffer } from "../../../packages/animation/src/pose/PoseBuffer.js";
import { PoseMixer } from "../../../packages/animation/src/pose/PoseMixer.js";
import { makeClipAdditive } from "../../../packages/animation/src/pose/makeClipAdditive.js";
import type { Keyframe } from "../../../packages/animation/src/Keyframe.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const FIXTURES = {
  soldier: "fixtures/threejs-parity/assets/character/soldier.glb",
  fox: "packages/create-aura3d/templates/animation-studio/public/hifi-cast/rpm/fox.glb",
  cesiumMan: "tests/assets/corpus/khronos/CesiumMan/CesiumMan.glb",
  robotExpressive: "fixtures/threejs-parity/assets/character/robot-expressive.glb"
} as const;

const DT = 1 / 60;
const FRAMES = 120;
const PARITY = 1e-4;

interface ThreeGltf {
  readonly scene: THREE.Group;
  readonly animations: readonly THREE.AnimationClip[];
}

async function parseGltf(path: string): Promise<ThreeGltf> {
  (globalThis as { self?: unknown }).self = globalThis;
  if (!URL.createObjectURL) {
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:stub";
  }
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const buf = readFileSync(resolve(repoRoot, path));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise<ThreeGltf>((resolvePromise, rejectPromise) => {
    new GLTFLoader().parse(ab, "", resolvePromise, rejectPromise);
  });
}

function skinnedBones(scene: THREE.Object3D): THREE.Bone[] {
  let bones: THREE.Bone[] | null = null;
  scene.traverse((object) => {
    if (bones === null && (object as THREE.SkinnedMesh).isSkinnedMesh) {
      bones = (object as THREE.SkinnedMesh).skeleton.bones;
    }
  });
  if (bones === null) throw new Error("fixture has no SkinnedMesh");
  return bones;
}

/** Build a SkeletonBinding over the three-loaded scene's bones. */
function threeBinding(bones: THREE.Bone[]): SkeletonBinding {
  const jointIndex = new Map<THREE.Bone, number>();
  bones.forEach((bone, index) => jointIndex.set(bone, index));
  return bindSkeleton({
    joints: bones.map((_, index) => index),
    jointNames: bones.map((bone) => bone.name),
    parentIndices: bones.map((bone) => (bone.parent as THREE.Bone | null)?.isBone ? jointIndex.get(bone.parent as THREE.Bone) ?? -1 : -1),
    resolveNode: (index) => {
      const bone = bones[index];
      if (!bone) return undefined;
      return {
        name: bone.name,
        position: [bone.position.x, bone.position.y, bone.position.z] as [number, number, number],
        rotation: [bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w] as [number, number, number, number],
        scale: [bone.scale.x, bone.scale.y, bone.scale.z] as [number, number, number]
      };
    }
  });
}

const PATH_TO_TARGET: Record<string, { leaf: string; valueType: "vector3" | "quaternion" | "number-array" }> = {
  position: { leaf: "translation", valueType: "vector3" },
  quaternion: { leaf: "rotation", valueType: "quaternion" },
  scale: { leaf: "scale", valueType: "vector3" },
  morphTargetInfluences: { leaf: "weights", valueType: "number-array" }
};

/** Convert a three AnimationClip to an aura AnimationClip (same keyframe data). */
function toAuraClip(threeClip: THREE.AnimationClip): AnimationClip {
  const tracks = threeClip.tracks.map((track) => {
    const separator = track.name.lastIndexOf(".");
    const nodeName = track.name.slice(0, separator);
    const path = track.name.slice(separator + 1);
    const mapping = PATH_TO_TARGET[path];
    if (!mapping) return null;

    // glTF CUBICSPLINE arrives via a flagged custom interpolant with
    // [inTangent, value, outTangent] per key; STEP is InterpolateDiscrete.
    const cubic = (track.createInterpolant as unknown as { isInterpolantFactoryMethodGLTFCubicSpline?: boolean }).isInterpolantFactoryMethodGLTFCubicSpline === true;
    const step = track.interpolation === THREE.InterpolateDiscrete;
    const stride = mapping.valueType === "quaternion" ? 4 : mapping.valueType === "vector3" ? 3 : (track as unknown as { getValueSize?: () => number }).getValueSize?.() ?? 1;
    const times = track.times;
    const values = track.values;
    const keyframes: Keyframe<never>[] = [];

    for (let k = 0; k < times.length; k += 1) {
      const base = cubic ? k * 3 * stride : k * stride;
      const valueOffset = cubic ? base + stride : base;
      const value = stride === 1 ? values[valueOffset]! as never : ([...values.slice(valueOffset, valueOffset + stride)] as never);
      const keyframe: Record<string, unknown> = { time: times[k]!, value };
      if (cubic) {
        keyframe.interpolation = "cubicspline";
        keyframe.inTangent = stride === 1 ? values[base]! : [...values.slice(base, base + stride)];
        keyframe.outTangent = stride === 1 ? values[base + 2 * stride]! : [...values.slice(base + 2 * stride, base + 3 * stride)];
      } else if (step) {
        keyframe.interpolation = "step";
      }
      keyframes.push(keyframe as Keyframe<never>);
    }
    return new AnimationTrack({ target: `${nodeName}.${mapping.leaf}`, valueType: mapping.valueType, keyframes });
  }).filter((track): track is AnimationTrack => track !== null);

  return new AnimationClip({ name: threeClip.name, duration: threeClip.duration, tracks });
}

function quatDistance(a: readonly number[], b: readonly number[]): number {
  const direct = Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!, a[3]! - b[3]!);
  const negated = Math.hypot(a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!, a[3]! + b[3]!);
  return Math.min(direct, negated);
}

/** Max |aura − three| across all joints/channels for the current frame. */
function poseDiff(pose: PoseBuffer, bones: THREE.Bone[]): { position: number; rotation: number; scale: number } {
  let position = 0;
  let rotation = 0;
  let scale = 0;
  for (let i = 0; i < bones.length; i += 1) {
    const bone = bones[i]!;
    position = Math.max(position,
      Math.abs(pose.positions[i * 3]! - bone.position.x),
      Math.abs(pose.positions[i * 3 + 1]! - bone.position.y),
      Math.abs(pose.positions[i * 3 + 2]! - bone.position.z));
    rotation = Math.max(rotation, quatDistance(
      [pose.rotations[i * 4]!, pose.rotations[i * 4 + 1]!, pose.rotations[i * 4 + 2]!, pose.rotations[i * 4 + 3]!],
      [bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w]
    ));
    scale = Math.max(scale,
      Math.abs(pose.scales[i * 3]! - bone.scale.x),
      Math.abs(pose.scales[i * 3 + 1]! - bone.scale.y),
      Math.abs(pose.scales[i * 3 + 2]! - bone.scale.z));
  }
  return { position, rotation, scale };
}

type FixtureRig = {
  readonly gltf: ThreeGltf;
  readonly bones: THREE.Bone[];
  readonly binding: SkeletonBinding;
  auraClips: AnimationClip[];
};

async function loadRig(path: string): Promise<FixtureRig> {
  const gltf = await parseGltf(path);
  const bones = skinnedBones(gltf.scene);
  return {
    gltf,
    bones,
    binding: threeBinding(bones),
    auraClips: gltf.animations.map((clip) => toAuraClip(clip))
  };
}

function makeAuraMixer(rig: FixtureRig): { mixer: PoseMixer; out: PoseBuffer } {
  const mixer = new PoseMixer({ skeleton: rig.binding });
  rig.auraClips.forEach((clip) => mixer.addClip(clip.name, clip));
  return { mixer, out: createPoseBuffer(rig.binding.boneCount) };
}

function expectWithin(diff: { position: number; rotation: number; scale: number }, label: string): void {
  expect(diff.position, `${label} position`).toBeLessThanOrEqual(PARITY);
  expect(diff.rotation, `${label} rotation`).toBeLessThanOrEqual(PARITY);
  expect(diff.scale, `${label} scale`).toBeLessThanOrEqual(PARITY);
}

/** Clone a rig so parallel cases don't share mutated three nodes. */
async function freshRig(path: string): Promise<{ three: { scene: THREE.Object3D; clips: THREE.AnimationClip[]; bones: THREE.Bone[] }; rig: FixtureRig }> {
  const rig = await loadRig(path);
  // Re-parse for the three side so bindings write into a dedicated scene.
  const gltf = await parseGltf(path);
  const bones = skinnedBones(gltf.scene);
  return { three: { scene: gltf.scene, clips: [...gltf.animations], bones }, rig };
}

describe("PoseMixer vs three r185 AnimationMixer (PRD-06 T1.3 parity)", () => {
  for (const [fixtureName, path] of Object.entries(FIXTURES)) {
    describe(fixtureName, () => {
      it("single clip, weight 1 — identical dt sequence", async () => {
        const { three, rig } = await freshRig(path);
        const clip = three.clips[0]!;
        const { mixer, out } = makeAuraMixer(rig);

        const threeMixer = new THREE.AnimationMixer(three.scene);
        threeMixer.clipAction(clip).play();
        const auraAction = mixer.play(clip.name);

        for (let frame = 0; frame < FRAMES; frame += 1) {
          threeMixer.update(DT);
          mixer.update(DT);
          mixer.evaluate(out);
        }
        void auraAction;
        expectWithin(poseDiff(out, three.bones), "single clip");
      });

      it("single clip at weight 0.3 — rest fills the remainder", async () => {
        const { three, rig } = await freshRig(path);
        const clip = three.clips[0]!;
        const { mixer, out } = makeAuraMixer(rig);

        const threeMixer = new THREE.AnimationMixer(three.scene);
        threeMixer.clipAction(clip).setEffectiveWeight(0.3).play();
        mixer.play(clip.name, { weight: 0.3 });

        for (let frame = 0; frame < FRAMES; frame += 1) {
          threeMixer.update(DT);
          mixer.update(DT);
          mixer.evaluate(out);
        }
        expectWithin(poseDiff(out, three.bones), "weight 0.3");
      });

      it("three actions at 0.5/0.3/0.4 — incremental slerp order", async () => {
        const { three, rig } = await freshRig(path);
        const clips = distinctClips(three.clips);
        const { mixer, out } = makeAuraMixer(rig);
        for (const clip of clips) ensureAuraClip(mixer, rig, clip);

        const threeMixer = new THREE.AnimationMixer(three.scene);
        const weights = [0.5, 0.3, 0.4];
        clips.forEach((clip, index) => {
          threeMixer.clipAction(clip).setEffectiveWeight(weights[index]!).play();
        });
        clips.forEach((clip, index) => {
          mixer.play(clip.name, { weight: weights[index]! });
        });

        for (let frame = 0; frame < FRAMES; frame += 1) {
          threeMixer.update(DT);
          mixer.update(DT);
          mixer.evaluate(out);
        }
        expectWithin(poseDiff(out, three.bones), "three actions");
      });

      it("crossfade at t = 0.1/0.2", async () => {
        const { three, rig } = await freshRig(path);
        const [clipA, clipB] = distinctClips(three.clips);
        const { mixer, out } = makeAuraMixer(rig);
        ensureAuraClip(mixer, rig, clipA);
        ensureAuraClip(mixer, rig, clipB);

        const threeMixer = new THREE.AnimationMixer(three.scene);
        const actionA = threeMixer.clipAction(clipA);
        const actionB = threeMixer.clipAction(clipB);
        actionA.play();

        mixer.play(clipA.name);

        // Crossfade mid-run, then compare inside the fade window.
        for (let frame = 0; frame < 30; frame += 1) {
          threeMixer.update(DT);
          mixer.update(DT);
          mixer.evaluate(out);
        }
        actionB.play();
        actionA.crossFadeTo(actionB, 0.4, false);
        mixer.crossFadeTo(clipB.name, 0.4);

        for (let frame = 0; frame < 24; frame += 1) {
          threeMixer.update(DT);
          mixer.update(DT);
          mixer.evaluate(out);
          const label = `crossfade frame ${frame}`;
          expectWithin(poseDiff(out, three.bones), label);
        }
      });

      it("crossfade with warp", async () => {
        const { three, rig } = await freshRig(path);
        const [clipA, clipB] = distinctClips(three.clips);
        const { mixer, out } = makeAuraMixer(rig);
        ensureAuraClip(mixer, rig, clipA);
        ensureAuraClip(mixer, rig, clipB);

        const threeMixer = new THREE.AnimationMixer(three.scene);
        const actionA = threeMixer.clipAction(clipA);
        const actionB = threeMixer.clipAction(clipB);
        actionA.play();
        mixer.play(clipA.name);

        for (let frame = 0; frame < 30; frame += 1) {
          threeMixer.update(DT);
          mixer.update(DT);
          mixer.evaluate(out);
        }
        actionB.play();
        actionA.crossFadeTo(actionB, 0.4, true);
        mixer.crossFadeTo(clipB.name, 0.4, { warp: true });

        for (let frame = 0; frame < 60; frame += 1) {
          threeMixer.update(DT);
          mixer.update(DT);
          mixer.evaluate(out);
          expectWithin(poseDiff(out, three.bones), `warp frame ${frame}`);
        }
      });

      it("additive clip via makeClipAdditive (reference frame 0)", async () => {
        const { three, rig } = await freshRig(path);
        const [clipA, clipB] = distinctClips(three.clips);
        const { mixer, out } = makeAuraMixer(rig);

        ensureAuraClip(mixer, rig, clipA);
        ensureAuraClip(mixer, rig, clipB);
        const threeAdditive = THREE.AnimationUtils.makeClipAdditive(clipB.clone());
        const auraAdditive = makeClipAdditive(rig.auraClips.find((c) => c.name === clipB.name)!);
        mixer.addClip(auraAdditive.name, auraAdditive);

        const threeMixer = new THREE.AnimationMixer(three.scene);
        threeMixer.clipAction(clipA).play();
        threeMixer.clipAction(threeAdditive).play(); // blendMode arrives via clip.blendMode

        mixer.play(clipA.name);
        mixer.play(auraAdditive.name, { additive: true });

        for (let frame = 0; frame < FRAMES; frame += 1) {
          threeMixer.update(DT);
          mixer.update(DT);
          mixer.evaluate(out);
        }
        expectWithin(poseDiff(out, three.bones), "additive");
      });
    });
  }
});

/** Register a converted aura clip under its three-side name if missing. */
function ensureAuraClip(mixer: PoseMixer, rig: FixtureRig, threeClip: THREE.AnimationClip): void {
  if (rig.auraClips.some((clip) => clip.name === threeClip.name)) return;
  const auraClip = toAuraClip(threeClip);
  rig.auraClips.push(auraClip);
  mixer.addClip(auraClip.name, auraClip);
}

/**
 * Up to 3 distinct clips per fixture; fixtures with fewer clips get synthetic
 * variants (subclips of the first clip) so the incremental-order case runs
 * everywhere.
 */
function distinctClips(clips: readonly THREE.AnimationClip[]): THREE.AnimationClip[] {
  const result: THREE.AnimationClip[] = [];
  const seen = new Set<string>();
  for (const clip of clips) {
    if (!seen.has(clip.name)) {
      result.push(clip);
      seen.add(clip.name);
    }
    if (result.length === 3) break;
  }
  while (result.length < 3) {
    const source = result[result.length % Math.max(1, result.length)] ?? clips[0]!;
    const frames = Math.max(2, Math.floor(source.duration * 30));
    const sub = THREE.AnimationUtils.subclip(source, `variant_${result.length}`, 0, Math.max(1, frames - result.length), 30);
    if (seen.has(sub.name)) break;
    seen.add(sub.name);
    result.push(sub);
  }
  return result;
}
