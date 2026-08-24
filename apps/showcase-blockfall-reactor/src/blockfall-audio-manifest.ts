/**
 * Blockfall Reactor audio manifest — maps gameplay cues to typed, CLI-registered audio.
 *
 * Every cue resolves to a generated \`assets.blockfall*\` audio entry committed through
 * \`aura3d assets add\` from \`scripts/build-sfx.mjs\` (original CC0 synthesis, author
 * "Aura3D synthesis"). No raw URLs, no invented ids — playback uses the typed asset
 * member so provenance stays in \`aura.assets.json\`, exactly like the Clash/Skyline
 * manifest discipline.
 *
 * BF-A1 bus plan:
 * - every gameplay cue plays on the \`sfx\` bus,
 * - the looping reactor hum plays on its own \`ambient\` bus,
 * - each additive music intensity stem owns its own \`music-stem-N\` bus so level-based
 *   layering is volume automation on persistent loops rather than start/stop churn.
 */
import { assets } from "../../../src/aura-assets";

export type BlockfallAudioCue =
  | "move"
  | "rotate"
  | "lock"
  | "line-clear"
  | "quad"
  | "level-up"
  | "hold-swap"
  | "hard-drop"
  | "game-over"
  | "ambient-hum"
  | "music-stem-1"
  | "music-stem-2"
  | "music-stem-3"
  | "music-stem-4";

export interface BlockfallAudioAssetReference {
  readonly key: BlockfallAudioAssetKey;
  readonly typedAssetMember: string;
  readonly url: string;
  readonly hash: string;
  readonly format: "wav";
  readonly license: "CC0-1.0";
  readonly author: "Aura3D synthesis";
}

export type BlockfallAudioAssetKey =
  | "blockfallMoveSfx"
  | "blockfallRotateSfx"
  | "blockfallLockThudSfx"
  | "blockfallLineClearSfx"
  | "blockfallQuadFanfareSfx"
  | "blockfallLevelUpSfx"
  | "blockfallHoldSwapSfx"
  | "blockfallHardDropSlamSfx"
  | "blockfallGameOverStingSfx"
  | "blockfallReactorHumLoop"
  | "blockfallMusicStem1"
  | "blockfallMusicStem2"
  | "blockfallMusicStem3"
  | "blockfallMusicStem4";

/** Cue id -> typed asset key. One distinct synthesized asset per gameplay cue. */
export const blockfallAudioCueAssetKeys: Record<BlockfallAudioCue, BlockfallAudioAssetKey> = {
  move: "blockfallMoveSfx",
  rotate: "blockfallRotateSfx",
  lock: "blockfallLockThudSfx",
  "line-clear": "blockfallLineClearSfx",
  quad: "blockfallQuadFanfareSfx",
  "level-up": "blockfallLevelUpSfx",
  "hold-swap": "blockfallHoldSwapSfx",
  "hard-drop": "blockfallHardDropSlamSfx",
  "game-over": "blockfallGameOverStingSfx",
  "ambient-hum": "blockfallReactorHumLoop",
  "music-stem-1": "blockfallMusicStem1",
  "music-stem-2": "blockfallMusicStem2",
  "music-stem-3": "blockfallMusicStem3",
  "music-stem-4": "blockfallMusicStem4"
};

export type BlockfallAudioBus = "sfx" | "ambient" | "music-stem-1" | "music-stem-2" | "music-stem-3" | "music-stem-4";

export interface BlockfallAudioCueDefinition {
  readonly cue: BlockfallAudioCue;
  readonly bus: BlockfallAudioBus;
  /** The state change this cue answers, in trigger-map wording for evidence/tests. */
  readonly trigger: string;
  readonly intent: string;
  readonly loop?: boolean;
  readonly volume: number;
  readonly assetKey: BlockfallAudioAssetKey;
  readonly asset: BlockfallAudioAssetReference;
}

/** Throws if the typed audio asset is missing a content hash — no silent placeholder. */
export function blockfallAudioAssetReference(key: BlockfallAudioAssetKey): BlockfallAudioAssetReference {
  const asset = assets[key];
  if (!asset || !asset.hash || !asset.url) {
    throw new Error("Blockfall audio asset " + key + " is missing its generated content hash/url.");
  }
  return {
    key,
    typedAssetMember: "assets." + key,
    url: asset.url,
    hash: asset.hash,
    format: "wav",
    license: "CC0-1.0",
    author: "Aura3D synthesis"
  };
}

const GAMEPLAY_CUES: ReadonlyArray<{
  cue: BlockfallAudioCue;
  trigger: string;
  intent: string;
  volume: number;
}> = [
  { cue: "move", trigger: "move action accepted", intent: "Tiny dry tick per horizontal shift.", volume: 0.5 },
  { cue: "rotate", trigger: "rotate action accepted", intent: "Quick rising flick per rotation.", volume: 0.55 },
  { cue: "lock", trigger: "lock event from kit", intent: "Soft low thud when a piece settles.", volume: 0.6 },
  { cue: "line-clear", trigger: "line-clear event with 1-3 rows", intent: "Bright ascending sweep on clears.", volume: 0.62 },
  { cue: "quad", trigger: "line-clear event with 4 rows", intent: "Four-note fanfare reserved for tetrises.", volume: 0.7 },
  { cue: "level-up", trigger: "level increases past last observed level", intent: "Reactor charge sweep into warm chord.", volume: 0.62 },
  { cue: "hold-swap", trigger: "hold action accepted", intent: "Double latch click on hold swap.", volume: 0.45 },
  { cue: "hard-drop", trigger: "hard-drop action accepted", intent: "Punchy slam at drop commit.", volume: 0.6 },
  { cue: "game-over", trigger: "game-over event from kit", intent: "Short descending sting, no long dirge.", volume: 0.65 }
];

function gameplayCue(definition: (typeof GAMEPLAY_CUES)[number]): BlockfallAudioCueDefinition {
  return {
    cue: definition.cue,
    bus: "sfx",
    trigger: definition.trigger,
    intent: definition.intent,
    volume: definition.volume,
    assetKey: blockfallAudioCueAssetKeys[definition.cue],
    asset: blockfallAudioAssetReference(blockfallAudioCueAssetKeys[definition.cue])
  };
}

function ambientLoop(
  cue: BlockfallAudioCue,
  bus: BlockfallAudioBus,
  trigger: string,
  intent: string,
  volume: number
): BlockfallAudioCueDefinition {
  return {
    cue,
    bus,
    trigger,
    intent,
    loop: true,
    volume,
    assetKey: blockfallAudioCueAssetKeys[cue],
    asset: blockfallAudioAssetReference(blockfallAudioCueAssetKeys[cue])
  };
}

/** The committed manifest: nine gameplay cues plus hum and four intensity stems. */
export const blockfallAudioManifest: Record<BlockfallAudioCue, BlockfallAudioCueDefinition> = {
  ...Object.fromEntries(GAMEPLAY_CUES.map((definition) => [definition.cue, gameplayCue(definition)])),
  "ambient-hum": ambientLoop("ambient-hum", "ambient", "runs while the route is mounted", "Looping reactor room tone on its own bus.", 0.5),
  "music-stem-1": ambientLoop("music-stem-1", "music-stem-1", "levels 1-5", "Base bass pulse stem.", 0.55),
  "music-stem-2": ambientLoop("music-stem-2", "music-stem-2", "levels 6-10", "Offbeat hat-tick stem.", 0.5),
  "music-stem-3": ambientLoop("music-stem-3", "music-stem-3", "levels 11-15", "Rolling arp stem.", 0.5),
  "music-stem-4": ambientLoop("music-stem-4", "music-stem-4", "levels 16+", "High tension pad stem.", 0.42)
} as Record<BlockfallAudioCue, BlockfallAudioCueDefinition>;

/** Gameplay cue ids only — used by the trigger-map test to exclude loops. */
export const BLOCKFALL_GAMEPLAY_CUES: readonly BlockfallAudioCue[] = GAMEPLAY_CUES.map((definition) => definition.cue);

/**
 * Additive music layering: stem N becomes audible at level 1 + 5 * (N - 1)
 * (stem 1 always, stem 2 at level 6, stem 3 at level 11, stem 4 at level 16) and
 * stays audible above that — an additive stem every five levels.
 */
export function blockfallStemsForLevel(level: number): readonly BlockfallAudioCue[] {
  const safeLevel = Math.max(1, Math.floor(level));
  const stems: BlockfallAudioCue[] = ["music-stem-1"];
  if (safeLevel >= 6) stems.push("music-stem-2");
  if (safeLevel >= 11) stems.push("music-stem-3");
  if (safeLevel >= 16) stems.push("music-stem-4");
  return stems;
}

/** Target bus gain for each stem at a given level; inactive stems sit at 0. */
export function blockfallStemVolumesForLevel(level: number): Record<BlockfallAudioBus, number> {
  const active = new Set(blockfallStemsForLevel(level));
  return {
    sfx: 0.5,
    ambient: 0.18,
    "music-stem-1": active.has("music-stem-1") ? 0.22 : 0,
    "music-stem-2": active.has("music-stem-2") ? 0.18 : 0,
    "music-stem-3": active.has("music-stem-3") ? 0.18 : 0,
    "music-stem-4": active.has("music-stem-4") ? 0.15 : 0
  };
}

export const blockfallAudioAssets: Readonly<Record<BlockfallAudioAssetKey, BlockfallAudioAssetReference>> = Object.freeze(
  Object.fromEntries(
    Object.values(blockfallAudioCueAssetKeys).map((key) => [key, blockfallAudioAssetReference(key)])
  ) as Record<BlockfallAudioAssetKey, BlockfallAudioAssetReference>
);
