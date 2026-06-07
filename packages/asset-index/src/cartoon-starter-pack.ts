import type { AuraCanonicalAsset } from "./CanonicalAsset.js";
import { normalizeLicense } from "./CanonicalAsset.js";
import type { AdapterContext, ResolveQuery, SourceAdapter } from "./SourceAdapter.js";

export type CartoonStarterPackRole =
  | "hero"
  | "sidekick"
  | "villain"
  | "narrator"
  | "background"
  | "furniture"
  | "vehicle"
  | "nature"
  | "tool"
  | "indoor-room"
  | "outdoor-park"
  | "school"
  | "space-station"
  | "underwater";

export type CartoonStarterPackKind = "character" | "prop" | "set";

export interface CartoonStarterPackEntry {
  readonly id: string;
  readonly kind: CartoonStarterPackKind;
  readonly role: CartoonStarterPackRole;
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

export const cartoonStarterPack: readonly CartoonStarterPackEntry[] = [
  starterCharacter("cartoon-starter:hero", "hero", "Hero Character", "kenney/blocky-characters/character-a.glb"),
  starterCharacter("cartoon-starter:sidekick", "sidekick", "Sidekick Character", "kenney/blocky-characters/character-b.glb"),
  starterCharacter("cartoon-starter:villain", "villain", "Villain Character", "kenney/blocky-characters/character-c.glb"),
  starterCharacter("cartoon-starter:narrator", "narrator", "Narrator Character", "kenney/blocky-characters/character-d.glb"),
  starterCharacter("cartoon-starter:background-kid", "background", "Background Character", "kenney/blocky-characters/character-e.glb"),
  starterProp("cartoon-starter:prop-stool", "furniture", "Classroom Stool Prop", "kenney/fantasy-town-kit/stall-stool.glb", ["stool", "chair", "furniture", "classroom"]),
  starterProp("cartoon-starter:prop-bench-table", "furniture", "Activity Bench Table Prop", "kenney/fantasy-town-kit/stall-bench.glb", ["bench", "table", "desk", "furniture"]),
  starterProp("cartoon-starter:prop-delivery-car", "vehicle", "Tiny Delivery Vehicle Prop", "kenney/car-kit/delivery.glb", ["vehicle", "car", "street"]),
  starterProp("cartoon-starter:prop-tree", "nature", "Rounded Park Tree Prop", "kenney/city-kit-suburban/tree-small.glb", ["tree", "nature", "park"]),
  starterProp("cartoon-starter:prop-flower", "nature", "Garden Flower Prop", "kenney/platformer-kit/flowers.glb", ["flower", "nature", "garden"]),
  starterProp("cartoon-starter:prop-key", "tool", "Story Key Prop", "kenney/platformer-kit/key.glb", ["key", "tool", "story"]),
  starterProp("cartoon-starter:prop-crate", "tool", "Utility Crate Prop", "kenney/platformer-kit/crate.glb", ["crate", "tool", "storage"]),
  starterProp("cartoon-starter:prop-sign", "tool", "Direction Sign Prop", "kenney/platformer-kit/sign.glb", ["sign", "tool", "label"]),
  starterProp("cartoon-starter:prop-bench", "furniture", "Park Bench Prop", "kenney/graveyard-kit/bench.glb", ["bench", "furniture", "park"]),
  starterProp("cartoon-starter:prop-boat", "vehicle", "Toy Boat Vehicle Prop", "kenney/pirate-kit/boat-row-small.glb", ["boat", "vehicle", "water"]),
  starterSet("cartoon-starter:set-indoor-room", "indoor-room", "Indoor Room Set", "kenney/modular-dungeon-kit/room-large.glb", ["room", "indoor", "set", "walkable"]),
  starterSet("cartoon-starter:set-outdoor-park", "outdoor-park", "Outdoor Park Set", "kenney/platformer-kit/block-grass-large.glb", ["park", "outdoor", "set", "walkable"]),
  starterSet("cartoon-starter:set-school", "school", "School Room Set", "kenney/modular-dungeon-kit/room-wide.glb", ["school", "classroom", "set", "walkable"]),
  starterSet("cartoon-starter:set-space-station", "space-station", "Space Station Set", "kenney/modular-space-kit/room-large.glb", ["space", "station", "set", "walkable"]),
  starterSet("cartoon-starter:set-underwater", "underwater", "Underwater Cove Set", "kenney/pirate-kit/ship-wreck.glb", ["underwater", "ocean", "set", "walkable"]),
] as const;

export function cartoonStarterPackSummary(): {
  readonly characterCount: number;
  readonly propCount: number;
  readonly setCount: number;
  readonly allLicenseVerified: boolean;
} {
  return {
    characterCount: cartoonStarterPack.filter((entry) => entry.kind === "character").length,
    propCount: cartoonStarterPack.filter((entry) => entry.kind === "prop").length,
    setCount: cartoonStarterPack.filter((entry) => entry.kind === "set").length,
    allLicenseVerified: cartoonStarterPack.every((entry) => entry.license === "CC0" && entry.sourcePage.length > 0),
  };
}

export function cartoonStarterPackAssets(): readonly AuraCanonicalAsset[] {
  return cartoonStarterPack.map(toCanonical);
}

export function createCartoonStarterPackAdapter(): SourceAdapter {
  return {
    id: "cartoon-starter-pack",
    label: "Aura3D curated cartoon starter pack",
    async search(_query: ResolveQuery, _ctx: AdapterContext) {
      return cartoonStarterPackAssets();
    },
  };
}

function starterCharacter(
  id: string,
  role: Extract<CartoonStarterPackRole, "hero" | "sidekick" | "villain" | "narrator" | "background">,
  title: string,
  mirrorPath: string,
): CartoonStarterPackEntry {
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
    tags: ["cartoon", "stylized", "low-poly", "character", "humanoid", "starter", role],
    bounds: [0.8, 1.7, 0.8],
    hasAnimations: true,
    triangles: 8_000,
  };
}

function starterProp(
  id: string,
  role: Extract<CartoonStarterPackRole, "furniture" | "vehicle" | "nature" | "tool">,
  title: string,
  mirrorPath: string,
  tags: readonly string[],
): CartoonStarterPackEntry {
  return {
    id,
    kind: "prop",
    role,
    title,
    mirrorPath,
    source: "kenney",
    pack: "cartoon-starter-props",
    license: "CC0",
    sourcePage: KENNEY_LICENSE_PAGE,
    tags: ["cartoon", "stylized", "low-poly", "prop", "starter", role, ...tags],
    bounds: [1, 1, 1],
    hasAnimations: false,
    triangles: 12_000,
  };
}

function starterSet(
  id: string,
  role: Extract<CartoonStarterPackRole, "indoor-room" | "outdoor-park" | "school" | "space-station" | "underwater">,
  title: string,
  mirrorPath: string,
  tags: readonly string[],
): CartoonStarterPackEntry {
  return {
    id,
    kind: "set",
    role,
    title,
    mirrorPath,
    source: "kenney",
    pack: "cartoon-starter-sets",
    license: "CC0",
    sourcePage: KENNEY_LICENSE_PAGE,
    tags: ["cartoon", "stylized", "low-poly", "set", "environment", "starter", role, ...tags],
    bounds: [6, 2, 6],
    hasAnimations: false,
    triangles: 40_000,
  };
}

function toCanonical(entry: CartoonStarterPackEntry): AuraCanonicalAsset {
  return {
    id: entry.id,
    source: `starter:${entry.source}`,
    title: entry.title,
    description: `Curated ${entry.kind} for the Aura3D cartoon starter pack. Role: ${entry.role}. Source pack: ${entry.pack}.`,
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
