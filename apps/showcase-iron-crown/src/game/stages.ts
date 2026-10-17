import { games, material, model, primitives, type AuraSceneNode } from "@aura3d/engine";
import { assets as rootAssets } from "../../../../src/aura-assets";
import { assets } from "../aura-assets";

/**
 * IRON CROWN venues.
 *
 * Each stage composes three layers:
 *  1. a biome `looks.preset` (world/lighting/fog/post)
 *  2. a `games.fighting.stagePreset` build (fight lane, floor, combat bounds)
 *     re-paletted per venue
 *  3. bespoke 3D GLB dressing nodes — all parked behind the fight plane (z <= -1.1)
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

export interface StagePalette {
  readonly floor: string;
  readonly lane: string;
  readonly aura: string;
  readonly warning: string;
  readonly skyline: string;
  readonly fog: string;
}

export interface IronStage {
  readonly id: StageId;
  readonly label: string;
  readonly venue: string;
  readonly lookId: "night-city" | "golden-hour" | "outdoor-day" | "overcast" | "alpine-snow" | "arena-fight";
  readonly lookOverrides?: { readonly accent?: string; readonly exposureEv?: number; readonly fogDensityScale?: number };
  readonly preset: PresetName;
  readonly palette: StagePalette;
  /** Rim-light accent (the fight-lane "aura" colour). */
  readonly accent: string;
  readonly stage: ReturnType<typeof games.fighting.stagePreset>;
  readonly issues: readonly { readonly severity: string; readonly code: string; readonly message: string }[];
  readonly bounds: { readonly minX: number; readonly maxX: number };
  readonly dressing: readonly AuraSceneNode[];
}

function modelProp(
  asset: Parameters<typeof model>[0],
  name: string,
  pos: readonly [number, number, number],
  targetMaxDimension: number,
  rotY = 0
): AuraSceneNode {
  return model(asset, { name, targetMaxDimension })
    .position(pos[0], pos[1], pos[2])
    .rotate(0, rotY, 0)
    .toJSON();
}

function buildArenaFloorDeck(id: StageId, palette: StagePalette): readonly AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [
    primitives
      .box({
        name: `${id}-obsidian-subfloor`,
        material: material.pbr({
          color: palette.floor,
          roughness: 0.48,
          metallic: 0.24
        })
      })
      .position(0, -0.14, 0)
      .scale([44, 0.2, 32])
      .toJSON()
  ];

  const plankZs = [-13.2, -11.0, -8.8, -6.6, -4.4, -2.2, 0.0, 2.2, 4.4, 6.6, 8.8, 11.0, 13.2];
  plankZs.forEach((z, idx) => {
    const even = idx % 2 === 0;
    nodes.push(
      primitives
        .box({
          name: `${id}-stone-plank-${idx}`,
          material: material.pbr({
            color: even ? palette.floor : palette.skyline,
            roughness: even ? 0.42 : 0.54,
            metallic: even ? 0.28 : 0.18
          })
        })
        .position(0, -0.036, z)
        .scale([38, 0.055, 2.06])
        .toJSON()
    );
  });

  const trimZs = [-12.1, -9.9, -7.7, -5.5, -3.3, -1.32, 1.32, 3.3, 5.5, 7.7, 9.9, 12.1];
  trimZs.forEach((z, idx) => {
    const isCombatEdge = Math.abs(Math.abs(z) - 1.32) < 0.1;
    const trimColor = isCombatEdge ? palette.lane : palette.warning;
    nodes.push(
      primitives
        .box({
          name: `${id}-gold-trim-z-${idx}`,
          material: material.pbr({
            color: trimColor,
            emissive: trimColor,
            emissiveIntensity: isCombatEdge ? 0.42 : 0.18,
            roughness: 0.28,
            metallic: 0.65
          })
        })
        .position(0, -0.012, z)
        .scale([36, 0.022, isCombatEdge ? 0.09 : 0.055])
        .toJSON()
    );
  });

  for (const side of [-1, 1] as const) {
    nodes.push(
      primitives
        .box({
          name: `${id}-ring-border-x-${side > 0 ? "r" : "l"}`,
          material: material.pbr({
            color: palette.warning,
            emissive: palette.warning,
            emissiveIntensity: 0.25,
            roughness: 0.3,
            metallic: 0.62
          })
        })
        .position(side * 3.9, -0.01, 0)
        .scale([0.08, 0.024, 28])
        .toJSON()
    );
  }

  return nodes;
}

function makeStage(
  id: StageId,
  label: string,
  venue: string,
  lookId: IronStage["lookId"],
  preset: PresetName,
  palette: StagePalette,
  dressing: readonly AuraSceneNode[],
  lookOverrides?: IronStage["lookOverrides"]
): IronStage {
  const stage = games.fighting.stagePreset(preset, {
    id,
    width: 7.8,
    depth: 30,
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
    palette,
    accent: palette.aura,
    stage,
    issues: games.fighting.validateStage(stage).map((issue) => ({
      severity: issue.severity,
      code: issue.code,
      message: issue.message
    })),
    bounds: { minX: stage.combatBounds.minX, maxX: stage.combatBounds.maxX },
    dressing: [...buildArenaFloorDeck(id, palette), ...dressing]
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
    modelProp(rootAssets.showcaseModernBuildingOne, "nt-tower-l", [-4.6, 0, -3.4], 5.6, 0.2),
    modelProp(rootAssets.showcaseModernOfficeBuilding, "nt-tower-r", [4.8, 0, -3.6], 6.0, -0.2),
    modelProp(rootAssets.heatsinkHoloBillboard, "nt-holo-sign-l", [-2.9, 1.8, -2.5], 2.2, 0.15),
    modelProp(rootAssets.heatsinkHoloBillboard, "nt-holo-sign-r", [2.9, 1.9, -2.5], 2.2, -0.15),
    modelProp(rootAssets.neonCyberPylonMeshy, "nt-pylon-l", [-3.8, 0, -1.8], 2.4, 0.3),
    modelProp(rootAssets.neonCyberPylonMeshy, "nt-pylon-r", [3.8, 0, -1.8], 2.4, -0.3),
    modelProp(rootAssets.reactorFusionTurbineMeshy, "nt-vent-1", [-1.9, 0, -1.8], 1.3, 0.4),
    modelProp(rootAssets.reactorFusionTurbineMeshy, "nt-vent-2", [1.9, 0, -1.8], 1.3, -0.4),
    modelProp(rootAssets.neonStreetLampProp, "nt-lamp-l", [-3.2, 0, -1.4], 2.2, 0),
    modelProp(rootAssets.neonStreetLampProp, "nt-lamp-r", [3.2, 0, -1.4], 2.2, Math.PI),
    modelProp(rootAssets.auraClashStageSpeakerTowerMeshy, "nt-speaker-c", [0, 0, -2.9], 2.5, 0)
  ],
  { accent: "#ff5cbe", exposureEv: 0.05, fogDensityScale: 0.9 }
);

/* ------------------------------------------------------------------ */
/* 2 · Bangkok dock market — warm dusk, stalls, lanterns, shrine.      */
/* ------------------------------------------------------------------ */
const BANGKOK = makeStage(
  "bangkok-dock",
  "Bangkok Dock Market",
  "Khlong pier · golden hour",
  "golden-hour",
  "training-grid",
  { floor: "#241a12", lane: "#ffab4d", aura: "#ffe08a", warning: "#ff6b4a", skyline: "#3a2418", fog: "#1c1008" },
  [
    modelProp(rootAssets.courierNeonStorefrontMeshy, "bk-stall-l", [-3.5, 0, -2.2], 2.8, 0.22),
    modelProp(rootAssets.courierNeonStorefrontMeshy, "bk-stall-r", [3.5, 0, -2.2], 2.8, -0.22),
    modelProp(rootAssets.showcaseTeaHouse, "bk-shrine", [0, 0, -3.5], 3.6, 0),
    modelProp(rootAssets.courierDeliveryKioskMeshy, "bk-kiosk-l", [-2.1, 0, -1.8], 1.7, 0.3),
    modelProp(rootAssets.courierDeliveryKioskMeshy, "bk-kiosk-r", [2.1, 0, -1.8], 1.7, -0.3),
    modelProp(rootAssets.auraClashCornerBrazierPylonMeshy, "bk-lan-l", [-3.1, 0, -1.4], 1.9, 0),
    modelProp(rootAssets.auraClashCornerBrazierPylonMeshy, "bk-lan-r", [3.1, 0, -1.4], 1.9, 0),
    modelProp(rootAssets.gullsiegeCrateMeshy, "bk-crate-l", [-1.5, 0, -1.45], 0.85, 0.4),
    modelProp(rootAssets.gullsiegeBarrelMeshy, "bk-barrel-r", [1.5, 0, -1.45], 0.8, -0.3)
  ],
  { accent: "#ffab4d", exposureEv: 0.1, fogDensityScale: 0.55 }
);

/* ------------------------------------------------------------------ */
/* 3 · Roman colosseum ruins — bright dust, colonnade, statues.        */
/* ------------------------------------------------------------------ */
const COLOSSEUM = makeStage(
  "colosseum-ruins",
  "Colosseum Ruins",
  "Rome · midday dust",
  "outdoor-day",
  "industrial-arena",
  { floor: "#3a2f22", lane: "#e8c98a", aura: "#ffe9b0", warning: "#c86a3a", skyline: "#6b5636", fog: "#caa66a" },
  [
    modelProp(rootAssets.gullsiegeGatehouseMeshy, "co-gate-center", [0, 0, -3.4], 3.8, 0),
    modelProp(rootAssets.gullsiegeWatchtowerMeshy, "co-tower-l", [-3.9, 0, -2.5], 3.4, 0.2),
    modelProp(rootAssets.gullsiegeWatchtowerMeshy, "co-tower-r", [3.9, 0, -2.5], 3.4, -0.2),
    modelProp(rootAssets.heatsinkArch, "co-arch-l", [-2.4, 0, -2.2], 2.6, 0.1),
    modelProp(rootAssets.heatsinkArch, "co-arch-r", [2.4, 0, -2.2], 2.6, -0.1),
    modelProp(rootAssets.galleryMarbleBustExhibitMeshy, "co-bust-l", [-1.6, 0, -1.55], 1.45, 0.35),
    modelProp(rootAssets.galleryMarbleBustExhibitMeshy, "co-bust-r", [1.6, 0, -1.55], 1.45, -0.35),
    modelProp(rootAssets.propBoulder, "co-rubble-l", [-2.9, 0, -1.45], 1.1, 0.5),
    modelProp(rootAssets.propRockA, "co-rubble-r", [2.9, 0, -1.45], 1.0, -0.4)
  ],
  { accent: "#e8c98a", exposureEv: 0.14, fogDensityScale: 0.4 }
);

/* ------------------------------------------------------------------ */
/* 4 · Nevada desert airbase — hangar, radar tower, parked fighter jet. */
/* ------------------------------------------------------------------ */
const AIRBASE = makeStage(
  "desert-airbase",
  "Desert Airbase",
  "Nevada range · dusk ops",
  "overcast",
  "industrial-arena",
  { floor: "#2b2620", lane: "#ffb03c", aura: "#ffe08a", warning: "#ff5c3c", skyline: "#54402a", fog: "#241a10" },
  [
    modelProp(rootAssets.patrolJetAircraftMeshy, "ab-jet-center", [0.4, 0.15, -3.0], 3.8, -0.35),
    modelProp(rootAssets.patrolCoastalRadarTowerMeshy, "ab-tower-l", [-4.0, 0, -2.8], 3.5, 0.25),
    modelProp(rootAssets.auroraFuelDepotTankMeshy, "ab-fuel-r", [3.8, 0, -2.6], 2.6, -0.2),
    modelProp(rootAssets.bunkerBarrelMeshy, "ab-drum-1", [-2.6, 0, -1.5], 0.85, 0.2),
    modelProp(rootAssets.bunkerBarrelMeshy, "ab-drum-2", [-2.1, 0, -1.45], 0.85, -0.4),
    modelProp(rootAssets.bunkerCrateMeshy, "ab-crate-1", [2.5, 0, -1.5], 0.95, 0.3),
    modelProp(rootAssets.auroraPadBeacon, "ab-light-l", [-3.5, 0, -1.25], 0.9, 0),
    modelProp(rootAssets.auroraPadBeacon, "ab-light-r", [3.5, 0, -1.25], 0.9, 0)
  ],
  { accent: "#ffb03c", exposureEv: 0.02, fogDensityScale: 0.5 }
);

/* ------------------------------------------------------------------ */
/* 5 · Himalayan monastery — cold air, temple, dragon guardians.       */
/* ------------------------------------------------------------------ */
const MONASTERY = makeStage(
  "himalayan-monastery",
  "Himalayan Monastery",
  "High pass · thin air",
  "alpine-snow",
  "training-grid",
  { floor: "#1c2230", lane: "#7dd7ff", aura: "#bfeaff", warning: "#ffb84d", skyline: "#2c3a55", fog: "#0d1420" },
  [
    modelProp(rootAssets.showcaseTeaHouse, "mo-monastery", [0, 0, -3.4], 4.2, 0),
    modelProp(rootAssets.clashDragonStatueMeshy, "mo-dragon-l", [-2.8, 0, -1.6], 1.85, 0.45),
    modelProp(rootAssets.clashDragonStatueMeshy, "mo-dragon-r", [2.8, 0, -1.6], 1.85, -0.45),
    modelProp(rootAssets.auraClashCornerBrazierPylonMeshy, "mo-braz-l", [-1.5, 0, -1.4], 1.65, 0),
    modelProp(rootAssets.auraClashCornerBrazierPylonMeshy, "mo-braz-r", [1.5, 0, -1.4], 1.65, 0),
    modelProp(rootAssets.propPineTree, "mo-pine-l", [-4.3, 0, -2.6], 3.2, 0.2),
    modelProp(rootAssets.propPineTree, "mo-pine-r", [4.3, 0, -2.6], 3.2, -0.2),
    modelProp(rootAssets.propBoulder, "mo-peak-l", [-3.5, 0, -4.4], 2.8, 0.3),
    modelProp(rootAssets.propBoulder, "mo-peak-r", [3.5, 0, -4.4], 2.6, -0.3)
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
    // Throne pedestal + club throne + trophy arch
    modelProp(rootAssets.galleryShiftPedestal, "cr-throne-pedestal", [0, 0, -2.5], 1.35, 0),
    modelProp(rootAssets.billiardsClubChairMeshy, "cr-throne-chair", [0, 0, -3.2], 2.1, 0),
    // The Iron Crown itself — bespoke Meshy prop (crown on velvet cushion),
    // grounded on the pedestal in the center of the arena backdrop.
    model(assets.ironcrownCrown, { name: "cr-iron-crown", targetMaxDimension: 1.05 })
      .position(0, 1.18, -2.5)
      .toJSON(),
    // Dragon guardians flanking the throne
    modelProp(rootAssets.clashDragonStatueMeshy, "cr-dragon-l", [-2.2, 0, -2.1], 2.1, 0.45),
    modelProp(rootAssets.clashDragonStatueMeshy, "cr-dragon-r", [2.2, 0, -2.1], 2.1, -0.45),
    // Corner fire braziers
    modelProp(rootAssets.auraClashCornerBrazierPylonMeshy, "cr-brazier-l", [-3.5, 0, -1.65], 2.2, 0.2),
    modelProp(rootAssets.auraClashCornerBrazierPylonMeshy, "cr-brazier-r", [3.5, 0, -1.65], 2.2, -0.2),
    // Trophy cabinets & speaker towers at the arena wings
    modelProp(rootAssets.billiardsTrophyCabinetMeshy, "cr-cabinet-l", [-4.3, 0, -2.8], 2.6, 0.25),
    modelProp(rootAssets.billiardsTrophyCabinetMeshy, "cr-cabinet-r", [4.3, 0, -2.8], 2.6, -0.25),
    modelProp(rootAssets.auraClashStageSpeakerTowerMeshy, "cr-speaker-l", [-4.9, 0, -2.2], 2.5, 0.35),
    modelProp(rootAssets.auraClashStageSpeakerTowerMeshy, "cr-speaker-r", [4.9, 0, -2.2], 2.5, -0.35)
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
