import {
  AnimationController,
  type AuraAssetRef,
  type AuraNamedAnimationClipDefinition,
  game,
  material,
  model,
  primitives
} from "@aura3d/engine";

/**
 * IRON CROWN roster.
 *
 * Six fighters are expressed as stat/palette/move variants on the two
 * certified animated rigs from the shared library (the only catalog rigs
 * whose embedded clip metadata passes validation — the Meshy clash-fighter
 * GLBs ship empty animation lists and would throw FIGHTER_CLIP_MISSING).
 *
 * Clip-map contract (adapted from the create-aura3d fighting template,
 * Q-06-8 / #488): every required logical state must resolve to a clip that
 * is actually embedded in the mounted GLB, else the app throws
 * FIGHTER_CLIP_MISSING at boot; stand-ins are allowed but tagged so they
 * surface in evidence instead of silently shipping.
 */

export type RigId = "player" | "rival";
export type FighterId = "kenji" | "volt" | "boulder" | "seraph" | "jinx" | "sovereign";

export const PLAYER_FIGHTER_ASSET = "auraclashPlayerRig" as const;
export const RIVAL_FIGHTER_ASSET = "auraclashRivalRig" as const;
export type FighterAssetKey = typeof PLAYER_FIGHTER_ASSET | typeof RIVAL_FIGHTER_ASSET;
export type TypedFighterAssets = Partial<Record<FighterAssetKey, AuraAssetRef<"model">>>;

/**
 * Logical states the fight code drives. Wider than the template's set —
 * crouch/throw/ko/win are layered on, resolved to embedded clips per rig.
 */
export type FighterClip =
  | "idle"
  | "walk"
  | "jump"
  | "dash"
  | "crouch"
  | "guard"
  | "light"
  | "heavy"
  | "special"
  | "throw"
  | "hitstun"
  | "ko"
  | "win";

export const REQUIRED_FIGHTER_CLIPS: readonly FighterClip[] = [
  "idle",
  "walk",
  "jump",
  "dash",
  "crouch",
  "guard",
  "light",
  "heavy",
  "special",
  "throw",
  "hitstun",
  "ko",
  "win"
];

interface AuraClipMapEntry {
  readonly clip: string;
  readonly standIn?: boolean;
}

/**
 * Best embedded clip per logical state, per rig. `standIn: true` marks
 * states where the GLB has no bespoke clip (e.g. there is no dedicated
 * throw or win animation — a punch/idle clip sells the pose instead).
 */
const PLAYER_CLIP_MAP: Record<FighterClip, AuraClipMapEntry> = {
  idle: { clip: "Idle_Loop" },
  walk: { clip: "Walk_Loop" },
  jump: { clip: "Jump_Loop" },
  dash: { clip: "Sprint_Loop" },
  crouch: { clip: "Crouch_Idle_Loop" },
  guard: { clip: "Sword_Block" },
  light: { clip: "Punch_Jab" },
  heavy: { clip: "Punch_Cross" },
  special: { clip: "Sword_Attack" },
  throw: { clip: "Punch_Cross", standIn: true },
  hitstun: { clip: "Hit_Chest" },
  ko: { clip: "Death01" },
  win: { clip: "Jump_Loop", standIn: true }
};

const RIVAL_CLIP_MAP: Record<FighterClip, AuraClipMapEntry> = {
  idle: { clip: "Idle_FoldArms_Loop" },
  walk: { clip: "Zombie_Walk_Fwd_Loop" },
  jump: { clip: "NinjaJump_Idle_Loop" },
  dash: { clip: "Shield_Dash_RM" },
  crouch: { clip: "Idle_FoldArms_Loop", standIn: true },
  guard: { clip: "Sword_Block" },
  light: { clip: "Melee_Hook" },
  heavy: { clip: "Sword_Regular_A" },
  special: { clip: "Sword_Regular_Combo" },
  throw: { clip: "Melee_Hook", standIn: true },
  hitstun: { clip: "Hit_Knockback" },
  ko: { clip: "LayToIdle" },
  win: { clip: "Idle_FoldArms_Loop", standIn: true }
};

export const RIG_CLIP_MAPS: Record<RigId, Record<FighterClip, AuraClipMapEntry>> = {
  player: PLAYER_CLIP_MAP,
  rival: RIVAL_CLIP_MAP
};

export const RIG_ASSET_KEY: Record<RigId, FighterAssetKey> = {
  player: PLAYER_FIGHTER_ASSET,
  rival: RIVAL_FIGHTER_ASSET
};

function validateClipMap(
  map: Record<FighterClip, AuraClipMapEntry>,
  options: { readonly availableClips: readonly string[]; readonly requiredStates: readonly FighterClip[]; readonly label: string }
): readonly string[] {
  const available = new Set(options.availableClips);
  const missing: string[] = [];
  const standIns: string[] = [];
  for (const state of options.requiredStates) {
    const entry = map[state];
    if (!entry || !available.has(entry.clip)) {
      missing.push(entry ? `${state}→"${entry.clip}"` : state);
    } else if (entry.standIn === true) {
      standIns.push(`${state}→"${entry.clip}"`);
    }
  }
  if (missing.length > 0) throw new Error(`FIGHTER_CLIP_MISSING (${options.label}): ${missing.join(", ")}`);
  return standIns;
}

export interface FighterPalette {
  readonly color: string;
  readonly emissive: string;
  readonly emissiveIntensity: number;
  readonly roughness: number;
  readonly metallic: number;
}

export interface FighterSpecialSpec {
  readonly name: string;
  /** Visual flavour used by main.ts for burst/tint/cue choices. */
  readonly fx: "arc" | "storm" | "slam" | "lance" | "mischief" | "crown";
  readonly color: string;
}

export interface FighterStats {
  /** Normalized health pool (engine actors run 0..100; this scales the HUD + effective bulk). */
  readonly maxHealth: number;
  /** Damage taken multiplier (<1 = tough). */
  readonly defense: number;
  /** Damage dealt multiplier. */
  readonly damage: number;
  /** m/s forward walk. */
  readonly walkSpeed: number;
  readonly jumpVelocity: number;
  readonly dashSpeed: number;
  /** Meter the fighter earns per point of damage dealt/taken. */
  readonly meterGain: number;
  /** Reach multiplier applied to authored hitbox offsets/sizes. */
  readonly reach: number;
}

export interface FighterDef {
  readonly id: FighterId;
  readonly name: string;
  readonly title: string;
  readonly archetype: string;
  readonly bio: string;
  readonly rig: RigId;
  readonly scale: number;
  readonly palette: FighterPalette;
  readonly stats: FighterStats;
  readonly special: FighterSpecialSpec;
  /** CPU bias: preferred spacing + aggression weight. */
  readonly ai: { readonly preferredRange: number; readonly aggression: number };
}

export const FIGHTERS: readonly FighterDef[] = [
  {
    id: "kenji",
    name: "KENJI ARASHI",
    title: "Storm Karateka",
    archetype: "Balanced shoto",
    bio: "The tournament's measuring stick. No weaknesses, no gimmicks — clean footsies, honest damage, and a special that punishes hesitation.",
    rig: "player",
    scale: 1,
    palette: { color: "#dfe9ff", emissive: "#2b6cff", emissiveIntensity: 0.22, roughness: 0.5, metallic: 0.12 },
    stats: { maxHealth: 100, defense: 1, damage: 1, walkSpeed: 3.4, jumpVelocity: 8.4, dashSpeed: 7.6, meterGain: 1, reach: 1 },
    special: { name: "Raijin Straight", fx: "arc", color: "#57c8ff" },
    ai: { preferredRange: 1.35, aggression: 0.55 }
  },
  {
    id: "volt",
    name: "MARA VOLT",
    title: "Rushdown Boxer",
    archetype: "Fast pressure",
    bio: "Dock-fight money made her fast; Bangkok made her mean. Volt lives inside your guard — her hands never stop and her dash never cools.",
    rig: "rival",
    scale: 0.96,
    palette: { color: "#ffd2a8", emissive: "#ff7a2e", emissiveIntensity: 0.24, roughness: 0.46, metallic: 0.08 },
    stats: { maxHealth: 88, defense: 1.12, damage: 0.88, walkSpeed: 4.1, jumpVelocity: 8.8, dashSpeed: 9.6, meterGain: 1.15, reach: 0.92 },
    special: { name: "Volt Combination", fx: "storm", color: "#ffb03c" },
    ai: { preferredRange: 1.05, aggression: 0.8 }
  },
  {
    id: "boulder",
    name: "BOULDER KANE",
    title: "Iron Grappler",
    archetype: "Heavy grappler",
    bio: "A colosseum wall that learned to walk. Slow feet, anvil hands, and a throw that rearranges spines. One read is all he needs.",
    rig: "rival",
    scale: 1.12,
    palette: { color: "#c8b39a", emissive: "#8a5a2e", emissiveIntensity: 0.16, roughness: 0.62, metallic: 0.2 },
    stats: { maxHealth: 128, defense: 0.78, damage: 1.28, walkSpeed: 2.5, jumpVelocity: 7.4, dashSpeed: 6.2, meterGain: 0.9, reach: 1.12 },
    special: { name: "Colossus Drop", fx: "slam", color: "#e88b3c" },
    ai: { preferredRange: 0.95, aggression: 0.5 }
  },
  {
    id: "seraph",
    name: "SERAPH LIN",
    title: "Spear Saint",
    archetype: "Zoning staff",
    bio: "The monastery's longest reach. Lin writes the fight's geometry with her staff and makes approaching feel like walking uphill in snow.",
    rig: "player",
    scale: 1.02,
    palette: { color: "#cfe8d8", emissive: "#35d0a0", emissiveIntensity: 0.2, roughness: 0.44, metallic: 0.14 },
    stats: { maxHealth: 94, defense: 1.06, damage: 0.94, walkSpeed: 3.1, jumpVelocity: 8.2, dashSpeed: 7.2, meterGain: 1.05, reach: 1.3 },
    special: { name: "Avalanche Lance", fx: "lance", color: "#5cffc8" },
    ai: { preferredRange: 1.9, aggression: 0.4 }
  },
  {
    id: "jinx",
    name: "JINX OKO",
    title: "The Trickster",
    archetype: "Slippery mix-up",
    bio: "Nobody agrees on what Jinx looks like mid-fight — only that you swung at empty air and ate the counter. Weakest hands on the card, sharpest grin.",
    rig: "player",
    scale: 0.92,
    palette: { color: "#e2ccff", emissive: "#9b4dff", emissiveIntensity: 0.28, roughness: 0.42, metallic: 0.1 },
    stats: { maxHealth: 86, defense: 1.16, damage: 0.84, walkSpeed: 3.9, jumpVelocity: 9.2, dashSpeed: 10.4, meterGain: 1.2, reach: 0.95 },
    special: { name: "Phantom Parade", fx: "mischief", color: "#c07dff" },
    ai: { preferredRange: 1.15, aggression: 0.65 }
  },
  {
    id: "sovereign",
    name: "SOVEREIGN",
    title: "The Iron Crown",
    archetype: "Final boss",
    bio: "The throne defends itself. Sovereign reads your habits faster than you form them, hits like a decree, and does not know how to kneel.",
    rig: "rival",
    scale: 1.08,
    palette: { color: "#ffe9b0", emissive: "#ffb400", emissiveIntensity: 0.42, roughness: 0.34, metallic: 0.5 },
    stats: { maxHealth: 120, defense: 0.82, damage: 1.18, walkSpeed: 3.3, jumpVelocity: 8.6, dashSpeed: 8.2, meterGain: 1.1, reach: 1.08 },
    special: { name: "Crown Decree", fx: "crown", color: "#ffd76a" },
    ai: { preferredRange: 1.3, aggression: 0.72 }
  }
] as const;

export const FIGHTER_MAP: ReadonlyMap<FighterId, FighterDef> = new Map(FIGHTERS.map((f) => [f.id, f]));

export function fighterById(id: FighterId): FighterDef {
  const def = FIGHTER_MAP.get(id);
  if (!def) throw new Error(`IRON_CROWN_FIGHTER_UNKNOWN: "${id}"`);
  return def;
}

/** Studio palette swatches applied as full-model tints. */
export const PALETTE_SWATCHES: readonly { readonly id: string; readonly label: string; readonly color: string; readonly emissive: string }[] = [
  { id: "default", label: "Default", color: "#ffffff", emissive: "" },
  { id: "crimson", label: "Crimson", color: "#ff8d80", emissive: "#ff4f46" },
  { id: "azure", label: "Azure", color: "#a8d4ff", emissive: "#2b6cff" },
  { id: "jade", label: "Jade", color: "#b8f5d0", emissive: "#35d0a0" },
  { id: "royal", label: "Royal", color: "#e0c8ff", emissive: "#9b4dff" },
  { id: "gilded", label: "Gilded", color: "#ffe9b0", emissive: "#ffb400" }
] as const;

export type PaletteId = (typeof PALETTE_SWATCHES)[number]["id"];

export function resolveTypedFighterAssets(assetManifest: TypedFighterAssets) {
  const typedFighterAssets: TypedFighterAssets = {
    [PLAYER_FIGHTER_ASSET]: assetManifest[PLAYER_FIGHTER_ASSET],
    [RIVAL_FIGHTER_ASSET]: assetManifest[RIVAL_FIGHTER_ASSET]
  };
  const missingFighterAssets = [PLAYER_FIGHTER_ASSET, RIVAL_FIGHTER_ASSET].filter((key) => !typedFighterAssets[key]);
  return {
    typedFighterAssets,
    missingFighterAssets,
    typedFighterAssetCount: 2 - missingFighterAssets.length
  };
}

const CLIP_DURATION: Partial<Record<FighterClip, number>> = {
  light: 0.26,
  heavy: 0.44,
  special: 0.7,
  throw: 0.4,
  dash: 0.24,
  hitstun: 0.32,
  ko: 1.4,
  win: 1
};

const LOOPING_CLIPS: ReadonlySet<FighterClip> = new Set(["idle", "walk", "jump", "dash", "crouch", "guard", "win"]);
const ATTACK_CLIPS: ReadonlySet<FighterClip> = new Set(["light", "heavy", "special", "throw"]);

export function isLoopingFighterClip(clip: FighterClip): boolean {
  return LOOPING_CLIPS.has(clip);
}

export function animationLayer(clip: FighterClip): "base" | "upper-body" {
  return ATTACK_CLIPS.has(clip) ? "upper-body" : "base";
}

export const fighterAnimationClips: readonly AuraNamedAnimationClipDefinition<FighterClip>[] = REQUIRED_FIGHTER_CLIPS.map((id) => ({
  id,
  duration: CLIP_DURATION[id] ?? 1,
  frameRate: 60,
  loop: LOOPING_CLIPS.has(id),
  layer: animationLayer(id),
  layerMetadata: {
    id: animationLayer(id),
    role: ATTACK_CLIPS.has(id) ? "attack" : "base",
    bodyMask: ATTACK_CLIPS.has(id) ? "upper-body" : "full-body",
    restartFromFrameZero: ATTACK_CLIPS.has(id) || id === "dash" || id === "hitstun" || id === "ko"
  },
  restartFromFrameZero: ATTACK_CLIPS.has(id) || id === "dash" || id === "hitstun" || id === "ko",
  suppressRootMotion: true,
  attack: ATTACK_CLIPS.has(id),
  tracks: [],
  metadata: {
    source: "iron-crown-embedded-clip-map",
    suppressRootMotion: true
  }
}));

export interface FighterAnimationBundle {
  readonly controller: AnimationController<FighterClip>;
  readonly standIns: readonly string[];
}

/**
 * Validate the rig's clip map against embedded metadata, then build the
 * controller with the embedded clip registry so bindRuntimeNode resolves
 * real GLB clip durations.
 */
export function createFighterAnimationController(
  label: string,
  rig: RigId,
  asset?: AuraAssetRef<"model">
): FighterAnimationBundle {
  let standIns: readonly string[] = [];
  if (asset) {
    const embedded = asset.metadata?.animations;
    const availableClips = Array.isArray(embedded)
      ? embedded.filter((clip): clip is string => typeof clip === "string")
      : [];
    standIns = validateClipMap(RIG_CLIP_MAPS[rig], {
      availableClips,
      requiredStates: REQUIRED_FIGHTER_CLIPS,
      label: `${label}:${rig}`
    });
  }
  const controller = new AnimationController<FighterClip>({
    id: `${label}-${rig}-animation-controller`,
    ...(asset ? { clipRegistry: animationClipRegistry(asset) } : {}),
    clips: fighterAnimationClips,
    requiredClips: REQUIRED_FIGHTER_CLIPS,
    suppressRootMotion: true,
    layers: [
      { id: "base", role: "base", bodyMask: "full-body" },
      { id: "upper-body", role: "attack", bodyMask: "upper-body", restartFromFrameZero: true }
    ]
  });
  return { controller, standIns };
}

/** Resolved embedded clip name for a logical state on a given rig (used for drive:"clips" evidence). */
export function embeddedClipFor(rig: RigId, state: FighterClip): { readonly clip: string; readonly standIn: boolean } {
  const entry = RIG_CLIP_MAPS[rig][state];
  return { clip: entry.clip, standIn: entry.standIn === true };
}

function animationClipRegistry(asset: AuraAssetRef<"model">) {
  const metadata: Record<string, unknown> = { ...(asset.metadata ?? {}) };
  return {
    id: asset.id,
    name: asset.id,
    url: asset.url,
    hash: asset.hash,
    metadata
  };
}

/**
 * Mount a fighter's rig. When `tint` is supplied the whole model gets a PBR
 * material override — the studio's palette forge and per-fighter liveries
 * ride on this (model() drops `materialOverrides`, so the node-level
 * `material` spec is the public seam).
 */
export function createFighterNode(
  nodeId: string,
  fighter: FighterDef,
  label: string,
  position: readonly [number, number, number],
  facing: 1 | -1,
  typedFighterAssets: TypedFighterAssets,
  tint?: FighterPalette
) {
  const assetKey = RIG_ASSET_KEY[fighter.rig];
  const asset = typedFighterAssets[assetKey];
  const runtime = game.runtimeNode(nodeId, {
    tags: ["fighter", fighter.id, fighter.rig, asset ? "typed-asset" : "source-placeholder"]
  });
  const palette = tint ?? fighter.palette;

  if (asset) {
    return model(asset, {
      name: label,
      material: material.pbr({
        color: palette.color,
        roughness: palette.roughness,
        metallic: palette.metallic,
        ...(palette.emissive ? { emissive: palette.emissive, emissiveIntensity: palette.emissiveIntensity } : {})
      })
    })
      .position(position[0], position[1], position[2])
      .rotate(0, facing < 0 ? Math.PI : 0, 0)
      .scale(fighter.scale)
      .runtime(runtime);
  }

  return primitives
    .capsule({
      name: `${label} placeholder (missing ${assetKey})`,
      material: material.pbr({ color: palette.color, roughness: 0.62 })
    })
    .position(position[0], position[1] + 0.82, position[2])
    .rotate(0, facing < 0 ? Math.PI : 0, 0)
    .scale([0.34, 0.74, 0.34])
    .runtime(runtime);
}
