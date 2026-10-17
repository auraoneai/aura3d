/**
 * Slingshot Siege audio — typed siege-catalog cues over `createGameAudio`
 * (@aura3d/engine). Every cue is a registered CC0 asset synthesized in-repo
 * for the siege family; playback only starts after a user gesture unlocks the
 * AudioContext.
 */
import { createGameAudio, type GameAudio } from "@aura3d/engine";
import { assets } from "../../../../src/aura-assets";

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

type SiegeAssetKey =
  | "gullSiegeDriveHitSfx"
  | "gullSiegeWoodCrackSfx"
  | "gullSiegeMetalClangSfx"
  | "gullSiegeTargetDownSfx"
  | "gullSiegeParChimeSfx"
  | "gullSiegeBogeyStingSfx"
  | "gullSiegeUiConfirmSfx"
  | "gullSiegeAmbientWindSfx";

const CUE_ASSETS: Record<SiegeCue, SiegeAssetKey> = {
  launch: "gullSiegeDriveHitSfx",
  "wood-crack": "gullSiegeWoodCrackSfx",
  "stone-thud": "gullSiegeMetalClangSfx",
  "glass-shatter": "gullSiegeTargetDownSfx",
  "gull-squash": "gullSiegeTargetDownSfx",
  "gull-scare": "gullSiegeBogeyStingSfx",
  ability: "gullSiegeParChimeSfx",
  "windmill-snap": "gullSiegeWoodCrackSfx",
  "star-chime": "gullSiegeParChimeSfx",
  "level-clear": "gullSiegeParChimeSfx",
  "level-fail": "gullSiegeBogeyStingSfx",
  "ui-confirm": "gullSiegeUiConfirmSfx",
  wind: "gullSiegeAmbientWindSfx"
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

let cached: GameAudio<SiegeCue> | null = null;

export function siegeAudio(): { cue(name: SiegeCue): void; unlock(): Promise<void> } {
  if (!cached) {
    const cues = Object.fromEntries(
      (Object.keys(CUE_ASSETS) as SiegeCue[]).map((cue) => {
        const key = CUE_ASSETS[cue];
        const asset = assets[key];
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
  return {
    cue(name) { void audio.cue(name).catch(() => undefined); },
    async unlock() { await audio.unlock().catch(() => undefined); }
  };
}
