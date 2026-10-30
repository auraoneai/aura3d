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
 * All six fighters mount bespoke Meshy-generated rigs imported into the
 * app-local catalog (assets.ironcrown<Name>) — no borrowed library rigs.
 * Every GLB ships the identical 14-clip set (Idle, Walk_Fight_Forward,
 * Walk_Fight_Back, Left_Jab_from_Guard, Right_Uppercut_from_Guard,
 * Triple_Combo_Attack, Block1, Hit_Reaction, Dead, Regular_Jump, plus the
 * IC-12 Meshy animate clips Combat_Stance, CrouchLookAroundBow,
 * Over_Shoulder_Throw, Victory_Fist_Pump), so one shared clip map resolves
 * every logical state.
 *
 * Clip-map contract (adapted from the create-aura3d fighting template,
 * Q-06-8 / #488): every required logical state must resolve to a clip that
 * is actually embedded in the mounted GLB, else the app throws
 * FIGHTER_CLIP_MISSING at boot; stand-ins are allowed but tagged so they
 * surface in evidence instead of silently shipping.
 */

export type FighterId = "kenji" | "volt" | "boulder" | "seraph" | "jinx" | "sovereign";

/** Typed catalog keys of the bespoke Meshy fighter rigs (see aura.assets.json). */
export type FighterAssetKey =
  | "ironcrownKenji"
  | "ironcrownVolt"
  | "ironcrownBoulder"
  | "ironcrownSeraph"
  | "ironcrownJinx"
  | "ironcrownSovereign";

export type TypedFighterAssets = Partial<Record<string, AuraAssetRef<"model">>>;

/** Fighter id → catalog key, same order as the Meshy artifact slugs. */
export const FIGHTER_ASSETS: Record<FighterId, FighterAssetKey> = {
  kenji: "ironcrownKenji",
  volt: "ironcrownVolt",
  boulder: "ironcrownBoulder",
  seraph: "ironcrownSeraph",
  jinx: "ironcrownJinx",
  sovereign: "ironcrownSovereign"
};

export const REQUIRED_FIGHTER_ASSETS: readonly FighterAssetKey[] = [
  "ironcrownKenji",
  "ironcrownVolt",
  "ironcrownBoulder",
  "ironcrownSeraph",
  "ironcrownJinx",
  "ironcrownSovereign"
];

/**
 * Logical states the fight code drives. Wider than the template's set —
 * crouch/throw/ko/win are layered on, resolved through the shared
 * FIGHTER_CLIP_MAP to embedded GLB clip names.
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
 * Best embedded clip per logical state, shared across the roster because
 * every bespoke Meshy rig ships the identical 14-clip set. `standIn: true`
 * marks the one state whose clip was made for something else: dash plays the
 * forward fight walk at double speed.
 *
 * IC-12: idle, crouch, throw and win have their own Meshy animate clips
 * (action ids 89, 258, 421, 403; aura-evidence/meshy/ironcrown*.ic12-clips.json).
 * Block1 is guard only. Over_Shoulder_Throw is trimmed to its grab-lift-toss
 * window (2.5 s), played at THROW_CLIP_SPEED so it fits the 0.62 s throw hold.
 */
export const FIGHTER_CLIP_MAP: Record<FighterClip, AuraClipMapEntry> = {
  idle: { clip: "Combat_Stance" },
  walk: { clip: "Walk_Fight_Forward" },
  jump: { clip: "Regular_Jump" },
  dash: { clip: "Walk_Fight_Forward", standIn: true },
  crouch: { clip: "CrouchLookAroundBow" },
  guard: { clip: "Block1" },
  light: { clip: "Left_Jab_from_Guard" },
  heavy: { clip: "Right_Uppercut_from_Guard" },
  special: { clip: "Triple_Combo_Attack" },
  throw: { clip: "Over_Shoulder_Throw" },
  hitstun: { clip: "Hit_Reaction" },
  ko: { clip: "Dead" },
  win: { clip: "Victory_Fist_Pump" }
};

/** Playback speed of the throw clip: its 2.5 s grab-lift-toss over the 0.62 s throw hold. */
export const THROW_CLIP_SPEED = 4;

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
  /** Studio palettes with a lacquered finish (IC47-M2: Gilded and Crimson). */
  readonly lacquer?: boolean;
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
  /** Catalog key of this fighter's bespoke Meshy rig. */
  readonly asset: FighterAssetKey;
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
    archetype: "Balanced all-rounder",
    bio: "The tournament's measuring stick. No weaknesses, no gimmicks — clean footsies, honest damage, and a special that punishes hesitation.",
    asset: "ironcrownKenji",
    scale: 1,
    palette: { color: "#dfe9ff", emissive: "#2b6cff", emissiveIntensity: 0.22, roughness: 0.5, metallic: 0.12 },
    stats: { maxHealth: 100, defense: 1, damage: 1, walkSpeed: 3.4, jumpVelocity: 8.4, dashSpeed: 7.6, meterGain: 1, reach: 1 },
    special: { name: "Raijin Straight", fx: "arc", color: "#57c8ff" },
    ai: { preferredRange: 1.75, aggression: 0.55 }
  },
  {
    id: "volt",
    name: "MARA VOLT",
    title: "Rushdown Boxer",
    archetype: "Fast pressure",
    bio: "Dock-fight money made her fast; the harbor made her mean. Volt lives inside your guard — her hands never stop and her dash never cools.",
    asset: "ironcrownVolt",
    scale: 0.96,
    palette: { color: "#ffd2a8", emissive: "#ff7a2e", emissiveIntensity: 0.24, roughness: 0.46, metallic: 0.08 },
    stats: { maxHealth: 88, defense: 1.12, damage: 0.88, walkSpeed: 4.1, jumpVelocity: 8.8, dashSpeed: 9.6, meterGain: 1.15, reach: 0.92 },
    special: { name: "Volt Combination", fx: "storm", color: "#ffb03c" },
    ai: { preferredRange: 1.55, aggression: 0.8 }
  },
  {
    id: "boulder",
    name: "BOULDER KANE",
    title: "Iron Grappler",
    archetype: "Heavy grappler",
    bio: "A colosseum wall that learned to walk. Slow feet, anvil hands, and a throw that rearranges spines. One read is all he needs.",
    asset: "ironcrownBoulder",
    scale: 1.12,
    palette: { color: "#c8b39a", emissive: "#8a5a2e", emissiveIntensity: 0.16, roughness: 0.62, metallic: 0.2 },
    stats: { maxHealth: 128, defense: 0.78, damage: 1.28, walkSpeed: 2.5, jumpVelocity: 7.4, dashSpeed: 6.2, meterGain: 0.9, reach: 1.12 },
    special: { name: "Colossus Drop", fx: "slam", color: "#e88b3c" },
    ai: { preferredRange: 1.55, aggression: 0.5 }
  },
  {
    id: "seraph",
    name: "SERAPH LIN",
    title: "Spear Saint",
    archetype: "Zoning staff",
    bio: "The monastery's longest reach. Lin writes the fight's geometry with her staff and makes approaching feel like walking uphill in snow.",
    asset: "ironcrownSeraph",
    scale: 1.02,
    palette: { color: "#cfe8d8", emissive: "#35d0a0", emissiveIntensity: 0.2, roughness: 0.44, metallic: 0.14 },
    stats: { maxHealth: 94, defense: 1.06, damage: 0.94, walkSpeed: 3.1, jumpVelocity: 8.2, dashSpeed: 7.2, meterGain: 1.05, reach: 1.3 },
    special: { name: "Avalanche Lance", fx: "lance", color: "#5cffc8" },
    ai: { preferredRange: 2.1, aggression: 0.4 }
  },
  {
    id: "jinx",
    name: "JINX OKO",
    title: "The Trickster",
    archetype: "Slippery mix-up",
    bio: "Nobody agrees on what Jinx looks like mid-fight — only that you swung at empty air and ate the counter. Weakest hands on the card, sharpest grin.",
    asset: "ironcrownJinx",
    scale: 0.92,
    palette: { color: "#e2ccff", emissive: "#9b4dff", emissiveIntensity: 0.28, roughness: 0.42, metallic: 0.1 },
    stats: { maxHealth: 86, defense: 1.16, damage: 0.84, walkSpeed: 3.9, jumpVelocity: 9.2, dashSpeed: 10.4, meterGain: 1.2, reach: 0.95 },
    special: { name: "Phantom Parade", fx: "mischief", color: "#c07dff" },
    ai: { preferredRange: 1.68, aggression: 0.65 }
  },
  {
    id: "sovereign",
    name: "SOVEREIGN",
    title: "The Iron Crown",
    archetype: "Final boss",
    bio: "The throne defends itself. Sovereign reads your habits faster than you form them, hits like a decree, and does not know how to kneel.",
    asset: "ironcrownSovereign",
    scale: 1.08,
    palette: { color: "#ffe9b0", emissive: "#ffb400", emissiveIntensity: 0.42, roughness: 0.34, metallic: 0.5 },
    stats: { maxHealth: 120, defense: 0.82, damage: 1.18, walkSpeed: 3.3, jumpVelocity: 8.6, dashSpeed: 8.2, meterGain: 1.1, reach: 1.08 },
    special: { name: "Crown Decree", fx: "crown", color: "#ffd76a" },
    ai: { preferredRange: 1.8, aggression: 0.72 }
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

/** Studio swatches with a lacquered finish (IC47-M2: clearcoat on Gilded and Crimson). */
export function isLacquerSwatch(id: string): boolean {
  return id === "gilded" || id === "crimson";
}

/**
 * GU47 IC47-M2: the fighter's surface extras. A Fresnel rim (E-D `rim`) in the fighter's own emissive colour so the
 * silhouette separates from the dark venues (on top of the back-rim lights), and a clearcoat on the Gilded and
 * Crimson studio palettes. Visual only.
 */
export function fighterSurface(palette: FighterPalette): {
  readonly rim: { readonly color: string; readonly power: number; readonly intensity: number };
  readonly clearcoat?: { readonly clearcoat: number; readonly clearcoatRoughness: number };
} {
  const lacquer = palette.lacquer === true;
  return {
    rim: { color: palette.emissive, power: 3.2, intensity: 0.85 },
    ...(lacquer ? { clearcoat: { clearcoat: 0.6, clearcoatRoughness: 0.22 } } : {})
  };
}

/** The manifest also carries the venue LUTs (IC47-P2); only `model` entries count as fighter assets. */
export function resolveTypedFighterAssets(assetManifest: Partial<Record<string, AuraAssetRef>>) {
  const typedFighterAssets: TypedFighterAssets = {};
  for (const key of REQUIRED_FIGHTER_ASSETS) {
    const entry = assetManifest[key];
    if (entry?.type === "model") typedFighterAssets[key] = entry as AuraAssetRef<"model">;
  }
  const missingFighterAssets = REQUIRED_FIGHTER_ASSETS.filter((key) => !typedFighterAssets[key]);
  return {
    typedFighterAssets,
    missingFighterAssets,
    typedFighterAssetCount: REQUIRED_FIGHTER_ASSETS.length - missingFighterAssets.length
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

/** Only genuine locomotion loops — the Meshy clip set has no loopable jump/dash/guard variants. */
const LOOPING_CLIPS: ReadonlySet<FighterClip> = new Set(["idle", "walk"]);
const ATTACK_CLIPS: ReadonlySet<FighterClip> = new Set(["light", "heavy", "special", "throw"]);

export function isLoopingFighterClip(clip: FighterClip): boolean {
  return LOOPING_CLIPS.has(clip);
}

export function animationLayer(clip: FighterClip): "base" | "upper-body" {
  return ATTACK_CLIPS.has(clip) ? "upper-body" : "base";
}

/**
 * GU47 IC47-AN1: attacks play on the upper-body layer over the locomotion clip by default, now that the engine's
 * `playLayer` forwards `speed` to the layer's time scale (the moves' hit frames expect the attack clips at 1.85x to
 * 2.8x). `?iclayer=0` keeps the full-body attack clips (today's look). Visual only: hitboxes and frames come from the
 * combat sim, not the clip.
 */
export function attackLayerEnabled(params: Pick<URLSearchParams, "get">): boolean {
  return params.get("iclayer") !== "0";
}

export const fighterAnimationClips: readonly AuraNamedAnimationClipDefinition<FighterClip>[] = REQUIRED_FIGHTER_CLIPS.map((id) => ({
  id,
  /** GLB clip name — lets clipSamples resolve the real embedded clip when this logical state is the active one. */
  name: FIGHTER_CLIP_MAP[id].clip,
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
  /** Embedded GLB clip names registered on the controller (empty when the asset ref is missing). */
  readonly embeddedClips: ReadonlySet<string>;
}

/**
 * Validate the shared clip map against the fighter's embedded metadata,
 * then build the controller with the embedded clip registry so
 * bindRuntimeNode resolves real GLB clip durations.
 */
export function createFighterAnimationController(
  label: string,
  assetKey: FighterAssetKey,
  asset?: AuraAssetRef<"model">
): FighterAnimationBundle {
  let standIns: readonly string[] = [];
  let availableClips: readonly string[] = [];
  if (asset) {
    const embedded = asset.metadata?.animations;
    availableClips = Array.isArray(embedded)
      ? embedded.filter((clip): clip is string => typeof clip === "string")
      : [];
    standIns = validateClipMap(FIGHTER_CLIP_MAP, {
      availableClips,
      requiredStates: REQUIRED_FIGHTER_CLIPS,
      label: `${label}:${assetKey}`
    });
  }
  const controller = new AnimationController<FighterClip>({
    id: `${label}-${assetKey}-animation-controller`,
    ...(asset ? { clipRegistry: animationClipRegistry(asset) } : {}),
    clips: fighterAnimationClips,
    requiredClips: REQUIRED_FIGHTER_CLIPS,
    suppressRootMotion: true,
    layers: [
      { id: "base", role: "base", bodyMask: "full-body" },
      { id: "upper-body", role: "attack", bodyMask: "upper-body", restartFromFrameZero: true }
    ]
  });
  return { controller, standIns, embeddedClips: new Set(availableClips) };
}

/** Resolved embedded clip name for a logical state (used for drive:"clips" evidence). */
export function embeddedClipFor(state: FighterClip): { readonly clip: string; readonly standIn: boolean } {
  const entry = FIGHTER_CLIP_MAP[state];
  return { clip: entry.clip, standIn: entry.standIn === true };
}

/**
 * Clip id to crossFade to for a logical state: the embedded GLB clip name
 * when the controller registered the fighter's clip registry — so the
 * runtime spec's `animation.clip` resolves the real clip exactly — else the
 * logical id (always registered as a declared clip). The embedded GLB clip
 * names sit outside the FighterClip union; the cast is safe because they
 * are registered on this controller's clip map.
 */
export function fighterDriveClipId(anim: FighterAnimationBundle, state: FighterClip): FighterClip {
  const embedded = FIGHTER_CLIP_MAP[state].clip;
  return (anim.embeddedClips.has(embedded) ? embedded : state) as FighterClip;
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
 * Canonical fighter render height in metres. The Meshy GLBs embed a ~0.01
 * armature root scale, so raw loaded bounds are centimetre-tiny —
 * `model()`'s targetHeight fit normalizes each rig to this height and the
 * per-fighter `scale` then re-introduces the roster's size spread
 * (Boulder ≈ 2.0 m, Jinx ≈ 1.66 m, matching the authored GLB proportions).
 */
const FIGHTER_RENDER_HEIGHT = 1.8;

/**
 * Mount a fighter's rig. When `tint` is supplied the whole model gets a PBR
 * material override — the studio's palette forge and per-fighter liveries
 * ride on this (model() drops `materialOverrides`, so the node-level
 * `material` spec is the public seam).
 */
export function fighterFacingYaw(facing: 1 | -1): number {
  return facing > 0 ? Math.PI / 2 : -Math.PI / 2;
}

export function createFighterNode(
  nodeId: string,
  fighter: FighterDef,
  label: string,
  position: readonly [number, number, number],
  facing: 1 | -1,
  typedFighterAssets: TypedFighterAssets,
  tint?: FighterPalette
) {
  const assetKey = fighter.asset;
  const asset = typedFighterAssets[assetKey];
  const runtime = game.runtimeNode(nodeId, {
    tags: ["fighter", fighter.id, assetKey, asset ? "typed-asset" : "source-placeholder"]
  });
  const palette = tint ?? fighter.palette;
  const yaw = fighterFacingYaw(facing);
  const surface = fighterSurface(palette);

  if (asset) {
    return model(asset, {
      name: label,
      targetHeight: FIGHTER_RENDER_HEIGHT,
      ...(tint
        ? {
            material: material.pbr({
              color: tint.color,
              roughness: tint.roughness,
              metallic: tint.metallic,
              ...(tint.emissive ? { emissive: tint.emissive, emissiveIntensity: tint.emissiveIntensity } : {}),
              ...surface.clearcoat,
              rim: surface.rim
            })
          }
        : { materialOverrides: [{ rim: surface.rim }] })
    })
      .position(position[0], position[1], position[2])
      .rotate(0, yaw, 0)
      .scale(fighter.scale)
      .animate({ clip: FIGHTER_CLIP_MAP.idle.clip, loop: true })
      .runtime(runtime);
  }

  return primitives
    .capsule({
      name: `${label} placeholder (missing ${assetKey})`,
      material: material.pbr({ color: palette.color, roughness: 0.62 })
    })
    .position(position[0], position[1] + 0.82, position[2])
    .rotate(0, yaw, 0)
    .scale([0.34, 0.74, 0.34])
    .runtime(runtime);
}

