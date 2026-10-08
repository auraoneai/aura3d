/**
 * PRD-06 T0.19 — C-19/C-38 type assertions against the pre-declared contract
 * types, plus T1.10's `AuraAnimationSpec` member conformance (C-19, PRD-06):
 * every member the lane wires compiles on the public spec type, and invalid
 * member shapes are rejected at compile time.
 *
 * Compiled by `tsc -p tsconfig.check.json` (vitest does not pick up
 * `*.test-d.ts`); assertions follow the `if (false)` + `@ts-expect-error`
 * convention used in `agent-api.test.ts`.
 */

import type {
  AuraActorAnimationApi,
  AuraActorAnimationStateSnapshot,
  AuraAnimationDiagnostics,
  AuraBoneSocket,
  AuraCreateAppAnimationOptions,
  AuraResolvedClipInfo
} from "../../../packages/engine/src/contracts/animation.js";
import type { AuraAnimationSpec } from "../../../packages/engine/src/agent-api/nodes/types";
import type { AuraQualityTier } from "@aura3d/rendering/contracts";
import type { Prd06ResolvedOptions } from "../../../packages/engine/src/agent-api/compiler/animation.js";

/* ---------- C-38 app options ---------- */

const options: AuraCreateAppAnimationOptions = {
  strict: true,
  defaults: "3.1",
  mixer: "pose",
  tier: "ultra"
};
const defaultsEra: "3.0" | "3.1" = options.defaults!;
const mixerKind: "pose" | "legacy" = options.mixer!;
const tier: AuraQualityTier = options.tier!;
void defaultsEra; void mixerKind; void tier;

/* ---------- resolved options ---------- */

const resolved: Prd06ResolvedOptions = {
  strict: true,
  defaults: "3.0",
  mixer: "legacy",
  tier: "medium"
};
const resolvedTier: AuraQualityTier = resolved.tier;
void resolvedTier;

/* ---------- C-19 snapshot shape ---------- */

const snapshot: AuraActorAnimationStateSnapshot = {
  activeClip: "Walk",
  tracksApplied: 42,
  activeActions: [{ clip: "Walk", layer: "base", weight: 1, time: 0.4 }],
  timeScale: 1
};
const nullableClip: string | null = snapshot.activeClip;
const actionTime: number = snapshot.activeActions[0]!.time;
const actionLayer: string = snapshot.activeActions[0]!.layer;
void nullableClip; void actionTime; void actionLayer;

/* ---------- C-19 api members the lane overrides ---------- */

declare const api: AuraActorAnimationApi;
const maybeSnapshot: AuraActorAnimationStateSnapshot | undefined = api.animationState();
const socket: AuraBoneSocket = api.socket("Hips");
const socketMatrix: Float32Array = socket.worldMatrix();
const socketMatrixOut: Float32Array = socket.worldMatrix(new Float32Array(16));
const socketValid: boolean = socket.valid;
const clipInfos: Promise<readonly AuraResolvedClipInfo[]> = api.resolveAnimationClips();
void maybeSnapshot; void socketMatrix; void socketMatrixOut; void socketValid; void clipInfos;

/* ---------- C-31 diagnostics row ---------- */

const diagnostics: AuraAnimationDiagnostics = {
  actors: [{
    id: "thief",
    activeClip: "sprint",
    tracksApplied: 65,
    activeActions: 2,
    mixerMs: 0,
    constraintsMs: 0,
    springsMs: 0,
    paletteBytes: 0,
    morphActive: 3,
    morphDropped: 0,
    cpuMs: 0
  }]
};
const actorRowId: string = diagnostics.actors[0]!.id;
void actorRowId;

/* ---------- T1.10: `AuraAnimationSpec` member conformance ---------- */

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
