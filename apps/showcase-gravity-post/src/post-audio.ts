/**
 * Gravity Post — audio controller + cue manifest.
 *
 * All ten cues resolve through typed CLI-registered audio assets from the root
 * generated map (no raw URLs, no invented ids). Loop-feel cues (burn, warp,
 * ambient) are short one-shot buffers retrigged by gameplay state, so a hum
 * plays exactly while its system is active and stops the moment it is not.
 */
import { createGameAudio, type GameAudio } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

export type GravityPostCue =
  | "launch-whoosh"
  | "burn-loop"
  | "dock-lock"
  | "bounce-off"
  | "pod-lost"
  | "contract-clear"
  | "assist-chime"
  | "warp-hum"
  | "ui-confirm"
  | "ambient-space";

export type GravityPostBus = "engine" | "mail" | "system" | "space";

interface CueDefinitionSpec {
  readonly cue: GravityPostCue;
  readonly bus: GravityPostBus;
  readonly volume: number;
  readonly assetKey: GravityPostAssetKey;
  /** Seconds between retrigs while the owning system stays active. */
  readonly retrigSeconds?: number;
}

export type GravityPostAssetKey =
  | "gravityPostLaunchWhooshSfx"
  | "gravityPostBurnLoopSfx"
  | "gravityPostDockLockSfx"
  | "gravityPostBounceOffSfx"
  | "gravityPostPodLostSfx"
  | "gravityPostContractClearSfx"
  | "gravityPostAssistChimeSfx"
  | "gravityPostWarpHumSfx"
  | "gravityPostUiConfirmSfx"
  | "gravityPostAmbientSpaceSfx";

export const GRAVITY_POST_AUDIO_MANIFEST: Readonly<Record<GravityPostCue, CueDefinitionSpec>> = {
  "launch-whoosh": { cue: "launch-whoosh", bus: "engine", volume: 0.9, assetKey: "gravityPostLaunchWhooshSfx" },
  "burn-loop": { cue: "burn-loop", bus: "engine", volume: 0.55, assetKey: "gravityPostBurnLoopSfx", retrigSeconds: 0.3 },
  "dock-lock": { cue: "dock-lock", bus: "mail", volume: 1, assetKey: "gravityPostDockLockSfx" },
  "bounce-off": { cue: "bounce-off", bus: "mail", volume: 0.85, assetKey: "gravityPostBounceOffSfx" },
  "pod-lost": { cue: "pod-lost", bus: "system", volume: 0.95, assetKey: "gravityPostPodLostSfx" },
  "contract-clear": { cue: "contract-clear", bus: "mail", volume: 0.95, assetKey: "gravityPostContractClearSfx" },
  "assist-chime": { cue: "assist-chime", bus: "mail", volume: 0.7, assetKey: "gravityPostAssistChimeSfx" },
  "warp-hum": { cue: "warp-hum", bus: "engine", volume: 0.5, assetKey: "gravityPostWarpHumSfx", retrigSeconds: 0.52 },
  "ui-confirm": { cue: "ui-confirm", bus: "system", volume: 0.5, assetKey: "gravityPostUiConfirmSfx" },
  "ambient-space": { cue: "ambient-space", bus: "space", volume: 0.4, assetKey: "gravityPostAmbientSpaceSfx", retrigSeconds: 6.1 }
};

function typedAudio(key: GravityPostAssetKey): { url: string; hash: string; format: "wav" } {
  const asset = assets[key];
  if (!asset || !asset.url || !asset.hash) {
    throw new Error("Gravity Post audio asset " + key + " is missing its generated url/hash.");
  }
  return { url: asset.url, hash: asset.hash, format: "wav" };
}

export interface GravityPostAudioProof {
  readonly cueCount: number;
  readonly busCount: number;
  readonly unlocked: boolean;
  readonly contextState: string;
  readonly playedCueCount: number;
  readonly lastCue: GravityPostCue | null;
  readonly recentCues: readonly GravityPostCue[];
  readonly errors: readonly string[];
}

export interface GravityPostAudio {
  /** Advance the retrig clock; call once per frame with frame dt. */
  readonly tick: (dtSeconds: number) => void;
  readonly play: (cue: GravityPostCue) => void;
  readonly unlock: () => Promise<void>;
  readonly proof: () => GravityPostAudioProof;
  readonly dispose: () => Promise<void>;
}

export function createGravityPostAudio(): GravityPostAudio {
  const recent: GravityPostCue[] = [];
  let lastPlayedAt = new Map<GravityPostCue, number>();
  let clockSeconds = 0;

  const cueEntries = Object.fromEntries(
    Object.values(GRAVITY_POST_AUDIO_MANIFEST).map((definition) => [
      definition.cue,
      { id: definition.cue, bus: definition.bus, volume: definition.volume, asset: typedAudio(definition.assetKey) }
    ])
  ) as unknown as Record<GravityPostCue, Parameters<typeof createGameAudio<GravityPostCue>>[0]["cues"][GravityPostCue]>;

  const audio: GameAudio<GravityPostCue> = createGameAudio<GravityPostCue>({
    browserContext: true,
    buses: [
      { id: "engine", volume: 0.8 },
      { id: "mail", volume: 1 },
      { id: "system", volume: 0.7 },
      { id: "space", volume: 0.35 }
    ],
    cues: cueEntries
  });

  return {
    tick(dtSeconds) {
      clockSeconds += Math.max(0, dtSeconds);
    },
    play(cue) {
      recent.push(cue);
      if (recent.length > 32) recent.shift();
      const definition = GRAVITY_POST_AUDIO_MANIFEST[cue];
      if (definition.retrigSeconds !== undefined) {
        const lastAt = lastPlayedAt.get(cue);
        if (lastAt !== undefined && clockSeconds - lastAt < definition.retrigSeconds) return;
        lastPlayedAt.set(cue, clockSeconds);
      }
      void audio.cue(cue).catch(() => {
        /* evidence keeps the suppressed count; route must never throw on audio */
      });
    },
    async unlock() {
      await audio.unlock();
    },
    proof() {
      const evidence = audio.evidence;
      return {
        cueCount: evidence.cueCount,
        busCount: evidence.busCount,
        unlocked: evidence.unlocked,
        contextState: evidence.contextState,
        playedCueCount: evidence.playedCueCount,
        lastCue: evidence.lastCue as GravityPostCue | null,
        recentCues: recent.slice(),
        errors: evidence.errors.slice()
      };
    },
    async dispose() {
      await audio.dispose();
      lastPlayedAt = new Map();
    }
  };
}
