/**
 * PRD-06 T0.19 — C-19/C-38 type assertions against the pre-declared contract
 * types. Compile-time only: `tsc -p tsconfig.build.json --noEmit` fails if the
 * declared shapes drift from what the lane's code relies on.
 */

import type {
  AuraActorAnimationApi,
  AuraActorAnimationStateSnapshot,
  AuraAnimationDiagnostics,
  AuraBoneSocket,
  AuraCreateAppAnimationOptions,
  AuraResolvedClipInfo
} from "../../../packages/engine/src/contracts/animation.js";
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
