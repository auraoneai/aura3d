/**
 * T1.10 type conformance (C-19, PRD-06): every `AuraAnimationSpec` member the
 * lane wires compiles on the public spec type, and invalid member shapes are
 * rejected at compile time.
 *
 * Compiled by `tsc -p tsconfig.check.json` (vitest does not pick up
 * `*.test-d.ts`); assertions follow the `if (false)` + `@ts-expect-error`
 * convention used in `agent-api.test.ts`.
 */
import type { AuraAnimationSpec } from "../../../packages/engine/src/agent-api/nodes/types";

const spec: AuraAnimationSpec = {
  clip: "Walk",
  loop: true,
  speed: 0.5,
  crossFade: 0.25,
  transition: "inertialize",
  warp: true,
  syncGroup: "locomotion",
  layer: "upper-body",
  blendMode: "additive",
  additiveReference: { clip: "Idle", time: 0.5 },
  mask: { include: ["Spine", "Spine1"], humanoid: "upper-body" },
  weight: 0.8,
  rootMotion: { mode: "extract-only", bone: "Hips", axes: ["x", "z"] },
  fallback: "first",
  restPoseReset: false
};
void spec;

const minimalSpec: AuraAnimationSpec = { clip: "Idle", crossFade: false, rootMotion: false };
void minimalSpec;

if (false) {
  // @ts-expect-error `transition` accepts only "crossfade" | "inertialize".
  const badTransition: AuraAnimationSpec = { transition: "lerp" };
  void badTransition;

  // @ts-expect-error `blendMode` accepts only "override" | "additive".
  const badBlend: AuraAnimationSpec = { blendMode: "screen" };
  void badBlend;

  // @ts-expect-error `fallback` accepts only "error" | "first".
  const badFallback: AuraAnimationSpec = { fallback: "skip" };
  void badFallback;

  // @ts-expect-error `mask.humanoid` accepts only the named presets.
  const badMask: AuraAnimationSpec = { mask: { humanoid: "torso" } };
  void badMask;

  // @ts-expect-error `rootMotion.mode` accepts only "apply" | "extract-only".
  const badRootMotion: AuraAnimationSpec = { rootMotion: { mode: "consume" } };
  void badRootMotion;
}
