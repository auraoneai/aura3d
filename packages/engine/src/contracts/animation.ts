/**
 * C-19 — animation (engine side, CONTRACTS.md). Provider: PRD 06. Flag: A3D_QR_ANIMATION.
 * AuraAnimationSpec (index.ts:1288) gains the PR 0a optional fields.
 */

import type { AuraRuntimeNodeHandle } from "../agent-api/index";
import type { AuraQualityTier } from "@aura3d/rendering/contracts";
import type { AuraQuat } from "./sceneGraph";

// AuraAnimationSpec (index.ts:1288-1304) additions (PR 0a):
//   crossFade?: number | false; transition?: "crossfade" | "inertialize"; warp?: boolean; syncGroup?: string; layer?: string;
//   blendMode?: "override" | "additive"; additiveReference?: { clip?: string; time?: number }; mask?: AuraBoneMaskSpec; weight?: number;
//   rootMotion?: AuraRootMotionSpec | false; fallback?: "error" | "first"; restPoseReset?: boolean
export interface AuraBoneMaskSpec { readonly include?: readonly string[]; readonly exclude?: readonly string[]; readonly humanoid?: "upper-body" | "lower-body" | "head" | "arms"; }
export interface AuraRootMotionSpec { readonly bone?: string; readonly axes?: readonly ("x" | "y" | "z" | "yaw")[]; readonly mode: "apply" | "extract-only"; }
export interface AuraResolvedClipInfo { readonly name: string; readonly duration: number; readonly channelCount: number; readonly hasRootMotionCandidate: boolean; }
export interface AuraActorAnimationStateSnapshot { readonly activeClip: string | null; readonly tracksApplied: number; readonly activeActions: readonly { readonly clip: string; readonly layer: string; readonly weight: number; readonly time: number }[]; readonly timeScale: number; }
export interface AuraBoneSocket { readonly bone: string; worldMatrix(out?: Float32Array): Float32Array; readonly bindWorldMatrix: (out?: Float32Array) => Float32Array; readonly valid: boolean; }
/**
 * C-19 socket attachment — pin a scene node to a bone so the engine resolves
 * the node's transform from the bone's world matrix every frame, after the
 * clip/pose pipeline has run (no one-frame lag, rigid through fast swings).
 * `position`/`rotation`/`scale` are an offset composed in bone space; the
 * target should be a root-level runtime node the route no longer drives.
 */
export interface AuraBoneAttachSpec {
  readonly socket: string;
  readonly target: string | AuraRuntimeNodeHandle;
  readonly position?: readonly [number, number, number];
  /** XYZ Euler radians in bone space. */
  readonly rotation?: readonly [number, number, number];
  readonly scale?: number;
}
/** `playLayer` options. `speed` (GU47 E-H) is the layer clip's playback rate: 1 = authored, 2 = twice as fast, 0 = frozen. */
export interface AuraPlayLayerOptions { weight?: number; fadeIn?: number; mask?: AuraBoneMaskSpec; blendMode?: "override" | "additive"; speed?: number }
/**
 * GU47 E-H — `actor.pose`: procedural per-bone overrides applied every frame
 * after clips, layers, IK and spring bones (the last pose-space write before
 * skinning), so a route can aim a head or a spine without authoring a clip.
 */
export interface AuraActorPoseApi {
  /**
   * Override `bone`'s local rotation (parent space) with `quat` = [x, y, z, w]
   * (normalised on write). Holds until replaced or cleared; a bone the rig does
   * not have is ignored with one `ANIMATION_POSE_UNKNOWN_BONE` warning.
   */
  setLocalRotation(bone: string, quat: AuraQuat): void;
  /** Release one bone's override, or every override with no argument. */
  clear(bone?: string): void;
}
export interface AuraActorAnimationApi {
  crossFadeTo(clip: string, seconds: number, options?: { transition?: "crossfade" | "inertialize"; warp?: boolean }): this;
  playLayer(layer: string, clip: string, options?: AuraPlayLayerOptions): this;
  stopLayer(layer: string, fadeOut?: number): this;
  /** GU47 E-H: procedural bone overrides (see {@link AuraActorPoseApi}). */
  readonly pose: AuraActorPoseApi;
  resolveAnimationClips(): Promise<readonly AuraResolvedClipInfo[]>;
  animationState(): AuraActorAnimationStateSnapshot | undefined;
  socket(bone: string): AuraBoneSocket;
  attach(spec: AuraBoneAttachSpec): () => void;
  readonly ik: { add(spec: unknown): () => void; clear(): void };          // concrete specs: PRD 06 TwoBoneIk/LookAt/Ccd/FootIk
  readonly springBones: { add(spec: unknown): () => void; clear(): void };
  /**
   * T3.8 (PRD-06 §7.2) — retarget-bake another skeleton's compiled clips onto
   * this actor's skeleton and register them by clip name. `source` is a loaded
   * model node (its runtime-node handle or its id, the form a route can reach),
   * a `{skeleton, clips}` pair, or another actor's animation runtime (its
   * `skeletons()`/`compiledClips()`); `map` is a prebuilt
   * `HumanoidRetargetingMap` (CCR-06-4 type pending); without it both rigs are
   * inferred from bone names. Worker + IndexedDB cache
   * are on by default. Returns the registered clip names.
   */
  addClipsFrom(source: unknown, options?: { map?: unknown; hipsScale?: "leg-length" | number; fingers?: boolean }): Promise<readonly string[]>;
}
// AuraRuntimeNodeHandle gains these members on model nodes (via C-37 extension "prd06.animation")
export interface AuraCreateAppAnimationOptions { readonly strict?: boolean; readonly defaults?: "3.0" | "3.1"; readonly mixer?: "pose" | "legacy"; readonly tier?: AuraQualityTier; }
// renderer options additions: skinnedShadows?: boolean; morph?: "gpu" | "cpu"; skinnedPbr?: "unified" | "fork"
export interface AuraAnimationDiagnostics { readonly actors: readonly { readonly id: string; readonly activeClip: string | null; readonly tracksApplied: number; readonly activeActions: number; readonly mixerMs: number; readonly constraintsMs: number; readonly springsMs: number; readonly paletteBytes: number; readonly morphActive: number; readonly morphDropped: number; readonly cpuMs: number }[]; }

/**
 * PR 0a stub animation api: single-clip state over today's legacy animation
 * fields (activeClip from the snapshot's animation spec); sockets report
 * `valid: false` until PRD 06 lands.
 */
export class StubActorAnimationApi implements AuraActorAnimationApi {
  private clip: string | null = null;

  constructor(private readonly handle: AuraRuntimeNodeHandle | undefined) {}

  crossFadeTo(clip: string, _seconds: number, _options?: { transition?: "crossfade" | "inertialize"; warp?: boolean }): this {
    this.clip = clip;
    return this;
  }
  playLayer(layer: string, clip: string, _options?: AuraPlayLayerOptions): this {
    void layer;
    this.clip = clip;
    return this;
  }
  stopLayer(_layer: string, _fadeOut?: number): this {
    return this;
  }
  /** Stub: overrides are accepted and dropped (no pose pipeline without PRD 06). */
  readonly pose: AuraActorPoseApi = { setLocalRotation: () => { /* noop */ }, clear: () => { /* noop */ } };
  async resolveAnimationClips(): Promise<readonly AuraResolvedClipInfo[]> {
    return [];
  }
  animationState(): AuraActorAnimationStateSnapshot | undefined {
    if (this.clip === null) return undefined;
    return { activeClip: this.clip, tracksApplied: 0, activeActions: [], timeScale: 1 };
  }
  socket(bone: string): AuraBoneSocket {
    return { bone, worldMatrix: (out?: Float32Array) => out ?? new Float32Array(16), bindWorldMatrix: (out?: Float32Array) => out ?? new Float32Array(16), valid: false };
  }
  attach(_spec: AuraBoneAttachSpec): () => void {
    return () => { /* noop */ };
  }
  readonly ik = { add: (_spec: unknown) => () => { /* noop */ }, clear: () => { /* noop */ } };
  readonly springBones = { add: (_spec: unknown) => () => { /* noop */ }, clear: () => { /* noop */ } };
  async addClipsFrom(_source: unknown, _options?: { map?: unknown; hipsScale?: "leg-length" | number; fingers?: boolean }): Promise<readonly string[]> {
    return [];
  }
}
