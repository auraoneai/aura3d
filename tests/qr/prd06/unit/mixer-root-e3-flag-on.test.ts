/**
 * §16 S-row — `animation-mixer-root-e3` flag-on lane copy (the original lives
 * in `tests/unit/agent-api/` whose first import is the engine's agent-api, so
 * per CONTRACTS §4.1 the new-expectation case lands here). On real soldier
 * clips through the per-runtime `PoseMixer` — the authority `node.play`
 * dispatches to under `A3D_QR_ANIMATION` (`compiler/animation.ts` →
 * `runtime.mixer()`/`applyPoseMixer`):
 *
 *   - `crossFadeTo` (the `node.play` semantic) keeps transition continuity
 *     C ≤ 1.5 (§17.3), measured on world-space bone samples built by forward
 *     kinematics over the evaluated pose — the same post-mixer pose
 *     `socket()` reads after constraints (none are installed here).
 *   - `speed: 0.5` halves clip advance within 2% (the action's
 *     `setEffectiveTimeScale`, wired to `animation.speed` in the dispatch).
 *   - An unknown clip throws `ANIMATION_CLIP_NOT_FOUND`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Quat, Vec3 } from "../../../../packages/animation/src/Keyframe";
import {
  motionFrame,
  transitionContinuity,
  type MotionFrame
} from "../../../../packages/animation/src/pose/MotionMetrics";
import { createPoseBuffer } from "../../../../packages/animation/src/pose/PoseBuffer";
import type { SkeletonBinding } from "../../../../packages/animation/src/pose/SkeletonBinding";
import {
  createGLTFSceneAnimationRuntime,
  GLTFLoader,
  loadCurrentRoutesAssetManifest
} from "../../../../packages/assets/src";
import { LoadContext } from "../../../../packages/assets/src/LoadContext";

async function loadSoldier() {
  const manifest = loadCurrentRoutesAssetManifest();
  const asset = manifest.assets.find((entry) => entry.id === "soldier");
  const uri = `data:model/gltf-binary;base64,${readFileSync(asset!.localPath).toString("base64")}`;
  return await new GLTFLoader().load({ url: uri, type: "gltf" }, new LoadContext());
}

/** World rotation of joint `i`: forward kinematics over parent joints. */
function worldSample(binding: SkeletonBinding, rotations: ArrayLike<number>, positions: ArrayLike<number>, i: number): { rotation: Quat; position: Vec3 } {
  const parent = binding.parentIndices[i]!;
  const q: Quat = [rotations[i * 4]!, rotations[i * 4 + 1]!, rotations[i * 4 + 2]!, rotations[i * 4 + 3]!];
  const p: Vec3 = [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!];
  if (parent < 0) return { rotation: q, position: p };
  const pw = worldSample(binding, rotations, positions, parent);
  // worldPos = parentPos + parentRot * (parentScale * localPos); scale is
  // folded in crudely — limb continuity only needs the rotation channel.
  const [x, y, z] = p;
  const [qx, qy, qz, qw] = pw.rotation;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  const position: Vec3 = [
    pw.position[0] + (ix * qw + iw * -qx + iy * -qz - iz * -qy),
    pw.position[1] + (iy * qw + iw * -qy + iz * -qx - ix * -qz),
    pw.position[2] + (iz * qw + iw * -qz + ix * -qy - iy * -qx)
  ];
  const rotation: Quat = [
    pw.rotation[3]! * q[0] + pw.rotation[0]! * q[3] + pw.rotation[1]! * q[2] - pw.rotation[2]! * q[1],
    pw.rotation[3]! * q[1] - pw.rotation[0]! * q[2] + pw.rotation[1]! * q[3] + pw.rotation[2]! * q[0],
    pw.rotation[3]! * q[2] + pw.rotation[0]! * q[1] - pw.rotation[1]! * q[0] + pw.rotation[2]! * q[3],
    pw.rotation[3]! * q[3] - pw.rotation[0]! * q[0] - pw.rotation[1]! * q[1] - pw.rotation[2]! * q[2]
  ];
  return { rotation, position };
}

describe("animation-mixer-root-e3 flag-on (§16 S, lane copy)", () => {
  it("crossFadeTo continuity C ≤ 1.5 on real soldier clips (§17.3)", async () => {
    const soldier = await loadSoldier();
    const runtime = createGLTFSceneAnimationRuntime({
      scene: soldier.createScene(),
      clips: soldier.animations,
      asset: soldier
    });
    const mixer = runtime.mixer();
    const binding = runtime.skeletons()[0]!;
    const out = createPoseBuffer(binding.boneCount);
    const [idle, walk] = soldier.animations;

    const DT = 1 / 120;
    const T0 = 0.6; // crossfade boundary
    const FADE = 0.25;
    const frames: MotionFrame[] = [];
    let time = 0;

    mixer.play(idle!.name);
    // Baseline window A: [0.3, 0.55]; boundary 0.6; window [0.5, 0.9];
    // baseline window B: [0.95, 1.3]. The crossfade is issued when the sim
    // clock reaches T0 so the measured window brackets the real transition.
    while (time <= 1.35) {
      if (time >= T0 && time - DT < T0) mixer.crossFadeTo(walk!.name, FADE);
      mixer.update(DT);
      mixer.evaluate(out);
      frames.push(
        motionFrame(time, binding.jointNames, (bone) => {
          const indices = binding.jointIndicesByName.get(bone);
          if (indices === undefined || indices.length === 0) return undefined;
          const sample = worldSample(binding, out.rotations, out.positions, indices[0]!);
          // motionFrame expects a world matrix — feed it a 4x4 built from the
          // FK sample instead of re-decomposing: cheaper to keep the quat
          // API by passing a tiny adapter matrix.
          const [x, y, z, w] = sample.rotation;
          const [px, py, pz] = sample.position;
          return [
            1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
            2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
            2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
            px, py, pz, 1
          ];
        })
      );
      time += DT;
    }

    const c = transitionContinuity(frames, {
      transitionTime: T0,
      baselineWindows: [
        [0.3, 0.55],
        [0.95, 1.3]
      ]
    });
    expect(
      c.continuity,
      `continuity ${c.continuity.toFixed(2)} (${c.maxAngularSpeedDegPerSec.toFixed(0)}°/s vs ${c.baselineDegPerSec.toFixed(0)}°/s baseline)`
    ).toBeLessThanOrEqual(1.5);
  }, 30000);

  it("speed 0.5 halves clip advance within 2%", async () => {
    const soldier = await loadSoldier();
    const runtime = createGLTFSceneAnimationRuntime({
      scene: soldier.createScene(),
      clips: soldier.animations,
      asset: soldier
    });
    const mixer = runtime.mixer();
    const action = mixer.play(soldier.animations[0]!.name);
    action.setEffectiveTimeScale(0.5);
    const before = action.time;
    mixer.update(0.4);
    const advanced = action.time - before;
    expect(advanced / 0.4).toBeCloseTo(0.5, 2);
  }, 30000);

  it("unknown clip throws ANIMATION_CLIP_NOT_FOUND", async () => {
    const soldier = await loadSoldier();
    const runtime = createGLTFSceneAnimationRuntime({
      scene: soldier.createScene(),
      clips: soldier.animations,
      asset: soldier
    });
    const mixer = runtime.mixer();
    expect(() => mixer.play("no-such-clip")).toThrow(/ANIMATION_CLIP_NOT_FOUND/);
    expect(() => mixer.crossFadeTo("no-such-clip", 0.2)).toThrow(/ANIMATION_CLIP_NOT_FOUND/);
  }, 30000);
});
