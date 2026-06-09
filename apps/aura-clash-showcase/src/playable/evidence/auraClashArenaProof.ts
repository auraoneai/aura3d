import type { AuraClashMoveId } from "../combat/auraClashMoveData";
import type { AuraClashClipReadiness } from "../animation/auraClashClipMaps";
import type { AuraClashArenaStageEvidence } from "../arena/AuraClashArenaStage";
import type { AuraClashArenaTweaksEvidence } from "../arena/ArenaTweaksPanel";
import type { AuraClashFighterControllerBoundary } from "../combat/AuraClashFighterController";
import type { AuraClashLightingEvidence } from "../../rendering/GameLighting";
import type { AuraClashPostProcessEvidence } from "../../rendering/GamePostProcess";

export const AURA_CLASH_ARENA_PROOF_SCHEMA_VERSION = "aura-clash-arena-proof/v1";
export const AURA_CLASH_ARENA_PROOF_RELEASE = "1.3.2";
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
  readonly tweaks: AuraClashArenaTweaksEvidence;
  readonly fighterController: AuraClashFighterControllerBoundary;
  readonly lighting: AuraClashLightingEvidence;
  readonly postProcess: AuraClashPostProcessEvidence;
  readonly performance: AuraClashPerformanceProof;
  readonly audio: AuraClashAudioProof;
  readonly deterministicReplay: AuraClashDeterministicReplayProof;
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
    tweaks: input.tweaks,
    fighterController: input.fighterController,
    lighting: input.lighting,
    postProcess: input.postProcess,
    performance: input.performance,
    audio: input.audio,
    deterministicReplay: input.deterministicReplay,
    engineCombat: input.engineCombat
  };
}
