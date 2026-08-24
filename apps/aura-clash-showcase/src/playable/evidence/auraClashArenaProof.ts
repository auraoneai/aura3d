import type { AuraClashMoveId } from "../combat/auraClashMoveData";
import type { AuraClashClipReadiness } from "../animation/auraClashClipMaps";
import type { AuraClashArenaStageEvidence } from "../arena/AuraClashArenaStage";
import type { AuraClashArenaTweaksEvidence } from "../arena/ArenaTweaksPanel";
import type { AuraClashFighterControllerBoundary } from "../combat/AuraClashFighterController";
import type { AuraClashLightingEvidence } from "../../rendering/GameLighting";
import type { AuraClashPostProcessEvidence } from "../../rendering/GamePostProcess";

export const AURA_CLASH_ARENA_PROOF_SCHEMA_VERSION = "aura-clash-arena-proof/v1";
export const AURA_CLASH_ARENA_PROOF_RELEASE = "1.4.5";
export const AURA_CLASH_ARENA_PROOF_VERSION = "aura-clash-arena-production-gltf-animation-crossfade-reactions";

export type AuraClashFighterAction =
  | "idle"
  | "walk"
  | "run"
  | "jump"
  | "down"
  | "guard"
  | "light"
  | "heavy"
  | "special"
  | "hurt"
  | "recover"
  | "knockdown"
  | "ko";

export interface AuraClashPerformanceProof {
  readonly frameTimeMs: number;
  readonly fps: number;
  readonly drawCalls: number;
  readonly budgetOk: boolean;
}

export interface AuraClashAudioProof {
  readonly enabled: boolean;
  readonly muted: boolean;
  readonly musicReady: boolean;
  readonly sfxReady: boolean;
  readonly lastCue: string | null;
  readonly recentCues: readonly string[];
  readonly cueCount: number;
  readonly typedAssetCount: number;
  readonly assetUrls: readonly string[];
  readonly oscillatorFallback: false;
  readonly audioErrors: readonly string[];
  /** AC-A6: named bus levels, published so independent levels are observable evidence. */
  readonly buses?: readonly { readonly id: string; readonly volume: number; readonly muted: boolean }[];
  /** AC-A6: true while the round-over KO duck holds the sfx bus down. */
  readonly koDuckActive?: boolean;
  /** AC-A6: the sfx bus level while ducked (null when no duck is active). */
  readonly koDuckLevel?: number | null;
}

export interface AuraClashDeterministicReplayProof {
  readonly kind: "aura-clash-deterministic-replay-proof";
  readonly runner: "game.runSimulation";
  readonly inputReplay: "game.inputReplay";
  readonly frameCount: number;
  readonly eventCount: number;
  readonly finalHash: string;
  readonly repeatedFinalHash: string;
  readonly stable: boolean;
  readonly exportedReplay: {
    readonly schemaVersion: "aura-game-input-replay/v1";
    readonly checksum: string;
    readonly frameCount: number;
    readonly duration: number;
  };
  readonly finalSnapshot: {
    readonly playerX: number;
    readonly rivalHp: number;
    readonly hits: number;
    readonly ko: boolean;
    readonly roundTime: number;
  };
}

export interface AuraClashProofFighter {
  readonly name: string;
  readonly health: number;
  readonly meter: number;
  readonly x: number;
  readonly y: number;
  readonly grounded: boolean;
  readonly action: AuraClashFighterAction;
  readonly activeClip: string;
  readonly attacking: AuraClashMoveId | null;
  /** World-facing direction used by combat and the rendered actor root. */
  readonly facing: 1 | -1;
  /** Final actor-root transform submitted after animation, facing, lunge, and secondary motion. */
  readonly renderedRoot: {
    readonly position: readonly [number, number, number];
    readonly rotation: readonly [number, number, number, number];
  };
}

export interface AuraClashArenaProof {
  readonly schemaVersion: typeof AURA_CLASH_ARENA_PROOF_SCHEMA_VERSION;
  readonly route: string;
  readonly app: "Aura Clash Arena";
  readonly release: typeof AURA_CLASH_ARENA_PROOF_RELEASE;
  readonly version: string;
  readonly status: "loading" | "running" | "paused" | "error";
  readonly error: string | null;
  readonly frame: number;
  readonly roundTime: number;
  readonly totalHits: number;
  readonly lastHitFrame: number;
  readonly callout: string;
  readonly visibleFighterAsset: string;
  readonly fighterAssets: {
    readonly player: { readonly id: string; readonly url: string; readonly hash: string };
    readonly rival: { readonly id: string; readonly url: string; readonly hash: string };
    readonly distinct: boolean;
    readonly releaseReady: boolean;
  };
  readonly noPrimitiveFighters: true;
  readonly renderer: {
    readonly surface: "aura3d-production-gltf-animation";
    readonly backend: string;
    readonly drawCalls: number;
  };
  readonly player: AuraClashProofFighter;
  readonly rival: AuraClashProofFighter;
  readonly animation: {
    readonly visibleSkinnedGlb: true;
    readonly skinnedDrawItems: number;
    readonly playerSkinningBindings: number;
    readonly rivalSkinningBindings: number;
    readonly playerLastTracks: number;
    readonly rivalLastTracks: number;
    readonly playerLastSkinningPalettes: number;
    readonly rivalLastSkinningPalettes: number;
    readonly clips: readonly string[];
    readonly clipReadiness?: AuraClashClipReadiness;
  };
  readonly runtime: {
    readonly frameLoop: boolean;
    readonly input: boolean;
    readonly deterministicCombat: boolean;
    readonly hitWindows: boolean;
    readonly hud: boolean;
    readonly evidence: boolean;
  };
  readonly controls: {
    readonly lastInput: string;
    readonly downSupported: boolean;
    readonly specialRequiresMeter: boolean;
    readonly koLocked: boolean;
    readonly resetCount: number;
  };
  readonly stage: AuraClashArenaStageEvidence;
  /**
   * Camera response to combat, read from the frame volume the renderer actually received.
   *
   * `cameraFrameBounds` used to be a fixed literal, so a KO, a heavy connect and an idle round were
   * framed identically. These fields exist so "camera feedback" is a measurable claim: `punchIn` and
   * `frameWidthUnits` can only differ from their resting values while a hit-stop the simulation set is
   * still decaying.
   */
  readonly camera: {
    /** Peak `hitStopRemaining` across both fighters this frame, in seconds. */
    readonly impactStrength: number;
    /** Normalised punch-in, 0 at rest and 1 at the 0.13s special-move hit-stop peak. */
    readonly punchIn: number;
    /** Whether the widened, lifted round-over framing is active. */
    readonly roundOverFraming: boolean;
    /** Horizontal extent of the frame volume, so a punch-in is verifiable rather than declared. */
    readonly frameWidthUnits: number;
    /** Resting horizontal extent, for comparison against `frameWidthUnits`. */
    readonly restingFrameWidthUnits: number;
    /** Whether the camera is responding to combat rather than sitting at its resting volume. */
    readonly respondingToCombat: boolean;
    /** Round-over presentation has no residual hit-stop or camera jitter. */
    readonly settled: boolean;
    /** Exact frame volume submitted to the renderer for this proof frame. */
    readonly frameBounds?: {
      readonly min: readonly [number, number, number];
      readonly max: readonly [number, number, number];
    };
    /** Manifest-bound full-body clearance inside the submitted frame volume. */
    readonly fighterFraming?: {
      readonly playerFullBodyInFrame: boolean;
      readonly rivalFullBodyInFrame: boolean;
      readonly minimumMarginUnits: number;
      readonly groundLineMarginUnits: number;
      readonly stableGroundLine: boolean;
    };
  };
  readonly tweaks: AuraClashArenaTweaksEvidence;
  readonly fighterController: AuraClashFighterControllerBoundary;
  readonly lighting: AuraClashLightingEvidence;
  readonly postProcess: AuraClashPostProcessEvidence;
  readonly performance: AuraClashPerformanceProof;
  readonly audio: AuraClashAudioProof;
  readonly deterministicReplay: AuraClashDeterministicReplayProof;
  /**
   * New-feel evidence for the combat picture: victim flash, special screen freeze, and the running
   * rival AI role. Presentation-only quantities measured from route state (no combat-sim mutation).
   */
  readonly feel?: {
    /** Peak confirmed-hit flash seconds currently active on the player rig (0 at rest). */
    readonly playerFlashStrength: number;
    /** Peak confirmed-hit flash seconds currently active on the rival rig (0 at rest). */
    readonly rivalFlashStrength: number;
    /** Special screen-freeze seconds currently active on the player rig (0 at rest). */
    readonly playerSpecialFreeze: number;
    /** The rival AI role resolved for the current frame. */
    readonly rivalAiRole: string;
    /** Whether input buffering is fighter-length (6-8 frames). */
    readonly fighterLengthBuffering: boolean;
    /** AC-A1: decaying camera impulse accumulated from authored `camera.impulse` clip events. */
    readonly clipImpulseStrength?: number;
    /** AC-A7: the named createCombatAi preset driving the rival this frame. */
    readonly rivalAiPreset?: string;
    /** AC-A7: the engine AI's last decision reason (diagnostics). */
    readonly rivalAiDecisionReason?: string;
    /** AC-A3: synchronized crowd cheer strength in [0, 1] this frame. */
    readonly crowdCheer?: number;
    /** True while a living fighter is at or below the authored low-health threshold. */
    readonly lowHealthTension?: boolean;
    /** Low-health tension freezes crowd/sign secondary motion instead of adding flashes. */
    readonly lowHealthSecondaryMotionSuppressed?: boolean;
  };
  /** AC-A1/AC-A3/AC-A4/AC-A5 presentation telemetry (additive). */
  readonly presentation?: {
    /** Cosmetic clip-event firings by lane since mount (`sfx`, `vfx`, `camera.impulse`, `footstep`). */
    readonly clipEventsFired: Readonly<Record<string, number>>;
    /** Crowd pool size — one instanced draw call regardless of this count. */
    readonly crowdInstanceCount: number;
    readonly crowdInstancedDrawItems: 1;
    /** True when either spring-joint sign is still swinging. */
    readonly signsSwinging: boolean;
    /** The ceremony phrase currently rendered in-scene, or null. */
    readonly ceremonyText: string | null;
    /** Latest combat-language state, published from resolved runtime events. */
    readonly lastOutcome?: "neutral" | "hit" | "block" | "whiff" | "guard-break" | "special" | "ko";
    /** Renderer-owned active impact kinds; whiffs intentionally publish an empty list. */
    readonly activeImpactKinds?: readonly string[];
  };
  /** AC-A2 training replay state (debug-gated; absent fields mean the feature is off). */
  readonly trainingReplay?: {
    readonly enabled: boolean;
    readonly bufferedSeconds: number;
    readonly scrubOffsetSeconds: number;
    readonly samples: number;
    readonly scrubLabel: string | null;
  };
  readonly engineCombat: {
    readonly frame: number;
    readonly activeAttacks: number;
    readonly events: readonly string[];
    readonly playerHealth: number;
    readonly rivalHealth: number;
    readonly playerGuarding: boolean;
    readonly rivalGuarding: boolean;
  };
}

export type AuraClashArenaProofInput = Omit<
  AuraClashArenaProof,
  "schemaVersion" | "route" | "app" | "release" | "version" | "noPrimitiveFighters"
> & {
  readonly route?: string;
  readonly version?: string;
};

export function createAuraClashArenaProof(input: AuraClashArenaProofInput): AuraClashArenaProof {
  return {
    schemaVersion: AURA_CLASH_ARENA_PROOF_SCHEMA_VERSION,
    route: input.route ?? "/playable/",
    app: "Aura Clash Arena",
    release: AURA_CLASH_ARENA_PROOF_RELEASE,
    version: input.version ?? AURA_CLASH_ARENA_PROOF_VERSION,
    noPrimitiveFighters: true,
    status: input.status,
    error: input.error,
    frame: input.frame,
    roundTime: input.roundTime,
    totalHits: input.totalHits,
    lastHitFrame: input.lastHitFrame,
    callout: input.callout,
    visibleFighterAsset: input.visibleFighterAsset,
    fighterAssets: input.fighterAssets,
    renderer: input.renderer,
    player: input.player,
    rival: input.rival,
    animation: input.animation,
    runtime: input.runtime,
    controls: input.controls,
    stage: input.stage,
    camera: input.camera,
    tweaks: input.tweaks,
    fighterController: input.fighterController,
    lighting: input.lighting,
    postProcess: input.postProcess,
    performance: input.performance,
    audio: input.audio,
    deterministicReplay: input.deterministicReplay,
    engineCombat: input.engineCombat,
    feel: input.feel ?? {
      playerFlashStrength: 0,
      rivalFlashStrength: 0,
      playerSpecialFreeze: 0,
      rivalAiRole: "neutral",
      fighterLengthBuffering: true
    },
    ...(input.presentation ? { presentation: input.presentation } : {}),
    ...(input.trainingReplay ? { trainingReplay: input.trainingReplay } : {})
  };
}
