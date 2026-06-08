import type { AuraCanonicalAsset } from "./CanonicalAsset.js";
import { normalizeLicense } from "./CanonicalAsset.js";
import type { AdapterContext, ResolveQuery, SourceAdapter } from "./SourceAdapter.js";

export type AnimationStarterPackRole =
  | "hero"
  | "sidekick"
  | "villain"
  | "narrator"
  | "background"
  | "miko"
  | "luma"
  | "furniture"
  | "vehicle"
  | "nature"
  | "tool"
  | "indoor-room"
  | "outdoor-park"
  | "school"
  | "space-station"
  | "underwater"
  | "moon-garden";

export type AnimationStarterPackKind = "character" | "prop" | "set";

export interface AnimationStarterPackEntry {
  readonly id: string;
  readonly kind: AnimationStarterPackKind;
  readonly role: AnimationStarterPackRole;
  readonly title: string;
  readonly mirrorPath: string;
  readonly source: "kenney";
  readonly pack: string;
  readonly license: "CC0";
  readonly sourcePage: string;
  readonly tags: readonly string[];
  readonly bounds: readonly [number, number, number];
  readonly hasAnimations?: boolean | undefined;
  readonly triangles?: number | undefined;
}

const CDN_BASE = "https://cdn.jsdelivr.net/gh/gchahal1982/aura3d-cc0-assets@main";
const KENNEY_LICENSE_PAGE = "https://kenney.nl/assets";

export const animationStarterPack: readonly AnimationStarterPackEntry[] = [
  starterCharacter("animation-starter:miko", "miko", "Miko Moon Garden Helper", "kenney/blocky-characters/character-a.glb"),
  starterCharacter("animation-starter:luma", "luma", "Luma Moon Garden Helper", "kenney/blocky-characters/character-b.glb"),
  starterCharacter("animation-starter:hero", "hero", "Hero Character", "kenney/blocky-characters/character-a.glb"),
  starterCharacter("animation-starter:sidekick", "sidekick", "Sidekick Character", "kenney/blocky-characters/character-b.glb"),
  starterCharacter("animation-starter:villain", "villain", "Villain Character", "kenney/blocky-characters/character-c.glb"),
  starterCharacter("animation-starter:narrator", "narrator", "Narrator Character", "kenney/blocky-characters/character-d.glb"),
  starterCharacter("animation-starter:background-kid", "background", "Background Character", "kenney/blocky-characters/character-e.glb"),
  starterProp("animation-starter:prop-stool", "furniture", "Classroom Stool Prop", "kenney/fantasy-town-kit/stall-stool.glb", ["stool", "chair", "furniture", "classroom"]),
  starterProp("animation-starter:prop-bench-table", "furniture", "Activity Bench Table Prop", "kenney/fantasy-town-kit/stall-bench.glb", ["bench", "table", "desk", "furniture"]),
  starterProp("animation-starter:prop-delivery-car", "vehicle", "Tiny Delivery Vehicle Prop", "kenney/car-kit/delivery.glb", ["vehicle", "car", "street"]),
  starterProp("animation-starter:prop-tree", "nature", "Rounded Park Tree Prop", "kenney/city-kit-suburban/tree-small.glb", ["tree", "nature", "park"]),
  starterProp("animation-starter:prop-flower", "nature", "Garden Flower Prop", "kenney/platformer-kit/flowers.glb", ["flower", "nature", "garden"]),
  starterProp("animation-starter:prop-key", "tool", "Story Key Prop", "kenney/platformer-kit/key.glb", ["key", "tool", "story"]),
  starterProp("animation-starter:prop-crate", "tool", "Utility Crate Prop", "kenney/platformer-kit/crate.glb", ["crate", "tool", "storage"]),
  starterProp("animation-starter:prop-sign", "tool", "Direction Sign Prop", "kenney/platformer-kit/sign.glb", ["sign", "tool", "label"]),
  starterProp("animation-starter:prop-bench", "furniture", "Park Bench Prop", "kenney/graveyard-kit/bench.glb", ["bench", "furniture", "park"]),
  starterProp("animation-starter:prop-boat", "vehicle", "Toy Boat Vehicle Prop", "kenney/pirate-kit/boat-row-small.glb", ["boat", "vehicle", "water"]),
  starterSet("animation-starter:set-indoor-room", "indoor-room", "Indoor Room Set", "kenney/modular-dungeon-kit/room-large.glb", ["room", "indoor", "set", "walkable"]),
  starterSet("animation-starter:set-outdoor-park", "outdoor-park", "Outdoor Park Set", "kenney/platformer-kit/block-grass-large.glb", ["park", "outdoor", "set", "walkable"]),
  starterSet("animation-starter:set-school", "school", "School Room Set", "kenney/modular-dungeon-kit/room-wide.glb", ["school", "classroom", "set", "walkable"]),
  starterSet("animation-starter:set-space-station", "space-station", "Space Station Set", "kenney/modular-space-kit/room-large.glb", ["space", "station", "set", "walkable"]),
  starterSet("animation-starter:set-underwater", "underwater", "Underwater Cove Set", "kenney/pirate-kit/ship-wreck.glb", ["underwater", "ocean", "set", "walkable"]),
  starterSet("animation-starter:set-moon-garden", "moon-garden", "Moon Garden Set", "kenney/platformer-kit/block-grass-large.glb", ["moon", "garden", "outdoor", "set", "walkable"]),
] as const;

export function animationStarterPackSummary(): {
  readonly characterCount: number;
  readonly propCount: number;
  readonly setCount: number;
  readonly allLicenseVerified: boolean;
} {
  return {
    characterCount: animationStarterPack.filter((entry) => entry.kind === "character").length,
    propCount: animationStarterPack.filter((entry) => entry.kind === "prop").length,
    setCount: animationStarterPack.filter((entry) => entry.kind === "set").length,
    allLicenseVerified: animationStarterPack.every((entry) => entry.license === "CC0" && entry.sourcePage.length > 0),
  };
}

export function animationStarterPackAssets(): readonly AuraCanonicalAsset[] {
  return animationStarterPack.map(toCanonical);
}

export function createAnimationStarterPackAdapter(): SourceAdapter {
  return {
    id: "animation-starter-pack",
    label: "Aura3D curated animation starter pack",
    async search(_query: ResolveQuery, _ctx: AdapterContext) {
      return animationStarterPackAssets();
    },
  };
}

function starterCharacter(
  id: string,
  role: Extract<AnimationStarterPackRole, "hero" | "sidekick" | "villain" | "narrator" | "background" | "miko" | "luma">,
  title: string,
  mirrorPath: string,
): AnimationStarterPackEntry {
  return {
    id,
    kind: "character",
    role,
    title,
    mirrorPath,
    source: "kenney",
    pack: "blocky-characters",
    license: "CC0",
    sourcePage: KENNEY_LICENSE_PAGE,
    tags: ["animation", "stylized", "low-poly", "character", "humanoid", "starter", role, "rigged", "animated", "mouth", "viseme", "expression", "primitive mouth-card fallback"],
    bounds: [0.8, 1.7, 0.8],
    hasAnimations: true,
    triangles: 8_000,
  };
}

function starterProp(
  id: string,
  role: Extract<AnimationStarterPackRole, "furniture" | "vehicle" | "nature" | "tool">,
  title: string,
  mirrorPath: string,
  tags: readonly string[],
): AnimationStarterPackEntry {
  return {
    id,
    kind: "prop",
    role,
    title,
    mirrorPath,
    source: "kenney",
    pack: "animation-starter-props",
    license: "CC0",
    sourcePage: KENNEY_LICENSE_PAGE,
    tags: ["animation", "stylized", "low-poly", "prop", "starter", role, ...tags],
    bounds: [1, 1, 1],
    hasAnimations: false,
    triangles: 12_000,
  };
}

function starterSet(
  id: string,
  role: Extract<AnimationStarterPackRole, "indoor-room" | "outdoor-park" | "school" | "space-station" | "underwater" | "moon-garden">,
  title: string,
  mirrorPath: string,
  tags: readonly string[],
): AnimationStarterPackEntry {
  return {
    id,
    kind: "set",
    role,
    title,
    mirrorPath,
    source: "kenney",
    pack: "animation-starter-sets",
    license: "CC0",
    sourcePage: KENNEY_LICENSE_PAGE,
    tags: ["animation", "stylized", "low-poly", "set", "environment", "starter", role, ...tags],
    bounds: [6, 2, 6],
    hasAnimations: false,
    triangles: 40_000,
  };
}

function toCanonical(entry: AnimationStarterPackEntry): AuraCanonicalAsset {
  return {
    id: entry.id,
    source: `starter:${entry.source}`,
    title: entry.title,
    description: `Curated ${entry.kind} for the Aura3D animation starter pack. Role: ${entry.role}. Source pack: ${entry.pack}.`,
    url: `${CDN_BASE}/${entry.mirrorPath}`,
    access: "direct-download",
    format: "glb",
    license: normalizeLicense(entry.license, entry.sourcePage),
    sourcePage: entry.sourcePage,
    attribution: "Kenney",
    tags: entry.tags,
    bounds: { size: entry.bounds },
    hasAnimations: entry.hasAnimations,
    triangles: entry.triangles,
  };
}
