/**
 * Slingshot Siege audio — typed siege-catalog cues over `createGameAudio`
 * (@aura3d/engine). Every cue is a registered CC0 asset synthesized in-repo
 * for the siege family; playback only starts after a user gesture (pointer or
 * key) unlocks the AudioContext. The mute toggle silences the master bus and
 * is remembered across visits.
 */
import { createGameAudio, type GameAudio } from "@aura3d/engine";
import { assets } from "../aura-assets.route";

export type SiegeCue =
  | "launch"
  | "wood-crack"
  | "stone-thud"
  | "glass-shatter"
  | "gull-squash"
  | "gull-scare"
  | "ability"
  | "windmill-snap"
  | "star-chime"
  | "level-clear"
  | "level-fail"
  | "ui-confirm"
  | "wind";

/** Static `assets.<id>` references, so per-route typegen sees every sound this game ships. */
const CUE_ASSETS: Record<SiegeCue, { readonly url: string; readonly hash: string }> = {
  launch: assets.gullSiegeDriveHitSfx,
  "wood-crack": assets.gullSiegeWoodCrackSfx,
  "stone-thud": assets.gullSiegeMetalClangSfx,
  "glass-shatter": assets.gullSiegeTargetDownSfx,
  "gull-squash": assets.gullSiegeTargetDownSfx,
  "gull-scare": assets.gullSiegeBogeyStingSfx,
  ability: assets.gullSiegeParChimeSfx,
  "windmill-snap": assets.gullSiegeWoodCrackSfx,
  "star-chime": assets.gullSiegeParChimeSfx,
  "level-clear": assets.gullSiegeParChimeSfx,
  "level-fail": assets.gullSiegeBogeyStingSfx,
  "ui-confirm": assets.gullSiegeUiConfirmSfx,
  wind: assets.gullSiegeAmbientWindSfx
};

const CUE_BUS: Record<SiegeCue, "sfx" | "ui" | "ambience"> = {
  launch: "sfx",
  "wood-crack": "sfx",
  "stone-thud": "sfx",
  "glass-shatter": "sfx",
  "gull-squash": "sfx",
  "gull-scare": "sfx",
  ability: "sfx",
  "windmill-snap": "sfx",
  "star-chime": "ui",
  "level-clear": "ui",
  "level-fail": "ui",
  "ui-confirm": "ui",
  wind: "ambience"
};

export const MUTE_STORE_KEY = "slingshot-siege-audio";

export interface SiegeAudio {
  cue(name: SiegeCue): void;
  /** Unlock the context from a user gesture and start the wind ambience once. */
  unlock(): Promise<void>;
  setMuted(muted: boolean): void;
  readonly muted: boolean;
  /** Small evidence snapshot for capture tooling. */
  state(): { readonly muted: boolean; readonly unlocked: boolean; readonly windStarted: boolean; readonly engineMuted: boolean | null; readonly sfxLevel: number | null };
}

export function readStoredMute(): boolean {
  try { return localStorage.getItem(MUTE_STORE_KEY) === "muted"; } catch { return false; }
}

let cached: GameAudio<SiegeCue> | null = null;
let api: SiegeAudio | null = null;

export function siegeAudio(): SiegeAudio {
  if (api) return api;
  if (!cached) {
    const cues = Object.fromEntries(
      (Object.keys(CUE_ASSETS) as SiegeCue[]).map((cue) => {
        const asset = CUE_ASSETS[cue];
        return [
          cue,
          {
            id: cue,
            bus: CUE_BUS[cue],
            volume: cue === "wind" ? 0.28 : CUE_BUS[cue] === "ui" ? 0.6 : 0.72,
            loop: cue === "wind",
            asset: { url: asset.url, hash: asset.hash, format: "wav" as const, license: "CC0-1.0", author: "Aura3D synthesis" }
          }
        ];
      })
    ) as unknown as Record<SiegeCue, Parameters<typeof createGameAudio<SiegeCue>>[0]["cues"][SiegeCue]>;
    cached = createGameAudio({
      browserContext: true,
      buses: [
        { id: "sfx", volume: 0.85 },
        { id: "ui", volume: 0.6 },
        { id: "ambience", volume: 0.4 }
      ],
      cues
    });
  }
  const audio = cached;
  let muted = readStoredMute();
  let unlocked = false;
  let windStarted = false;
  audio.setMuted(muted);
  api = {
    cue(name) { void audio.cue(name).catch(() => undefined); },
    async unlock() {
      if (unlocked) return;
      unlocked = true;
      await audio.unlock().catch(() => undefined);
      if (!windStarted) {
        windStarted = true;
        void audio.cue("wind").catch(() => { windStarted = false; });
      }
    },
    setMuted(next) {
      muted = next;
      audio.setMuted(next);
      try { localStorage.setItem(MUTE_STORE_KEY, next ? "muted" : "on"); } catch { /* private mode */ }
    },
    get muted() { return muted; },
    state() {
      let engineMuted: boolean | null = null;
      let sfxLevel: number | null = null;
      try {
        const ev = audio.evidence;
        engineMuted = ev.muted;
        sfxLevel = ev.busLevels.find((b) => b.id === "sfx")?.level ?? null;
      } catch { /* evidence optional */ }
      return { muted, unlocked, windStarted, engineMuted, sfxLevel };
    }
  };
  return api;
}
