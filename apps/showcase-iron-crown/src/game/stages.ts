import { games, material, model, primitives, type AuraLookId, type AuraSceneNode } from "@aura3d/engine";
import { stageAssets } from "./stage-assets";
import { assets } from "../aura-assets";
import { stageLook } from "./look";
import { venueBackdrop } from "./backdrop";
import { floorDetailFields } from "./surfaces";
import { CROWD_IDS } from "./ambientMotion";
import { buildOriginalFloorDeck } from "./originalLook";

/**
 * IRON CROWN venues.
 *
 * Each stage composes three layers:
 *  1. its own look row (look.ts STAGE_LOOKS: HDRI, time of day, key, fog, post, grade; GU47 WP-15)
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
  /** The look preset of the venue's row in look.ts (its overrides live there too). */
  readonly lookId: AuraLookId;
  readonly preset: PresetName;
  readonly palette: StagePalette;
  /** The venue's one accent (look.ts STAGE_LOOKS[id].accent). */
  readonly accent: string;
  readonly stage: ReturnType<typeof games.fighting.stagePreset>;
  readonly issues: readonly { readonly severity: string; readonly code: string; readonly message: string }[];
  readonly bounds: { readonly minX: number; readonly maxX: number };
  readonly dressing: readonly AuraSceneNode[];
  /** The 4.6.2 dressing (its floor deck, the same props, no far backdrop) for the 4.6.2 look (originalLook.ts). */
  readonly originalDressing: readonly AuraSceneNode[];
}

/**
 * A static dressing prop. `role: "primaryWorld"` consolidates the GLB's static meshes per material at load (engine
 * `consolidateStaticMeshes`; animated, skinned or morphing GLBs are left as they are), so a many-mesh prop such as the
 * tea house or the office tower costs a handful of draws instead of thousands (IC47-PF1 / IC47-A2 interim until the
 * WP-36 single-material remeshes land).
 */
function modelProp(
  asset: Parameters<typeof model>[0],
  name: string,
  pos: readonly [number, number, number],
  targetMaxDimension: number,
  rotY = 0
): AuraSceneNode {
  return model(asset, { name, targetMaxDimension, role: "primaryWorld" })
    .position(pos[0], pos[1], pos[2])
    .rotate(0, rotY, 0)
    .toJSON();
}

type FloorPart = { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] };
const floorPart = (position: [number, number, number], scale: [number, number, number]): FloorPart => ({ position, rotation: [0, 0, 0], scale });

/**
 * The hero floor deck (IC47-M1, IC47-PF1): the venue's own finish from its look row (obsidian with a gold inlay, wet
 * concrete, oiled teak, packed sand, sun-baked tarmac, frosted slate) on one subfloor, two instanced plank courses and
 * two instanced inlay courses (the combat edge in the venue accent). Instancing takes the deck from 38 draws to 14.
 */
function buildArenaFloorDeck(id: StageId, palette: StagePalette): readonly AuraSceneNode[] {
  const look = stageLook(id);
  const finish = look.floor;
  const nodes: AuraSceneNode[] = [
    primitives
      .box({
        name: `${id}-subfloor`,
        material: material.pbr({ color: finish.base, roughness: Math.min(1, finish.roughness + 0.12), metallic: finish.metallic }),
        castShadow: false
      })
      .position(0, -0.14, 0)
      .scale([44, 0.2, 32])
      .toJSON()
  ];

  const plankZs = [-13.2, -11.0, -8.8, -6.6, -4.4, -2.2, 0.0, 2.2, 4.4, 6.6, 8.8, 11.0, 13.2];
  const planks = (even: boolean) => plankZs.filter((_, idx) => (idx % 2 === 0) === even).map((z) => floorPart([0, -0.036, z], [38, 0.055, 2.06]));
  nodes.push(
    primitives
      .box({
        name: `${id}-floor-planks-a`,
        material: material.pbr({
          color: finish.base,
          roughness: finish.roughness,
          metallic: finish.metallic,
          clearcoat: finish.clearcoat,
          clearcoatRoughness: 0.18,
          ...floorDetailFields(id)
        }),
        instances: planks(true),
        castShadow: false,
        receiveShadow: true
      })
      .toJSON(),
    primitives
      .box({
        name: `${id}-floor-planks-b`,
        material: material.pbr({
          color: finish.plank,
          roughness: Math.min(1, finish.roughness + 0.08),
          metallic: finish.metallic * 0.8,
          clearcoat: finish.clearcoat * 0.6,
          clearcoatRoughness: 0.3,
          ...floorDetailFields(id)
        }),
        instances: planks(false),
        castShadow: false,
        receiveShadow: true
      })
      .toJSON()
  );

  // Inlaid light strips: practicals, not fill (art-direction `emissive-fill` rule).
  const trimZs = [-12.1, -9.9, -7.7, -5.5, -3.3, -1.32, 1.32, 3.3, 5.5, 7.7, 9.9, 12.1];
  const isCombatEdge = (z: number) => Math.abs(Math.abs(z) - 1.32) < 0.1;
  nodes.push(
    primitives
      .box({
        name: `${id}-inlay-combat-edge`,
        material: material.pbr({ color: look.accent, emissive: look.accent, emissiveIntensity: finish.inlayGlow + 0.14, roughness: 0.28, metallic: 0.65, practical: true }),
        instances: trimZs.filter(isCombatEdge).map((z) => floorPart([0, -0.012, z], [36, 0.022, 0.09])),
        castShadow: false,
        receiveShadow: false
      })
      .toJSON(),
    primitives
      .box({
        name: `${id}-inlay-courses`,
        material: material.pbr({ color: finish.inlay, emissive: finish.inlay, emissiveIntensity: finish.inlayGlow * 0.55, roughness: 0.28, metallic: 0.65, practical: true }),
        instances: [
          ...trimZs.filter((z) => !isCombatEdge(z)).map((z) => floorPart([0, -0.012, z], [36, 0.022, 0.055])),
          floorPart([-3.9, -0.01, 0], [0.08, 0.024, 28]),
          floorPart([3.9, -0.01, 0], [0.08, 0.024, 28])
        ],
        castShadow: false,
        receiveShadow: false
      })
      .toJSON()
  );

  // Elliptical ring apron: two inlaid light lines frame the fight lane and
  // read as a real arena ring instead of an unmarked slab.
  const ringSegments = 56;
  const ringA: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  const ringB: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  for (let i = 0; i < ringSegments; i += 1) {
    const a = (i / ringSegments) * Math.PI * 2;
    const tx = -Math.sin(a) * 4.35;
    const tz = Math.cos(a) * 2.95;
    const yaw = -Math.atan2(tz, tx);
    ringA.push({ position: [Math.cos(a) * 4.35, -0.003, Math.sin(a) * 2.95], rotation: [0, yaw, 0], scale: [0.46, 0.012, 0.06] });
    const tx2 = -Math.sin(a) * 3.5;
    const tz2 = Math.cos(a) * 2.3;
    ringB.push({ position: [Math.cos(a) * 3.5, -0.004, Math.sin(a) * 2.3], rotation: [0, -Math.atan2(tz2, tx2), 0], scale: [0.34, 0.01, 0.035] });
  }
  nodes.push(
    primitives
      .box({
        name: `${id}-stage-ring`,
        material: material.emissive({ color: finish.inlay, emissive: finish.inlay, emissiveIntensity: 0.62, roughness: 0.28, metalness: 0.5 }),
        instances: ringA,
        castShadow: false,
        receiveShadow: false
      })
      .toJSON(),
    primitives
      .box({
        name: `${id}-stage-ring-inner`,
        material: material.emissive({ color: look.accent, emissive: look.accent, emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.45 }),
        instances: ringB,
        castShadow: false,
        receiveShadow: false
      })
      .toJSON()
  );

  // Floor medallion + 12-spoke crown star centred in the apron.
  const star: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    star.push({
      position: [0, -0.002, 0.95],
      rotation: [0, -a, 0],
      scale: [i % 3 === 0 ? 1.5 : 1.05, 0.011, i % 3 === 0 ? 0.07 : 0.042]
    });
  }
  nodes.push(
    primitives
      .cylinder({
        name: `${id}-stage-medallion`,
        material: material.physical({ color: palette.skyline, roughness: 0.28, metallic: 0.52, clearcoat: 0.36, clearcoatRoughness: 0.22 }),
        castShadow: false,
        receiveShadow: true
      })
      .position(0, -0.006, 0.95)
      .scale([3.1, 0.014, 2.15])
      .toJSON(),
    primitives
      .cylinder({
        name: `${id}-stage-medallion-hub`,
        material: material.emissive({ color: finish.inlay, emissive: finish.inlay, emissiveIntensity: 0.36, roughness: 0.25, metalness: 0.55 }),
        castShadow: false,
        receiveShadow: false
      })
      .position(0, 0.001, 0.95)
      .scale([0.62, 0.012, 0.62])
      .toJSON(),
    primitives
      .box({
        name: `${id}-stage-star`,
        material: material.emissive({ color: finish.inlay, emissive: finish.inlay, emissiveIntensity: 0.22, roughness: 0.3, metalness: 0.5 }),
        instances: star,
        castShadow: false,
        receiveShadow: false
      })
      .toJSON()
  );

  // Low apron lip across the near edge of the ring and two approach rails
  // carry the eye into the bottom third of the frame.
  nodes.push(
    primitives
      .box({
        name: `${id}-ring-lip-front`,
        material: material.brushedMetal({ color: palette.skyline, roughness: 0.28 })
      })
      .position(0, 0.028, 3.28)
      .scale([13.4, 0.075, 0.2])
      .toJSON(),
    primitives
      .box({
        name: `${id}-ring-lip-back`,
        material: material.brushedMetal({ color: palette.skyline, roughness: 0.3 })
      })
      .position(0, 0.022, -2.9)
      .scale([12.2, 0.06, 0.18])
      .toJSON(),
    primitives
      .box({
        name: `${id}-ring-lip-glow`,
        material: material.emissive({ color: look.accent, emissive: look.accent, emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.4 }),
        castShadow: false,
        receiveShadow: false
      })
      .position(0, 0.067, 3.28)
      .scale([13.4, 0.012, 0.06])
      .toJSON(),
    primitives
      .box({
        name: `${id}-approach-rails`,
        material: material.emissive({ color: look.accent, emissive: look.accent, emissiveIntensity: 0.2, roughness: 0.32, metalness: 0.4 }),
        instances: [floorPart([-3.35, -0.002, 5.05], [0.055, 0.012, 3.5]), floorPart([3.35, -0.002, 5.05], [0.055, 0.012, 3.5])],
        castShadow: false,
        receiveShadow: false
      })
      .toJSON()
  );

  return nodes;
}

function makeStage(
  id: StageId,
  label: string,
  venue: string,
  preset: PresetName,
  palette: StagePalette,
  dressing: readonly AuraSceneNode[]
): IronStage {
  const stage = games.fighting.stagePreset(preset, {
    id,
    width: 7.8,
    depth: 30,
    safeInset: 0.5,
    palette
  });
  const look = stageLook(id);
  return {
    id,
    label,
    venue,
    lookId: look.look,
    preset,
    palette,
    accent: look.accent,
    stage,
    issues: games.fighting.validateStage(stage).map((issue) => ({
      severity: issue.severity,
      code: issue.code,
      message: issue.message
    })),
    bounds: { minX: stage.combatBounds.minX, maxX: stage.combatBounds.maxX },
    // IC47-W1: the far backdrop (10-60 m) sits behind the dressing.
    dressing: [...buildArenaFloorDeck(id, palette), ...dressing, ...venueBackdrop(id)],
    originalDressing: [...buildOriginalFloorDeck(id, palette), ...dressing]
  };
}

/* ------------------------------------------------------------------ */
/* 1 · Neo-Tokyo rooftop — rain-slick night towers behind the fight.    */
/* ------------------------------------------------------------------ */
const NEO_TOKYO = makeStage(
  "neo-tokyo-rooftop",
  "Neo-Tokyo Rooftop",
  "Shinjuku ward · midnight rain",
  "rooftop-city",
  { floor: "#0d1119", lane: "#ff5cbe", aura: "#6ee7ff", warning: "#ffd166", skyline: "#141c33", fog: "#060a14" },
  [
    modelProp(stageAssets.showcaseModernBuildingOne, "nt-tower-l", [-4.6, 0, -3.4], 5.6, 0.2),
    modelProp(stageAssets.showcaseModernOfficeBuilding, "nt-tower-r", [4.8, 0, -3.6], 6.0, -0.2),
    modelProp(stageAssets.heatsinkHoloBillboard, "nt-holo-sign-l", [-2.9, 1.8, -2.5], 2.2, 0.15),
    modelProp(stageAssets.heatsinkHoloBillboard, "nt-holo-sign-r", [2.9, 1.9, -2.5], 2.2, -0.15),
    modelProp(assets.ironcrownRooftopPowerBox, "nt-pylon-l", [-3.8, 0, -1.8], 2.4, 0.3),
    modelProp(assets.ironcrownRooftopPowerBox, "nt-pylon-r", [3.8, 0, -1.8], 2.4, -0.3),
    modelProp(assets.ironcrownRooftopAircon, "nt-vent-1", [-1.9, 0, -1.8], 1.3, 0.4),
    modelProp(assets.ironcrownRooftopAircon, "nt-vent-2", [1.9, 0, -1.8], 1.3, -0.4),
    modelProp(assets.ironcrownStreetLamp, "nt-lamp-l", [-3.2, 0, -1.4], 2.2, 0),
    modelProp(assets.ironcrownStreetLamp, "nt-lamp-r", [3.2, 0, -1.4], 2.2, Math.PI),
    modelProp(assets.ironcrownSearchlight, "nt-speaker-c", [0, 0, -2.9], 2.5, 0)
  ]
);

/* ------------------------------------------------------------------ */
/* 2 · Bangkok dock market — warm dusk, stalls, lanterns, shrine.      */
/* ------------------------------------------------------------------ */
const BANGKOK = makeStage(
  "bangkok-dock",
  "Lantern Dock Market",
  "Stilt pier · dusk over water",
  "training-grid",
  { floor: "#241a12", lane: "#ffab4d", aura: "#ffe08a", warning: "#ff6b4a", skyline: "#3a2418", fog: "#1c1008" },
  [
    modelProp(stageAssets.courierNeonStorefrontMeshy, "bk-stall-l", [-3.5, 0, -2.2], 2.8, 0.22),
    modelProp(stageAssets.courierNeonStorefrontMeshy, "bk-stall-r", [3.5, 0, -2.2], 2.8, -0.22),
    modelProp(assets.ironcrownShrine, "bk-shrine", [0, 0, -3.5], 4.0, 0),
    modelProp(assets.ironcrownDockVendorCart, "bk-kiosk-l", [-2.1, 0, -1.8], 1.7, 0.3),
    modelProp(assets.ironcrownDockVendorCart, "bk-kiosk-r", [2.1, 0, -1.8], 1.7, -0.3),
    modelProp(assets.ironcrownBrazierPylon, "bk-lan-l", [-3.1, 0, -1.4], 1.9, 0),
    modelProp(assets.ironcrownBrazierPylon, "bk-lan-r", [3.1, 0, -1.4], 1.9, 0),
    modelProp(assets.ironcrownDockCrate, "bk-crate-l", [-1.5, 0, -1.45], 0.85, 0.4),
    modelProp(assets.ironcrownDockBarrel, "bk-barrel-r", [1.5, 0, -1.45], 0.8, -0.3)
  ]
);

/* ------------------------------------------------------------------ */
/* 3 · Roman colosseum ruins — bright dust, colonnade, statues.        */
/* ------------------------------------------------------------------ */
const COLOSSEUM = makeStage(
  "colosseum-ruins",
  "Colosseum Ruins",
  "Rome · harsh-noon dust",
  "industrial-arena",
  { floor: "#3a2f22", lane: "#e8c98a", aura: "#ffe9b0", warning: "#c86a3a", skyline: "#6b5636", fog: "#caa66a" },
  [
    modelProp(stageAssets.gullsiegeGatehouseMeshy, "co-gate-center", [0, 0, -3.4], 3.8, 0),
    modelProp(assets.ironcrownTowerA, "co-tower-l", [-3.9, 0, -2.5], 4.6, 0.2),
    modelProp(assets.ironcrownTowerA, "co-tower-r", [3.9, 0, -2.5], 4.6, -0.2),
    modelProp(stageAssets.heatsinkArch, "co-arch-l", [-2.4, 0, -2.2], 2.6, 0.1),
    modelProp(stageAssets.heatsinkArch, "co-arch-r", [2.4, 0, -2.2], 2.6, -0.1),
    modelProp(assets.ironcrownColosseumBust, "co-bust-l", [-1.6, 0, -1.55], 1.45, 0.35),
    modelProp(assets.ironcrownColosseumBust, "co-bust-r", [1.6, 0, -1.55], 1.45, -0.35),
    modelProp(stageAssets.propBoulder, "co-rubble-l", [-2.9, 0, -1.45], 1.1, 0.5),
    modelProp(stageAssets.propRockA, "co-rubble-r", [2.9, 0, -1.45], 1.0, -0.4)
  ]
);

/* ------------------------------------------------------------------ */
/* 4 · Nevada desert airbase — hangar, radar tower, parked fighter jet. */
/* ------------------------------------------------------------------ */
const AIRBASE = makeStage(
  "desert-airbase",
  "Dustline Airstrip",
  "Salt flat range · sunset haze",
  "industrial-arena",
  { floor: "#2b2620", lane: "#ffb03c", aura: "#ffe08a", warning: "#ff5c3c", skyline: "#54402a", fog: "#241a10" },
  [
    // The parked plane (the name keeps the 4.6.2 "jet" id: refinedLook.ts GROUNDED_PROPS and its test key on it).
    modelProp(assets.ironcrownHangarPlane, "ab-jet-center", [0.4, 0, -3.0], 4.6, -0.12),
    modelProp(stageAssets.patrolCoastalRadarTowerMeshy, "ab-tower-l", [-4.0, 0, -2.8], 3.5, 0.25),
    modelProp(stageAssets.auroraFuelDepotTankMeshy, "ab-fuel-r", [3.8, 0, -2.6], 2.6, -0.2),
    modelProp(stageAssets.bunkerBarrelMeshy, "ab-drum-1", [-2.6, 0, -1.5], 0.85, 0.2),
    modelProp(stageAssets.bunkerBarrelMeshy, "ab-drum-2", [-2.1, 0, -1.45], 0.85, -0.4),
    modelProp(stageAssets.bunkerCrateMeshy, "ab-crate-1", [2.5, 0, -1.5], 0.95, 0.3),
    modelProp(stageAssets.auroraPadBeacon, "ab-light-l", [-3.5, 0, -1.25], 0.9, 0),
    modelProp(stageAssets.auroraPadBeacon, "ab-light-r", [3.5, 0, -1.25], 0.9, 0)
  ]
);

/* ------------------------------------------------------------------ */
/* 5 · Himalayan monastery — cold air, temple, dragon guardians.       */
/* ------------------------------------------------------------------ */
const MONASTERY = makeStage(
  "himalayan-monastery",
  "Cloudstep Monastery",
  "High pass · cold dawn snow",
  "training-grid",
  { floor: "#1c2230", lane: "#7dd7ff", aura: "#bfeaff", warning: "#ffb84d", skyline: "#2c3a55", fog: "#0d1420" },
  [
    modelProp(assets.ironcrownHall, "mo-monastery", [0, 0, -3.4], 4.6, 0),
    modelProp(stageAssets.clashDragonStatueMeshy, "mo-dragon-l", [-2.8, 0, -1.6], 1.85, 0.45),
    modelProp(stageAssets.clashDragonStatueMeshy, "mo-dragon-r", [2.8, 0, -1.6], 1.85, -0.45),
    modelProp(assets.ironcrownBrazierPylon, "mo-braz-l", [-1.5, 0, -1.4], 1.65, 0),
    modelProp(assets.ironcrownBrazierPylon, "mo-braz-r", [1.5, 0, -1.4], 1.65, 0),
    modelProp(stageAssets.propPineTree, "mo-pine-l", [-4.3, 0, -2.6], 3.2, 0.2),
    modelProp(stageAssets.propPineTree, "mo-pine-r", [4.3, 0, -2.6], 3.2, -0.2),
    modelProp(assets.ironcrownTowerB, "mo-pagoda-l", [-4.9, 0, -4.2], 6.2, 0.3),
    modelProp(assets.ironcrownTowerB, "mo-pagoda-r", [4.9, 0, -4.2], 6.2, -0.3)
  ]
);


/**
 * Trophy cabinets at the arena wings, built from primitives: wood frame, shelves with gold cups, and flat crimson banners
 * with gold borders on the back panel. They replace a scanned cabinet whose texture atlas held framed photographs of real
 * people (see tests/unit/likeness-audit/iron-crown-stage-props.test.ts). Two cabinets share one instanced node per part,
 * so the whole set is eight draws.
 */
type Part = { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] };
function buildTrophyCabinets(): readonly AuraSceneNode[] {
  const CABINET_X = [-4.3, 4.3] as const;
  const CZ = -2.8, W = 2.6, H = 2.6, D = 0.95;
  const frame: Part[] = [], back: Part[] = [], shelves: Part[] = [], gold: Part[] = [], cups: Part[] = [], silver: Part[] = [], glass: Part[] = [], banner: Part[] = [], border: Part[] = [];
  const part = (position: [number, number, number], scale: [number, number, number]): Part => ({ position, rotation: [0, 0, 0], scale });
  for (const cx of CABINET_X) {
    back.push(part([cx, H / 2, CZ - D / 2 + 0.05], [W - 0.2, H - 0.3, 0.08]));
    frame.push(
      part([cx - W / 2 + 0.06, H / 2, CZ], [0.12, H, D]),
      part([cx + W / 2 - 0.06, H / 2, CZ], [0.12, H, D]),
      part([cx, H - 0.07, CZ], [W, 0.14, D]),
      part([cx, 0.11, CZ], [W, 0.22, D])
    );
    gold.push(part([cx, H + 0.03, CZ], [W + 0.2, 0.08, D + 0.1]));
    glass.push(part([cx, H / 2, CZ + D / 2 - 0.03], [W - 0.24, H - 0.36, 0.02]));
    for (const y of [0.62, 1.12, 1.62, 2.12]) {
      shelves.push(part([cx, y, CZ + 0.02], [W - 0.28, 0.05, D - 0.18]));
      for (let i = 0; i < 5; i += 1) {
        const x = cx - 0.95 + i * 0.475;
        const h = 0.2 + ((i + Math.round(y * 10)) % 3) * 0.07;
        const target = (i + Math.round(y * 5)) % 2 === 0 ? cups : silver;
        target.push(part([x, y + 0.025 + h / 2, CZ + 0.04], [0.14, h, 0.14]));
        gold.push(part([x, y + 0.025 + h + 0.05, CZ + 0.04], [0.19, 0.08, 0.19]));
      }
    }
    for (const bx of [-0.62, 0.62]) {
      border.push(part([cx + bx, 1.37, CZ - D / 2 + 0.1], [0.56, 1.02, 0.02]));
      banner.push(part([cx + bx, 1.37, CZ - D / 2 + 0.115], [0.5, 0.96, 0.02]));
    }
  }
  const box = (name: string, mat: ReturnType<typeof material.pbr>, instances: Part[]) =>
    primitives.box({ name, material: mat, instances, castShadow: false, receiveShadow: true }).toJSON();
  const wood = material.lacquer({ color: "#2b160d", roughness: 0.26 });
  const goldMat = material.brushedMetal({ color: "#d9a441", roughness: 0.22 });
  const silverMat = material.brushedMetal({ color: "#cbd5e1", roughness: 0.26 });
  return [
    box("cr-cabinet-frame", wood, frame),
    box("cr-cabinet-back", material.fabric({ color: "#2a0f16", roughness: 0.88 }), back),
    box("cr-cabinet-shelves", material.physical({ color: "#4e2d1b", roughness: 0.42, metallic: 0.08, clearcoat: 0.22 }), shelves),
    box("cr-cabinet-trim", goldMat, gold),
    primitives.cylinder({ name: "cr-cabinet-cups", material: goldMat, instances: cups, castShadow: false, receiveShadow: true }).toJSON(),
    primitives.cylinder({ name: "cr-cabinet-silver", material: silverMat, instances: silver, castShadow: false, receiveShadow: true }).toJSON(),
    box("cr-cabinet-banner-border", goldMat, border),
    box("cr-cabinet-banner", material.fabric({ color: "#7a1620", roughness: 0.84 }), banner),
    primitives.box({ name: "cr-cabinet-glass", material: material.clearGlass({ color: "#dce8f5", opacity: 0.16, roughness: 0.08 }), instances: glass, castShadow: false, receiveShadow: false }).toJSON()
  ];
}

/** Height of the stepped obsidian-and-brass throne dais (`z = -3.45`); the throne chair sits directly atop it. */
export const PLINTH_TOP = 0.34;
export const PLINTH_Z = -3.45;

function buildThronePlinth(): readonly AuraSceneNode[] {
  const z = PLINTH_Z;
  const obsidian = material.physical({
    color: "#1b161f",
    roughness: 0.28,
    metallic: 0.16,
    clearcoat: 0.44,
    clearcoatRoughness: 0.18,
    ...floorDetailFields("crown-arena")
  });
  const brass = material.brushedMetal({ color: "#d9a441", roughness: 0.24 });
  const velvet = material.fabric({ color: "#5a0f1a", roughness: 0.86 });
  return [
    primitives.box({ name: "cr-throne-plinth-base", material: obsidian, castShadow: true, receiveShadow: true }).position(0, 0.06, z).scale([2.55, 0.12, 1.88]).toJSON(),
    primitives.box({ name: "cr-throne-plinth-column", material: obsidian, castShadow: true, receiveShadow: true }).position(0, 0.19, z).scale([2.06, 0.14, 1.54]).toJSON(),
    primitives.box({ name: "cr-throne-plinth-band", material: brass, castShadow: false, receiveShadow: true }).position(0, 0.28, z).scale([2.14, 0.04, 1.62]).toJSON(),
    primitives.box({ name: "cr-throne-plinth-cap", material: velvet, castShadow: false, receiveShadow: true }).position(0, PLINTH_TOP - 0.02, z).scale([1.92, 0.04, 1.44]).toJSON()
  ];
}

/* ------------------------------------------------------------------ */
/* Crown Arena theatre dressing                                         */
/* ------------------------------------------------------------------ */

/**
 * Back-of-house structure for the throne venue: a dark arena wall, three
 * rings of articulated crowd silhouettes, and two forged lighting trusses. Everything sits
 * behind the fight plane so the fighters keep a clean silhouette.
 */
function buildCrownTheater(palette: StagePalette): readonly AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  const steel = material.brushedMetal({ color: "#201b28", roughness: 0.34 });
  const darkCloth = material.fabric({ color: "#120b12", roughness: 0.92 });

  nodes.push(
    primitives.box({ name: "cr-back-wall", material: darkCloth, castShadow: false })
      .position(0, 3.9, -12.2).scale([34, 7.8, 0.8]).toJSON(),
    primitives.box({ name: "cr-back-wall-band", material: material.pbr({ color: palette.warning, emissive: palette.warning, emissiveIntensity: 0.34, roughness: 0.34, metallic: 0.5, practical: true }), castShadow: false, receiveShadow: false })
      .position(0, 6.0, -11.75).scale([27, 0.08, 0.04]).toJSON()
  );

  // Tiered crowd decks.
  const tierZ = [-7.0, -8.2, -9.4];
  for (let row = 0; row < tierZ.length; row += 1) {
    nodes.push(
      primitives.box({ name: `cr-crowd-deck-${row}`, material: steel, castShadow: false })
        .position(0, 0.48 + row * 0.52, tierZ[row]).scale([28, 0.5, 1.35]).toJSON()
    );
  }

  const bodies: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  const heads: { position: [number, number, number]; scale: [number, number, number] }[] = [];
  const mantles: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  const arms: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  const bodyColors: string[] = [];
  const headColors: string[] = [];
  const mantleColors: string[] = [];
  const crowdTint = ["#1b121e", "#2b1620", "#15101a", "#331a22", "#1e1a28"];
  const skinHoodTint = ["#261920", "#1d141c", "#322026", "#201824"];
  for (let row = 0; row < tierZ.length; row += 1) {
    let col = 0;
    for (let x = -11.4; x <= 11.4; x += 0.78) {
      const jitter = ((Math.sin((col + 1) * 12.9898 + row * 78.233) * 43758.5453) % 1 + 1) % 1;
      const px = x + (jitter - 0.5) * 0.24;
      const py = 0.74 + row * 0.52;
      const hScale = 0.92 + jitter * 0.18;
      const yaw = -Math.atan2(px, Math.abs(tierZ[row]!)) * 0.45 + (jitter - 0.5) * 0.22;
      bodies.push({ position: [px, py, tierZ[row]!], rotation: [0, yaw, 0], scale: [0.34, 0.54 * hScale, 0.28] });
      mantles.push({ position: [px, py + 0.16 * hScale, tierZ[row]!], rotation: [0, yaw, Math.PI / 2], scale: [0.2, 0.46, 0.24] });
      heads.push({ position: [px, py + 0.45 * hScale, tierZ[row]!], scale: [0.22, 0.26, 0.22] });
      const tone = crowdTint[(col + row) % crowdTint.length]!;
      bodyColors.push(tone);
      mantleColors.push(crowdTint[(col + row + 1) % crowdTint.length]!);
      headColors.push(skinHoodTint[(col + row + 2) % skinHoodTint.length]!);
      if ((col + row) % 3 === 0) {
        const side = col % 2 === 0 ? 1 : -1;
        arms.push({
          position: [px + side * 0.22, py + 0.38 * hScale, tierZ[row]! + 0.06],
          rotation: [0.22, yaw, side * -0.38],
          scale: [0.09, 0.34, 0.09]
        });
      }
      col += 1;
    }
  }
  const cloakMat = material.fabric({ color: "#ffffff", roughness: 0.9 });
  nodes.push(
    // IC47-AN2: runtime ids so the crowd can bob (game/ambientMotion.ts).
    primitives.capsule({ name: "cr-crowd-bodies", material: cloakMat, instances: bodies, instanceColors: bodyColors, castShadow: false, receiveShadow: false }).runtime({ id: CROWD_IDS.bodies }).toJSON(),
    primitives.capsule({ name: "cr-crowd-mantles", material: cloakMat, instances: mantles, instanceColors: mantleColors, castShadow: false, receiveShadow: false }).toJSON(),
    primitives.sphere({ name: "cr-crowd-heads", material: material.pbr({ color: "#ffffff", roughness: 0.84 }), instances: heads, instanceColors: headColors, castShadow: false, receiveShadow: false }).runtime({ id: CROWD_IDS.heads }).toJSON(),
    primitives.capsule({ name: "cr-crowd-arms", material: material.fabric({ color: "#24151e", roughness: 0.9 }), instances: arms, castShadow: false, receiveShadow: false }).toJSON()
  );

  // Sparse torch/ember arena lights in the stands (marked practical).
  const crowdLights: { position: [number, number, number]; scale: [number, number, number] }[] = [];
  const crowdLightColors: string[] = [];
  for (let i = 0; i < 42; i += 1) {
    const row = i % tierZ.length;
    const spread = ((Math.sin((i + 3) * 7.31) * 24634.6345) % 1 + 1) % 1;
    crowdLights.push({ position: [-11.2 + spread * 22.4, 1.34 + row * 0.52, tierZ[row]! - 0.1], scale: [0.075, 0.075, 0.03] });
    crowdLightColors.push(i % 5 === 0 ? palette.aura : i % 3 === 0 ? "#8ee6ff" : palette.warning);
  }
  nodes.push(
    primitives.box({ name: "cr-crowd-lights", material: material.pbr({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.15, roughness: 0.3, practical: true }), instances: crowdLights, instanceColors: crowdLightColors, castShadow: false, receiveShadow: false }).toJSON()
  );

  // Lighting trusses and warm lens cans.
  for (const side of [-1, 1] as const) {
    const x = side * 6.3;
    nodes.push(
      primitives.box({ name: `cr-truss-post-${side > 0 ? "r" : "l"}`, material: steel, castShadow: false })
        .position(x, 2.5, -5.6).scale([0.16, 5.0, 0.16]).toJSON(),
      primitives.box({ name: `cr-truss-foot-${side > 0 ? "r" : "l"}`, material: steel, castShadow: false })
        .position(x, 0.12, -5.6).scale([0.72, 0.24, 0.72]).toJSON(),
      primitives.sphere({ name: `cr-truss-lens-${side > 0 ? "r" : "l"}`, material: material.pbr({ color: palette.warning, emissive: palette.warning, emissiveIntensity: 1.1, roughness: 0.24, practical: true }), castShadow: false, receiveShadow: false })
        .position(x, 4.9, -5.55).scale([0.15, 0.15, 0.15]).toJSON()
    );
  }
  nodes.push(
    primitives.box({ name: "cr-truss-beam", material: steel, castShadow: false })
      .position(0, 4.95, -5.6).scale([12.8, 0.14, 0.14]).toJSON()
  );
  for (const x of [-3.6, 0, 3.6] as const) {
    nodes.push(
      primitives.cylinder({ name: `cr-lamp-can-${x}`, material: steel, castShadow: false })
        .position(x, 4.72, -5.35).scale([0.16, 0.28, 0.16]).toJSON(),
      primitives.cylinder({ name: `cr-lamp-lens-${x}`, material: material.pbr({ color: "#ffe8b0", emissive: palette.warning, emissiveIntensity: 1.4, roughness: 0.2, practical: true }), castShadow: false, receiveShadow: false })
        .position(x, 4.56, -5.35).scale([0.11, 0.03, 0.11]).toJSON()
    );
  }

  // Dark drape wings close the frame and hide the endless floor edge.
  for (const side of [-1, 1] as const) {
    nodes.push(
      primitives.box({ name: `cr-drape-${side > 0 ? "r" : "l"}`, material: darkCloth, castShadow: false })
        .position(side * 14.4, 3.1, -7.8).scale([0.7, 6.2, 9.4]).toJSON()
    );
  }

  return nodes;
}

/* ------------------------------------------------------------------ */
/* 6 · Crown Arena — the throne room. Gold, crimson, the crown itself.  */
/* ------------------------------------------------------------------ */
const CROWN_PALETTE: StagePalette = { floor: "#241421", lane: "#ffd76a", aura: "#ff4f46", warning: "#ffd76a", skyline: "#3a1b2c", fog: "#0c060c" };

const CROWN = makeStage(
  "crown-arena",
  "Crown Arena",
  "The throne · forge-smoke night",
  "neon-dojo",
  CROWN_PALETTE,
  [
    ...buildCrownTheater(CROWN_PALETTE),
    // Stepped 0.34m obsidian-and-brass dais directly under the throne at z = -3.45 so nothing blocks the throne chair.
    ...buildThronePlinth(),
    modelProp(assets.ironcrownThrone, "cr-throne-chair", [0, PLINTH_TOP, PLINTH_Z], 2.1, 0),
    // The Iron Crown itself — bespoke Meshy prop (crown on velvet cushion), seated regally upon the throne cushion.
    model(assets.ironcrownCrown, { name: "cr-iron-crown", targetMaxDimension: 0.78 })
      .position(0, PLINTH_TOP + 0.48, PLINTH_Z + 0.14)
      .toJSON(),
    // Iron Crown king statues flanking the throne (Poly Haven CC0 gothic_statue)
    modelProp(assets.ironcrownKingStatue, "cr-dragon-l", [-2.2, 0, -2.1], 2.1, 0.45),
    modelProp(assets.ironcrownKingStatue, "cr-dragon-r", [2.2, 0, -2.1], 2.1, -0.45),
    // Corner fire braziers
    modelProp(assets.ironcrownBrazierPylon, "cr-brazier-l", [-3.5, 0, -1.65], 2.2, 0.2),
    modelProp(assets.ironcrownBrazierPylon, "cr-brazier-r", [3.5, 0, -1.65], 2.2, -0.2),
    // Trophy cabinets & follow-spot searchlights at the arena wings
    ...buildTrophyCabinets(),
    modelProp(assets.ironcrownSearchlight, "cr-speaker-l", [-4.9, 0, -2.2], 2.5, 0.35),
    modelProp(assets.ironcrownSearchlight, "cr-speaker-r", [4.9, 0, -2.2], 2.5, -0.35)
  ]
);


export const STAGES: readonly IronStage[] = [NEO_TOKYO, BANGKOK, COLOSSEUM, AIRBASE, MONASTERY, CROWN];

export const STAGE_MAP: ReadonlyMap<StageId, IronStage> = new Map(STAGES.map((s) => [s.id, s]));

export function stageById(id: StageId): IronStage {
  const stage = STAGE_MAP.get(id);
  if (!stage) throw new Error(`IRON_CROWN_STAGE_UNKNOWN: "${id}"`);
  return stage;
}

export const DEFAULT_STAGE: StageId = "crown-arena";
