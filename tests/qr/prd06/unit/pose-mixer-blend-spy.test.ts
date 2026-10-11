/**
 * PRD-06 06-SPY (T1.11 completion 6) — under `A3D_QR_ANIMATION_POSE_MIXER` no
 * legacy blend function runs for compiled clips: `AnimationMixer`'s facade
 * routes every base/additive blend through the pose-mixer's kernels
 * (`blendKernels.ts`) and the legacy bodies inside `blendBase` /
 * `additiveContribution` are dead code. Flag-off stays on the legacy path —
 * asserted by the same spy not being invoked.
 *
 * The kernels are mocked with call-through spies so real math still runs; the
 * assertion is on routing, not on output values (those are covered by the
 * parity tests).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../packages/animation/src/pose/blendKernels.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../packages/animation/src/pose/blendKernels.js")>();
  return {
    ...actual,
    blendBaseValue: vi.fn(actual.blendBaseValue),
    additiveContributionValue: vi.fn(actual.additiveContributionValue)
  };
});

import * as blendKernels from "../../../../packages/animation/src/pose/blendKernels.js";
import { AnimationClip, AnimationTrack } from "@aura3d/animation";
import { AnimationMixer } from "../../../../packages/animation/src/AnimationMixer.js";
import { AnimationLayer } from "../../../../packages/animation/src/AnimationLayer.js";
import { setPoseMixerBlendFlagProvider } from "../../../../packages/animation/src/pose/poseMixerFlags.js";

const blendBaseValue = vi.mocked(blendKernels.blendBaseValue);
const additiveContributionValue = vi.mocked(blendKernels.additiveContributionValue);

function clip(name: string, z = 0): AnimationClip {
  return new AnimationClip({
    name,
    duration: 1,
    tracks: [new AnimationTrack({
      target: "hips.translation",
      valueType: "vector3",
      keyframes: [
        { time: 0, value: [0, 1, z] },
        { time: 1, value: [0, 1, z + 1] }
      ]
    })]
  });
}

function mixer(): AnimationMixer {
  const values = new Map<string, unknown>();
  return new AnimationMixer({
    setAnimationValue: (target, value) => { values.set(target, value); }
  });
}

afterEach(() => {
  setPoseMixerBlendFlagProvider(undefined);
  vi.clearAllMocks();
});

describe("pose-mixer blend routing (06-SPY)", () => {
  it("flag-on: base blends route through blendBaseValue, never the legacy body", () => {
    setPoseMixerBlendFlagProvider(() => true);
    const m = mixer();
    // Two non-additive actions on the same target force a weighted base merge
    // during the crossfade window — the exact shape compiled clips take.
    const a = m.play(clip("walk"));
    const b = m.play(clip("run", 2));
    m.crossFade(a, b, 0.5);
    m.update(0.1);
    expect(blendBaseValue).toHaveBeenCalled();
  });

  it("flag-on: additive layer blends route through additiveContributionValue", () => {
    setPoseMixerBlendFlagProvider(() => true);
    const m = mixer();
    const layer = new AnimationLayer("hurt", { additive: true });
    layer.add(m.play(clip("pain", 5)));
    m.addLayer(layer);
    m.update(0.1);
    expect(additiveContributionValue).toHaveBeenCalled();
  });

  it("flag-off: kernels are not invoked (legacy bodies run)", () => {
    setPoseMixerBlendFlagProvider(() => false);
    const m = mixer();
    const a = m.play(clip("walk"));
    const b = m.play(clip("run", 2));
    m.crossFade(a, b, 0.5);
    m.update(0.1);
    expect(blendBaseValue).not.toHaveBeenCalled();
    expect(additiveContributionValue).not.toHaveBeenCalled();
  });
});
