/**
 * PRD-06 T0.2 — `rejectEmptyAnimationPose` and the `setActorRuntimeAnimationPose`
 * interim guard: flag-off stores poses verbatim (today's behaviour); flag-on
 * rejects a 0-bone/0-morph pose (stores undefined), warns once per node, and
 * throws `ANIMATION_EMPTY_POSE` in strict mode. Morph-only poses stay accepted.
 */

import { afterEach, describe, expect, it } from "vitest";
import type { AnimationPose } from "@aura3d/animation";
import { resolveQrFlags } from "@aura3d/engine/contracts";
import {
  ANIMATION_EMPTY_POSE,
  consumePendingEmptyPoseRejection,
  qrAnimationFlags,
  rejectEmptyAnimationPose,
  resetEmptyPoseRejections,
  resetQrAnimationFlags,
  setActorRuntimeAnimationPose,
  setQrAnimationFlags
} from "../../../packages/engine/src/agent-api/app/actorAnimationHandle";

const BONE_POSE: AnimationPose = {
  bones: {
    Hips: {
      position: { x: 0, y: 1, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 }
    }
  },
  morphTargets: {}
};

const MORPH_ONLY_POSE = { bones: {}, morphTargets: { blink: 1 } } as unknown as AnimationPose;
const EMPTY_POSE: AnimationPose = { bones: {}, morphTargets: {} };

function qrFlags(...shortNames: string[]) {
  return resolveQrFlags({ options: shortNames, env: {} });
}

function poseRecorder() {
  const calls: { pose?: AnimationPose; metadata?: unknown }[] = [];
  return {
    calls,
    setAnimationPose(pose?: AnimationPose, metadata?: unknown) {
      calls.push({ pose, metadata });
      return this;
    }
  };
}

afterEach(() => {
  resetQrAnimationFlags();
  resetEmptyPoseRejections();
});

describe("rejectEmptyAnimationPose (T0.2)", () => {
  it("rejects poses with zero bones and zero morph targets", () => {
    expect(rejectEmptyAnimationPose(EMPTY_POSE)).toBeUndefined();
    expect(rejectEmptyAnimationPose({ bones: {} } as AnimationPose)).toBeUndefined();
    expect(rejectEmptyAnimationPose({} as AnimationPose)).toBeUndefined();
    expect(rejectEmptyAnimationPose(undefined)).toBeUndefined();
    expect(rejectEmptyAnimationPose(null)).toBeUndefined();
  });

  it("accepts poses that carry at least one bone", () => {
    expect(rejectEmptyAnimationPose(BONE_POSE)).toBe(BONE_POSE);
    expect(rejectEmptyAnimationPose({ bones: { Root: {} } } as AnimationPose)).toBeDefined();
  });

  it("accepts a morph-only pose (0 bones, at least one morph target)", () => {
    expect(rejectEmptyAnimationPose(MORPH_ONLY_POSE)).toBe(MORPH_ONLY_POSE);
  });
});

describe("setActorRuntimeAnimationPose (T0.2)", () => {
  it("flag-off stores the empty pose verbatim, exactly as today", () => {
    setQrAnimationFlags(qrFlags());
    const handle = poseRecorder();
    const metadata = { kind: "aura-runtime-node-animation-pose" } as never;
    const stored = setActorRuntimeAnimationPose(handle, EMPTY_POSE, metadata, { nodeId: "n1" });
    expect(stored).toBe(true);
    expect(handle.calls).toEqual([{ pose: EMPTY_POSE, metadata }]);
    expect(consumePendingEmptyPoseRejection("n1")).toBe(false);
  });

  it("flag-on non-strict rejects the empty pose: stores undefined, records one warning, fires the degradation hook", () => {
    setQrAnimationFlags(qrFlags("animation"));
    const handle = poseRecorder();
    const rejected: (string | undefined)[] = [];
    const first = setActorRuntimeAnimationPose(handle, EMPTY_POSE, undefined, { nodeId: "hero", onRejected: (id) => rejected.push(id) });
    const second = setActorRuntimeAnimationPose(handle, EMPTY_POSE, undefined, { nodeId: "hero", onRejected: (id) => rejected.push(id) });
    expect(first).toBe(false);
    expect(second).toBe(false);
    expect(handle.calls).toEqual([
      { pose: undefined, metadata: undefined },
      { pose: undefined, metadata: undefined }
    ]);
    // Warn once per node: the second rejection adds nothing.
    expect(rejected).toEqual(["hero"]);
    expect(consumePendingEmptyPoseRejection("hero")).toBe(true);
    expect(consumePendingEmptyPoseRejection("hero")).toBe(false);
  });

  it("flag-on strict throws ANIMATION_EMPTY_POSE and stores nothing", () => {
    setQrAnimationFlags(qrFlags("animation", "strict"));
    const handle = poseRecorder();
    expect(() => setActorRuntimeAnimationPose(handle, EMPTY_POSE, undefined, { nodeId: "hero" }))
      .toThrowError(expect.objectContaining({ name: ANIMATION_EMPTY_POSE }) as Error);
    expect(handle.calls).toHaveLength(0);
  });

  it("explicit strict option overrides the flag state", () => {
    setQrAnimationFlags(qrFlags("animation"));
    const handle = poseRecorder();
    expect(() => setActorRuntimeAnimationPose(handle, EMPTY_POSE, undefined, { nodeId: "hero", strict: true }))
      .toThrowError(/ANIMATION_EMPTY_POSE/);
  });

  it("flag-on stores non-empty poses with their metadata", () => {
    setQrAnimationFlags(qrFlags("animation"));
    const handle = poseRecorder();
    const metadata = { kind: "aura-runtime-node-animation-pose" } as never;
    expect(setActorRuntimeAnimationPose(handle, BONE_POSE, metadata, { nodeId: "hero" })).toBe(true);
    expect(setActorRuntimeAnimationPose(handle, MORPH_ONLY_POSE, metadata, { nodeId: "hero" })).toBe(true);
    expect(handle.calls).toEqual([
      { pose: BONE_POSE, metadata },
      { pose: MORPH_ONLY_POSE, metadata }
    ]);
  });

  it("flag-on clears a stored pose when the incoming pose is undefined", () => {
    setQrAnimationFlags(qrFlags("animation"));
    const handle = poseRecorder();
    expect(setActorRuntimeAnimationPose(handle, undefined, undefined, { nodeId: "hero" })).toBe(false);
    expect(handle.calls).toEqual([{ pose: undefined, metadata: undefined }]);
  });
});

describe("qrAnimationFlags plumbing", () => {
  it("honours the installed flags and resets cleanly", () => {
    setQrAnimationFlags(qrFlags("animation"));
    expect(qrAnimationFlags().on("A3D_QR_ANIMATION")).toBe(true);
    resetQrAnimationFlags();
    expect(qrAnimationFlags().on("A3D_QR_ANIMATION")).toBe(false);
  });
});
