import { games, looks, material, model, primitives, type AuraSceneNode } from "@aura3d/engine";
import { assets } from "../aura-assets";

/**
 * IRON CROWN venues.
 *
 * Each stage composes three layers:
 *  1. a biome `looks.preset` (world/lighting/fog/post)
 *  2. a `games.fighting.stagePreset` build (fight lane, floor, combat bounds)
 *     re-paletted per venue
 *  3. bespoke dressing nodes — all parked behind the fight plane (z <= -1.1)
 *     or overhead so silhouettes stay readable.
 */

export type StageId =
  | "neo-tokyo-rooftop"
  | "bangkok-dock"
  | "colosseum-ruins"
  | "desert-airbase"
  | "himalayan-monastery"
  | "crown-arena";

type PresetName = "training-grid" | "rooftop-city" | "neon-dojo" | "industrial-arena";

export interface IronStage {
  readonly id: StageId;
  readonly label: string;
  readonly venue: string;
  readonly lookId: "night-city" | "golden-hour" | "outdoor-day" | "overcast" | "alpine-snow" | "arena-fight";
  readonly lookOverrides?: { readonly accent?: string; readonly exposureEv?: number; readonly fogDensityScale?: number };
  readonly preset: PresetName;
  /** Rim-light accent (the fight-lane "aura" colour). */
  readonly accent: string;
  readonly stage: ReturnType<typeof games.fighting.stagePreset>;
  readonly issues: readonly { readonly severity: string; readonly code: string; readonly message: string }[];
  readonly bounds: { readonly minX: number; readonly maxX: number };
  readonly dressing: readonly AuraSceneNode[];
}

function prop(kind: "box" | "sphere" | "plane" | "cylinder" | "capsule" | "torus", name: string, pos: readonly [number, number, number], scale: number | readonly [number, number, number], color: string, opts: { readonly emissive?: number; readonly roughness?: number; readonly metallic?: number } = {}): AuraSceneNode {
  const emissive = opts.emissive ?? 0;
  return primitives[kind]({
    name,
    material: material.pbr({
      color,
      roughness: opts.roughness ?? 0.68,
      metallic: opts.metallic ?? 0.08,
      ...(emissive > 0 ? { emissive: color, emissiveIntensity: emissive } : {})
    })
  })
    .position(pos[0], pos[1], pos[2])
    .scale(scale as [number, number, number])
    .toJSON();
}

function makeStage(
  id: StageId,
  label: string,
  venue: string,
  lookId: IronStage["lookId"],
  preset: PresetName,
  palette: { floor: string; lane: string; aura: string; warning: string; skyline: string; fog: string },
  dressing: readonly AuraSceneNode[],
  lookOverrides?: IronStage["lookOverrides"]
): IronStage {
  const stage = games.fighting.stagePreset(preset, {
    id,
    width: 7.8,
    depth: 2.5,
    safeInset: 0.5,
    palette
  });
  return {
    id,
    label,
    venue,
    lookId,
    lookOverrides,
    preset,
    accent: palette.aura,
    stage,
    issues: games.fighting.validateStage(stage).map((issue) => ({
      severity: issue.severity,
      code: issue.code,
      message: issue.message
    })),
    bounds: { minX: stage.combatBounds.minX, maxX: stage.combatBounds.maxX },
    dressing
  };
}

/* ------------------------------------------------------------------ */
/* 1 · Neo-Tokyo rooftop — rain-slick night towers behind the fight.    */
/* ------------------------------------------------------------------ */
const NEO_TOKYO = makeStage(
  "neo-tokyo-rooftop",
  "Neo-Tokyo Rooftop",
  "Shinjuku ward · night",
  "night-city",
  "rooftop-city",
  { floor: "#0d1119", lane: "#ff5cbe", aura: "#6ee7ff", warning: "#ffd166", skyline: "#141c33", fog: "#060a14" },
  [
    // Neon signage stack (left tower)
    prop("box", "nt-tower-l", [-4.6, 2.6, -2.6], [1.1, 5.2, 0.9], "#101828", { roughness: 0.8 }),
    prop("box", "nt-sign-1", [-4.52, 3.4, -2.1], [0.16, 1.9, 0.5], "#ff2fa0", { emissive: 1.6 }),
    prop("box", "nt-sign-2", [-4.52, 1.6, -2.1], [0.16, 0.9, 0.4], "#35d5ff", { emissive: 1.4 }),
    // Neon signage stack (right tower)
    prop("box", "nt-tower-r", [4.8, 3.1, -3.1], [1.3, 6.2, 1.0], "#0c1424", { roughness: 0.8 }),
    prop("box", "nt-sign-3", [4.72, 4.2, -2.55], [0.16, 2.4, 0.5], "#ffd166", { emissive: 1.5 }),
    prop("box", "nt-sign-4", [4.72, 2.0, -2.55], [0.16, 1.1, 0.4], "#7d6bff", { emissive: 1.3 }),
    // Roof clutter: vent boxes + antenna
    prop("box", "nt-vent-1", [-2.9, 0.28, -1.4], [0.9, 0.55, 0.6], "#2a3140", { roughness: 0.9 }),
    prop("box", "nt-vent-2", [3.1, 0.22, -1.5], [0.7, 0.44, 0.5], "#232b3a", { roughness: 0.9 }),
    prop("cylinder", "nt-antenna", [0.0, 2.4, -2.9], [0.05, 4.8, 0.05], "#39445c", { roughness: 0.7, metallic: 0.5 }),
    prop("sphere", "nt-antenna-tip", [0.0, 4.9, -2.9], [0.09, 0.09, 0.09], "#ff4f46", { emissive: 2.0 }),
    // Holo billboard ring
    prop("torus", "nt-holo-ring", [2.4, 3.4, -2.4], [0.9, 0.9, 0.9], "#35d5ff", { emissive: 0.9 })
  ],
  { accent: "#ff5cbe", exposureEv: 0.05, fogDensityScale: 0.9 }
);

/* ------------------------------------------------------------------ */
/* 2 · Bangkok dock market — warm dusk, boats, awnings, lanterns.       */
/* ------------------------------------------------------------------ */
const BANGKOK = makeStage(
  "bangkok-dock",
  "Bangkok Dock Market",
  "Khlong pier · golden hour",
  "golden-hour",
  "training-grid",
  { floor: "#241a12", lane: "#ffab4d", aura: "#ffe08a", warning: "#ff6b4a", skyline: "#3a2418", fog: "#1c1008" },
  [
    // Market stalls with striped awnings
    prop("box", "bk-stall-l", [-3.4, 0.95, -1.7], [1.5, 1.5, 0.7], "#5a3a24", { roughness: 0.85 }),
    prop("box", "bk-awning-l", [-3.4, 1.85, -1.6], [1.8, 0.14, 0.9], "#d8452e", { roughness: 0.7 }),
    prop("box", "bk-stall-r", [3.5, 0.95, -1.8], [1.4, 1.5, 0.7], "#52351f", { roughness: 0.85 }),
    prop("box", "bk-awning-r", [3.5, 1.85, -1.7], [1.7, 0.14, 0.9], "#e8b23c", { roughness: 0.7 }),
    // Hanging lantern strings (emissive)
    prop("sphere", "bk-lan-1", [-1.8, 2.6, -1.5], [0.14, 0.17, 0.14], "#ff9d3c", { emissive: 1.8 }),
    prop("sphere", "bk-lan-2", [-0.6, 2.75, -1.5], [0.14, 0.17, 0.14], "#ffd166", { emissive: 1.8 }),
    prop("sphere", "bk-lan-3", [0.6, 2.7, -1.5], [0.14, 0.17, 0.14], "#ff9d3c", { emissive: 1.8 }),
    prop("sphere", "bk-lan-4", [1.8, 2.62, -1.5], [0.14, 0.17, 0.14], "#ff6b4a", { emissive: 1.7 }),
    // Long-tail boat silhouette on the water line
    prop("box", "bk-boat", [-0.4, 0.18, -3.2], [2.6, 0.36, 0.7], "#2e2016", { roughness: 0.9 }),
    prop("cylinder", "bk-boat-pole", [-1.5, 0.9, -3.2], [0.04, 1.5, 0.04], "#3a2a1a", { roughness: 0.9 }),
    // Temple silhouette far back
    prop("cylinder", "bk-spire", [4.4, 2.2, -4.4], [0.35, 3.2, 0.35], "#6b4a2a", { roughness: 0.8, metallic: 0.3 }),
    prop("sphere", "bk-spire-top", [4.4, 3.9, -4.4], [0.3, 0.5, 0.3], "#e8b23c", { emissive: 0.4, metallic: 0.6 })
  ],
  { accent: "#ffab4d", exposureEv: 0.1, fogDensityScale: 0.55 }
);

/* ------------------------------------------------------------------ */
/* 3 · Roman colosseum ruins — bright dust, broken colonnade.           */
/* ------------------------------------------------------------------ */
const COLOSSEUM = makeStage(
  "colosseum-ruins",
  "Colosseum Ruins",
  "Rome · midday dust",
  "outdoor-day",
  "industrial-arena",
  { floor: "#3a2f22", lane: "#e8c98a", aura: "#ffe9b0", warning: "#c86a3a", skyline: "#6b5636", fog: "#caa66a" },
  [
    // Broken colonnade
    prop("cylinder", "co-col-1", [-3.8, 1.6, -1.9], [0.32, 3.2, 0.32], "#cbbfa4", { roughness: 0.95 }),
    prop("cylinder", "co-col-2", [-2.5, 1.15, -2.0], [0.32, 2.3, 0.32], "#bfb296", { roughness: 0.95 }),
    prop("cylinder", "co-col-3", [2.6, 1.9, -2.0], [0.32, 3.8, 0.32], "#cbbfa4", { roughness: 0.95 }),
    prop("cylinder", "co-col-4", [3.9, 1.0, -1.9], [0.32, 2.0, 0.32], "#b3a686", { roughness: 0.95 }),
    // Architrave spans
    prop("box", "co-arch-1", [-3.15, 3.1, -1.95], [1.7, 0.35, 0.4], "#c4b696", { roughness: 0.95 }),
    prop("box", "co-arch-2", [3.25, 3.6, -1.95], [1.75, 0.35, 0.4], "#c4b696", { roughness: 0.95 }),
    // Rubble + banner cloth
    prop("box", "co-rubble-1", [-1.6, 0.16, -1.4], [0.7, 0.32, 0.5], "#a89574", { roughness: 1 }),
    prop("box", "co-rubble-2", [1.9, 0.12, -1.3], [0.55, 0.24, 0.45], "#9a8a6a", { roughness: 1 }),
    prop("box", "co-banner", [-2.5, 2.5, -1.86], [0.5, 1.0, 0.04], "#8a2f24", { roughness: 0.8 }),
    // Arena wall silhouette
    prop("box", "co-wall", [0, 1.5, -4.6], [10.5, 3.0, 0.5], "#8f7d5c", { roughness: 1 })
  ],
  { accent: "#e8c98a", exposureEv: 0.14, fogDensityScale: 0.4 }
);

/* ------------------------------------------------------------------ */
/* 4 · Nevada desert airbase — flat light, hangar, windsock, tower.     */
/* ------------------------------------------------------------------ */
const AIRBASE = makeStage(
  "desert-airbase",
  "Desert Airbase",
  "Nevada range · dusk ops",
  "overcast",
  "industrial-arena",
  { floor: "#2b2620", lane: "#ffb03c", aura: "#ffe08a", warning: "#ff5c3c", skyline: "#54402a", fog: "#241a10" },
  [
    // Quonset hangar silhouette
    prop("cylinder", "ab-hangar", [0.4, 1.5, -4.2], [2.4, 2.4, 1.7], "#3d4a55", { roughness: 0.75, metallic: 0.35 }),
    // Control tower
    prop("box", "ab-tower-base", [-4.2, 1.5, -3.4], [0.8, 3.0, 0.8], "#46545f", { roughness: 0.8 }),
    prop("box", "ab-tower-top", [-4.2, 3.2, -3.4], [1.3, 0.8, 1.1], "#5a6b78", { roughness: 0.7 }),
    prop("box", "ab-tower-glass", [-4.2, 3.15, -2.85], [1.1, 0.5, 0.06], "#ffcf6e", { emissive: 1.2 }),
    // Windsock on pole
    prop("cylinder", "ab-pole", [4.0, 1.6, -2.2], [0.05, 3.2, 0.05], "#5c666f", { metallic: 0.5, roughness: 0.5 }),
    prop("capsule", "ab-sock", [4.35, 3.05, -2.2], [0.5, 0.16, 0.16], "#ff7a2e", { emissive: 0.35 }),
    // Fuel drums + runway edge lights
    prop("cylinder", "ab-drum-1", [-2.6, 0.35, -1.5], [0.3, 0.7, 0.3], "#7a4a2a", { roughness: 0.8, metallic: 0.3 }),
    prop("cylinder", "ab-drum-2", [-2.2, 0.35, -1.45], [0.3, 0.7, 0.3], "#5c6b3a", { roughness: 0.8, metallic: 0.3 }),
    prop("sphere", "ab-light-l", [-3.6, 0.08, -0.9], [0.07, 0.07, 0.07], "#ff5c3c", { emissive: 2.2 }),
    prop("sphere", "ab-light-r", [3.6, 0.08, -0.9], [0.07, 0.07, 0.07], "#ff5c3c", { emissive: 2.2 }),
    // Parked jet silhouette
    prop("capsule", "ab-jet", [4.6, 0.55, -3.6], [1.9, 0.4, 0.4], "#39434d", { roughness: 0.55, metallic: 0.5 }),
    prop("box", "ab-jet-wing", [4.6, 0.6, -3.6], [0.5, 0.06, 1.6], "#333d46", { roughness: 0.6, metallic: 0.45 })
  ],
  { accent: "#ffb03c", exposureEv: 0.02, fogDensityScale: 0.5 }
);

/* ------------------------------------------------------------------ */
/* 5 · Himalayan monastery — cold air, prayer flags, stone lions.       */
/* ------------------------------------------------------------------ */
const MONASTERY = makeStage(
  "himalayan-monastery",
  "Himalayan Monastery",
  "High pass · thin air",
  "alpine-snow",
  "training-grid",
  { floor: "#1c2230", lane: "#7dd7ff", aura: "#bfeaff", warning: "#ffb84d", skyline: "#2c3a55", fog: "#0d1420" },
  [
    // Monastery gate pillars + roof
    prop("box", "mo-pillar-l", [-3.9, 1.5, -2.2], [0.55, 3.0, 0.55], "#7a2f2a", { roughness: 0.85 }),
    prop("box", "mo-pillar-r", [3.9, 1.5, -2.2], [0.55, 3.0, 0.55], "#7a2f2a", { roughness: 0.85 }),
    prop("box", "mo-roof", [0, 3.15, -2.2], [8.6, 0.45, 0.9], "#b8862e", { roughness: 0.55, metallic: 0.45 }),
    prop("box", "mo-roof-up", [0, 3.55, -2.2], [6.4, 0.4, 0.7], "#8a5f1e", { roughness: 0.6, metallic: 0.4 }),
    // Prayer-flag line (alternating colours)
    prop("box", "mo-flag-1", [-2.4, 2.55, -1.7], [0.3, 0.24, 0.03], "#2b6cff", { emissive: 0.25 }),
    prop("box", "mo-flag-2", [-1.7, 2.6, -1.7], [0.3, 0.24, 0.03], "#f0f0f0", { emissive: 0.2 }),
    prop("box", "mo-flag-3", [-1.0, 2.62, -1.7], [0.3, 0.24, 0.03], "#d8452e", { emissive: 0.25 }),
    prop("box", "mo-flag-4", [1.0, 2.62, -1.7], [0.3, 0.24, 0.03], "#35a05c", { emissive: 0.25 }),
    prop("box", "mo-flag-5", [1.7, 2.6, -1.7], [0.3, 0.24, 0.03], "#e8b23c", { emissive: 0.3 }),
    prop("box", "mo-flag-6", [2.4, 2.55, -1.7], [0.3, 0.24, 0.03], "#2b6cff", { emissive: 0.25 }),
    // Stone lions + braziers
    prop("sphere", "mo-lion-l", [-3.0, 0.5, -1.3], [0.4, 0.5, 0.35], "#8a8f99", { roughness: 1 }),
    prop("sphere", "mo-lion-r", [3.0, 0.5, -1.3], [0.4, 0.5, 0.35], "#8a8f99", { roughness: 1 }),
    prop("cylinder", "mo-braz-l", [-1.4, 0.4, -1.2], [0.22, 0.55, 0.22], "#4a3a2a", { metallic: 0.5, roughness: 0.6 }),
    prop("sphere", "mo-fire-l", [-1.4, 0.82, -1.2], [0.2, 0.26, 0.2], "#ff9d3c", { emissive: 1.9 }),
    prop("cylinder", "mo-braz-r", [1.4, 0.4, -1.2], [0.22, 0.55, 0.22], "#4a3a2a", { metallic: 0.5, roughness: 0.6 }),
    prop("sphere", "mo-fire-r", [1.4, 0.82, -1.2], [0.2, 0.26, 0.2], "#ff9d3c", { emissive: 1.9 }),
    // Distant peaks
    prop("box", "mo-peak-1", [-3.2, 2.4, -5.6], [3.4, 4.8, 0.8], "#dfe8f4", { roughness: 1 }),
    prop("box", "mo-peak-2", [3.0, 2.0, -5.9], [3.0, 4.0, 0.8], "#cdd8e8", { roughness: 1 })
  ],
  { accent: "#7dd7ff", exposureEv: 0.1, fogDensityScale: 0.75 }
);

/* ------------------------------------------------------------------ */
/* 6 · Crown Arena — the throne room. Gold, crimson, the crown itself.  */
/* ------------------------------------------------------------------ */
const CROWN = makeStage(
  "crown-arena",
  "Crown Arena",
  "The throne · final venue",
  "arena-fight",
  "neon-dojo",
  { floor: "#160c14", lane: "#ffd76a", aura: "#ff4f46", warning: "#ffd76a", skyline: "#2a1024", fog: "#0c060c" },
  [
    // Throne backdrop
    prop("box", "cr-throne-base", [0, 0.55, -3.4], [1.6, 1.1, 0.9], "#3a2430", { roughness: 0.7 }),
    prop("box", "cr-throne-back", [0, 2.0, -3.6], [1.3, 3.4, 0.35], "#4a2a3a", { roughness: 0.65 }),
    // The Iron Crown itself — bespoke Meshy prop (crown on velvet cushion),
    // grounded on the throne seat in front of the throne-back.
    model(assets.ironcrownCrown, { name: "cr-iron-crown", targetMaxDimension: 1.0 })
      .position(0, 1.1, -3.5)
      .toJSON(),
    // Banner columns
    prop("cylinder", "cr-col-l", [-4.0, 2.0, -2.4], [0.3, 4.0, 0.3], "#3a2430", { roughness: 0.8 }),
    prop("box", "cr-banner-l", [-4.0, 3.1, -2.05], [0.7, 1.8, 0.05], "#8a1f2a", { roughness: 0.75 }),
    prop("sphere", "cr-flame-l", [-4.0, 4.2, -2.4], [0.22, 0.3, 0.22], "#ff8a3c", { emissive: 1.8 }),
    prop("cylinder", "cr-col-r", [4.0, 2.0, -2.4], [0.3, 4.0, 0.3], "#3a2430", { roughness: 0.8 }),
    prop("box", "cr-banner-r", [4.0, 3.1, -2.05], [0.7, 1.8, 0.05], "#8a1f2a", { roughness: 0.75 }),
    prop("sphere", "cr-flame-r", [4.0, 4.2, -2.4], [0.22, 0.3, 0.22], "#ff8a3c", { emissive: 1.8 }),
    // Crowd silhouette band
    prop("box", "cr-crowd", [0, 1.3, -5.4], [11, 2.6, 0.4], "#160a18", { roughness: 1 })
  ],
  { accent: "#ffd76a", exposureEv: 0.08, fogDensityScale: 0.7 }
);

export const STAGES: readonly IronStage[] = [NEO_TOKYO, BANGKOK, COLOSSEUM, AIRBASE, MONASTERY, CROWN];

export const STAGE_MAP: ReadonlyMap<StageId, IronStage> = new Map(STAGES.map((s) => [s.id, s]));

export function stageById(id: StageId): IronStage {
  const stage = STAGE_MAP.get(id);
  if (!stage) throw new Error(`IRON_CROWN_STAGE_UNKNOWN: "${id}"`);
  return stage;
}

export const DEFAULT_STAGE: StageId = "crown-arena";
