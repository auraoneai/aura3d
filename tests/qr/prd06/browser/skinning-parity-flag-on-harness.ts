/**
 * PRD-06 §16 flag-on copies of `threejs-parity-skinning-{blending,additive,ik}-parity.spec.ts`.
 *
 * The original specs run the flag-off `createGLTFSceneAnimationMixer` path and
 * compare rendered pixels against actual Three.js r185. §10 (P1, item 2)
 * requires a flag-on case per spec asserting r185-parity semantics — every
 * expectation cites the three r185 value it matches. Rather than duplicating
 * the full screenshot machinery, these cases assert the semantic invariants
 * directly in-page: the flag-on PoseMixer path (`applyClips`) must produce the
 * same per-bone local TRS as an actual `THREE.AnimationMixer` driving the same
 * clip samples (within the lane's 1e-4 parity bound, quats up to sign), the
 * additive case compares `makeClipAdditive`+`additive:true` against
 * `THREE.AnimationUtils.makeClipAdditive`+`AdditiveAnimationBlendMode`, and the
 * IK case feeds the a3d-solved local quaternions into the r185 scene graph and
 * asserts the world-space chain agrees within 1e-3 while endDistanceToTarget
 * holds the original spec's < 0.55 bound.
 *
 * Flags installed via `setRendererQrFlags` (`?a3d-qr=` can't spell multi-word
 * sub-flags). Publishes `window.__AURA3D_QR_SKINNING_PARITY_FLAG_ON__`.
 */

import "./buffer-shim.js";
import { GLTFLoader, LoadContext } from "@aura3d/assets";
import { createGLTFSceneAnimationRuntime } from "@aura3d/assets/browser";
import { makeClipAdditive } from "@aura3d/animation/lanes";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph.js";
import type { QrFlagName, QrFlags, QrFlagValue } from "../../../../packages/rendering/src/contracts/core.js";
import * as THREE from "three";
// The dev server maps this path verbatim; it has no d.ts — declare a minimal
// loader surface inline (loadAsync only).
 
// @ts-expect-error runtime alias
import { GLTFLoader as ThreeGLTFLoaderUntyped } from "/node_modules/three/examples/jsm/loaders/GLTFLoader.js";

const ThreeGLTFLoader = ThreeGLTFLoaderUntyped as new () => {
  loadAsync(url: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>;
};

const FLAGS: QrFlags = {
  values: { A3D_QR_ANIMATION: true } as Partial<Record<QrFlagName, QrFlagValue>>,
  on: (name: QrFlagName) => name === "A3D_QR_ANIMATION"
};
setRendererQrFlags(FLAGS);

const ASSET_URL = `${location.origin}/fixtures/threejs-parity/assets/character/robot-expressive.glb`;
const SAMPLE_SECONDS = 1.18;
const PARITY = 1e-4;
const IK_JOINTS = ["UpperArm.R", "LowerArm.R", "Palm2.R"] as const;
const IK_OPTIONS = {
  jointNames: IK_JOINTS,
  target: [0.7, 0.55, 0] as const,
  pole: [-0.2, 1.38, 0.18] as const,
  weight: 1,
  allowStretch: false
} as const;

interface TrsDiff {
  readonly boneCount: number;
  readonly maxPosition: number;
  readonly maxQuaternion: number;
  readonly maxScale: number;
}

interface CaseReport {
  readonly status: "ready" | "error";
  readonly error?: string;
  readonly diff?: TrsDiff;
  readonly tracksApplied?: number;
  readonly clipsUsed?: readonly string[];
}

interface IkReport {
  readonly status: "ready" | "error";
  readonly error?: string;
  readonly applied?: boolean;
  readonly endDistanceToTarget?: number;
  readonly skinningPalettesUpdated?: number;
  readonly worldDrift?: number;
}

interface FlagOnReport {
  status: "ready" | "error";
  error?: string;
  stack?: string;
  blending?: CaseReport;
  additive?: CaseReport;
  ik?: IkReport;
}

const report: FlagOnReport = { status: "ready" };
(window as unknown as { __AURA3D_QR_SKINNING_PARITY_FLAG_ON__?: FlagOnReport }).__AURA3D_QR_SKINNING_PARITY_FLAG_ON__ = report;

function pickClip<T extends { name: string }>(clips: readonly T[], pattern: RegExp): T {
  const clip = clips.find((c) => pattern.test(c.name));
  if (!clip) throw new Error(`clip matching ${pattern} missing`);
  return clip;
}

function a3dTrs(scene: { traverse(v: (n: { name: string; transform: { position: ArrayLike<number>; rotation: ArrayLike<number>; scale: ArrayLike<number> } }) => void): void }): Map<string, { p: ArrayLike<number>; q: ArrayLike<number>; s: ArrayLike<number> }> {
  const out = new Map<string, { p: ArrayLike<number>; q: ArrayLike<number>; s: ArrayLike<number> }>();
  scene.traverse((node) => {
    if (node.name) out.set(node.name, { p: node.transform.position, q: node.transform.rotation, s: node.transform.scale });
  });
  return out;
}

function threeTrs(root: THREE.Object3D): Map<string, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }> {
  const out = new Map<string, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }>();
  root.traverse((o) => {
    if (o.name) out.set(o.name, { p: o.position, q: o.quaternion, s: o.scale });
  });
  return out;
}

function diffTrs(a3d: ReturnType<typeof a3dTrs>, three: ReturnType<typeof threeTrs>): TrsDiff {
  let maxP = 0, maxQ = 0, maxS = 0, count = 0;
  for (const [name, a] of a3d) {
    const t = three.get(name);
    if (!t) continue;
    count += 1;
    for (let i = 0; i < 3; i += 1) maxP = Math.max(maxP, Math.abs((a.p[i] as number) - t.p.getComponent(i)));
    const tq = [t.q.x, t.q.y, t.q.z, t.q.w];
    let dq = 0;
    let dqNeg = 0;
    for (let i = 0; i < 4; i += 1) {
      const av = a.q[i] as number;
      const tv = tq[i]!;
      dq = Math.max(dq, Math.abs(av - tv));
      dqNeg = Math.max(dqNeg, Math.abs(av + tv));
    }
    maxQ = Math.max(maxQ, Math.min(dq, dqNeg));
    for (let i = 0; i < 3; i += 1) maxS = Math.max(maxS, Math.abs((a.s[i] as number) - t.s.getComponent(i)));
  }
  return { boneCount: count, maxPosition: maxP, maxQuaternion: maxQ, maxScale: maxS };
}

function worldPos(node: { transform: { worldMatrix: ArrayLike<number> } }): [number, number, number] {
  const m = node.transform.worldMatrix;
  return [m[12] as number, m[13] as number, m[14] as number];
}

async function main(): Promise<void> {
  const a3dLoader = new GLTFLoader();
  const context = new LoadContext();
  const asset = await a3dLoader.load({ url: ASSET_URL }, context);
  const threeLoader = new ThreeGLTFLoader();
  const gltf = await threeLoader.loadAsync(ASSET_URL);

  const idleA = pickClip(asset.animations, /^idle$/i);
  const walkA = pickClip(asset.animations, /walk/i);
  const runA = pickClip(asset.animations, /run|running/i);

  // ---------- case: blending (flag-on applyClips vs THREE.AnimationMixer) ----------
  try {
    const sceneA = asset.createScene();
    const runtimeA = createGLTFSceneAnimationRuntime({ scene: sceneA, clips: asset.animations, asset });
    const t = (c: { duration: number }) => c.duration > 0 ? SAMPLE_SECONDS % c.duration : 0;
    const applied = runtimeA.applyClips([
      { clipName: idleA.name, time: t(idleA), weight: 0.2 },
      { clipName: walkA.name, time: t(walkA), weight: 0.55 },
      { clipName: runA.name, time: t(runA), weight: 0.25 }
    ]);

    const robot = gltf.scene.clone(true) as THREE.Group;
    const mixer = new THREE.AnimationMixer(robot);
    const entries: [string, number][] = [[idleA.name, 0.2], [walkA.name, 0.55], [runA.name, 0.25]];
    for (const [name, w] of entries) {
      const clip = THREE.AnimationClip.findByName(gltf.animations, name);
      if (!clip) throw new Error(`three clip ${name} missing`);
      const action = mixer.clipAction(clip);
      action.enabled = true;
      action.setEffectiveWeight(w);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      action.time = clip.duration > 0 ? SAMPLE_SECONDS % clip.duration : 0;
    }
    mixer.update(0);

    report.blending = {
      status: "ready",
      tracksApplied: applied.tracksApplied,
      clipsUsed: [idleA.name, walkA.name, runA.name],
      diff: diffTrs(a3dTrs(sceneA), threeTrs(robot))
    };
    runtimeA.dispose();
  } catch (error) {
    report.blending = { status: "error", error: error instanceof Error ? error.message : String(error) };
  }

  // ---------- case: additive (makeClipAdditive + additive:true vs THREE additive blend) ----------
  try {
    const additiveClip = makeClipAdditive(walkA);
    const sceneB = asset.createScene();
    const runtimeB = createGLTFSceneAnimationRuntime({ scene: sceneB, clips: [...asset.animations, additiveClip], asset });
    const t = (c: { duration: number }) => c.duration > 0 ? SAMPLE_SECONDS % c.duration : 0;
    const applied = runtimeB.applyClips([
      { clipName: idleA.name, time: t(idleA), weight: 1 },
      { clipName: additiveClip.name, time: t(additiveClip), weight: 0.75, additive: true }
    ]);

    const robot = gltf.scene.clone(true) as THREE.Group;
    const mixer = new THREE.AnimationMixer(robot);
    const idle3 = THREE.AnimationClip.findByName(gltf.animations, idleA.name)!;
    const walk3 = THREE.AnimationClip.findByName(gltf.animations, walkA.name)!;
    const baseAction = mixer.clipAction(idle3);
    baseAction.enabled = true;
    baseAction.setEffectiveWeight(1);
    baseAction.play();
    baseAction.time = idle3.duration > 0 ? SAMPLE_SECONDS % idle3.duration : 0;
    const additive3 = THREE.AnimationUtils.makeClipAdditive(walk3.clone());
    const addAction = mixer.clipAction(additive3);
    addAction.enabled = true;
    addAction.blendMode = THREE.AdditiveAnimationBlendMode;
    addAction.setEffectiveWeight(0.75);
    addAction.play();
    addAction.time = additive3.duration > 0 ? SAMPLE_SECONDS % additive3.duration : 0;
    mixer.update(0);

    report.additive = {
      status: "ready",
      tracksApplied: applied.tracksApplied,
      clipsUsed: [idleA.name, additiveClip.name],
      diff: diffTrs(a3dTrs(sceneB), threeTrs(robot))
    };
    runtimeB.dispose();
  } catch (error) {
    report.additive = { status: "error", error: error instanceof Error ? error.message : String(error) };
  }

  // ---------- case: ik (flag-on solver output replayed in the r185 scene graph) ----------
  try {
    const sceneC = asset.createScene();
    const runtimeC = createGLTFSceneAnimationRuntime({ scene: sceneC, clips: asset.animations, asset });
    const baseClip = idleA;
    runtimeC.applyClip(baseClip, baseClip.duration > 0 ? 0.84 % baseClip.duration : 0);
    const ik = runtimeC.solveImportedSkeletonTwoBoneIK({ ...IK_OPTIONS, apply: true });

    sceneC.updateWorldTransforms();
    // Post-solve a3d world positions, chain-relative (placement-agnostic).
    const a3dWorld: Record<string, [number, number, number]> = {};
    sceneC.traverse((node) => {
      if (IK_JOINTS.includes(node.name as (typeof IK_JOINTS)[number])) {
        a3dWorld[node.name] = worldPos(node);
      }
    });

    // Replay the a3d-solved local quaternions inside the real r185 scene graph:
    // the solved pose must land each joint at the same world-space spot.
    const robot = gltf.scene.clone(true) as THREE.Group;
    robot.updateMatrixWorld(true);
    let worldDrift = 0;
    const a3dLocal = a3dTrs(sceneC);
    for (const name of IK_JOINTS) {
      const bone = robot.getObjectByName(name) as THREE.Object3D | undefined;
      const a = a3dLocal.get(name);
      if (!bone || !a) continue;
      bone.quaternion.set(a.q[0] as number, a.q[1] as number, a.q[2] as number, a.q[3] as number);
      bone.updateMatrixWorld(true);
      const wp = new THREE.Vector3();
      bone.getWorldPosition(wp);
      const aw = a3dWorld[name]!;
      // Chain-relative comparison removes the two scenes' different placements.
      const rootBone = robot.getObjectByName(IK_JOINTS[0])!;
      const rp = new THREE.Vector3();
      rootBone.getWorldPosition(rp);
      const threeRel = [wp.x - rp.x, wp.y - rp.y, wp.z - rp.z];
      const a3dRoot = a3dWorld[IK_JOINTS[0]]!;
      const a3dRel = [aw[0] - a3dRoot[0], aw[1] - a3dRoot[1], aw[2] - a3dRoot[2]];
      worldDrift = Math.max(worldDrift, Math.hypot(threeRel[0]! - a3dRel[0]!, threeRel[1]! - a3dRel[1]!, threeRel[2]! - a3dRel[2]!));
    }

    report.ik = {
      status: "ready",
      applied: ik.applied,
      endDistanceToTarget: ik.solution.endDistanceToTarget,
      skinningPalettesUpdated: ik.skinningPalettesUpdated,
      worldDrift
    };
    runtimeC.dispose();
  } catch (error) {
    report.ik = { status: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

main().catch((error) => {
  report.status = "error";
  report.error = error instanceof Error ? error.message : String(error);
  report.stack = error instanceof Error ? error.stack : undefined;
});
