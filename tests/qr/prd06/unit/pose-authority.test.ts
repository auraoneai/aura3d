/**
 * §17.0 row 6 spy test — one animation authority behind the flag. With
 * `A3D_QR_ANIMATION_POSE_MIXER` on, no blend math outside
 * `packages/animation/src/pose/` runs for compiled clips:
 *
 *   - `AnimationController` keyframe clips → `PoseMixer.evaluateSamples`
 *     (asserted by spying the prototype) and never the legacy
 *     `AnimationTrack.sample` interpolation (the renormalising path's blend
 *     engine, outside `pose/`).
 *   - `GLTFSceneAnimationRuntime.applyClips` / `applyPoseMixer` → the
 *     per-runtime `PoseMixer` (`evaluateSamples` / `update`+`evaluate`),
 *     while the runtime's legacy `AnimationMixer.update` accumulator stays
 *     untouched (spy: zero calls) — the mixer exists only for the flag-off
 *     `playClip` path.
 *   - Control: with the flag off the controller never reaches the mixer
 *     (zero `evaluateSamples` calls), proving the spy reads the flag and not
 *     incidental calls.
 *
 * Out of scope by construction: the `@aura3d/animation` `AnimationMixer`
 * facade never receives a `CompiledClip` — its value-level mixing delegates
 * to `pose/blendKernels` under the flag (T1.11), so no outside-pose blend
 * math runs on its compiled-clip surface either.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimationController } from "../../../../packages/animation/src/AnimationController";
import { AnimationMixer } from "../../../../packages/animation/src/AnimationMixer";
import { AnimationTrack } from "../../../../packages/animation/src/AnimationTrack";
import { PoseMixer } from "../../../../packages/animation/src/pose/PoseMixer";
import { setPoseMixerBlendFlagProvider } from "../../../../packages/animation/src/pose/poseMixerFlags";
import {
  createGLTFSceneAnimationRuntime,
  GLTFLoader,
  loadCurrentRoutesAssetManifest
} from "../../../../packages/assets/src";
import { LoadContext } from "../../../../packages/assets/src/LoadContext";

const positionTrack = (target: string, x: number) =>
  new AnimationTrack({
    target,
    valueType: "vector3",
    keyframes: [
      { time: 0, value: [x, 0, 0] },
      { time: 1, value: [x, 0, 0] }
    ]
  });

async function loadAsset(id: string) {
  const manifest = loadCurrentRoutesAssetManifest();
  const asset = manifest.assets.find((entry) => entry.id === id);
  expect(asset).toBeDefined();
  const uri = `data:model/gltf-binary;base64,${readFileSync(asset!.localPath).toString("base64")}`;
  return await new GLTFLoader().load({ url: uri, type: "gltf" }, new LoadContext());
}

describe("pose authority (§17.0-6): no blend math outside packages/animation/src/pose/", () => {
  afterEach(() => {
    setPoseMixerBlendFlagProvider(undefined);
    vi.restoreAllMocks();
  });

  it("controller keyframe blends run through PoseMixer.evaluateSamples only", () => {
    const evaluateSamples = vi.spyOn(PoseMixer.prototype, "evaluateSamples");
    const trackSample = vi.spyOn(AnimationTrack.prototype, "sample");
    setPoseMixerBlendFlagProvider(() => true);

    const controller = new AnimationController<string>();
    controller.registerClip({ id: "a", duration: 1, loop: true, tracks: [positionTrack("root.position", 0)] });
    controller.registerClip({ id: "b", duration: 1, loop: true, tracks: [positionTrack("root.position", 10)] });
    controller.play("a", { weight: 0.5 });
    controller.play("b", { weight: 0.5 });
    const pose = controller.capturePose().pose;

    expect(evaluateSamples).toHaveBeenCalledTimes(1);
    // The r185 incremental mix at 0.5/0.5 over identity rest → x = 5.
    expect(pose.bones.root?.position?.x).toBeCloseTo(5, 6);
    // No outside-pose blend math: the legacy track interpolator stays cold.
    expect(trackSample).not.toHaveBeenCalled();
  });

  it("control: flag off never reaches the mixer", () => {
    const evaluateSamples = vi.spyOn(PoseMixer.prototype, "evaluateSamples");
    const controller = new AnimationController<string>();
    controller.registerClip({ id: "a", duration: 1, loop: true, tracks: [positionTrack("root.position", 10)] });
    controller.play("a", { weight: 0.5 });
    controller.capturePose();
    expect(evaluateSamples).not.toHaveBeenCalled();
  });

  it("applyClips on real GLB clips evaluates on PoseMixer, legacy AnimationMixer untouched", async () => {
    const soldier = await loadAsset("soldier");
    const runtime = createGLTFSceneAnimationRuntime({
      scene: soldier.createScene(),
      clips: soldier.animations,
      asset: soldier
    });
    const evaluateSamples = vi.spyOn(PoseMixer.prototype, "evaluateSamples");
    const evaluate = vi.spyOn(PoseMixer.prototype, "evaluate");
    const update = vi.spyOn(PoseMixer.prototype, "update");
    const legacyUpdate = vi.spyOn(AnimationMixer.prototype, "update");
    const trackSample = vi.spyOn(AnimationTrack.prototype, "sample");

    const [base, overlay] = soldier.animations;
    const result = runtime.applyClips([
      { clipName: base!.name, time: 0.2, weight: 0.7 },
      { clipName: overlay!.name, time: 0.2, weight: 0.3 }
    ]);

    expect(result.blendedClipCount).toBe(2);
    expect(result.transformTracksApplied).toBeGreaterThan(0);
    expect(evaluateSamples).toHaveBeenCalledTimes(1);
    expect(evaluate).not.toHaveBeenCalled();
    expect(legacyUpdate).not.toHaveBeenCalled();
    expect(trackSample).not.toHaveBeenCalled();

    runtime.applyPoseMixer(1 / 60, { label: "authority-probe" });
    expect(update).toHaveBeenCalledTimes(1);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(legacyUpdate).not.toHaveBeenCalled();
    expect(trackSample).not.toHaveBeenCalled();
  }, 30000);
});
