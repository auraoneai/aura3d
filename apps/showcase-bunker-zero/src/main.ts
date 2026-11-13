/**
 * Bunker Zero — six-floor retro corridor FPS on Aura3D.
 * Real extruded 3D corridors from ASCII grids (instanced boxes — NOT a raycaster),
 * pointer-lock FPS controller with a twin-stick touch layer, 4 weapons with their own
 * magazines, 3 enemy archetypes + the Iron Warden boss, push-wall secrets,
 * key→elevator progression with the loadout carried floor to floor, Kill House
 * skill mode, pause, minimap, results panel, deterministic ?demo=1 playback,
 * JSON evidence on window.__gameEvidence.
 */
import "../../showcase-port-shared/quickbar.css";
import { createImpactRig, type ImpactRig } from "../../showcase-port-shared/feel";
import { labAppOptions, readLabFlags, labCameraOptions } from "../../showcase-port-shared/lab-flags";
import { createLoadingProgress } from "../../showcase-port-shared/loading-progress";
import {
  camera, decals, defineAuraAssets, effects, environments, game, gameFeel, lights, material,
  primitives, resolveQrFlags, scene, text3D, type AuraNodeBuilder, type AuraSceneNode
} from "@aura3d/engine";
import { createGame, sfxUrl, type ForwardAxis } from "@aura3d/engine/game";
import { CELL, WALL_H, SILO_H, FLOORS, KILL_HOUSE, isSolid, type FloorDef } from "./maps";
import {
  createSim, cellCenter, captureLoadout, defaultLoadout, drainEvents, ENEMIES, MAX_SUMMONS, WEAPONS,
  type Enemy, type Loadout, type Sim, type SimInput, type WeaponId
} from "./sim";
import { autopilotInput, createAutopilot } from "./autopilot";
import {
  betterMedal, cosmeticRng, DEFAULT_BINDINGS, enemyNodeStem, floorOutcome, floorResult, hudKey, keyLabel, MEDAL_MARK,
  outcomeView, parseBindings, REMAPPABLE, rebind, runTotals, scaleHex, type BindAction, type Bindings, type FloorOutcome, type FloorResult
} from "./flow";
import {
  buildCombatMacheteNode,
  buildPulseCarbineNode,
  buildReflexOpticNode,
  buildRocketLauncherNode,
  buildServicePistolNode,
  buildTacticalGloveNode,
  buildTacticalSleeveNode,
  buildTacticalWristCuffNode,
  formatTacticalFeed,
  viewmodelFraming,
  VIEWMODEL_YAW_OFFSET,
  weaponHudLabel
} from "./weapons-view";
import {
  buildArticulatedEnemyNode,
  buildBallisticArmorNode,
  buildBallisticTracerNode,
  buildBlastDoorBulkheadNode,
  buildBulkheadLampNode,
  buildBullionCaseNode,
  buildClearanceKeycardNode,
  buildCommandConsoleNode,
  buildConduitPipeInstances,
  buildCorridorTrimInstances,
  buildCryoCanisterNode,
  buildHazardDrumPoolNodes,
  buildMedicalBoxNode,
  buildMergedCorridorSteelNode,
  buildMilitaryCratePoolNodes,
  buildMunitionBoxNode,
  buildMuzzleStarburstNode,
  buildPatrolDroneNode,
  buildPilasterColumnInstances,
  buildRocketWarheadNode,
  buildSecretPushWallNode,
  buildShutterDoorNode,
  buildWorkLightInstances,
  computeEnemyRigPose,
  ENEMY_RIG_PARTS,
  makeEnemyRigIds,
  type BunkerEnemyKind,
  type EnemyRigIds
} from "./art/proceduralModels";
import { ENEMY_FORWARD, enemyFacingError, nextEnemyYaw } from "./enemy-facing";
import { installBlackFrameGuard } from "@aura3d/debug";
import {
  BZ_FOV, BZ_HATCH_CELLS, BZ_HATCH_FLOOR_ID, BZ_HDRI, BZ_HDRI_URL, BZ_OUTPUT_EXPOSURE, BZ_PALETTE, BZ_POST, BZ_STENCIL_COLOR, BZ_VARIANTS, bunkerSceneFog, lookOfSlot, parseFloorParam, underHatch
} from "./art/look";
import { buildLightRig, createLightRigDriver, type QualityTierName, type RigLightHandle } from "./art/lightRig";
import { BZ_FLOOR_TEXTURES, bunkerTexture, compensatedBase } from "./art/textures";
import { createFloorSurfaceLoader, nextSlotOf, placeholderId, withoutMaps } from "./art/floorLoad";
import { damageArcDeg, deathFade, deathRoll, descentSeconds, doorOffset, reloadDip, viewmodelSway } from "./art/motion";
import { BZ_VFX_EVENTS, atmosphereEmitters, registerBunkerVfx, type BunkerVfxKind } from "./art/vfx";
import {
  BZ_BULLET_HOLES, BZ_FLOOR_DECAL_COUNT, BZ_HAZARD_DECALS, BZ_HAZARD_SIZE, bulletHoleId, bulletHolePose, createBunkerDecalTextures, decalsForTier, floorDecalId, floorDecalKind,
  floorDecals, floorStencil, hazardDecalId, hazardPoses, holeExpired, nextHoleSlot
} from "./art/decals";
import { BLUEPRINT, blueprintEdges, type Segment } from "./art/minimap";
import { BZ_CA_PULSE, caPulseLevel, lutOfSlot, lutUrlOfSlot } from "./art/lut";
import { HATCH_BACKDROP, HATCH_COLLAR, hatchBackdrop, hatchCeiling, hatchCollar, hatchShaftSpec, shaftOnSlot } from "./art/hatch";
import {
  bunkerDampSeepageMaterial,
  bunkerExitLaserMaterial,
  bunkerMuzzleFlipbookMaterial,
  bunkerRicochetSparksMaterial,
  bunkerWardenVentMaterial
} from "./art/shaders";
import { createWorkerRendererWorker } from "@aura3d/engine/worker";

installBlackFrameGuard();

declare global {
  interface Window {
    __gameEvidence?: unknown;
    __AURA3D_GAME_EVIDENCE__?: unknown;
    __AURA3D_ROUTE_READY__?: unknown;
  }
}

const bootParams = new URLSearchParams(location.search);
const DEMO = bootParams.get("demo") === "1" || bootParams.has("demo");
let autoPilot = bootParams.get("autoplay") === "1" || DEMO;
let appReady = false;
/** GU47 WP-21: no look preset; the scene is lit by its own fixtures (art/look.ts, art/lightRig.ts). */
const LOOK_ID = "bunker-practicals" as const;
/** BZ-20: `?floor=1..6|kh` boots that floor at its fixed reference viewpoint with the sim held (capture variants). */
const BOOT_FLOOR = parseFloorParam(bootParams);
/** The floor slot the scene mounts posed for (the rig is re-aimed per floor at runtime). */
const BOOT_SLOT = BOOT_FLOOR?.slot ?? 0;
const DEFER_FLOOR_SURFACES = resolveQrFlags({ options: ["game"], url: location.href }).on("A3D_QR_COMPILER");
/** WP-10: moonlit volumetric shaft down the Floor 6 silo hatch (`?godrays=0` opts out). */
const BZ_GOD_RAYS = bootParams.get("godrays") !== "0";
/** BZ-18: `?lut=0` turns the per-floor LUT off (the LUT on/off A/B); cosmetic only. */
const LUT_ON = bootParams.get("lut") !== "0";
const floorLut = (slot: number) => (LUT_ON ? lutOfSlot(slot) : null);
const EYE = 1.55;
/**
 * World x-offset between floor slots. All floors share the origin now that only the active floor is visible (C18). (The black
 * walls on floors 2-6 first looked like a far-from-origin problem; the real cause was the palette applied twice, see wallGain.)
 */
const FLOOR_SPAN = 0;
const MAX_ROCKETS = 18;
const ENEMY_TRACERS = 8;
const SPARK_CARD_POOL = 4;
/** BZ-06: F2 standing water, and the wet-ground amount per floor slot (F2 flooded cellars, F6 the hatch rain). */
// GU47 phase 3: #0b1714 read as a black hole in the floor (rubric round p3-r3); a lifted teal-grey keeps it wet and dark but a surface.
const BZ_WATER = { color: "#22403b", roughness: 0.05 } as const;
/** BZ-04: base colour under the texture sets (slightly warm white; the lamps carry each floor's colour). */
const BZ_SURFACE_WHITE = "#ece8df";
/** GU47 phase 2: lift of the floor palette tones used as wall and floor base colours (shade(), +amt*255 per channel). */
const BZ_WALL_LIFT = 0.1, BZ_FLOOR_LIFT = 0.08;
/** GU47 phase 3: linear gain on the palette tone per surface (walls and floor a little darker for pools; the ceiling lifted out of the void). */
const BZ_SURFACE_GAIN = { wall: 0.85, floor: 0.85, ceiling: 1.4 } as const;
/** GU47 phase 3: the ceiling slab's map on every sealed ceiling. */
const BZ_CEIL_TEXTURE = "concrete034" as const;
const BZ_WETNESS = [0, 0.7, 0, 0, 0, 0.45, 0] as const;
/** GU47 phase 4: baked contact shade at the wall foot (the key's cast shadow alone did not ground the walls; rubric 3). */
const BZ_WALL_AO = { near: 0.22, far: 0.6, y: 0.006, nearOpacity: 0.24, farOpacity: 0.15, ceil: 0.4, ceilOpacity: 0.3 } as const;
/** GU47 phase 4: two service pipes under the ceiling on each corridor face (olive enamel over steel; F3 rust-brown). */
const BZ_PIPES = [{ d: 0.16, off: 0.14, drop: 0.3 }, { d: 0.09, off: 0.1, drop: 0.52 }] as const;
const BZ_PIPE_COLOR = "#4b5136";
/** GU47 phase 4: floor gloss per slot so the screen-space reflections catch the lamps (cutoff 0.5), wetter on F2 / F6. */
const BZ_FLOOR_ROUGHNESS = (slot: number) => 0.34 - (BZ_WETNESS[slot] ?? 0) * 0.16;
const BZ_BLOB = { y: 0.008, opacity: 0.3, rings: [{ scale: 1 }, { scale: 0.62 }, { scale: 0.34 }] } as const;
/** GU47 phase 4: decal tints. Round g11p4-r1 drew the scorches as white shapes (alpha from the map, white from the tint),
 *  so the tint carries the soot / paint tone: a multiply over the map where its RGB is sampled, the tone where it is not. */
const BZ_DECAL_TINT = { scorch: "#2a231c", crack: "#221e19", bullet: "#1a1714", hazard: "#d8b234" } as const;
/** WP-10 / WP-11: real damp concrete screen-space reflections (`roughness: 0.26`). */
const BZ_SSR = { intensity: 0.18, maxDistance: 16, roughness: 0.26, thickness: 0.22 } as const;
const ALL_FLOORS: { def: FloorDef; slot: number }[] = [
  ...FLOORS.map((def, i) => ({ def, slot: i })),
  { def: KILL_HOUSE, slot: 6 }
];

// ---------------------------------------------------------------------------
// deterministic jitter for wall tint variation
const hash2 = (x: number, z: number) => {
  let h = (x * 374761393 + z * 668265263) ^ 0x5bf03635;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

// BZ-14 / WP-11: hostiles read by light, armored metallic sheen (`enemyMaterialOverrides`) and sculpted `practical: true` optic visors.

/** GU47 phase 9 / WP-11 procedural prop placement: crack lamp on the push block's face, exit shutter and lamp, columns. */
const BZ_CRACK_LAMP = { height: 0.5, out: 0.47, y: 1.15 } as const;
const BZ_EXIT_SHUTTER = { heightFrac: 0.78, maxHeight: 2.4, wallGap: CELL / 2 - 0.17, lampGap: CELL / 2 - 0.08, lampHeight: 0.42 } as const;
const BZ_COLUMN = { side: 1.2 } as const;
/** Crack-lamp offset from its push block (the lamp rides the block's face while it slides). */
const CRACK_OFFSET = new Map<string, [number, number]>();

// ---------------------------------------------------------------------------
// scene graph — everything exists from boot; runtime nodes move per frame
const floorDefOf = (slot: number): FloorDef => (slot === 6 ? KILL_HOUSE : FLOORS[slot]!);
function cellX(slot: number, cx: number) { return cellCenter(cx) + slot * FLOOR_SPAN; }
/** Wall height of each floor slot (floor 6 is the tall silo): the door sink uses it (C15). */
const SLOT_WALL_H = ALL_FLOORS.map(({ def }) => (def.id === 5 ? SILO_H : WALL_H));
/** Every runtime node id built for each floor slot; startFloor hides all slots but the active one (C18). */
const SLOT_IDS: string[][] = ALL_FLOORS.map(() => []);
/** The static geometry ids of each slot (walls, floor, ceiling, trim, exits, columns): shown only on the active floor. */
const SLOT_STATIC_IDS: string[][] = ALL_FLOORS.map(() => []);
function slotNode(slot: number, id: string, tags: string[], isStatic = false) {
  if (!SLOT_IDS[slot]!.includes(id)) SLOT_IDS[slot]!.push(id);
  if (isStatic && !SLOT_STATIC_IDS[slot]!.includes(id)) SLOT_STATIC_IDS[slot]!.push(id);
  return game.runtimeNode(id, { tags });
}
const staticNode = (slot: number, key: string) => slotNode(slot, `f${slot}-s-${key}`, ["floor-static"], true);
/**
 * GU47 g11 phase 10 (art/floorLoad.ts): only the boot slot's mapped surfaces mount with the scene. Every other slot mounts
 * a hidden map-free placeholder of the same geometry, and its mapped surfaces are added when the floor is prepared.
 */
const SURFACES = createFloorSurfaceLoader<AuraNodeBuilder<AuraSceneNode>>(BOOT_SLOT, (builder) => {
  if (!app.nodes.add) throw new Error("Bunker Zero: app.nodes.add is unavailable; floor surfaces cannot be prepared");
  nodeCache.clear();
  app.nodes.add(builder);
}, (slot) => {
  if (slot !== activeSlot()) for (const id of SLOT_STATIC_IDS[slot]!) opt(id)?.setVisible(false);
});
type PbrOptions = NonNullable<Parameters<typeof material.pbr>[0]>;
const pbrMaps = (options: PbrOptions, maps: boolean) => material.pbr(maps ? options : withoutMaps(options));
function mappedSurface(slot: number, key: string, make: (maps: boolean) => AuraNodeBuilder<AuraSceneNode>): AuraNodeBuilder<AuraSceneNode> {
  const mapped = make(true).runtime(staticNode(slot, key));
  if (slot === BOOT_SLOT || !DEFER_FLOOR_SURFACES) return mapped;
  SURFACES.defer(slot, mapped);
  return make(false).runtime(slotNode(slot, placeholderId(`f${slot}-s-${key}`), ["floor-static", "placeholder"]));
}

function buildScene() {
  // BZ-01: no look preset, ambient, hemisphere or directional fill. The light is the practical rig (one shadowed key
  // spot per floor, its fill spot, the carried lamp at 1.2 and a pool of fixture points; the F6 moon through the
  // hatch), the hangar_interior IBL at 0.35 that is never drawn as the background (BZ-05), and the gunfire transient
  // lights of the effect pack (BZ-03).
  const boot = lookOfSlot(BOOT_SLOT);
  const b = scene();
  const nodes: AuraNodeBuilder<AuraSceneNode>[] = [
    ...buildLightRig({ lights, runtimeNode: game.runtimeNode }, boot),
    environments.hdri({
      name: "bunker ibl", intensity: boot.environmentIntensity, background: false,
      texture: { type: "texture", format: "hdr", url: BZ_HDRI_URL } as never
    })
  ];

  // GU47 phase 3: the boot floor is built first so its surface maps queue first. Software WebGL2 uploads a few textures
  // per presented frame (one frame every 5-10 s), and in slot order a `?floor=2..6` boot still had untextured walls at 60 s.
  const buildOrder = [...ALL_FLOORS.filter((f) => f.slot === BOOT_SLOT), ...ALL_FLOORS.filter((f) => f.slot !== BOOT_SLOT)];
  for (const { def, slot } of buildOrder) {
    const rows = def.rows;
    const h = rows.length, w = rows[0].length;
    const wallH = SLOT_WALL_H[slot]!;
    const look = lookOfSlot(slot);
    // BZ-04: each floor's own ambientCG set, one repeat per 3 m cell (box faces are 0..1 per face). The renderer multiplies
    // material and instance colours, so the material is near white and the instance colour is only a +-6% jitter.
    const tex = BZ_FLOOR_TEXTURES[slot]!;
    const wallTex = bunkerTexture(tex.wall), altTex = bunkerTexture(tex.accent), floorTex = bunkerTexture(tex.floor);
    const metalWall = tex.wall.startsWith("metal");
    // GU47 phase 2: base colours from the floor palette (the 4.6.2 tones) instead of near white. The CC0 colour maps do not
    // show in the software WebGL2 capture (fix run g11fix1: flat walls), so the #ece8df base read as white plaster lit
    // evenly by the rig: luma ~145-200 on every wall and floor. The palette keeps each floor dark and its own hue.
    // GU47 phase 3: the maps now load (the refs lacked `kind: "aura-asset-ref"`, so the compiler never resolved their URLs);
    // each material colour is the palette tone divided by its map's mean albedo, at BZ_SURFACE_GAIN, so the lit tone
    // stays the panel-approved one and the map adds the detail.
    const wallBase = compensatedBase(shade(def.palette.wall, BZ_WALL_LIFT), tex.wall, BZ_SURFACE_GAIN.wall);
    const altBase = compensatedBase(shade(def.palette.wallAlt, BZ_WALL_LIFT), tex.accent, BZ_SURFACE_GAIN.wall);
    const floorBase = compensatedBase(shade(def.palette.floor, BZ_FLOOR_LIFT), tex.floor, BZ_SURFACE_GAIN.floor);
    const ceilBase = compensatedBase(shade(def.palette.ceil, 0.1), BZ_CEIL_TEXTURE, BZ_SURFACE_GAIN.ceiling);
    const ceilTex = bunkerTexture(BZ_CEIL_TEXTURE);
    const wallMat = (maps: boolean) => pbrMaps({ color: wallBase, texture: wallTex.color, normal: wallTex.normal, normalScale: 0.9, textureAnisotropy: 8, roughness: metalWall ? 0.55 : 0.88, metalness: metalWall ? 0.25 : 0 }, maps);
    const altMat = (maps: boolean) => pbrMaps({ color: altBase, texture: altTex.color, normal: altTex.normal, normalScale: 0.9, textureAnisotropy: 8, roughness: 0.8, metalness: tex.accent.startsWith("metal") ? 0.25 : 0 }, maps);
    const jitter = (x: number, z: number) => scaleHex(BZ_SURFACE_WHITE, 1 + (hash2(x, z) - 0.5) * 0.12);
    const wallInst: { position: [number, number, number]; scale: [number, number, number] }[] = [];
    const wallCol: string[] = [];
    const altInst: { position: [number, number, number]; scale: [number, number, number] }[] = [];
    const altCol: string[] = [];
    const faltInst: { position: [number, number, number]; scale: [number, number, number] }[] = [];
    const stripInst: { position: [number, number, number]; scale: [number, number, number] }[] = [];
    const ceilInst: { position: [number, number, number]; scale: [number, number, number] }[] = [];
    const bulkheadInst: { position: [number, number, number]; scale: [number, number, number] }[] = [];
    const drainInst: { position: [number, number, number]; scale: [number, number, number] }[] = [];
    const aoNear: { position: [number, number, number]; scale: [number, number, number] }[] = [];
    const aoCeil: { position: [number, number, number]; scale: [number, number, number] }[] = [];
    const aoFar: { position: [number, number, number]; scale: [number, number, number] }[] = [];
    const pipeInst: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
    let floodSumX = 0, floodSumZ = 0, floodCount = 0;

    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
      const ch = rows[z][x];
      const wx = cellX(slot, x), wz = cellCenter(z);
      if (ch === "#" || ch === " " || ch === "P") {
        if (ch === "P") continue; // push-walls are runtime nodes
        wallInst.push({ position: [wx, wallH / 2, wz], scale: [CELL, wallH, CELL] });
        wallCol.push(jitter(x, z));
      } else if (ch === "%") {
        altInst.push({ position: [wx, wallH / 2, wz], scale: [CELL, wallH, CELL] });
        altCol.push(jitter(x, z));
      } else if (ch === ",") {
        faltInst.push({ position: [wx, 0.04, wz], scale: [CELL, 0.08, CELL] });
        floodSumX += wx; floodSumZ += wz; floodCount++;
      }
      if (ch !== "#" && ch !== "%" && ch !== " " && ch !== "P") {
        // Ceiling work lights over open corridor cells (`instances.custom` louvered caged trough).
        if ((x * 7 + z * 13) % 9 === 0 && !underHatch(def, x, z)) {
          ceilInst.push({ position: [wx, wallH - 0.08, wz], scale: [1, 1, 1] });
        }
        // Gunmetal overhead structural I-beam ribs & grated floor drains (positive scales only).
        if ((x * 5 + z * 9) % 11 === 0 && !underHatch(def, x, z)) {
          bulkheadInst.push({ position: [wx, wallH - 0.055, wz], scale: [CELL * 0.94, 0.11, 0.16] });
        }
        if (ch !== "," && ch !== "D" && ch !== "E" && (x * 11 + z * 5) % 13 === 0) {
          drainInst.push({ position: [wx, 0.012, wz], scale: [1, 1, 1] });
        }
      }
    }

    // Emissive baseboard trim on every wall face that opens onto a corridor.
    // One instanced draw per floor, no per-frame work.
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
      const ch = rows[z][x];
      if (ch !== "#" && ch !== "%") continue;
      const wx = cellX(slot, x), wz = cellCenter(z);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, nz = z + dz;
        const nch = rows[nz]?.[nx] ?? " ";
        if (nch === "#" || nch === "%" || nch === " " || nch === "P") continue;
        stripInst.push({
          position: [wx + dx * (CELL / 2 + 0.012), 0.14, wz + dz * (CELL / 2 + 0.012)],
          scale: dx !== 0 ? [0.045, 0.07, 2.15] : [2.15, 0.07, 0.045]
        });
        // GU47 phase 4: baked contact shade on the floor along the wall foot (two stacked bands, darker at the wall) and
        // the service pipes under the ceiling on every corridor face (one instanced draw each; presentation only).
        for (const [band, wide] of [[aoNear, BZ_WALL_AO.near], [aoFar, BZ_WALL_AO.far]] as const) {
          band.push({
            position: [wx + dx * (CELL / 2 + wide / 2), BZ_WALL_AO.y, wz + dz * (CELL / 2 + wide / 2)],
            scale: dx !== 0 ? [wide, 0.004, CELL] : [CELL, 0.004, wide]
          });
        }
        aoCeil.push({
          position: [wx + dx * (CELL / 2 + 0.006), wallH - BZ_WALL_AO.ceil / 2, wz + dz * (CELL / 2 + 0.006)],
          scale: dx !== 0 ? [0.004, BZ_WALL_AO.ceil, CELL] : [CELL, BZ_WALL_AO.ceil, 0.004]
        });
        if (slot !== 5) for (const pipe of BZ_PIPES) {
          const off = CELL / 2 + pipe.off;
          pipeInst.push({
            position: [wx + dx * off, wallH - pipe.drop, wz + dz * off],
            rotation: dx !== 0 ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2],
            scale: [pipe.d, CELL, pipe.d]
          });
        }
      }
    }
    nodes.push(
      // structural walls — one instanced draw call per material group
      mappedSurface(slot, "walls", (maps) => primitives.box({ name: `f${slot} walls`, material: wallMat(maps), instances: wallInst, instanceColors: wallCol })),
      mappedSurface(slot, "accent", (maps) => primitives.box({ name: `f${slot} accent`, material: altMat(maps), instances: altInst, instanceColors: altCol })),
      // slab floor + sealed ceiling: the ceiling now meets the wall tops so the
      // corridors read as enclosed rooms instead of an open-topped flat plane.
      // GU47 phase 6: the slab casts nothing on F6 (nothing lies under it; it was a moon shadow-pass draw)
      mappedSurface(slot, "floor", (maps) => primitives.box({ name: `f${slot} floor`, castShadow: def.id !== BZ_HATCH_FLOOR_ID, size: [w * CELL, 0.3, h * CELL], position: [slot * FLOOR_SPAN + w * CELL / 2, -0.15, h * CELL / 2], material: pbrMaps({
        color: floorBase, texture: floorTex.color, normal: floorTex.normal, normalScale: 0.8, textureAnisotropy: 8, roughness: BZ_FLOOR_ROUGHNESS(slot), metalness: tex.floor.startsWith("metal") ? 0.4 : 0,
        // GU47 phase 3: two repeats per 3 m cell and anisotropic filtering (rubric: the floor smeared like a stretched noise map)
        texTransforms: { baseColor: { scale: [w * 2, h * 2] }, normal: { scale: [w * 2, h * 2] } }
      }, maps) })),
      // BZ-07: F6's ceiling is four slabs around the 3x3 hatch (one instanced draw); every other floor stays sealed.
      def.id === 5
        ? primitives.box({ name: `f${slot} ceil`, instances: hatchCeiling(w, h, wallH), material: material.pbr({ color: shade(def.palette.ceil, 0.1), roughness: 0.92, metalness: 0 }) }).runtime(staticNode(slot, "ceil"))
        : mappedSurface(slot, "ceil", (maps) => primitives.box({ name: `f${slot} ceil`, size: [w * CELL, 0.24, h * CELL], position: [slot * FLOOR_SPAN + w * CELL / 2, wallH + 0.14, h * CELL / 2], material: pbrMaps({
          // GU47 phase 3: board-formed concrete slab, one repeat per cell, so the lamps light a ceiling instead of a black void
          color: ceilBase, texture: ceilTex.color, normal: ceilTex.normal, normalScale: 0.8, textureAnisotropy: 8, roughness: 0.92, metalness: 0,
          texTransforms: { baseColor: { scale: [w, h] }, normal: { scale: [w, h] } }
        }, maps) })),
      ...wallShade(def, aoNear, aoFar, aoCeil, slot)
    );
    if (pipeInst.length) {
      nodes.push(
        buildConduitPipeInstances(`f${slot} service pipes`, pipeInst, def.id === 2 ? "#5a3a26" : BZ_PIPE_COLOR)
          .runtime(staticNode(slot, "pipes"))
      );
    }
    // BZ-10: the floor's stencilled name on the floor ahead of the spawn (SDF text, +1 draw on its floor)
    const stencil = floorStencil(def, def.id === 90 ? "KILL HOUSE" : `B-${def.id + 1} ${def.name}`);
    if (stencil) {
      nodes.push(text3D(stencil.text, {
        name: `f${slot} floor stencil`, size: 0.42, depth: 0.01, letterSpacing: 0.06, backend: "sdf", castShadow: false,
        material: material.pbr({ color: BZ_STENCIL_COLOR, roughness: 0.82, metalness: 0 })
      }).position(slot * FLOOR_SPAN + stencil.position[0], stencil.position[1], stencil.position[2])
        .rotate(stencil.rotation[0], stencil.rotation[1], stencil.rotation[2])
        .runtime(staticNode(slot, "stencil")) as unknown as AuraNodeBuilder<AuraSceneNode>);
    }
    if (def.id === 5) {
      // BZ-07: the olive steel collar lining the shaft and the night backdrop closing it (+2 draws on F6 only)
      nodes.push(
        primitives.box({ name: `f${slot} hatch collar`, instances: hatchCollar(wallH), material: material.brushedMetal({ color: HATCH_COLLAR.color, roughness: 0.42, metallic: 0.82 }) }).runtime(staticNode(slot, "hatch-collar")),
        primitives.box({
          name: `f${slot} hatch night backdrop`, instances: [hatchBackdrop(wallH)], castShadow: false, receiveShadow: false,
          material: material.emissive({ color: HATCH_BACKDROP.color, emissive: HATCH_BACKDROP.emissive, emissiveIntensity: HATCH_BACKDROP.emissiveIntensity, roughness: 1 })
        }).runtime(staticNode(slot, "hatch-backdrop")),
        primitives.plane({
          name: `f${slot} hatch rain seepage`, size: [8.4, 1, 8.4],
          position: [slot * FLOOR_SPAN + 11.5 * CELL, 0.014, 9.5 * CELL],
          castShadow: false, receiveShadow: false,
          material: bunkerDampSeepageMaterial()
        }).runtime(staticNode(slot, "damp-shimmer"))
      );
    }
    if (slot === 1 && floodCount > 0) {
      nodes.push(primitives.plane({
        name: `f${slot} cellar flood shimmer`, size: [8.6, 1, 5.6],
        position: [floodSumX / floodCount, 0.084, floodSumZ / floodCount],
        castShadow: false, receiveShadow: false,
        material: bunkerDampSeepageMaterial()
      }).runtime(staticNode(slot, "damp-shimmer")));
    }
    if (ceilInst.length) {
      nodes.push(
        buildWorkLightInstances(
          `f${slot} work-lights`,
          ceilInst,
          look.lamp.color,
          look.fixtures.height === "grate" ? 0.28 : 0.42
        ).runtime(staticNode(slot, "work-lights"))
      );
    }
    if (faltInst.length) {
      nodes.push(mappedSurface(slot, "floor-alt", (maps) => primitives.box({
        name: `f${slot} floor-alt`, instances: faltInst,
        // BZ-06: only the F3 forge grates glow (capped <= 0.45). F2's flood is dark standing water.
        material: slot === 2 && def.palette.floorEmissive
          ? material.emissive({ color: def.palette.floorAlt, emissive: def.palette.floorEmissive, emissiveIntensity: 0.44, roughness: 0.4, practical: true, ...(tex.floorAlt && maps ? { texture: bunkerTexture(tex.floorAlt).color } : {}) })
          : slot === 1
            ? material.pbr({ color: BZ_WATER.color, roughness: BZ_WATER.roughness, metalness: 0 })
            : material.pbr({ color: def.palette.floorAlt, roughness: 0.75 })
      })));
    }
    // ---- per-cell runtime 3D entities & batched props ----------------------
    let dI = 0, pI = 0, eI = 0, kI = 0;
    const columnInst: { position: [number, number, number]; scale: [number, number, number] }[] = [];
    const barrelInst: { position: [number, number, number]; scale: [number, number, number] }[] = [];
    const crateInst: { position: [number, number, number]; scale: [number, number, number] }[] = [];
    let castBarrelShadows = false;
    let castCrateShadows = false;
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
      const ch = rows[z][x];
      const wx = cellX(slot, x), wz = cellCenter(z);
      const cast = castsShadowAt(def, x, z);
      switch (ch) {
        case "D": {
          const facesZ = doorFacesZ(rows, x, z);
          const jambOff = CELL * 0.47;
          bulkheadInst.push(
            { position: [wx + (facesZ ? -jambOff : 0), wallH / 2, wz + (facesZ ? 0 : -jambOff)], scale: facesZ ? [0.16, wallH, 0.34] : [0.34, wallH, 0.16] },
            { position: [wx + (facesZ ? jambOff : 0), wallH / 2, wz + (facesZ ? 0 : jambOff)], scale: facesZ ? [0.16, wallH, 0.34] : [0.34, wallH, 0.16] },
            { position: [wx, wallH - 0.1, wz], scale: facesZ ? [CELL, 0.2, 0.36] : [0.36, 0.2, CELL] }
          );
          nodes.push(
            buildBlastDoorBulkheadNode(wallH, cast, `f${slot} door ${dI}`)
              .position(wx, 0, wz).rotate(0, facesZ ? 0 : Math.PI / 2, 0)
              .runtime(slotNode(slot, `f${slot}-door-${x}-${z}`, ["door"]))
          );
          dI++;
          break;
        }
        case "P": {
          // WP-11: riveted steel-and-concrete false bulkhead with recessed pry seam + forged iron pull rings + caged crack lamp
          const side = pushFace(rows, x, z);
          CRACK_OFFSET.set(`f${slot}-crack-${x}-${z}`, [-side[0] * CELL * BZ_CRACK_LAMP.out, -side[1] * CELL * BZ_CRACK_LAMP.out]);
          nodes.push(
            buildSecretPushWallNode(wallH, cast, `f${slot} push ${pI}`)
              .position(wx, 0, wz)
              .runtime(slotNode(slot, `f${slot}-pw-${x}-${z}`, ["pushwall"])),
            buildBulkheadLampNode(BZ_CRACK_LAMP.height, `f${slot} crack ${pI}`)
              .position(wx - side[0] * CELL * BZ_CRACK_LAMP.out, BZ_CRACK_LAMP.y, wz - side[1] * CELL * BZ_CRACK_LAMP.out)
              .rotate(0, Math.atan2(-side[0], -side[1]), 0)
              .runtime(slotNode(slot, `f${slot}-crack-${x}-${z}`, ["crack"]))
          );
          pI++;
          break;
        }
        case "E": {
          const exitWall = wallFace(rows, x, z);
          const exitShutterH = Math.min(wallH * BZ_EXIT_SHUTTER.heightFrac, BZ_EXIT_SHUTTER.maxHeight);
          const exitAlongZ = exitWall[1] !== 0;
          bulkheadInst.push(
            {
              position: [
                wx + exitWall[0] * (BZ_EXIT_SHUTTER.wallGap - 0.06) + (exitAlongZ ? -1.05 : 0),
                exitShutterH / 2,
                wz + exitWall[1] * (BZ_EXIT_SHUTTER.wallGap - 0.06) + (exitAlongZ ? 0 : -1.05)
              ],
              scale: exitAlongZ ? [0.16, exitShutterH, 0.24] : [0.24, exitShutterH, 0.16]
            },
            {
              position: [
                wx + exitWall[0] * (BZ_EXIT_SHUTTER.wallGap - 0.06) + (exitAlongZ ? 1.05 : 0),
                exitShutterH / 2,
                wz + exitWall[1] * (BZ_EXIT_SHUTTER.wallGap - 0.06) + (exitAlongZ ? 0 : 1.05)
              ],
              scale: exitAlongZ ? [0.16, exitShutterH, 0.24] : [0.24, exitShutterH, 0.16]
            }
          );
          nodes.push(
            // WP-11: procedural multi-material corrugated steel roller-shutter lift door + caged bulkhead lamp
            buildShutterDoorNode(exitShutterH, cast, `f${slot} exit`)
              .position(wx + exitWall[0] * BZ_EXIT_SHUTTER.wallGap, 0, wz + exitWall[1] * BZ_EXIT_SHUTTER.wallGap)
              .rotate(0, Math.atan2(-exitWall[0], -exitWall[1]), 0).runtime(staticNode(slot, "exit")),
            buildBulkheadLampNode(BZ_EXIT_SHUTTER.lampHeight, `f${slot} exitpost`)
              .position(wx + exitWall[0] * BZ_EXIT_SHUTTER.lampGap, exitShutterH + 0.08, wz + exitWall[1] * BZ_EXIT_SHUTTER.lampGap)
              .rotate(0, Math.atan2(-exitWall[0], -exitWall[1]), 0).runtime(staticNode(slot, "exitpost")),
            primitives.box({
              name: `f${slot} exit containment field`,
              castShadow: false,
              receiveShadow: false,
              size: exitAlongZ ? [1.9, exitShutterH * 0.88, 0.03] : [0.03, exitShutterH * 0.88, 1.9],
              position: [
                wx + exitWall[0] * (BZ_EXIT_SHUTTER.wallGap - 0.14),
                exitShutterH * 0.45,
                wz + exitWall[1] * (BZ_EXIT_SHUTTER.wallGap - 0.14)
              ],
              material: bunkerExitLaserMaterial()
            }).runtime(slotNode(slot, `f${slot}-exit-field`, ["exit-field"]))
          );
          break;
        }
        case "K":
          nodes.push(
            buildClearanceKeycardNode(false, `f${slot} key`)
              .position(wx, 1.1, wz)
              .runtime(slotNode(slot, `f${slot}-pk-${x}-${z}`, ["pickup", "key"]))
          );
          break;
        case "t": case "T":
          nodes.push(
            buildBullionCaseNode(ch === "T" ? "gold" : "silver", false, `f${slot} treasure ${kI}`)
              .position(wx, 0.55, wz)
              .runtime(slotNode(slot, `f${slot}-pk-${x}-${z}`, ["pickup", "treasure"]))
          );
          kI++;
          break;
        case "+": case "*": case "!":
          nodes.push(
            buildMedicalBoxNode(ch === "*" ? "plate" : "medkit", false, `f${slot} medkit ${x}-${z}`)
              .position(wx, 0.55, wz)
              .runtime(slotNode(slot, `f${slot}-pk-${x}-${z}`, ["pickup", "health"]))
          );
          break;
        case "a":
          nodes.push(
            buildMunitionBoxNode(false, `f${slot} ammo`)
              .position(wx, 0.55, wz)
              .runtime(slotNode(slot, `f${slot}-pk-${x}-${z}`, ["pickup", "ammo"]))
          );
          break;
        case "r":
          nodes.push(
            buildBallisticArmorNode(false, `f${slot} armor`)
              .position(wx, 0.55, wz)
              .runtime(slotNode(slot, `f${slot}-pk-${x}-${z}`, ["pickup", "armor"]))
          );
          break;
        case "w":
          nodes.push(
            buildPulseCarbineNode(`f${slot} mgpickup`, false)
              .position(wx, 0.55, wz).rotate(0, 0.7, 0)
              .runtime(slotNode(slot, `f${slot}-pk-${x}-${z}`, ["pickup", "weapon"]))
          );
          break;
        case "W":
          nodes.push(
            buildRocketLauncherNode(`f${slot} rocketpickup`, false)
              .position(wx, 0.55, wz).rotate(0, -0.7, 0)
              .runtime(slotNode(slot, `f${slot}-pk-${x}-${z}`, ["pickup", "weapon"]))
          );
          break;
        case "b":
          barrelInst.push({ position: [wx, 0, wz], scale: [1, 1, 1] });
          if (cast) castBarrelShadows = true;
          addPropPoolEntry(slot, "barrel", x, z, wx, wz);
          addBlob(slot, `f${slot}-prop-${x}-${z}`, wx, wz, 0.62);
          break;
        case "c":
          crateInst.push({ position: [wx, 0, wz], scale: [1, 1, 1] });
          if (cast) castCrateShadows = true;
          addPropPoolEntry(slot, "crate", x, z, wx, wz);
          addBlob(slot, `f${slot}-prop-${x}-${z}`, wx, wz, 0.78);
          break;
        case "o":
          columnInst.push({ position: [wx, wallH / 2, wz], scale: [BZ_COLUMN.side, wallH, BZ_COLUMN.side] });
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            stripInst.push({
              position: [wx + dx * (BZ_COLUMN.side / 2 + 0.012), 0.14, wz + dz * (BZ_COLUMN.side / 2 + 0.012)],
              scale: dx !== 0 ? [0.045, 0.07, BZ_COLUMN.side + 0.05] : [BZ_COLUMN.side + 0.05, 0.07, 0.045]
            });
          }
          break;
        case "g":
          nodes.push(
            buildArticulatedEnemyNode(
              "guard",
              `f${slot} guard ${eI}`,
              (partId, part) => slotNode(slot, partId, ["enemy", "guard", part]),
              `f${slot}-en-${x}-${z}`,
              true
            ).position(wx, 0, wz)
          );
          addBlob(slot, `f${slot}-en-${x}-${z}`, wx, wz, 0.5);
          eI++;
          break;
        case "d":
          nodes.push(
            buildArticulatedEnemyNode(
              "dog",
              `f${slot} hound ${eI}`,
              (partId, part) => slotNode(slot, partId, ["enemy", "dog", part]),
              `f${slot}-en-${x}-${z}`,
              true
            ).position(wx, 0, wz)
          );
          addBlob(slot, `f${slot}-en-${x}-${z}`, wx, wz, 0.45);
          eI++;
          break;
        case "G":
          nodes.push(
            buildArticulatedEnemyNode(
              "gunner",
              `f${slot} gunner ${eI}`,
              (partId, part) => slotNode(slot, partId, ["enemy", "gunner", part]),
              `f${slot}-en-${x}-${z}`,
              true
            ).position(wx, 0, wz)
          );
          addBlob(slot, `f${slot}-en-${x}-${z}`, wx, wz, 0.55);
          eI++;
          break;
        case "B":
          nodes.push(
            buildArticulatedEnemyNode(
              "boss",
              `f${slot} boss ${eI}`,
              (partId, part) => slotNode(slot, partId, ["enemy", "boss", part]),
              `f${slot}-en-${x}-${z}`,
              true
            ).position(wx, 0, wz)
          );
          addBlob(slot, `f${slot}-en-${x}-${z}`, wx, wz, 0.85);
          eI++;
          break;
      }
    }
    // C1: hidden guard nodes for the guards the Iron Warden summons (sim.MAX_SUMMONS), mapped by Enemy.summonSlot
    if (rows.some((r) => r.includes("B"))) {
      for (let i = 0; i < MAX_SUMMONS; i++) {
        nodes.push(
          buildArticulatedEnemyNode(
            "guard",
            `f${slot} summon ${i}`,
            (partId, part) => slotNode(slot, partId, ["enemy", "guard", "summon", part]),
            `f${slot}-summon-${i}`,
            true
          ).position(slot * FLOOR_SPAN, -50, 0)
        );
        addBlob(slot, `f${slot}-summon-${i}`, slot * FLOOR_SPAN, 0, 0.5, false);
      }
    }
    if (stripInst.length) {
      nodes.push(
        buildCorridorTrimInstances(`f${slot} wall-trim`, stripInst, BZ_PALETTE.hazard)
          .runtime(staticNode(slot, "trim"))
      );
    }
    if (bulkheadInst.length || drainInst.length || ceilInst.length) {
      nodes.push(
        buildMergedCorridorSteelNode(`f${slot} corridor-steel`, bulkheadInst, drainInst, ceilInst)
          .runtime(staticNode(slot, "corridor-steel"))
      );
    }
    if (barrelInst.length) {
      buildHazardDrumPoolNodes(`f${slot} barrels`, barrelInst, castBarrelShadows).forEach((bNode, mIdx) => {
        nodes.push(bNode.runtime(staticNode(slot, `barrels-${mIdx}`)));
      });
    }
    if (crateInst.length) {
      buildMilitaryCratePoolNodes(`f${slot} crates`, crateInst, castCrateShadows).forEach((cNode, mIdx) => {
        nodes.push(cNode.runtime(staticNode(slot, `crates-${mIdx}`)));
      });
    }
    if (columnInst.length) {
      nodes.push(
        mappedSurface(slot, "columns", (maps) => buildPilasterColumnInstances(`f${slot} columns`, columnInst, wallMat(maps)))
      );
    }
    // Tactical command console, cryo containment canister, and autonomous ceiling patrol drone per floor (`staticNode` zero-sim-impact dressing)
    {
      const refCell = look.reference.cell;
      let placedConsole = false;
      let placedCryo = false;
      let placedDrone = false;
      const touchesSolid = (cx: number, cz: number) =>
        isSolid(rows[cz + 1]?.[cx] ?? "#") ||
        isSolid(rows[cz - 1]?.[cx] ?? "#") ||
        isSolid(rows[cz]?.[cx + 1] ?? "#") ||
        isSolid(rows[cz]?.[cx - 1] ?? "#");
      for (let z = 1; z < h - 1; z++) {
        for (let x = 1; x < w - 1; x++) {
          if (placedConsole && placedCryo && placedDrone) break;
          const ch = rows[z]![x]!;
          if (Math.abs(x - refCell[0]) <= 1 && Math.abs(z - refCell[1]) <= 1) continue;
          if (underHatch(def, x, z)) continue;
          const wx = cellX(slot, x), wz = cellCenter(z);
          if (!placedDrone && (ch === "g" || ch === "d" || ch === ".")) {
            nodes.push(
              buildPatrolDroneNode(false, `f${slot} patrol-drone`)
                .position(wx, wallH - 0.54, wz)
                .rotate(0, hash2(x + slot, z) * Math.PI * 2, 0)
                .runtime(staticNode(slot, "patrol-drone"))
            );
            placedDrone = true;
            continue;
          }
          if (ch === "." && touchesSolid(x, z)) {
            const wf = wallFace(rows, x, z);
            const wallYaw = Math.atan2(-wf[0], -wf[1]);
            if (!placedConsole) {
              nodes.push(
                buildCommandConsoleNode(false, `f${slot} console`)
                  .position(wx + wf[0] * (CELL / 2 - 0.34), 0, wz + wf[1] * (CELL / 2 - 0.34))
                  .rotate(0, wallYaw, 0)
                  .runtime(staticNode(slot, "console"))
              );
              placedConsole = true;
            } else if (!placedCryo) {
              nodes.push(
                buildCryoCanisterNode(false, `f${slot} cryo`)
                  .position(wx + wf[0] * (CELL / 2 - 0.36), 0, wz + wf[1] * (CELL / 2 - 0.36))
                  .rotate(0, wallYaw, 0)
                  .runtime(staticNode(slot, "cryo"))
              );
              placedCryo = true;
            }
          }
        }
      }
    }
    // GU47 phase 6: every contact blob of the floor in one instanced draw (one draw per prop and hostile made F6 +11)
    if (BLOB_INST[slot]!.length) {
      nodes.push(primitives.cylinder({
        name: `f${slot} contact blobs`, castShadow: false, receiveShadow: false, instances: BLOB_INST[slot]!,
        material: material.pbr({ color: "#000000", roughness: 1, metalness: 0, opacity: BZ_BLOB.opacity })
      }).runtime(staticNode(slot, "blobs")));
    }
  }

  // ---- player rig: WP-11 sculpted multi-material viewmodels + tactical sleeves/gloves + muzzle starburst ---------
  nodes.push(
    buildCombatMacheteNode("vm knife")
      .position(0, 0, 0)
      .runtime(game.runtimeNode("vm-knife", { tags: ["viewmodel"] })),
    buildServicePistolNode("vm pistol")
      .position(0, 0, 0)
      .runtime(game.runtimeNode("vm-pistol", { tags: ["viewmodel"] })),
    buildPulseCarbineNode("vm mg")
      .position(0, 0, 0)
      .runtime(game.runtimeNode("vm-mg", { tags: ["viewmodel"] })),
    buildRocketLauncherNode("vm rocket")
      .position(0, 0, 0)
      .runtime(game.runtimeNode("vm-rocket", { tags: ["viewmodel"] })),
    buildTacticalSleeveNode("right", "vm sleeve right")
      .position(-500, -60, -500).runtime(game.runtimeNode("vm-sleeve-r", { tags: ["viewmodel", "hand"] })),
    buildTacticalWristCuffNode("vm wrist cuff right")
      .position(-500, -60, -500).runtime(game.runtimeNode("vm-cuff-r", { tags: ["viewmodel", "hand"] })),
    buildTacticalGloveNode("right", "vm glove right")
      .position(-500, -60, -500).runtime(game.runtimeNode("vm-glove-r", { tags: ["viewmodel", "hand"] })),
    buildTacticalSleeveNode("left", "vm sleeve left")
      .position(-500, -60, -500).runtime(game.runtimeNode("vm-sleeve-l", { tags: ["viewmodel", "hand"] })),
    buildTacticalGloveNode("left", "vm glove left")
      .position(-500, -60, -500).runtime(game.runtimeNode("vm-glove-l", { tags: ["viewmodel", "hand"] })),
    buildReflexOpticNode("vm reflex optic")
      .position(-500, -60, -500).runtime(game.runtimeNode("vm-optic", { tags: ["viewmodel", "optic"] })),
    buildMuzzleStarburstNode("muzzle flash")
      .position(0, -50, 0)
      .runtime(game.runtimeNode("muzzle-flash", { tags: ["vfx"] })),
    primitives.box({
      name: "muzzle flipbook card", castShadow: false, receiveShadow: false, size: [0.16, 0.16, 0.008],
      position: [0, -50, 0], material: bunkerMuzzleFlipbookMaterial()
    }).runtime(game.runtimeNode("muzzle-card", { tags: ["vfx"] })),
    effects.flipbook({
      name: "muzzle sprite", sprite: "flame-loop", size: 0.16, frameRate: 36, intensity: 0.38, blend: "additive", position: [0, -50, 0]
    }).runtime(game.runtimeNode("muzzle-sprite", { tags: ["vfx"] })) as unknown as AuraNodeBuilder<AuraSceneNode>,
    // C27: the Iron Warden's vent glows + paired GLSL/WGSL containment aura while vulnerable (intensity capped)
    lights.point({ name: "warden vent light", color: "#ff5a1a", intensity: 2.2, distance: 7, decay: 1.8, position: [0, -50, 0] })
      .runtime(game.runtimeNode("vent-light", { tags: ["vfx"] })),
    primitives.cylinder({
      name: "warden vent containment field", castShadow: false, receiveShadow: false, size: [1.35, 2.3, 1.35],
      position: [0, -50, 0], material: bunkerWardenVentMaterial()
    }).runtime(game.runtimeNode("warden-vent-field", { tags: ["vfx"] }))
  );
  for (let i = 0; i < SPARK_CARD_POOL; i++) {
    nodes.push(primitives.box({
      name: `ricochet spark card ${i}`, castShadow: false, receiveShadow: false, size: [0.24, 0.24, 0.012],
      position: [0, -50, 0], material: bunkerRicochetSparksMaterial(i)
    }).runtime(game.runtimeNode(`spark-card-${i}`, { tags: ["vfx"] })));
  }
  // BZ-10: one shared pool of 12 floor decals (moved to the active floor by placeFloorDecals) and a ring of 12 bullet holes
  const decalTextures = createBunkerDecalTextures(defineAuraAssets);
  const bootDecals = floorDecals(floorDefOf(BOOT_SLOT));
  for (let i = 0; i < BZ_FLOOR_DECAL_COUNT; i++) {
    const kind = floorDecalKind(i), pose = bootDecals[i];
    nodes.push(decals.project({
      name: `bunker floor ${kind} ${i}`, texture: decalTextures[kind], color: BZ_DECAL_TINT[kind], opacity: kind === "scorch" ? 0.8 : 0.9, roughness: 0.9,
      size: pose?.size ?? 1, position: pose ? pose.position : [0, -50, 0], rotation: [0, pose?.yaw ?? 0, 0], normal: [0, 1, 0]
    }).runtime(game.runtimeNode(floorDecalId(i), { tags: ["decal"] })) as unknown as AuraNodeBuilder<AuraSceneNode>);
  }
  const bootHazard = hazardPoses(floorDefOf(BOOT_SLOT));
  for (let i = 0; i < BZ_HAZARD_DECALS; i++) {
    const pose = bootHazard[i];
    nodes.push(decals.project({
      name: `bunker hazard stripe ${i}`, texture: decalTextures.hazard, color: BZ_DECAL_TINT.hazard, opacity: 0.9, roughness: 0.7,
      size: BZ_HAZARD_SIZE, position: pose ? pose.position : [0, -50, 0], rotation: [0, pose?.yaw ?? 0, 0], normal: [0, 1, 0]
    }).runtime(game.runtimeNode(hazardDecalId(i), { tags: ["decal"] })) as unknown as AuraNodeBuilder<AuraSceneNode>);
  }
  for (let i = 0; i < BZ_BULLET_HOLES; i++) {
    nodes.push(decals.project({
      name: `bunker bullet hole ${i}`, texture: decalTextures.bullet, color: BZ_DECAL_TINT.bullet, opacity: 0.9, roughness: 0.95,
      size: 0.16, position: [0, -50, 0], normal: [0, 1, 0]
    }).runtime(game.runtimeNode(bulletHoleId(i), { tags: ["decal"] })) as unknown as AuraNodeBuilder<AuraSceneNode>);
  }
  // C8: enemy gunshots get a sculpted supersonic dart tracer; the muzzle flash at the shooter is bz-enemy-muzzle (BZ-03)
  for (let i = 0; i < ENEMY_TRACERS; i++)
    nodes.push(
      buildBallisticTracerNode(`enemy tracer ${i}`, true)
        .runtime(game.runtimeNode(`etracer-${i}`, { tags: ["vfx"] }))
    );
  // WP-11: fin-stabilized ogive rocket warheads (`0.55 m` + `practical: true` thruster) + supersonic dart tracers + capped trails
  for (let i = 0; i < MAX_ROCKETS; i++)
    nodes.push(
      buildRocketWarheadNode(`rocket ${i}`)
        .position(0, -50, 0)
        .runtime(game.runtimeNode(`rocket-${i}`, { tags: ["vfx"] })),
      buildBallisticTracerNode(`tracer ${i}`, false)
        .runtime(game.runtimeNode(`tracer-${i}`, { tags: ["vfx"] }))
    );
  for (let i = 0; i < 4; i++) {
    nodes.push(
      effects.trail({
        name: `rocket smoke trail ${i}`, target: `rocket-${i}`, color: "#ff8a3a", intensity: 0.42, width: 0.075, maxPoints: 16, life: 0.22
      }) as unknown as AuraNodeBuilder<AuraSceneNode>,
      effects.trail({
        name: `projectile trail ${i}`, target: `tracer-${i}`, color: "#ffb85c", intensity: 0.38, width: 0.045, maxPoints: 14, life: 0.14
      }) as unknown as AuraNodeBuilder<AuraSceneNode>
    );
  }

  return b.addMany(nodes)
    .add(effects.fog(bunkerSceneFog(boot)))
    .add(effects.contactShadows({ length: 0.25, thickness: 0.05, steps: 16, intensity: 0.75, lights: "shadowed" }))
    .add(effects.ambientOcclusion({ intensity: BZ_POST.ao.intensity, radius: BZ_POST.ao.radius, multiBounce: true }))
    .add(effects.cinematicBloom({ threshold: 1.15, intensity: 0.18, maxIntensity: 0.35, color: "#ffd59a", radius: 0.26, antiBlowout: true }))
    .add(effects.colorGrade({
      contrast: BZ_POST.grade.contrast, saturation: BZ_POST.grade.saturation,
      temperature: boot.grade.temperature, tint: boot.grade.tint,
      // BZ-18: the floor's split-tone LUT (swapped per floor by applyFloorLook)
      ...(floorLut(BOOT_SLOT) ? { lut: floorLut(BOOT_SLOT)!, lutIntensity: 1 } : {})
    }))
    // BZ-18: chromatic aberration at rest 0, pulsed on heavy hits (S10; the engine drops it on Low)
    .add(effects.chromaticAberration({ intensity: 0 }))
    // BZ-07: the moon shaft through the F6 hatch (S4 god rays, Medium tier and up), mounted only when the scene boots on F6.
    .addMany(BOOT_SLOT === 5 && BZ_GOD_RAYS ? [effects.volumetricFog(hatchShaftSpec(lookOfSlot(5).fog.density))] : [])
    // WP-10: real damp concrete screen-space reflections
    .add(effects.screenSpaceReflections({ intensity: BZ_SSR.intensity, maxDistance: BZ_SSR.maxDistance, roughness: BZ_SSR.roughness, thickness: BZ_SSR.thickness }))
    .add(effects.vignette({ intensity: BZ_POST.vignette }))
    .add(effects.filmGrain({ intensity: BZ_POST.grain }))
    .camera(camera.perspective({ ...labCameraOptions(readLabFlags(), "reversed"), position: [4.5, EYE, 4.5], target: [12.5, EYE, 4.5], fov: BZ_FOV }));
}

type PropPoolKind = "barrel" | "crate";
type PropPoolEntry = { index: number; wx: number; wz: number; shown: boolean };
type PropPoolBucket = { entries: PropPoolEntry[]; byCell: Map<string, PropPoolEntry>; mats: Float32Array | null; dirty: boolean; matSlots: number };
const makePropBucket = (matSlots: number): PropPoolBucket => ({ entries: [], byCell: new Map(), mats: null, dirty: false, matSlots });
const PROP_POOLS: Record<PropPoolKind, PropPoolBucket[]> = {
  barrel: ALL_FLOORS.map(() => makePropBucket(4)),
  crate: ALL_FLOORS.map(() => makePropBucket(3))
};
function writePropInstanceMatrix(m: Float32Array, index: number, wx: number, wz: number, shown: boolean) {
  const o = index * 16;
  const s = shown ? 1 : 0.001;
  m.fill(0, o, o + 16);
  m[o] = s; m[o + 5] = s; m[o + 10] = s; m[o + 12] = wx; m[o + 13] = shown ? 0 : -60; m[o + 14] = wz; m[o + 15] = 1;
}
function ensurePropMatrices(bucket: PropPoolBucket): Float32Array {
  if (!bucket.mats) {
    bucket.mats = new Float32Array(bucket.entries.length * 16);
    bucket.entries.forEach((e) => writePropInstanceMatrix(bucket.mats!, e.index, e.wx, e.wz, e.shown));
  }
  return bucket.mats;
}
function addPropPoolEntry(slot: number, kind: PropPoolKind, cx: number, cz: number, wx: number, wz: number) {
  const bucket = PROP_POOLS[kind][slot]!;
  const entry: PropPoolEntry = { index: bucket.entries.length, wx, wz, shown: true };
  bucket.entries.push(entry);
  bucket.byCell.set(`${cx}:${cz}`, entry);
}
function resetPropPools(slot: number) {
  for (const kind of ["barrel", "crate"] as const) {
    const bucket = PROP_POOLS[kind][slot]!;
    for (const e of bucket.entries) {
      if (!e.shown) {
        e.shown = true;
        writePropInstanceMatrix(ensurePropMatrices(bucket), e.index, e.wx, e.wz, true);
        bucket.dirty = true;
      }
    }
  }
  flushPropPools(slot);
}
function syncPropPoolEntry(slot: number, kind: PropPoolKind, cx: number, cz: number, alive: boolean) {
  const bucket = PROP_POOLS[kind][slot]!;
  const e = bucket.byCell.get(`${cx}:${cz}`);
  if (!e || e.shown === alive) return;
  e.shown = alive;
  writePropInstanceMatrix(ensurePropMatrices(bucket), e.index, e.wx, e.wz, alive);
  bucket.dirty = true;
}
function flushPropPools(slot: number) {
  if (!appReady) return;
  for (const kind of ["barrel", "crate"] as const) {
    const bucket = PROP_POOLS[kind][slot]!;
    if (!bucket.dirty || !bucket.mats) continue;
    bucket.dirty = false;
    const prefix = kind === "barrel" ? "barrels" : "crates";
    for (let mIdx = 0; mIdx < bucket.matSlots; mIdx++) {
      opt(`f${slot}-s-${prefix}-${mIdx}`)?.setInstanceMatrices(bucket.mats, bucket.entries.length);
    }
  }
}

/**
 * GU47 phase 6: the soft contact blobs under props and hostiles (three stacked discs, darker at the centre) are one
 * instanced draw per floor; phase 4 drew one node per prop and hostile (F6 164 draws against its 120 budget).
 * `addBlob` reserves a blob's three rings at build time; `placeBlob` moves or hides them each frame and `flushBlobs`
 * writes the floor's matrices once when something changed. Presentation only.
 */
type BlobInst = { position: [number, number, number]; scale: [number, number, number] };
const BLOB_INST: BlobInst[][] = ALL_FLOORS.map(() => []);
const BLOB_SLOT = new Map<string, { slot: number; index: number; radius: number }>();
const BLOB_MATS: (Float32Array | null)[] = ALL_FLOORS.map(() => null);
const BLOB_DIRTY: boolean[] = ALL_FLOORS.map(() => false);
function blobRing(i: number, x: number, z: number, radius: number, shown: boolean): BlobInst {
  const d = radius * 2 * BZ_BLOB.rings[i]!.scale;
  return { position: [x, shown ? BZ_BLOB.y + i * 0.002 : -50, z], scale: [d, 0.002, d] };
}
function addBlob(slot: number, id: string, x: number, z: number, radius: number, shown = true) {
  const list = BLOB_INST[slot]!;
  BLOB_SLOT.set(id, { slot, index: list.length, radius });
  for (let i = 0; i < BZ_BLOB.rings.length; i++) list.push(blobRing(i, x, z, radius, shown));
}
function blobMatrices(slot: number): Float32Array {
  let m = BLOB_MATS[slot];
  if (!m) {
    const list = BLOB_INST[slot]!;
    m = new Float32Array(list.length * 16);
    list.forEach((inst, k) => writeBlobMatrix(m!, k, inst.position[0], inst.position[1], inst.position[2], inst.scale[0]));
    BLOB_MATS[slot] = m;
  }
  return m;
}
function writeBlobMatrix(m: Float32Array, k: number, x: number, y: number, z: number, d: number): boolean {
  const o = k * 16;
  if (m[o] === d && m[o + 12] === x && m[o + 13] === y && m[o + 14] === z && m[o + 15] === 1) return false;
  m.fill(0, o, o + 16);
  m[o] = d; m[o + 5] = 0.002; m[o + 10] = d; m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
  return true;
}
/** Moves (or, with `shown` false, hides) the blob reserved under node `id`. */
function placeBlob(id: string, x: number, z: number, shown: boolean) {
  const b = BLOB_SLOT.get(id);
  if (!b) return;
  const m = blobMatrices(b.slot);
  for (let i = 0; i < BZ_BLOB.rings.length; i++) {
    const r = blobRing(i, x, z, b.radius, shown);
    if (writeBlobMatrix(m, b.index + i, r.position[0], r.position[1], r.position[2], r.scale[0])) BLOB_DIRTY[b.slot] = true;
  }
}
function flushBlobs(slot: number) {
  if (!BLOB_DIRTY[slot]) return;
  BLOB_DIRTY[slot] = false;
  const m = BLOB_MATS[slot];
  if (m) opt(`f${slot}-s-blobs`)?.setInstanceMatrices(m, m.length / 16);
}
type ShadeInst = { position: [number, number, number]; scale: [number, number, number] };
/**
 * WP-11: baked contact shade at the wall foot (near + wide bands) and ceiling head merged into one instanced draw per floor.
 */
function wallShade(_def: FloorDef, near: ShadeInst[], far: ShadeInst[], ceil: ShadeInst[], slot: number): AuraNodeBuilder<AuraSceneNode>[] {
  const up = (list: ShadeInst[], dy: number) => list.map((i) => ({ position: [i.position[0], i.position[1] + dy, i.position[2]] as [number, number, number], scale: i.scale }));
  return [primitives.box({
    name: `f${slot} wall contact shade`,
    instances: [...far, ...up(near, 0.001), ...up(near, 0.002), ...ceil, ...up(ceil, -0.001)],
    castShadow: false,
    receiveShadow: false,
    material: material.pbr({ color: "#000000", roughness: 1, metalness: 0, opacity: BZ_WALL_AO.farOpacity })
  }).runtime(staticNode(slot, "ao"))];
}
/**
 * GU47 phase 6: on F6 the only shadowed light is the moon through the hatch, and the sealed ceiling around it already
 * shades everything else, so props, doors and pickups more than two cells from the hatch cast nothing (each caster was
 * a second draw in the moon's shadow pass). Hostiles still cast (they walk into the shaft). Every other floor: unchanged.
 */
function castsShadowAt(def: FloorDef, x: number, z: number): boolean {
  if (def.id !== BZ_HATCH_FLOOR_ID) return true;
  const { min, max } = BZ_HATCH_CELLS;
  return x >= min[0] - 2 && x <= max[0] + 2 && z >= min[1] - 2 && z <= max[1] + 2;
}
/** GU47 phase 4: a door whose slide runs along X (walls left and right of it) faces +-Z; same rule as doorAlongX on the rows. */
function doorFacesZ(rows: readonly string[], x: number, z: number): boolean {
  const solid = (x2: number, z2: number) => isSolid(rows[z2]?.[x2] ?? "#");
  return solid(x - 1, z) || solid(x + 1, z) ? !(solid(x, z - 1) && solid(x, z + 1)) : false;
}
/** GU47 phase 9: direction from an exit cell to its first solid neighbour (the lift shutter stands against that wall). */
function wallFace(rows: readonly string[], x: number, z: number): [number, number] {
  for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) if (isSolid(rows[z + dz]?.[x + dx] ?? "#")) return [dx, dz];
  return [0, 1];
}
// crack cue faces the first open neighbor
function pushFace(rows: readonly string[], x: number, z: number): [number, number] {
  const at = (x2: number, z2: number) => rows[z2]?.[x2] ?? " ";
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const c = at(x + dx, z + dz);
    if (c !== "#" && c !== "%" && c !== " " && c !== "P") return [-dx, -dz];
  }
  return [0, 0];
}
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt * 255));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt * 255));
  const b = Math.max(0, Math.min(255, (n & 255) + amt * 255));
  return `#${((Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// audio cues — game-sfx-core pack (served under /packs/)
const CUES = {
  pistol: { id: "pistol", asset: { url: sfxUrl("explosion.laser.00", "opus.webm") }, volume: 0.5, bus: "sfx" },
  mg: { id: "mg", asset: { url: sfxUrl("explosion.zap.00", "opus.webm") }, volume: 0.4, bus: "sfx" },
  rocket: { id: "rocket", asset: { url: sfxUrl("explosion.large.00", "opus.webm") }, volume: 0.8, bus: "sfx" },
  knife: { id: "knife", asset: { url: sfxUrl("whoosh.swing-light.00", "opus.webm") }, volume: 0.6, bus: "sfx" },
  dry: { id: "dry", asset: { url: sfxUrl("ui.error.00", "opus.webm") }, volume: 0.5, bus: "ui" },
  reload: { id: "reload", asset: { url: sfxUrl("ui.toggle.00", "opus.webm") }, volume: 0.6, bus: "ui" },
  hit: { id: "hit", asset: { url: sfxUrl("impact.flesh.medium.00", "opus.webm") }, volume: 0.55, bus: "sfx" },
  kill: { id: "kill", asset: { url: sfxUrl("creature.grunt-heavy.00", "opus.webm") }, volume: 0.65, bus: "sfx" },
  hurt: { id: "hurt", asset: { url: sfxUrl("impact.flesh.heavy.00", "opus.webm") }, volume: 0.6, bus: "sfx" },
  bite: { id: "bite", asset: { url: sfxUrl("impact.flesh.light.00", "opus.webm") }, volume: 0.7, bus: "sfx" },
  boom: { id: "boom", asset: { url: sfxUrl("explosion.medium.00", "opus.webm") }, volume: 0.75, bus: "sfx" },
  step: { id: "step", asset: { url: sfxUrl("footsteps.concrete.00", "opus.webm") }, volume: 0.28, bus: "sfx" },
  secret: { id: "secret", asset: { url: sfxUrl("stinger.checkpoint.00", "opus.webm") }, volume: 0.8, bus: "ui" },
  pickup: { id: "pickup", asset: { url: sfxUrl("pickup.coin.00", "opus.webm") }, volume: 0.55, bus: "ui" },
  key: { id: "key", asset: { url: sfxUrl("ui.unlock.00", "opus.webm") }, volume: 0.8, bus: "ui" },
  weapon: { id: "weapon", asset: { url: sfxUrl("pickup.power-up.00", "opus.webm") }, volume: 0.7, bus: "ui" },
  door: { id: "door", asset: { url: sfxUrl("impact.metal.medium.00", "opus.webm") }, volume: 0.4, bus: "sfx" },
  alert: { id: "alert", asset: { url: sfxUrl("creature.grunt-light.00", "opus.webm") }, volume: 0.5, bus: "sfx" },
  boss: { id: "boss", asset: { url: sfxUrl("stinger.alarm.00", "opus.webm") }, volume: 0.7, bus: "sfx" },
  // C9: the Warden's volley, vent and summon each get their own cue
  launch: { id: "launch", asset: { url: sfxUrl("whoosh.swing-light.00", "opus.webm") }, volume: 0.75, bus: "sfx" },
  vent: { id: "vent", asset: { url: sfxUrl("ui.unlock.00", "opus.webm") }, volume: 0.7, bus: "sfx" },
  // C8: positional enemy gunfire
  enemyShot: { id: "enemyShot", asset: { url: sfxUrl("explosion.laser.00", "opus.webm") }, volume: 0.42, bus: "sfx" },
  win: { id: "win", asset: { url: sfxUrl("stinger.win.00", "opus.webm") }, volume: 0.9, bus: "ui" },
  lose: { id: "lose", asset: { url: sfxUrl("stinger.lose.00", "opus.webm") }, volume: 0.8, bus: "ui" },
  switch: { id: "switch", asset: { url: sfxUrl("ui.click.00", "opus.webm") }, volume: 0.5, bus: "ui" },
  ambience: { id: "ambience", asset: { url: sfxUrl("ambience.interior-hum", "opus.webm") }, volume: 0.32, loop: true, bus: "ambience" }
} as const;
type CueId = keyof typeof CUES;

// ---------------------------------------------------------------------------
// The game reads its own key table (flow.ts DEFAULT_BINDINGS, remappable in the Player Studio); the engine input only gets
// the pointer.
/** 5.0 lab flags (?backend= / ?gamut=): all off by default, EXPERIMENTAL, WebGL2 fallback kept. ?worker=1 renders in a worker (main-thread fallback kept); ?depth= is not wired here. */
// WebGPU by default (real-GPU check 2026-11-08: same frame, >= 0.9x WebGL2 fps); ?backend=webgl2 opts out.
const isDocumentHidden = (): boolean =>
  typeof document !== "undefined" && (document.visibilityState === "hidden" || document.hidden === true);
const targetPixelRatio =
  typeof window !== "undefined"
    ? Math.min(window.devicePixelRatio || 1, (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches) ? 1.35 : 2)
    : 1;
const labOptions = labAppOptions(readLabFlags(), { backend: "auto", createWorker: createWorkerRendererWorker });
const mg = createGame({
  id: "showcase-bunker-zero",
  target: "#app",
  autoStart: true,
  pixelRatio: targetPixelRatio,
  scene: buildScene,
  input: { actions: { fire: [...DEFAULT_BINDINGS.fire] }, pointer: true },
  sound: { cues: { ...CUES } },
  juice: {
    fire: { shake: 0.06 },
    kill: { punch: { fovDeg: 2.2, ms: 180 } },
    hurt: { shake: 0.5, flash: { color: "#c22a1f", peak: 0.3, ms: 260 } },
    secret: { punch: { fovDeg: 1.6, ms: 280 }, flash: { color: "#ffb648", peak: 0.12, ms: 300 } },
    win: { punch: { fovDeg: 2.6, ms: 420 }, flash: { color: "#ffd76a", peak: 0.2, ms: 500 } }
  },
  qualityRebuild: { flags: ["game"] },
  // WP-10: AgX filmic output with dithering, never a look preset or ambient fill (art/look.ts BZ_OUTPUT_EXPOSURE).
  output: { toneMapping: "agx", exposure: BZ_OUTPUT_EXPOSURE, dither: true, ...labOptions.output },
  ...(labOptions.renderer ? { renderer: labOptions.renderer } : {}),
  ...(labOptions.worker ? { worker: labOptions.worker } : {}),
  evidence: { schema: 1, sections: { bunkerZero: () => window.__gameEvidence ?? { status: "unbound" } } }
});
const app = mg.app;
// A1: the shared loading helper drives the game shell's loading bar until the renderer is mounted.
const loading = createLoadingProgress({ shell: mg.shell });
loading.set(0.05, "Loading Bunker Zero");
mg.start();
if (isDocumentHidden()) app.pause?.();
const feel = gameFeel.create({ app, time: app.time });
const impactRig: ImpactRig = createImpactRig();
let impactFrame: ReturnType<ImpactRig["step"]> = {
  simDt: 1 / 60,
  frozen: false,
  fovDeltaDeg: 0,
  shakeOffset: [0, 0, 0],
  shakeRoll: 0
};
let recoilKick = 0;
const cue = (id: CueId) => { void mg.sound?.cue(id); };

// ---------------------------------------------------------------------------
// sim + node-handle caches
type NodeHandle = ReturnType<typeof app.nodes.require>;
let sim: Sim;
let mode: "descent" | "killhouse" = "descent";
let floorIdx = 0;
let dogtag = "RAZOR-6";
const nodeCache = new Map<string, NodeHandle | null>();
const enemyRigShown = new Map<string, boolean>();
/** Node by id, or null when the scene has no such node: per-frame code skips missing nodes instead of throwing (C1). */
function opt(id: string): NodeHandle | null {
  let n = nodeCache.get(id);
  if (n === undefined) {
    n = app.nodes.get(id) ?? null;
    if (n || appReady) nodeCache.set(id, n);
  }
  return n;
}
function req(id: string): NodeHandle {
  const n = opt(id);
  if (!n) throw new Error(`Bunker Zero: scene node "${id}" is missing`);
  return n;
}
function setEnemyRigVisible(ids: EnemyRigIds, shown: boolean) {
  if (enemyRigShown.get(ids.body) === shown) return;
  enemyRigShown.set(ids.body, shown);
  for (const part of ENEMY_RIG_PARTS) opt(ids[part])?.setVisible(shown);
}
function applyEnemyRigPose(ids: EnemyRigIds, pose: ReturnType<typeof computeEnemyRigPose>) {
  const rig = opt(ids.rig);
  if (rig) {
    rig.setPosition(pose.rigPos[0], pose.rigPos[1], pose.rigPos[2]);
    rig.setRotation(pose.rigRot[0], pose.rigRot[1], pose.rigRot[2]);
  }
  opt(ids.torso)?.setRotation(pose.torsoRot[0], pose.torsoRot[1], pose.torsoRot[2]);
  opt(ids.head)?.setRotation(pose.headRot[0], pose.headRot[1], pose.headRot[2]);
  opt(ids.armL)?.setRotation(pose.armLRot[0], pose.armLRot[1], pose.armLRot[2]);
  opt(ids.armR)?.setRotation(pose.armRRot[0], pose.armRRot[1], pose.armRRot[2]);
  opt(ids.legL)?.setRotation(pose.legLRot[0], pose.legLRot[1], pose.legLRot[2]);
  opt(ids.legR)?.setRotation(pose.legRRot[0], pose.legRRot[1], pose.legRRot[2]);
  opt(ids.spec)?.setRotation(pose.specRot[0], pose.specRot[1], pose.specRot[2]);
}
const vmNodes = { knife: req("vm-knife"), pistol: req("vm-pistol"), mg: req("vm-mg"), rocket: req("vm-rocket") };
const vmHands = {
  sleeveR: req("vm-sleeve-r"),
  cuffR: req("vm-cuff-r"),
  gloveR: req("vm-glove-r"),
  sleeveL: req("vm-sleeve-l"),
  gloveL: req("vm-glove-l"),
  optic: req("vm-optic")
};
/**
 * GU47 phase 6: a viewmodel not in hand is parked far outside every floor instead of hidden. The machine gun, hidden
 * from boot until its pickup, never drew in any HUD frame although its handle was visible and in front of the camera
 * (vmprobe g11p6-r1 and r2, with and without a material override); the pistol, shown at boot, always drew.
 */
const vmParked = new Set<NodeHandle>();
function parkViewmodel(node: NodeHandle) {
  if (vmParked.has(node)) return;
  vmParked.add(node);
  node.setPosition(-500, -60, -500);
  node.setVisible(true);
}
function unparkViewmodel(node: NodeHandle) {
  vmParked.delete(node);
}
const muzzleFlash = req("muzzle-flash");
const muzzleCard = req("muzzle-card");
const muzzleSprite = req("muzzle-sprite");
const ventLight = req("vent-light");
const wardenVentField = req("warden-vent-field");
const sparkCards = Array.from({ length: SPARK_CARD_POOL }, (_, i) => req(`spark-card-${i}`));
const sparkCardState: { x: number; y: number; z: number; until: number }[] = Array.from(
  { length: SPARK_CARD_POOL },
  () => ({ x: 0, y: -50, z: 0, until: -1 })
);
let nextSparkCard = 0;
const rocketNodes = Array.from({ length: MAX_ROCKETS }, (_, i) => req(`rocket-${i}`));
const tracerNodes = Array.from({ length: MAX_ROCKETS }, (_, i) => req(`tracer-${i}`));
const enemyTracerNodes = Array.from({ length: ENEMY_TRACERS }, (_, i) => req(`etracer-${i}`));
const rocketShown: boolean[] = Array.from({ length: MAX_ROCKETS }, () => true);
const enemyTracerShown: boolean[] = Array.from({ length: ENEMY_TRACERS }, () => true);
const sparkShown: boolean[] = Array.from({ length: SPARK_CARD_POOL }, () => true);
let muzzleShown = true;
let ventShown = true;
let lastExitSlot = -1;
let lastExitLocked: boolean | null = null;
const fxRng = cosmeticRng(0xb2e0);

// ---------------------------------------------------------------------------
// GU47 WP-21 look: the practical light rig (BZ-01/02), per-floor fog, IBL and white balance, the effect pack (BZ-03)
const qualityTier = (): QualityTierName => {
  const t = (app as { quality?: { tier?: string } }).quality?.tier;
  return t === "low" || t === "medium" || t === "ultra" ? t : "high";
};
const lightRig = createLightRigDriver((id) => opt(id) as RigLightHandle | null, {
  tier: qualityTier,
  reducedMotion: () => reducedMotion(),
  isOpen: (cx, cz) => {
    const st = sim?.state;
    if (!st || cx < 0 || cz < 0 || cx >= st.w || cz >= st.h) return false;
    return !isSolid(st.grid[cz * st.w + cx] ?? "#");
  }
});
/** BZ-02 / BZ-05: one lamp colour, dark-slate linear fog, IBL scale and white balance per floor (presentation only, PRD D8). */
function applyFloorLook(slot: number, transitionSeconds = 0) {
  const look = lookOfSlot(slot);
  lightRig.applyFloor(slot);
  try { app.atmosphere?.setFog(bunkerSceneFog(look), { transitionSeconds }); } catch { /* fog runtime not mounted */ }
  try { app.lighting?.setEnvironmentIntensity(look.environmentIntensity / lookOfSlot(BOOT_SLOT).environmentIntensity); } catch { /* lighting runtime not mounted */ }
  try { app.atmosphere?.setWetness(BZ_WETNESS[slot] ?? 0, { transitionSeconds }); } catch { /* wetness not mounted */ }
  const lut = floorLut(slot);
  try { app.post?.setEffect("colorGrade", { temperature: look.grade.temperature, tint: look.grade.tint, lut: lut ? lutUrlOfSlot(slot) : "", lutIntensity: lut ? 1 : 0 }); } catch { /* post runtime not mounted */ }
  try { app.post?.setEffectEnabled("volumetricFog", BZ_GOD_RAYS && shaftOnSlot(slot)); } catch { /* post runtime not mounted */ }
  document.documentElement.style.setProperty("--bz-lamp", look.lamp.color);
  startAtmosphere(slot);
  placeFloorDecals(slot);
}
/** BZ-10: move the floor-decal pool to this floor's 12 seeded poses (6 on Low) and clear the bullet holes. */
const holeSpawnedAt: number[] = Array.from({ length: BZ_BULLET_HOLES }, () => -1e9);
function placeFloorDecals(slot: number) {
  const poses = floorDecals(floorDefOf(slot));
  const { floor } = decalsForTier(qualityTier());
  for (let i = 0; i < BZ_FLOOR_DECAL_COUNT; i++) {
    const node = opt(floorDecalId(i)), pose = poses[i];
    if (!node) continue;
    if (!pose || i >= floor) { node.setVisible(false); continue; }
    node.setPosition(pose.position[0], pose.position[1], pose.position[2]).setRotation(0, pose.yaw, 0).setScale([pose.size, 1, pose.size]).setVisible(true);
  }
  const hazards = hazardPoses(floorDefOf(slot));
  for (let i = 0; i < BZ_HAZARD_DECALS; i++) {
    const node = opt(hazardDecalId(i)), pose = hazards[i];
    if (!node) continue;
    if (!pose) { node.setVisible(false); continue; }
    node.setPosition(pose.position[0], pose.position[1], pose.position[2]).setRotation(0, pose.yaw, 0).setVisible(true);
  }
  for (let i = 0; i < BZ_BULLET_HOLES; i++) { holeSpawnedAt[i] = -1e9; opt(bulletHoleId(i))?.setVisible(false); }
}
/** BZ-10: a player shot that hit a wall leaves a hole on that face for 20 s (ring of 12, 6 on Low). */
function addBulletHole(x: number, z: number) {
  const st = sim.state;
  const pose = bulletHolePose(st.grid, st.w, st.h, x, z);
  if (!pose) return;
  const ring = holeSpawnedAt.slice(0, decalsForTier(qualityTier()).holes);
  const i = nextHoleSlot(ring);
  const node = opt(bulletHoleId(i));
  if (!node) return;
  holeSpawnedAt[i] = performance.now() / 1000;
  node.setPosition(pose.position[0], pose.position[1], pose.position[2]).setRotation(pose.rotation[0], pose.rotation[1], pose.rotation[2]).setVisible(true);
}
function expireBulletHoles(nowSeconds: number) {
  for (let i = 0; i < BZ_BULLET_HOLES; i++) {
    if (holeSpawnedAt[i]! > -1e8 && holeExpired(holeSpawnedAt[i]!, nowSeconds)) { holeSpawnedAt[i] = -1e9; opt(bulletHoleId(i))?.setVisible(false); }
  }
}
/** BZ-09: 2-3 looping emitters on the active floor, none on the hidden ones (stopped and respawned per floor). */
let atmosphere: { stop(o?: { immediate?: boolean }): void }[] = [];
let atmosphereSlot = -1;
function startAtmosphere(slot: number) {
  if (!appReady || !app.effects || slot === atmosphereSlot) return;
  for (const h of atmosphere) { try { h.stop({ immediate: true }); } catch { /* already gone */ } }
  atmosphere = [];
  atmosphereSlot = slot;
  const look = lookOfSlot(slot);
  for (const e of atmosphereEmitters(look, SLOT_WALL_H[slot]!, { tier: qualityTier(), reducedMotion: reducedMotion() })) {
    try { atmosphere.push(app.effects.spawn(e.spec, [cellCenter(e.cell[0]), e.y, cellCenter(e.cell[1])])); } catch { /* effects runtime not mounted */ }
  }
}
/** Reduced flash: the OS setting (prefers-reduced-motion covers flashing in most browsers) or `?reducedFlash=1`. */
const reducedFlash = () => bootParams.get("reducedFlash") === "1" || reducedMotion();
let vfxRegisteredFor = "";
function ensureVfx() {
  const key = `${reducedMotion() ? 1 : 0}${reducedFlash() ? 1 : 0}`;
  if (key === vfxRegisteredFor || !app.effects) return;
  vfxRegisteredFor = key;
  registerBunkerVfx(app.effects, { reducedMotion: reducedMotion(), reducedFlash: reducedFlash() });
}
let vfxBursts = 0;
/** BZ-03: one registered preset per gameplay event; every shot, impact and blast flashes a transient light. */
function fireVfx(event: keyof typeof BZ_VFX_EVENTS, at: [number, number, number]) {
  const kind: BunkerVfxKind | undefined = BZ_VFX_EVENTS[event];
  if (!kind || !app.effects || !appReady) return;
  ensureVfx();
  try { app.effects.burst(kind, at, { camera: false }); vfxBursts++; } catch { /* effects runtime not mounted */ }
}
/** Sim records (shots, blasts, enemy shots) already given their burst: cosmetic bookkeeping, never fed back. */
const seenFx = new WeakSet<object>();
const firstSight = (o: object) => { if (seenFx.has(o)) return false; seenFx.add(o); return true; };
let muzzleWasLit = false;
/** BZ-18: wall time of the last heavy hit and the CA level last sent (only changes are pushed to the post surface). */
let caHitAt = -1e9;
let caSent = 0;
function tickCaPulse(now: number) {
  const level = caPulseLevel((now - caHitAt) / 1000, reducedFlash());
  if (level === caSent) return;
  caSent = level;
  try { app.post?.setEffect("chromaticAberration", { intensity: level }); } catch { /* post runtime not mounted */ }
}
let deadAt = -1;
let deathFadeLevel = 0;
/** BZ-15: a door slides along x when its open neighbours are north/south (the frame spans x). */
function doorAlongX(cx: number, cz: number): boolean {
  const st = sim.state;
  const solid = (x: number, z: number) => x < 0 || z < 0 || x >= st.w || z >= st.h || isSolid(st.grid[z * st.w + x] ?? "#");
  return solid(cx - 1, cz) || solid(cx + 1, cz) ? !(solid(cx, cz - 1) && solid(cx, cz + 1)) : false;
}
/** BZ-16: letterbox bars over the elevator descent between floors; skipped under reduced motion. */
let descentTimer = 0;
function playDescent() {
  const secs = descentSeconds(reducedMotion());
  if (secs <= 0 || DEMO || BOOT_FLOOR) return;
  document.body.classList.add("bz-descending");
  clearTimeout(descentTimer);
  descentTimer = window.setTimeout(() => document.body.classList.remove("bz-descending"), secs * 1000);
}

const enemyYaw = new Map<string, number>();
const forwardOverride: Partial<Record<string, ForwardAxis>> = {};
const enemyForward = (kind: keyof typeof ENEMY_FORWARD): ForwardAxis => forwardOverride[kind] ?? ENEMY_FORWARD[kind];
let lastPoseTime = -1;
let poseDt = 1 / 60;
let qaFrozen = false;
const activeSlot = () => (sim.state.mode === "killhouse" ? 6 : floorIdx);
const enemyIds = (slot: number, e: Enemy): EnemyRigIds => makeEnemyRigIds(`f${slot}-${enemyNodeStem(e).body}`);

// ---------------------------------------------------------------------------
// run state: the loadout and score carry floor to floor in a descent run (C14); the results panel totals the run (C3)
let runResults: FloorResult[] = [];
let runStartFloor = 0;
let entryLoadout: Loadout = defaultLoadout();
let outcomeHandled = false;
let campaignDone = false;
/** The one pending transition (death retry, next floor, Kill House retry). startFloor clears it, so timers never stack (C16). */
let pending: { kind: "next" | "retry" | "killhouse-retry" | "to-descent" | "results"; t: number; age: number } | null = null;
let eventSeq = 0;
let eventsDrained = 0;
let frameErrors = 0;
let lastFrameError = "";
let pilot = createAutopilot();

interface StartOptions { loadout?: Loadout; newRun?: boolean }
function startFloor(idx: number, m: "descent" | "killhouse", opts: StartOptions = {}) {
  mode = m;
  enemyYaw.clear();
  lastPoseTime = -1;
  floorIdx = idx;
  pending = null;
  outcomeHandled = false;
  campaignDone = false;
  if (opts.newRun || m === "killhouse") { runResults = []; runStartFloor = idx; }
  entryLoadout = opts.loadout ?? (opts.newRun || m === "killhouse" ? defaultLoadout() : entryLoadout);
  const def = m === "killhouse" ? KILL_HOUSE : FLOORS[idx]!;
  sim = createSim(def, { ox: (m === "killhouse" ? 6 : idx) * FLOOR_SPAN, mode: m, seed: 1337 + idx * 97 + (m === "killhouse" ? 7 : 0), loadout: entryLoadout });
  pilot = createAutopilot();
  // GU47 g11 phase 10: a floor that was not prepared ahead (menu jump, QA hook) mounts its mapped surfaces now
  if (appReady) SURFACES.prepare(activeSlot());
  eventSeq = 0;
  hideAllRuntime();
  bindFloor();
  applyFloorLook(activeSlot());
  syncScenePose(NO_INPUT);
  setResultsVisible(false);
  lastHud = "";
  renderHud();
  publishEvidence(true);
  setModeButtons();
  (document.activeElement as HTMLElement | null)?.blur?.();
  if (m === "killhouse") banner("KILL HOUSE", "clear the floor before the clock runs out");
  else banner(`FLOOR ${def.id + 1} — ${def.name.toUpperCase()}`, def.subtitle);
}
/** C18: every floor slot but the active one is hidden, static geometry included. */
function hideAllRuntime() {
  const slot = activeSlot();
  enemyRigShown.clear();
  for (let s = 0; s < ALL_FLOORS.length; s++) {
    for (const id of SLOT_IDS[s]!) opt(id)?.setVisible(false);
    if (s === slot) for (const id of SLOT_STATIC_IDS[s]!) opt(id)?.setVisible(true);
  }
  vmParked.clear();
  for (const v of Object.values(vmNodes)) parkViewmodel(v);
  for (const h of Object.values(vmHands)) parkViewmodel(h);
  muzzleFlash.setVisible(false);
  muzzleCard.setVisible(false);
  muzzleSprite.setVisible(false);
  wardenVentField.setVisible(false);
  muzzleShown = true;
  ventShown = true;
  lastExitSlot = -1;
  lastExitLocked = null;
  rocketShown.fill(true);
  enemyTracerShown.fill(true);
  for (let i = 0; i < SPARK_CARD_POOL; i++) {
    sparkCardState[i]!.until = -1;
    sparkCards[i]!.setVisible(false);
    sparkShown[i] = false;
  }
}
function bindFloor() {
  enemyRigShown.clear();
  resetPropPools(activeSlot());
}
const cellOf = (v: number) => Math.floor(v / CELL);
const NO_INPUT: SimInput = { moveX: 0, moveZ: 0, turn: 0, pitchDelta: 0, fire: false, firePressed: false, reload: false, use: false };

// ---------------------------------------------------------------------------
// HUD
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const elHud = $<HTMLElement>("bz-hud"), elHp = $("bz-hp"), elArmor = $("bz-armor"), elAmmo = $("bz-ammo"),
  elWeapon = $("bz-weapon-name"), elScore = $("bz-score"), elKills = $("bz-kills"), elTime = $("bz-time"),
  elVign = $("bz-vignette"), elBanner = $("bz-banner"), elTag = $("bz-floor-tag"), elFeed = $("bz-feed"),
  elCross = $("bz-crosshair"), elMenu = $("bz-menu"), elPause = $("bz-pause"), elResults = $("bz-results"),
  elIntro = $("bz-intro"), elMap = $<HTMLCanvasElement>("bz-map"), elVuln = $("bz-vulnerable"), elTouch = $("bz-touch"),
  elArc = $("bz-damage-arc"), elCoords = document.getElementById("bz-coords");
let bannerT = 0;
function banner(big: string, small = "") {
  elBanner.textContent = big;
  const sm = document.createElement("small");
  sm.textContent = small;
  elBanner.append(sm);
  elBanner.classList.add("show");
  bannerT = 3;
}
const FEED: { text: string; warn: boolean }[] = [];
function feed(s: string, warn = false) {
  FEED.push({ text: formatTacticalFeed(s), warn });
  if (FEED.length > 6) FEED.shift();
  elFeed.replaceChildren(...FEED.map((f) => { const d = document.createElement("div"); d.className = `bz-tick${f.warn ? " warn" : ""}`; d.textContent = f.text; return d; }));
}

// ---------------------------------------------------------------------------
// settings: key bindings, HUD scale, reduced motion (C10, C21)
const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }
};
let bindings: Bindings = parseBindings(store.get("bz-bindings"));
const reducedMotionQuery = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
let reducedMotionPref = store.get("bz-reduced-motion");
const reducedMotion = () => (reducedMotionPref === null ? !!reducedMotionQuery?.matches : reducedMotionPref === "1");
/** Shake and head bob scale: 15% under reduced motion. */
const motionScale = () => (reducedMotion() ? 0.15 : 1);
function applyHudScale(v: string) {
  const scale = v === "l" ? 1.25 : v === "s" ? 0.85 : 1;
  document.documentElement.style.setProperty("--bz-hud-scale", String(scale));
  document.querySelectorAll<HTMLButtonElement>(".bz-hudscale").forEach((b) => b.classList.toggle("active", b.dataset.scale === v));
}
applyHudScale(store.get("bz-hud-scale") ?? "m");

// ---------------------------------------------------------------------------
// pause (C13): menu open, pointer lock lost, P or Esc, the intro card
const pauseReason = { user: false, lock: false, menu: false, intro: false };
const isPaused = () => pauseReason.user || pauseReason.lock || pauseReason.menu || pauseReason.intro;
function refreshPause() {
  elPause.hidden = !(pauseReason.user || pauseReason.lock) || pauseReason.menu || pauseReason.intro || campaignDone;
}
function setPaused(reason: keyof typeof pauseReason, on: boolean) { pauseReason[reason] = on; refreshPause(); }
function resume() {
  pauseReason.user = false; pauseReason.lock = false; refreshPause();
  if (!DEMO && !touchMode) requestLock();
}

// ---------------------------------------------------------------------------
// pointer lock + mouse + capture-phase keyboard tracking
const canvas = document.querySelector<HTMLCanvasElement>("#app canvas")!;
let pointerLocked = false;
let pointerFireHeld = false;
let pointerFirePressed = false;
let pendingWheel = 0;
let lockRequestedAt = -1;
let lockUnavailable = false;
const keysHeld = new Set<string>();
const keysPressed = new Set<string>();
let remapAction: BindAction | null = null;
let yawDelta = 0, pitchDelta = 0;

function requestLock() {
  if (pointerLocked || lockUnavailable) return;
  lockRequestedAt = performance.now();
  try { const r = canvas.requestPointerLock() as unknown; if (r instanceof Promise) r.catch(() => { lockUnavailable = true; }); } catch { lockUnavailable = true; }
}
canvas.addEventListener("click", () => {
  if (!DEMO) { autoPilot = false; if (!touchMode) requestLock(); }
  void mg.sound?.unlock();
  cue("ambience");
});
document.addEventListener("pointerlockchange", () => {
  const was = pointerLocked;
  pointerLocked = document.pointerLockElement === canvas;
  // losing the lock mid-play pauses the run; the Resume button takes it back
  if (was && !pointerLocked && !DEMO && !campaignDone) setPaused("lock", true);
  if (pointerLocked) setPaused("lock", false);
});
document.addEventListener("pointerlockerror", () => { lockUnavailable = true; });
document.addEventListener("mousemove", (e) => {
  if (!pointerLocked || DEMO) return;
  autoPilot = false;
  yawDelta += e.movementX * 0.0024;
  pitchDelta -= e.movementY * 0.002;
});
window.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  const target = e.target as HTMLElement | null;
  if (target && (target.closest(".aura3d-top-bar") || target.closest(".bz-overlay") || target.closest("#bz-menu") || target.closest("#bz-touch"))) return;
  if (pending?.kind === "retry" && pending.age > 0.6) { runPending(); return; }
  // C26: the click that acquires pointer lock does not also fire (unless the browser cannot lock at all)
  if (!DEMO && !touchMode && !pointerLocked && !lockUnavailable) {
    if (lockRequestedAt > 0 && performance.now() - lockRequestedAt > 1500) lockUnavailable = true;
    else return;
  }
  if (!DEMO) autoPilot = false;
  pointerFireHeld = true;
  pointerFirePressed = true;
}, { capture: true });
window.addEventListener("mouseup", (e) => { if (e.button === 0) pointerFireHeld = false; }, { capture: true });
document.addEventListener("wheel", (e) => {
  if ((e.target as HTMLElement | null)?.closest?.(".bz-panel")) return;
  if (!DEMO) autoPilot = false;
  pendingWheel += Math.sign(e.deltaY);
});

const boundCodes = () => new Set(Object.values(bindings).flat());
const actionHas = (a: BindAction, set: Set<string>) => bindings[a].some((c) => set.has(c));
const onKeyDown = (e: KeyboardEvent) => {
  const typing = (document.activeElement as HTMLInputElement | null)?.tagName === "INPUT" && (document.activeElement as HTMLInputElement).type === "text";
  if (remapAction) {
    e.preventDefault(); e.stopPropagation();
    if (e.code !== "Escape") { bindings = rebind(bindings, remapAction, e.code); store.set("bz-bindings", JSON.stringify(bindings)); }
    remapAction = null; renderRemap();
    return;
  }
  if (typing || e.repeat && keysHeld.has(e.code)) { if (!typing && boundCodes().has(e.code) && e.code !== "Escape") e.preventDefault(); return; }
  if (e.code === "Escape") {
    if (elMenu.classList.contains("open")) { closeMenu(); return; }
    if (!elIntro.hidden) { dismissIntro(); return; }
    if (!pointerLocked && !campaignDone) { if (isPaused()) resume(); else setPaused("user", true); }
    return; // with the pointer locked the browser releases it, and pointerlockchange pauses
  }
  if (pending?.kind === "retry" && pending.age > 0.6) { runPending(); return; }
  if (elMenu.classList.contains("open") || !elIntro.hidden) return;
  // C11: Enter, Tab, Space and arrows act in game only; they never re-click a focused button or move browser focus
  if (boundCodes().has(e.code)) e.preventDefault();
  if (bindings.pause.includes(e.code)) { if (isPaused()) resume(); else setPaused("user", true); return; }
  if (bindings.map.includes(e.code)) { toggleMap(); return; }
  if (!DEMO) autoPilot = false;
  if (!keysHeld.has(e.code)) keysPressed.add(e.code);
  keysHeld.add(e.code);
};
const onKeyUp = (e: KeyboardEvent) => { keysHeld.delete(e.code); };
window.addEventListener("keydown", onKeyDown, { capture: true });
window.addEventListener("keyup", onKeyUp, { capture: true });
window.addEventListener("blur", () => {
  keysHeld.clear();
  keysPressed.clear();
  pointerFireHeld = false;
  pointerFirePressed = false;
});
const syncBackgroundVisibility = (): void => {
  if (isDocumentHidden()) {
    keysHeld.clear();
    keysPressed.clear();
    pointerFireHeld = false;
    pointerFirePressed = false;
    app.pause?.();
  } else {
    lastWall = performance.now();
    app.resume?.();
  }
};
document.addEventListener("visibilitychange", syncBackgroundVisibility);
window.addEventListener("pagehide", () => { app.pause?.(); });
window.addEventListener("pageshow", syncBackgroundVisibility);

// ---------------------------------------------------------------------------
// touch layer (C12): left stick moves, the right half looks, buttons of at least 56 px fire, use, reload, swap and pause
let touchMode = false;
const touch = { moveX: 0, moveZ: 0, fire: false, firePressed: false, use: false, reload: false, swap: 0 };
function enableTouch() {
  if (touchMode) return;
  touchMode = true;
  elTouch.hidden = false;
  document.body.classList.add("bz-touch-mode");
}
if (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches) enableTouch();
window.addEventListener("touchstart", () => enableTouch(), { passive: true, capture: true });
{
  const stick = elTouch.querySelector<HTMLElement>('[data-control="move"]')!;
  const knob = stick.querySelector<HTMLElement>(".bz-knob")!;
  const look = elTouch.querySelector<HTMLElement>('[data-control="look"]')!;
  let stickId = -1, cx = 0, cy = 0, lookId = -1, lx = 0, ly = 0;
  stick.addEventListener("pointerdown", (e) => {
    stickId = e.pointerId; stick.setPointerCapture(e.pointerId);
    const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    e.preventDefault();
  });
  stick.addEventListener("pointermove", (e) => {
    if (e.pointerId !== stickId) return;
    const r = stick.getBoundingClientRect().width / 2;
    let dx = (e.clientX - cx) / r, dy = (e.clientY - cy) / r;
    const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    touch.moveX = Math.abs(dx) > 0.12 ? dx : 0; touch.moveZ = Math.abs(dy) > 0.12 ? -dy : 0;
    knob.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
  });
  const endStick = (e: PointerEvent) => { if (e.pointerId !== stickId) return; stickId = -1; touch.moveX = 0; touch.moveZ = 0; knob.style.transform = ""; };
  stick.addEventListener("pointerup", endStick); stick.addEventListener("pointercancel", endStick);
  look.addEventListener("pointerdown", (e) => { lookId = e.pointerId; look.setPointerCapture(e.pointerId); lx = e.clientX; ly = e.clientY; e.preventDefault(); });
  look.addEventListener("pointermove", (e) => {
    if (e.pointerId !== lookId) return;
    yawDelta += (e.clientX - lx) * 0.006; pitchDelta -= (e.clientY - ly) * 0.004; lx = e.clientX; ly = e.clientY;
    autoPilot = false;
  });
  const endLook = (e: PointerEvent) => { if (e.pointerId === lookId) lookId = -1; };
  look.addEventListener("pointerup", endLook); look.addEventListener("pointercancel", endLook);
  const button = (name: string, down: () => void, up?: () => void) => {
    const el = elTouch.querySelector<HTMLElement>(`[data-control="${name}"]`)!;
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add("on"); autoPilot = false; down(); void mg.sound?.unlock(); });
    const release = () => { el.classList.remove("on"); up?.(); };
    el.addEventListener("pointerup", release); el.addEventListener("pointercancel", release);
  };
  button("fire", () => { if (pending?.kind === "retry" && pending.age > 0.6) { runPending(); return; } touch.fire = true; touch.firePressed = true; }, () => { touch.fire = false; });
  button("use", () => { touch.use = true; });
  button("reload", () => { touch.reload = true; });
  button("swap", () => { touch.swap += 1; });
  button("pause", () => { if (isPaused()) resume(); else setPaused("user", true); });
}

// ---------------------------------------------------------------------------
// minimap (C11, C27): M or Tab toggles it; walls, doors, the key, the exit and the player
let mapOpen = false;
let mapDrawT = 0;
function toggleMap(on = !mapOpen) { mapOpen = on; elMap.hidden = !on; if (on) drawMap(); }
let mapEdges: { key: string; edges: Segment[] } = { key: "", edges: [] };
/** BZ-17: the blueprint floor plan (art/minimap.ts): wall outlines on blueprint blue, doors hazard, exit and player in the lamp colour. */
function drawMap() {
  const s = sim.state, p = s.player;
  const px = BLUEPRINT.px;
  if (elMap.width !== s.w * px) { elMap.width = s.w * px; elMap.height = s.h * px; }
  const ctx = elMap.getContext("2d");
  if (!ctx) return;
  const lamp = lookOfSlot(activeSlot()).lamp.color;
  const gridKey = s.grid.join(""); // push walls open in place, so the plan is keyed by content
  if (mapEdges.key !== gridKey) mapEdges = { key: gridKey, edges: blueprintEdges(s.grid, s.w, s.h) };
  ctx.fillStyle = BLUEPRINT.paper; ctx.fillRect(0, 0, elMap.width, elMap.height);
  ctx.strokeStyle = BLUEPRINT.grid; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 0; x <= s.w; x++) { ctx.moveTo(x * px + 0.5, 0); ctx.lineTo(x * px + 0.5, elMap.height); }
  for (let z = 0; z <= s.h; z++) { ctx.moveTo(0, z * px + 0.5); ctx.lineTo(elMap.width, z * px + 0.5); }
  ctx.stroke();
  for (let z = 0; z < s.h; z++) for (let x = 0; x < s.w; x++) {
    const ch = s.grid[z * s.w + x]!;
    const fill = ch === "#" || ch === " " || ch === "%" || ch === "P" ? BLUEPRINT.wallFill : ch === "D" ? BLUEPRINT.door : ch === "E" ? lamp : null;
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(x * px + 1, z * px + 1, px - 2, px - 2); }
  }
  ctx.strokeStyle = BLUEPRINT.wall; ctx.lineWidth = 1.5; ctx.beginPath();
  for (const [x0, z0, x1, z1] of mapEdges.edges) { ctx.moveTo(x0 * px, z0 * px); ctx.lineTo(x1 * px, z1 * px); }
  ctx.stroke();
  for (const k of s.pickups) if (k.kind === "key" && !k.taken) { ctx.fillStyle = BLUEPRINT.key; ctx.beginPath(); ctx.arc((k.cx + 0.5) * px, (k.cz + 0.5) * px, px * 0.32, 0, Math.PI * 2); ctx.fill(); }
  const mx = (p.x / CELL) * px, mz = (p.z / CELL) * px;
  ctx.save(); ctx.translate(mx, mz); ctx.rotate(p.yaw);
  ctx.fillStyle = lamp; ctx.strokeStyle = "#0a2242"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -px * 0.7); ctx.lineTo(px * 0.45, px * 0.45); ctx.lineTo(-px * 0.45, px * 0.45); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// the camera, viewmodel, enemies and props follow the sim
function syncScenePose(inp: SimInput) {
  const p = sim.state.player;
  poseDt = lastPoseTime < 0 ? 1 : Math.min(0.1, Math.max(0, sim.state.time - lastPoseTime));
  lastPoseTime = sim.state.time;
  const motion = motionScale();
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  const framing = viewmodelFraming(aspect, BZ_FOV);
  const feelScale = qaFrozen || BOOT_FLOOR ? 0 : motion;
  // ---- camera: eye pose + shake + tactical flashlight tracking (C21: both scale down under reduced motion)
  const shake = (sim.state.shake + (p.hurtT > 0 ? 0.3 : 0)) * motion;
  const shakeYaw = shake * Math.sin(sim.state.time * 91) * 0.012;
  const moveMag = Math.min(1, Math.abs(inp.moveZ) + Math.abs(inp.moveX));
  const eyeY = EYE + Math.sin(sim.state.time * 8.4) * 0.024 * moveMag * motion;
  const ox = sim.state.ox;
  const fx = Math.sin(p.yaw + shakeYaw), fz = -Math.cos(p.yaw + shakeYaw);
  const impX = impactFrame.shakeOffset[0] * feelScale;
  const impY = impactFrame.shakeOffset[1] * feelScale;
  const impZ = impactFrame.shakeOffset[2] * feelScale;
  // BZ-16: death roll 12 deg (reduced motion: none); no sprint in the sim, so no sprint FOV
  if (p.alive) deadAt = -1; else if (deadAt < 0) deadAt = sim.state.time;
  const sinceDeath = deadAt < 0 ? 0 : sim.state.time - deadAt;
  app.camera?.setPose({
    position: [p.x + ox + impX, eyeY + p.pitch * 0.4 + impY, p.z + impZ],
    target: [p.x + ox + impX + fx, eyeY + Math.tan(p.pitch) + impY, p.z + impZ + fz],
    roll: deathRoll(sinceDeath, reducedMotion()) + impactFrame.shakeRoll * feelScale,
    fov: framing.fov + impactFrame.fovDeltaDeg * feelScale
  });
  deathFadeLevel = deathFade(sinceDeath, reducedMotion());
  try { mg.sound?.setListener?.({ position: [p.x + ox, EYE, p.z], forward: [fx, 0, fz], up: [0, 1, 0] }); } catch { /* audio not ready */ }
  // BZ-01: the rig follows the camera (carried lamp, fixture pool, flicker, F6 beacon); cosmetic, never the sim's RNG
  lightRig.update({ x: p.x + ox, y: eyeY, z: p.z, fx, fz }, sim.state.time);

  // ---- viewmodel + gloved tactical hands (with Hor+ portrait framing & crisp recoil kickback on fire)
  const bob = Math.sin(sim.state.time * 9) * 0.018 * moveMag * motion;
  const muzzleFrac = Math.min(1, (sim.state.muzzle ?? 0) / 0.06);
  const recoil = muzzleFrac * 0.12 + recoilKick * 0.045 * feelScale;
  const rx = Math.cos(p.yaw), rz = Math.sin(p.yaw);
  const side = framing.side;
  // BZ-15: sway from the turn rate and a reload dip (both off under reduced motion)
  const [swayX, swayY] = viewmodelSway(inp.turn / Math.max(poseDt, 1 / 240), sim.state.time, moveMag, reducedMotion());
  const dip = reloadDip(p.reloading, p.weapon === "rocket" ? 1.4 : 1.1, reducedMotion());
  const vmx = p.x + ox + fx * (framing.forward - recoil) + rx * (side + swayX);
  const vmy = EYE - framing.drop + bob - p.pitch * 0.12 + recoil * 0.38 + swayY - dip;
  const vmz = p.z + fz * (framing.forward - recoil) + rz * (side + swayX);
  for (const [id, node] of Object.entries(vmNodes) as [WeaponId, typeof vmNodes.knife][]) {
    if (id === p.weapon && p.alive) {
      unparkViewmodel(node);
      node.setPosition(vmx, vmy, vmz);
      node.setRotation((id === "knife" ? -0.6 : 0) - recoil * 1.5, -p.yaw + Math.PI / 2 + VIEWMODEL_YAW_OFFSET[id], id === "knife" ? 0.5 : 0);
      node.setVisible(true);
    } else parkViewmodel(node);
  }
  if (p.alive) {
    // Gloved right forearm, gunmetal cuff, and armored grip enter from the lower-right wrist,
    // staying outside the 1280x720 pistol reference region while grounding every weapon in hand.
    const wristOffset = aspect < 0.85 ? 0.045 : 0.085;
    const armFwd = framing.forward - 0.12 - recoil * 0.85;
    const handFwd = framing.forward - 0.05 - recoil * 0.9;
    const armSide = side + wristOffset + swayX;
    const handSide = side + wristOffset * 0.72 + swayX;
    unparkViewmodel(vmHands.sleeveR);
    vmHands.sleeveR.setPosition(p.x + ox + fx * armFwd + rx * armSide, vmy - 0.085, p.z + fz * armFwd + rz * armSide);
    vmHands.sleeveR.setRotation(-1.12 - recoil * 0.8, -p.yaw, -0.26);
    vmHands.sleeveR.setVisible(true);
    unparkViewmodel(vmHands.cuffR);
    vmHands.cuffR.setPosition(p.x + ox + fx * (armFwd + 0.045) + rx * (armSide - 0.014), vmy - 0.056, p.z + fz * (armFwd + 0.045) + rz * (armSide - 0.014));
    vmHands.cuffR.setRotation(-1.12 - recoil * 0.8, -p.yaw, -0.26);
    vmHands.cuffR.setVisible(true);
    unparkViewmodel(vmHands.gloveR);
    vmHands.gloveR.setPosition(p.x + ox + fx * handFwd + rx * handSide, vmy - 0.038, p.z + fz * handFwd + rz * handSide);
    vmHands.gloveR.setRotation(-0.35 - recoil * 1.1, -p.yaw, -0.14);
    vmHands.gloveR.setVisible(true);
    if (p.weapon === "mg" || p.weapon === "rocket") {
      const supFwd = framing.forward + 0.06 - recoil;
      const supSide = side - 0.075 + swayX;
      unparkViewmodel(vmHands.sleeveL);
      vmHands.sleeveL.setPosition(p.x + ox + fx * (supFwd - 0.1) + rx * (supSide - 0.055), vmy - 0.09, p.z + fz * (supFwd - 0.1) + rz * (supSide - 0.055));
      vmHands.sleeveL.setRotation(-1.05, -p.yaw, 0.34);
      vmHands.sleeveL.setVisible(true);
      unparkViewmodel(vmHands.gloveL);
      vmHands.gloveL.setPosition(p.x + ox + fx * supFwd + rx * supSide, vmy - 0.042, p.z + fz * supFwd + rz * supSide);
      vmHands.gloveL.setRotation(-0.25, -p.yaw, 0.18);
      vmHands.gloveL.setVisible(true);
      unparkViewmodel(vmHands.optic);
      vmHands.optic.setPosition(vmx + fx * 0.03, vmy + 0.088, vmz + fz * 0.03);
      vmHands.optic.setRotation(-recoil * 1.2, -p.yaw, 0);
      vmHands.optic.setVisible(true);
    } else {
      parkViewmodel(vmHands.sleeveL);
      parkViewmodel(vmHands.gloveL);
      parkViewmodel(vmHands.optic);
    }
  } else {
    for (const h of Object.values(vmHands)) parkViewmodel(h);
  }

  // ---- compact off-center muzzle flash + dual-backend flipbook card + additive sprite; transient light via fireVfx (BZ-03)
  if (sim.state.muzzle > 0) {
    const mx = p.x + ox + fx * 0.84 + rx * (side * 1.04);
    const my = EYE - 0.24 - framing.drop * 0.35;
    const mz = p.z + fz * 0.84 + rz * (side * 1.04);
    muzzleFlash.setPosition(mx, my, mz);
    muzzleFlash.setRotation(0, -p.yaw + Math.PI / 2, sim.state.time * 25);
    // C17: cosmetic jitter comes from its own RNG, never the sim's seeded stream
    const flashJitter = fxRng();
    muzzleFlash.setScale(0.46 + flashJitter * 0.16);
    muzzleFlash.setVisible(true);
    muzzleCard.setPosition(mx + fx * 0.03, my, mz + fz * 0.03);
    muzzleCard.setRotation(0, -p.yaw, sim.state.time * 19);
    muzzleCard.setScale(0.52 + flashJitter * 0.18);
    muzzleCard.setVisible(true);
    muzzleSprite.setPosition(mx, my, mz);
    muzzleSprite.setVisible(true);
    muzzleShown = true;
    if (!muzzleWasLit) fireVfx("player-fire", [mx, my, mz]);
    muzzleWasLit = true;
  } else {
    if (muzzleShown) {
      muzzleFlash.setVisible(false);
      muzzleFlash.setPosition(0, -50, 0);
      muzzleCard.setVisible(false);
      muzzleCard.setPosition(0, -50, 0);
      muzzleSprite.setVisible(false);
      muzzleSprite.setPosition(0, -50, 0);
      muzzleShown = false;
    }
    muzzleWasLit = false;
  }

  // ---- enemies (articulated hierarchical group pivots + deterministic ZYX joint poses); nodes that do not exist are skipped (C1)
  const slot = activeSlot();
  let vulnerable: Enemy | null = null;
  let bossAlive = false;
  for (const e of sim.state.enemies) {
    const ids = enemyIds(slot, e);
    const node = opt(ids.body);
    if (!node) continue;
    const phaseSeed = e.sx * 1.37 + e.sz * 0.73;
    if (e.state === "dead") {
      placeBlob(ids.body, 0, 0, false);
      if (e.deathT < 4) {
        const yaw = enemyYaw.get(ids.body) ?? nextEnemyYaw(0, e.kind, e.facing, 1, enemyForward(e.kind));
        enemyYaw.set(ids.body, yaw);
        node.setPosition(e.x + ox, 0, e.z);
        node.setRotation(0, yaw, 0);
        applyEnemyRigPose(ids, computeEnemyRigPose({
          kind: e.kind,
          state: "dead",
          time: sim.state.time,
          stateT: e.stateT,
          painT: e.painT,
          deathT: e.deathT,
          phaseSeed
        }));
        setEnemyRigVisible(ids, true);
      } else {
        setEnemyRigVisible(ids, false);
      }
      continue;
    }
    if (e.kind === "boss") bossAlive = true;
    if (e.kind === "boss" && e.vulnerableT > 0) vulnerable = e;
    node.setPosition(e.x + ox, 0, e.z);
    placeBlob(ids.body, e.x + ox, e.z, true);
    const yaw = nextEnemyYaw(enemyYaw.get(ids.body) ?? nextEnemyYaw(0, e.kind, e.facing, 1, enemyForward(e.kind)), e.kind, e.facing, poseDt, enemyForward(e.kind));
    enemyYaw.set(ids.body, yaw);
    node.setRotation(0, yaw, 0);
    const shoulderY = e.kind === "dog" ? 0.72 : e.kind === "boss" ? 2.22 : e.kind === "gunner" ? 1.5 : 1.48;
    const tracking = e.state === "alert" || e.state === "chase" || e.state === "attack";
    const aimPitch = tracking ? -Math.atan2(EYE - shoulderY, Math.max(1.2, Math.hypot(p.x - e.x, p.z - e.z))) : 0;
    applyEnemyRigPose(ids, computeEnemyRigPose({
      kind: e.kind,
      state: e.state,
      time: sim.state.time,
      stateT: e.stateT,
      painT: e.painT,
      deathT: 0,
      vulnerableT: e.vulnerableT,
      phaseSeed,
      aimPitch
    }));
    setEnemyRigVisible(ids, true);
  }
  if (vulnerable) {
    ventLight.setPosition(vulnerable.x + ox, 1.9, vulnerable.z);
    wardenVentField.setPosition(vulnerable.x + ox, 1.55, vulnerable.z);
    wardenVentField.setRotation(0, sim.state.time * 1.4, 0);
    wardenVentField.setVisible(true);
    ventShown = true;
  } else if (ventShown) {
    ventLight.setPosition(0, -50, 0);
    wardenVentField.setPosition(0, -50, 0);
    wardenVentField.setVisible(false);
    ventShown = false;
  }
  elVuln.hidden = !vulnerable;
  const liftLocked = mode === "descent" && (!p.key || (slot === 5 && bossAlive));
  if (lastExitSlot !== slot || lastExitLocked !== liftLocked) {
    const exitField = opt(`f${slot}-exit-field`);
    if (exitField) {
      exitField.setVisible(liftLocked);
      lastExitSlot = slot;
      lastExitLocked = liftLocked;
    }
  }

  // ---- pickups (bob + spin)
  for (const pk of sim.state.pickups) {
    const node = opt(`f${slot}-pk-${pk.cx}-${pk.cz}`);
    if (!node) continue;
    // GU47 phase 4: a taken weapon pickup shares its GLB with the weapon in hand; hiding it also dropped the machine-gun
    // viewmodel from every HUD frame (p3-r4, p4-r1), so a taken mg / rocket pickup is parked under the floor instead.
    if (pk.taken && (pk.kind === "mg" || pk.kind === "rocket")) { node.setPosition(pk.x + ox, -40, pk.z); node.setVisible(true); continue; }
    if (pk.taken) { node.setVisible(false); continue; }
    node.setPosition(pk.x + ox, (pk.kind === "key" ? 1.1 : 0.55) + Math.sin(sim.state.time * 2.4 + pk.cx) * 0.1, pk.z);
    node.setRotation(0, sim.state.time * 1.6, 0);
    node.setVisible(true);
  }

  // ---- doors (C15 sized them per floor height; BZ-15 slides them sideways)
  for (const d of sim.state.doors) {
    const node = opt(`f${slot}-door-${d.cx}-${d.cz}`);
    if (!node) continue;
    // BZ-15: blast doors slide sideways into the wall along their frame (y constant), not down through the floor
    const alongX = doorAlongX(d.cx, d.cz);
    const [offX, offZ] = doorOffset(d.open, alongX, CELL);
    node.setPosition(cellX(slot, d.cx) + offX, 0, cellCenter(d.cz) + offZ);
    node.setVisible(true);
  }

  // ---- push-walls (block + crack cue slide together)
  for (const pw of sim.state.pushWalls) {
    const node = opt(`f${slot}-pw-${pw.cx}-${pw.cz}`);
    const crack = opt(`f${slot}-crack-${pw.cx}-${pw.cz}`);
    if (!node || !crack) continue;
    node.setVisible(true);
    if (pw.state === "closed") { crack.setVisible(true); continue; }
    const px = cellX(slot, pw.cx) + pw.dx * pw.progress * CELL;
    const pz = cellCenter(pw.cz) + pw.dz * pw.progress * CELL;
    node.setPosition(px, 0, pz);
    const [cox, coz] = CRACK_OFFSET.get(`f${slot}-crack-${pw.cx}-${pw.cz}`) ?? [0, 0];
    crack.setPosition(px + cox, BZ_CRACK_LAMP.y, pz + coz);
    if (pw.state === "open") crack.setVisible(false);
  }

  // ---- batched props (barrels & crates share per-floor instance pools; exploded barrels hide via dirty matrix update)
  for (const pr of sim.state.props) {
    if (pr.kind === "column") continue;
    syncPropPoolEntry(slot, pr.kind, pr.cx, pr.cz, pr.alive);
    placeBlob(`f${slot}-prop-${pr.cx}-${pr.cz}`, cellX(slot, pr.cx), cellCenter(pr.cz), pr.alive);
  }
  flushPropPools(slot);
  flushBlobs(slot);

  // ---- 3D ammo projectiles (rockets + bullet bolts + sleek supersonic tracer streaks, never beach-balls)
  const rockets = sim.state.rockets;
  for (let i = 0; i < rocketNodes.length; i++) {
    if (i < rockets.length) {
      const r = rockets[i]!;
      const ry = r.y ?? 1.18;
      const projYaw = Math.atan2(r.vx, r.vz);
      const isRocket = r.kind === "rocket" || r.fromEnemy;
      rocketNodes[i]!.setPosition(r.x + ox, ry, r.z);
      rocketNodes[i]!.setRotation(0, projYaw, r.t * 16);
      rocketNodes[i]!.setScale(isRocket ? 1 : 0.62);
      rocketNodes[i]!.setVisible(true);
      tracerNodes[i]!.setPosition(r.x + ox - r.dx * 0.16, ry, r.z - r.dz * 0.16);
      tracerNodes[i]!.setRotation(0, projYaw, 0);
      tracerNodes[i]!.setScale(isRocket ? [0.09, 0.09, 0.52] : [0.05, 0.05, 0.42]);
      tracerNodes[i]!.setVisible(true);
      rocketShown[i] = true;
    } else if (rocketShown[i]) {
      rocketNodes[i]!.setVisible(false);
      rocketNodes[i]!.setPosition(0, -50, 0);
      tracerNodes[i]!.setVisible(false);
      tracerNodes[i]!.setPosition(0, -50, 0);
      rocketShown[i] = false;
    }
  }
  // ---- enemy gunfire: muzzle flash at the shooter, a tracer to the player (or past them on a miss)
  const eshots = sim.state.enemyShots;
  for (let i = 0; i < ENEMY_TRACERS; i++) {
    const s = eshots[i];
    if (s && s.t < 0.12) {
      const dx = s.x1 - s.x0, dz = s.z1 - s.z0, len = Math.hypot(dx, dz);
      const k = Math.min(1, s.t / 0.12);
      enemyTracerNodes[i]!.setPosition(s.x0 + dx * (0.5 + k * 0.2) + ox, s.y0 - 0.1 * k, s.z0 + dz * (0.5 + k * 0.2));
      enemyTracerNodes[i]!.setRotation(0, Math.atan2(dx, dz), 0);
      enemyTracerNodes[i]!.setScale([0.045, 0.045, Math.max(0.2, len * 0.6)]);
      enemyTracerNodes[i]!.setVisible(true);
      enemyTracerShown[i] = true;
      if (firstSight(s)) fireVfx("enemy-fire", [s.x0 + ox, s.y0, s.z0]);
    } else if (enemyTracerShown[i]) {
      enemyTracerNodes[i]!.setVisible(false);
      enemyTracerNodes[i]!.setPosition(0, -50, 0);
      enemyTracerShown[i] = false;
    }
  }
  // ---- BZ-03: blasts and impacts are one burst each + procedural flipbook ricochet spark cards
  for (const e of sim.state.explosions) if (e.t < 0.55 && firstSight(e)) fireVfx("rocket-or-barrel-blast", [e.x + ox, 1.0, e.z]);
  for (const s of sim.state.shots) {
    if (s.t >= 0.25 || !firstSight(s)) continue;
    fireVfx("bullet-impact", [s.x + ox, 1.18, s.z]);
    fireVfx("wall-chip", [s.x + ox, 1.18, s.z]);
    addBulletHole(s.x, s.z);
    const cardIdx = nextSparkCard++ % SPARK_CARD_POOL;
    sparkCardState[cardIdx] = { x: s.x + ox - fx * 0.08, y: 1.18, z: s.z - fz * 0.08, until: sim.state.time + 0.14 };
  }
  for (let i = 0; i < SPARK_CARD_POOL; i++) {
    const st = sparkCardState[i]!;
    if (st.until > sim.state.time) {
      sparkCards[i]!.setPosition(st.x, st.y, st.z);
      sparkCards[i]!.setRotation(0, -p.yaw, i * 0.8);
      sparkCards[i]!.setVisible(true);
      sparkShown[i] = true;
    } else if (sparkShown[i]) {
      sparkCards[i]!.setVisible(false);
      sparkCards[i]!.setPosition(0, -50, 0);
      sparkShown[i] = false;
    }
  }
}

// ---------------------------------------------------------------------------
// per-frame: read input → tick sim → drive nodes/camera/HUD
let simSteps = 0;
let demoAcc = 0;
let lastWall = performance.now();
let lastAutoInput: SimInput = NO_INPUT;
function gatherInput(dt: number): SimInput {
  const held = (a: BindAction) => actionHas(a, keysHeld);
  const pressed = (a: BindAction) => actionHas(a, keysPressed);
  const fireHeld = held("fire") || pointerFireHeld || touch.fire;
  const fireJustPressed = pressed("fire") || pointerFirePressed || touch.firePressed;
  const reloadPressed = pressed("reload") || touch.reload;
  const usePressed = pressed("use") || touch.use;
  const wpnPick: WeaponId | undefined =
    pressed("weapon1") ? "knife" : pressed("weapon2") ? "pistol" : pressed("weapon3") ? "mg" : pressed("weapon4") ? "rocket" : undefined;
  const moveZ = ((held("forward") ? 1 : 0) - (held("back") ? 1 : 0)) || touch.moveZ;
  const moveX = ((held("strafeRight") ? 1 : 0) - (held("strafeLeft") ? 1 : 0)) || touch.moveX;
  const turnDir = (held("turnRight") ? 1 : 0) - (held("turnLeft") ? 1 : 0);
  const wheel = pendingWheel + touch.swap;
  const userActive = Math.abs(moveX) > 0.01 || Math.abs(moveZ) > 0.01 || Math.abs(turnDir) > 0.01 || fireHeld || fireJustPressed || reloadPressed || usePressed || wpnPick !== undefined;
  if (userActive && !DEMO) autoPilot = false;
  const inp: SimInput = DEMO ? lastAutoInput : autoPilot
    ? autopilotInput(pilot, sim, dt)
    : {
        moveX, moveZ, turn: yawDelta + turnDir * 2.4 * dt, pitchDelta,
        fire: fireHeld, firePressed: fireJustPressed, reload: reloadPressed, use: usePressed,
        weapon: wpnPick, weaponDelta: wheel !== 0 ? Math.sign(wheel) : 0
      };
  yawDelta = 0; pitchDelta = 0; pendingWheel = 0;
  keysPressed.clear();
  pointerFirePressed = false;
  touch.firePressed = false; touch.use = false; touch.reload = false; touch.swap = 0;
  return inp;
}

function stepSim(dt: number, inp: SimInput) {
  if (DEMO) {
    demoAcc += dt;
    while (demoAcc >= 1 / 60) { lastAutoInput = autopilotInput(pilot, sim, 1 / 60); sim.tick(1 / 60, lastAutoInput); demoAcc -= 1 / 60; simSteps++; }
    return;
  }
  const useAuto = autoPilot;
  const hitStopScale = impactFrame.frozen ? 0.08 : 1;
  const totalStepDt = Math.min(0.1, Math.max(1 / 240, dt * hitStopScale));
  let remaining = totalStepDt;
  let firstSub = true;
  while (remaining > 1e-9) {
    const st = Math.min(1 / 60, remaining);
    const frac = st / totalStepDt;
    const subInp: SimInput = useAuto ? (firstSub ? inp : autopilotInput(pilot, sim, st)) : {
      ...inp,
      turn: inp.turn * frac,
      pitchDelta: inp.pitchDelta * frac,
      firePressed: firstSub ? inp.firePressed : false,
      reload: firstSub ? inp.reload : false,
      use: firstSub ? inp.use : false,
      weapon: firstSub ? inp.weapon : undefined,
      weaponDelta: firstSub ? inp.weaponDelta : 0
    };
    sim.tick(st, subInp);
    remaining -= st;
    firstSub = false;
    simSteps++;
  }
}

/** C2: drain by sequence number, so audio and feedback keep working however many events a floor emits. */
function drain() {
  eventSeq = drainEvents(sim.state, eventSeq, (ev) => { eventsDrained++; handleEvent(ev); });
}

/** C3/C4/C16: one outcome per floor, read from the medal and the floor index, then one pending transition. */
function checkOutcome() {
  const p = sim.state.player;
  if (sim.state.finished && !outcomeHandled) {
    outcomeHandled = true;
    const outcome: FloorOutcome = floorOutcome(sim, floorIdx);
    const view = outcomeView(outcome, sim, fmtTime);
    banner(view.title, view.subtitle);
    cue(view.cue);
    if (view.juice) mg.juice?.fire(view.juice);
    if (outcome === "floor-cleared" || outcome === "campaign-complete") {
      runResults.push(floorResult(sim, floorIdx));
      recordMedal(floorIdx, sim.state.medal);
    }
    pending = {
      kind: outcome === "killhouse-timeup" ? "killhouse-retry" : outcome === "killhouse-clear" ? "to-descent" : outcome === "campaign-complete" ? "results" : "next",
      t: outcome === "campaign-complete" ? 2.2 : 2.6, age: 0
    };
    // GU47 g11 phase 10: the next floor's surface maps load behind the outcome banner and the descent
    const nextSlot = nextSlotOf(pending.kind, floorIdx, activeSlot(), FLOORS.length);
    if (nextSlot !== null) SURFACES.prepare(nextSlot);
    return;
  }
  if (!p.alive && !sim.state.finished && !pending) {
    cue("lose");
    banner("YOU DIED", "press any key to retry the floor");
    pending = { kind: "retry", t: 2.2, age: 0 };
  }
}
function tickPending(dt: number) {
  if (!pending) return;
  pending.age += dt;
  pending.t -= dt;
  if (pending.t <= 0) runPending();
}
function runPending() {
  const job = pending;
  pending = null;
  if (!job) return;
  switch (job.kind) {
    case "retry": startFloor(floorIdx, mode, { loadout: entryLoadout }); break;
    case "killhouse-retry": startFloor(0, "killhouse"); break;
    case "to-descent": startFloor(0, "descent", { newRun: true }); break;
    case "next": playDescent(); startFloor(floorIdx + 1, "descent", { loadout: captureLoadout(sim) }); break;
    case "results": showResults(); break;
  }
}

app.onFrame(({ dt }) => {
  if (isDocumentHidden()) return;
  if (!appReady || !sim) return;
  const now = performance.now();
  const wallDt = Math.min(1, Math.max(0, (now - lastWall) / 1000));
  lastWall = now;
  const paused = isPaused();
  const realStepDt = paused ? 0 : wallDt;
  impactFrame = impactRig.step(realStepDt);
  recoilKick *= Math.exp(-realStepDt * 12);
  if (recoilKick < 0.002) recoilKick = 0;
  const inp = paused ? (gatherInput(dt), NO_INPUT) : gatherInput(dt);
  if (!qaFrozen && !paused && !campaignDone) stepSim(dt, inp);
  drain();
  try { syncScenePose(inp); } catch (e) { frameErrors++; lastFrameError = e instanceof Error ? e.message : String(e); }
  if (!paused) { checkOutcome(); tickPending(wallDt); }
  renderHud();
  publishEvidence();
  feel.update(dt * 1000);
  bannerT -= wallDt;
  if (bannerT <= 0) elBanner.classList.remove("show");
  if (mapOpen) { mapDrawT -= wallDt; if (mapDrawT <= 0) { mapDrawT = 0.2; drawMap(); } }
  tickCaPulse(now);
  expireBulletHoles(now / 1000);
});

// ---------------------------------------------------------------------------
function handleEvent(ev: string) {
  const [type, a, b] = ev.split(":");
  switch (type) {
    case "fire":
      cue(a === "pistol" ? "pistol" : a === "mg" ? "mg" : a === "rocket" ? "rocket" : a === "dry" ? "dry" : "knife");
      mg.juice?.fire("fire");
      if (a !== "dry") {
        recoilKick = Math.min(1.5, recoilKick + (a === "rocket" ? 0.9 : a === "mg" ? 0.42 : 0.55));
        impactRig.trigger({
          trauma: a === "rocket" ? 0.34 : a === "mg" ? 0.12 : 0.16,
          fovKickDeg: a === "rocket" ? 2.2 : 0.7
        });
      }
      break;
    case "hit": cue("hit"); elCross.classList.add("hit"); setTimeout(() => elCross.classList.remove("hit"), 90); break;
    case "kill":
      cue("kill");
      mg.juice?.fire("kill");
      recoilKick = Math.min(1.5, recoilKick + 0.32);
      impactRig.trigger({ freezeSeconds: 0.04, trauma: 0.22, fovKickDeg: 1.4 });
      feed(`kill confirmed — ${a}`);
      break;
    case "hurt":
      cue("hurt");
      mg.juice?.fire("hurt");
      recoilKick = Math.min(1.5, recoilKick + 0.4);
      impactRig.trigger({ trauma: 0.45, fovKickDeg: -1.2 });
      if (Number(a) >= BZ_CA_PULSE.minDamage) caHitAt = performance.now();
      break;
    case "dog": cue("bite"); break;
    case "step": cue("step"); break;
    case "secret":
      cue("secret");
      mg.juice?.fire("secret");
      recoilKick = Math.min(1.5, recoilKick + 0.25);
      impactRig.trigger({ trauma: 0.24, fovKickDeg: 1.2 });
      feed("push-wall revealed a secret");
      eventVfx("push-wall");
      break;
    case "pickup": cue(a === "key" ? "key" : a === "mg" || a === "rocket" ? "weapon" : "pickup"); feed(a === "key" ? "brass key secured" : `${a} collected`); eventVfx("pickup"); break;
    case "door": cue("door"); eventVfx("door-slide"); break;
    case "reload": cue("reload"); break;
    case "weapon": cue("switch"); break;
    case "rocket": cue("boom"); recoilKick = Math.min(1.5, recoilKick + 0.5); impactRig.trigger({ freezeSeconds: 0.03, trauma: 0.42, fovKickDeg: 1.8 }); break;
    case "barrel": cue("boom"); mg.juice?.fire("fire"); recoilKick = Math.min(1.5, recoilKick + 0.55); impactRig.trigger({ freezeSeconds: 0.035, trauma: 0.48, fovKickDeg: 2.0 }); break;
    // C9: each Warden event has its own cue and line
    case "boss":
      if (a === "rocket") positional("launch", bossPos());
      else if (a === "vent") { cue("vent"); feed("the Warden vents — VULNERABLE", true); }
      else if (a === "summon") { cue("boss"); feed("the Warden calls reinforcements", true); }
      break;
    case "alert": case "spot": cue("alert"); break;
    // C8: enemy gunfire is heard where it comes from
    case "guard": case "gunner": if (b === "hit" || b === "miss") positional("enemyShot", shooterPos(a as "guard" | "gunner")); break;
    default: break;
  }
}
/** BZ-03/BZ-15: dust off a sliding door, debris off a push wall, a glint on a pickup; placed from read-only sim state. */
function eventVfx(event: "door-slide" | "push-wall" | "pickup") {
  const st = sim.state, p = st.player, ox = st.ox;
  const near = <T extends { cx: number; cz: number }>(list: readonly T[], ok: (v: T) => boolean): T | undefined => {
    let best: T | undefined, bd = Infinity;
    for (const v of list) {
      if (!ok(v)) continue;
      const d = Math.hypot(cellCenter(v.cx) - p.x, cellCenter(v.cz) - p.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  };
  if (event === "pickup") { fireVfx("pickup", [p.x + ox, 0.9, p.z]); return; }
  const cell = event === "door-slide" ? near(st.doors, (d) => d.target !== d.open || d.open < 1) : near(st.pushWalls, (w) => w.state === "sliding");
  if (cell) fireVfx(event, [cellCenter(cell.cx) + ox, event === "door-slide" ? 0.2 : 1.2, cellCenter(cell.cz)]);
}
function positional(id: CueId, at: [number, number, number] | null) {
  if (!at || !mg.sound?.playPositional) { cue(id); return; }
  mg.sound.playPositional(id, { x: at[0], y: at[1], z: at[2] }).catch(() => { /* audio locked until the first click */ });
}
function bossPos(): [number, number, number] | null {
  const e = sim.state.enemies.find((en) => en.kind === "boss");
  return e ? [e.x + sim.state.ox, 2, e.z] : null;
}
function shooterPos(kind: "guard" | "gunner"): [number, number, number] | null {
  const s = [...sim.state.enemyShots].reverse().find((sh) => sh.kind === kind);
  return s ? [s.x0 + sim.state.ox, s.y0, s.z0] : null;
}

// ---------------------------------------------------------------------------
let lastHud = "";
let lastCoordsKey = "";
function renderHud() {
  const p = sim.state.player;
  const wpn = WEAPONS[p.weapon];
  const ammoStr = wpn.ammo === "none" ? "—" : `${p.mag} / ${p.ammo[wpn.ammo as "bullets" | "rockets"]}`;
  const timeShown = mode === "killhouse" ? Math.max(0, sim.state.killhouseLeft) : sim.state.time;
  // C25: keyed on whole seconds, so the DOM is written only when a shown value changes
  const hud = hudKey(sim, p.reloading > 0, mode === "killhouse" ? Math.ceil(timeShown) : timeShown);
  if (hud !== lastHud) {
    lastHud = hud;
    elHp.textContent = String(Math.ceil(p.hp));
    elHp.classList.toggle("low", p.hp <= 30);
    elArmor.textContent = String(Math.ceil(p.armor));
    elAmmo.textContent = p.reloading > 0 ? "Reloading" : ammoStr;
    elAmmo.classList.toggle("text-mode", p.reloading > 0 || wpn.ammo === "none");
    elWeapon.textContent = weaponHudLabel(p.weapon);
    elScore.textContent = String(sim.state.score);
    elKills.textContent = `${sim.state.kills}/${sim.state.totalEnemies}`;
    elTime.textContent = fmtTime(timeShown);
    elVign.classList.toggle("low", p.alive && p.hp <= 30);
    // C26: the dog tag is text, never markup
    const small = document.createElement("small");
    if (mode === "killhouse") {
      elTag.textContent = "SKILL LAB — KILL HOUSE";
      small.textContent = `${dogtag} · clear the floor`;
    } else {
      elTag.textContent = `FLOOR ${floorIdx + 1} — ${sim.state.floor.name.toUpperCase()}`;
      small.textContent = `${p.key ? "key secured · the elevator is armed" : sim.state.floor.subtitle} · ${dogtag}`;
    }
    elTag.append(small);
  }
  if (elCoords) {
    const cx = Math.max(0, cellOf(p.x)), cz = Math.max(0, cellOf(p.z));
    const ckey = `${mode}:${floorIdx}:${cx}:${cz}`;
    if (ckey !== lastCoordsKey) {
      lastCoordsKey = ckey;
      elCoords.textContent = `${mode === "killhouse" ? "KH" : `B${floorIdx + 1}`} · X${String(cx).padStart(2, "0")} Z${String(cz).padStart(2, "0")}`;
    }
  }
  const vign = String(Math.max(p.hurtT * 1.6, p.alive && p.hp <= 30 ? 0.4 : 0, deathFadeLevel));
  // BZ-17: directional damage arc toward the shooter that hurt the player (last enemy shot), read-only
  if (p.hurtT > 0.3 && p.alive) {
    const src = sim.state.enemyShots[sim.state.enemyShots.length - 1];
    if (src) { elArc.style.transform = `rotate(${damageArcDeg(p, { x: src.x0, z: src.z0 }).toFixed(1)}deg)`; elArc.classList.add("on"); }
  } else elArc.classList.remove("on");
  if (elVign.style.opacity !== vign) elVign.style.opacity = vign;
  if (sim.state.msg) feed2(sim.state.msg);
}
let lastFeedMsg = "";
function feed2(s: string) { if (s !== lastFeedMsg) { lastFeedMsg = s; feed(s, /LOCKED|DIED|WARDEN|OUT/.test(s)); } }
function fmtTime(t: number) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// results panel (C3, C27) and floor medals
function loadJson<T>(k: string, fallback: T): T { try { const v = store.get(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } }
let floorMedals = loadJson<Record<string, string>>("bz-medals", {});
function recordMedal(idx: number, medal: string) {
  floorMedals = { ...floorMedals, [idx]: betterMedal(floorMedals[idx], medal) };
  store.set("bz-medals", JSON.stringify(floorMedals));
  renderFloorCards();
}
function setResultsVisible(on: boolean) { elResults.hidden = !on; }
function showResults() {
  campaignDone = true;
  refreshPause();
  if (pointerLocked) document.exitPointerLock();
  const totals = runTotals(runResults);
  const fullRun = runStartFloor === 0 && runResults.length === FLOORS.length;
  const best = loadJson<{ score: number; time: number } | null>("bz-best-run", null);
  const isBest = fullRun && (!best || totals.score > best.score);
  if (isBest) store.set("bz-best-run", JSON.stringify({ score: totals.score, time: totals.time }));
  const rows = $("bz-results-rows");
  rows.replaceChildren(...runResults.map((r) => {
    const tr = document.createElement("tr");
    for (const cell of [`F${r.floor} ${r.name}`, fmtTime(r.time), `${r.kills}/${r.totalEnemies}`, `${r.secrets}/${r.totalSecrets}`, r.medal.toUpperCase()]) {
      const td = document.createElement("td"); td.textContent = cell; tr.append(td);
    }
    return tr;
  }));
  $("bz-results-total").textContent =
    `SCORE ${totals.score} · TIME ${fmtTime(totals.time)} · KILLS ${totals.kills}/${totals.totalEnemies} · SECRETS ${totals.secrets}/${totals.totalSecrets} · ` +
    `MEDALS ${totals.medals.gold} gold, ${totals.medals.silver} silver, ${totals.medals.bronze} bronze`;
  const bestNow = isBest ? { score: totals.score, time: totals.time } : best;
  $("bz-results-best").textContent = !fullRun
    ? `run started on floor ${runStartFloor + 1}: start from floor 1 to set a best run`
    : bestNow ? `${isBest ? "NEW BEST RUN" : "best run"}: ${bestNow.score} in ${fmtTime(bestNow.time)}` : "";
  setResultsVisible(true);
  publishEvidence(true);
}

// ---------------------------------------------------------------------------
// QA hook (deterministic stills and numbers): stage an enemy of a kind in front of the player and report which way it is drawn;
// drive the end states the remote captures check (boss summon, campaign results, Kill House time-out).
function installQa() {
  const KIND_CHAR = { guard: "g", dog: "d", gunner: "G", boss: "B" } as const;
  const noInput = NO_INPUT;
  const tickN = (seconds: number) => { const n = Math.round(seconds * 60); for (let i = 0; i < n; i++) { sim.tick(1 / 60, autoPilot ? autopilotInput(pilot, sim, 1 / 60) : noInput); simSteps++; drain(); syncScenePose(noInput); checkOutcome(); tickPending(1 / 60); } };
  const rig = {
    stage(kind: keyof typeof KIND_CHAR, dist = 4.5, bearingDeg = 0) {
      const floor = FLOORS.findIndex((f, i) => createSim(f, { ox: 0, mode: "descent", seed: 1337 + i * 97 }).state.enemies.some((en) => en.kind === kind));
      if (floor < 0) return { ok: false, reason: "no floor has this enemy" };
      startFloor(floor, "descent", { newRun: true });
      qaFrozen = false;
      const e = sim.state.enemies.find((en) => en.kind === kind && en.state !== "dead");
      if (!e) return { ok: false, reason: "enemy missing" };
      const p = sim.state.player;
      for (const o of sim.state.enemies) if (o !== e) { o.state = "dead"; o.deathT = 99; }
      const base = (bearingDeg * Math.PI) / 180;
      for (let k = 0; k < 16; k++) {
        const a = base + (k * Math.PI) / 8;
        for (let d = dist; d >= 2.2; d -= 0.4) {
          const px = e.x + Math.sin(a) * d, pz = e.z - Math.cos(a) * d;
          if (sim.cellBlocked(Math.floor(px / CELL), Math.floor(pz / CELL))) continue;
          if (!sim.hasLOS(px, pz, e.x, e.z)) continue;
          p.x = px; p.z = pz; p.hp = 9999; p.armor = 0;
          p.yaw = Math.atan2(e.x - px, -(e.z - pz));
          p.pitch = 0;
          e.state = "chase"; e.stateT = 0; e.attackCd = 99;
          sim.tick(1 / 60, noInput);
          sim.tick(1 / 60, noInput);
          qaFrozen = true;
          syncScenePose(noInput);
          return { ok: true, floor, distance: +d.toFixed(2) };
        }
      }
      return { ok: false, reason: "no open spot" };
    },
    unfreeze() { qaFrozen = false; },
    freeze() { qaFrozen = true; syncScenePose(noInput); },
    /** Let the drawn yaw smooth toward the sim heading for `seconds` without running the simulation (enemies stay where they are). */
    settle(seconds: number) {
      const n = Math.max(1, Math.round(seconds * 60));
      for (let i = 0; i < n; i++) { lastPoseTime = sim.state.time - 1 / 60; syncScenePose(noInput); }
    },
    /** Run the sim, events, pose and transitions for `seconds` of 60 Hz steps, then refreeze. */
    advance(seconds: number) { tickN(seconds); qaFrozen = true; return rig.snapshot(); },
    turnAway(kind: keyof typeof KIND_CHAR) {
      const e = sim.state.enemies.find((en) => en.kind === kind && en.state !== "dead");
      if (!e) return false;
      const id = enemyIds(activeSlot(), e).body;
      enemyYaw.set(id, (enemyYaw.get(id) ?? 0) + Math.PI);
      return true;
    },
    rotateDrawn(kind: keyof typeof KIND_CHAR, rad: number) {
      const e = sim.state.enemies.find((en) => en.kind === kind && en.state !== "dead");
      if (!e) return false;
      const id = enemyIds(activeSlot(), e).body;
      enemyYaw.set(id, (enemyYaw.get(id) ?? 0) + rad);
      opt(id)?.setRotation(0, enemyYaw.get(id)!, 0);
      return true;
    },
    setForward(kind: keyof typeof KIND_CHAR, axis: ForwardAxis | null) {
      if (axis === null) delete forwardOverride[kind]; else forwardOverride[kind] = axis;
      syncScenePose(noInput);
    },
    report() {
      const p = sim.state.player;
      const slot = activeSlot();
      return sim.state.enemies.filter((e) => e.state !== "dead").map((e) => {
        const yaw = enemyYaw.get(enemyIds(slot, e).body) ?? 0;
        const dx = p.x - e.x, dz = p.z - e.z;
        return {
          kind: e.kind, state: e.state, forward: enemyForward(e.kind), trueForward: ENEMY_FORWARD[e.kind], simFacing: +e.facing.toFixed(4), drawnYaw: +yaw.toFixed(4),
          distance: +Math.hypot(dx, dz).toFixed(2), errorDeg: +((enemyFacingError(yaw, e.kind, dx, dz, ENEMY_FORWARD[e.kind]) * 180) / Math.PI).toFixed(2)
        };
      });
    },
    snapshot() {
      const s = sim.state;
      return {
        mode, floor: floorIdx + 1, time: +s.time.toFixed(2), simSteps, paused: isPaused(), finished: s.finished, medal: s.medal,
        hp: Math.ceil(s.player.hp), alive: s.player.alive, summons: s.summons.length, enemies: s.enemies.length,
        summonNodesVisible: s.enemies.filter((e) => e.summonSlot !== undefined).map((e) => opt(enemyIds(activeSlot(), e).body)?.visible ?? null),
        eventSeq: s.eventSeq, eventsDrained, frameErrors, lastFrameError, pending: pending?.kind ?? null, campaignDone,
        results: !elResults.hidden, banner: elBanner.textContent,
        // C18: runtime nodes left visible on floor slots other than the active one (0 when inactive floors are hidden)
        offFloorVisible: app.nodes.all().filter((h) => h.visible !== false && /^f\d-/.test(h.id) && !h.id.startsWith(`f${activeSlot()}-`)).length,
        onFloorStaticVisible: SLOT_STATIC_IDS[activeSlot()]!.filter((id) => opt(id)?.visible !== false).length
      };
    },
    /** C1: start floor 6, bring the Warden under 66% so it summons, and keep the sim running. */
    bossSummon() {
      startFloor(5, "descent", { newRun: true });
      const boss = sim.state.enemies.find((e) => e.kind === "boss")!;
      const p = sim.state.player;
      p.hp = 9999;
      p.x = boss.x; p.z = boss.z + CELL * 2; p.yaw = 0;
      boss.hp = ENEMIES.boss.hp * 0.6; boss.state = "attack"; boss.stateT = 0; boss.volleyLeft = 3;
      for (let i = 0; i < 120 && sim.state.summons.length === 0; i++) { sim.tick(1 / 60, noInput); drain(); syncScenePose(noInput); }
      return rig.snapshot();
    },
    /** C3: finish floor 6 (Warden down, key in hand, standing on the exit) and let the transition run. */
    campaignComplete() {
      startFloor(5, "descent", { newRun: true });
      // a completed run: floors 1 to 5 as gold clears
      runResults = FLOORS.slice(0, 5).map((f, i) => ({ floor: i + 1, name: f.name, time: f.par * 0.8, kills: 4, totalEnemies: 5, secrets: 1, totalSecrets: 2, medal: "gold", score: 1500 * (i + 1) }));
      runStartFloor = 0;
      sim.state.score = 7500 + 4000;
      sim.state.time = 312;
      sim.state.kills = sim.state.totalEnemies; sim.state.secrets = 1;
      const p = sim.state.player;
      for (const e of sim.state.enemies) { e.state = "dead"; e.deathT = 9; e.hp = 0; }
      p.key = true; p.hp = 9999;
      const exit = (() => { for (let z = 0; z < sim.state.h; z++) for (let x = 0; x < sim.state.w; x++) if (sim.state.grid[z * sim.state.w + x] === "E") return [x, z] as const; return null; })()!;
      p.x = cellCenter(exit[0]); p.z = cellCenter(exit[1]);
      qaFrozen = false;
      tickN(3.2);
      return rig.snapshot();
    },
    /** C4: start the Kill House and run the clock out. */
    killhouseTimeout() {
      startFloor(0, "killhouse");
      sim.state.killhouseLeft = 0.05;
      sim.state.player.hp = 9999;
      tickN(0.2);
      return rig.snapshot();
    },
    autopilot(on: boolean) { autoPilot = on; return on; },
    dismissIntro() { dismissIntro(); return true; },
    /** GU47 phase 9 probe: stand two cells from the first cell holding `ch` (any floor), face it, hold `weapon`, freeze. */
    propView(ch: string, weapon: WeaponId = "pistol", dist = 2.2) {
      const all = [...FLOORS.map((f, i) => [f, i] as const)];
      for (const [f, i] of all) {
        const rows = f.rows;
        for (let z = 0; z < rows.length; z++) for (let x = 0; x < rows[z]!.length; x++) {
          if (rows[z]![x] !== ch) continue;
          startFloor(i, "descent", { newRun: true });
          const p = sim.state.player;
          for (const e of sim.state.enemies) { e.state = "dead"; e.deathT = 99; }
          const tx = cellCenter(x), tz = cellCenter(z);
          // the crack lamp and the exit shutter face one way: stand on that side, looking back at them
          const facing = ch === "P" ? pushFace(rows, x, z).map((v) => -v) : ch === "E" ? wallFace(rows, x, z).map((v) => -v) : null;
          if (facing && (facing[0] || facing[1])) {
            // straight out from the face first, then along the corridor (a face one cell from the opposite wall)
            const aim = [tx + facing[0] * CELL * 0.3, tz + facing[1] * CELL * 0.3] as const;
            const spots: [number, number][] = [];
            for (let d = dist * CELL; d >= CELL * 0.6; d -= 0.3) spots.push([tx + facing[0] * d, tz + facing[1] * d]);
            for (const k of [1.6, -1.6, 2.2, -2.2]) spots.push([aim[0] + facing[1] * k * CELL + facing[0] * 0.4, aim[1] + facing[0] * k * CELL + facing[1] * 0.4]);
            for (const [px, pz] of spots) {
              if (sim.cellBlocked(Math.floor(px / CELL), Math.floor(pz / CELL))) continue;
              if (!sim.hasLOS(px, pz, aim[0], aim[1])) continue;
              p.x = px; p.z = pz; p.hp = 9999; p.pitch = 0;
              p.yaw = Math.atan2(tx - px, -(tz - pz));
              if (!p.weapons.includes(weapon)) p.weapons.push(weapon);
              p.weapon = weapon;
              qaFrozen = true;
              syncScenePose(noInput);
              return { ok: true, floor: i, cell: [x, z], at: [+px.toFixed(2), +pz.toFixed(2)], facing };
            }
          }
          for (let k = 0; k < 16; k++) {
            const a = (k * Math.PI) / 8;
            for (let d = dist * CELL; d >= CELL * 0.9; d -= 0.4) {
              const px = tx + Math.sin(a) * d, pz = tz - Math.cos(a) * d;
              if (sim.cellBlocked(Math.floor(px / CELL), Math.floor(pz / CELL))) continue;
              if (ch === "+" || ch === "*" ? !sim.hasLOS(px, pz, tx, tz) : !sim.hasLOS(px, pz, tx + (px - tx) * 0.3, tz + (pz - tz) * 0.3)) continue;
              p.x = px; p.z = pz; p.hp = 9999; p.pitch = 0;
              p.yaw = Math.atan2(tx - px, -(tz - pz));
              if (!p.weapons.includes(weapon)) p.weapons.push(weapon);
              p.weapon = weapon;
              qaFrozen = true;
              syncScenePose(noInput);
              return { ok: true, floor: i, cell: [x, z], distance: +d.toFixed(2) };
            }
          }
        }
      }
      return { ok: false };
    },
    /** GU47 phase 6 triage: the viewmodel handles (and the weapon pickups that share their GLBs) as the engine sees them. */
    vmProbe() {
      const p = sim.state.player;
      const look = (n: NodeHandle | null) => {
        if (!n) return null;
        const r: Record<string, unknown> = { visible: n.visible, position: n.position };
        try { r.bounds = n.bounds(); } catch (e) { r.bounds = String(e).slice(0, 120); }
        try { r.snapshot = JSON.stringify(n.snapshot()).slice(0, 600); } catch (e) { r.snapshot = String(e).slice(0, 120); }
        return r;
      };
      const pickups = sim.state.pickups.filter((pk) => pk.kind === "mg" || pk.kind === "rocket")
        .map((pk) => ({ kind: pk.kind, taken: pk.taken, node: look(opt(`f${activeSlot()}-pk-${pk.cx}-${pk.cz}`)) }));
      return { weapon: p.weapon, alive: p.alive, reloading: p.reloading, pitch: p.pitch, mg: look(vmNodes.mg), pistol: look(vmNodes.pistol), pickups };
    },
  };
  (window as unknown as { __AURA_BUNKER_ZERO_QA__?: typeof rig }).__AURA_BUNKER_ZERO_QA__ = rig;
}

// ---------------------------------------------------------------------------
/**
 * QA crops for E-I's capture (normalised 0..1). First person: the camera carries the viewmodel, so the crops are fixed
 * in screen space. `muzzle` is the weapon's mouth (BZ-03), `floor` the lower band under the reference view (BZ-04, F2
 * water BZ-06), `ceiling` the top band (BZ-13), `centre` the middle band (F6 hatch shaft, BZ-07).
 */
const QA_CROPS = [
  { name: "muzzle", x: 0.5, y: 0.52, w: 0.3, h: 0.34 },
  { name: "floor", x: 0.2, y: 0.72, w: 0.6, h: 0.26 },
  { name: "ceiling", x: 0.1, y: 0, w: 0.8, h: 0.2 },
  { name: "centre", x: 0.33, y: 0.2, w: 0.34, h: 0.55 }
] as const;
function publishQaCrops() {
  const w = window as unknown as { __AURA_QA__?: Record<string, unknown> };
  w.__AURA_QA__ = { ...(w.__AURA_QA__ ?? {}), crops: QA_CROPS.map((c) => ({ ...c })), variant: BZ_VARIANTS[activeSlot()] };
}

// ---------------------------------------------------------------------------
// evidence at 4 Hz (C25), with draw calls per floor (C18)
let lastEvidenceAt = -1;
const drawCallsByFloor: Record<string, number> = {};
function publishEvidence(force = false) {
  const now = performance.now();
  if (!force && lastEvidenceAt >= 0 && now - lastEvidenceAt < 250) return;
  lastEvidenceAt = now;
  const p = sim.state.player;
  let drawCalls: number | null = null;
  try { drawCalls = (app.diagnostics?.() as { drawCalls?: number } | undefined)?.drawCalls ?? null; } catch { drawCalls = null; }
  const floorKey = mode === "killhouse" ? "killhouse" : `f${floorIdx + 1}`;
  if (drawCalls) drawCallsByFloor[floorKey] = drawCalls;
  const payload = {
    status: campaignDone ? "complete" : "playing",
    mode, floor: floorIdx + 1,
    floorName: sim.state.floor.name,
    playerPos: [+(p.x.toFixed(2)), +(p.z.toFixed(2))],
    projectilesSpawned: sim.state.projectilesSpawned,
    activeProjectiles: sim.state.rockets.length,
    player: {
      x: +(p.x.toFixed(2)), z: +(p.z.toFixed(2)), yaw: +p.yaw.toFixed(3),
      hp: Math.ceil(p.hp), armor: Math.ceil(p.armor), alive: p.alive,
      weapon: p.weapon, mag: p.mag, mags: { ...p.mags, [p.weapon]: p.mag }, ammo: { ...p.ammo }, key: p.key
    },
    enemiesAlive: sim.state.enemies.filter((e) => e.state !== "dead").length,
    kills: sim.state.kills, score: sim.state.score,
    secrets: `${sim.state.secrets}/${sim.state.totalSecrets}`,
    time: +sim.state.time.toFixed(1),
    simSteps,
    paused: isPaused(),
    outcome: pending?.kind ?? (campaignDone ? "results" : null),
    eventSeq: sim.state.eventSeq, eventsDrained, frameErrors,
    drawCalls, drawCallsByFloor: { ...drawCallsByFloor },
    run: { startFloor: runStartFloor + 1, floorsCleared: runResults.length },
    events: sim.state.events.slice(-12),
    look: {
      id: LOOK_ID, hdri: BZ_HDRI, variant: BZ_VARIANTS[activeSlot()], lamp: lookOfSlot(activeSlot()).lamp.color,
      rigPool: lightRig.pool(), vfxBursts, vfxLive: app.effects?.liveCount ?? null
    }
  };
  window.__gameEvidence = payload;
  const prevEv = (window.__AURA3D_GAME_EVIDENCE__ && typeof window.__AURA3D_GAME_EVIDENCE__ === "object")
    ? (window.__AURA3D_GAME_EVIDENCE__ as Record<string, unknown>)
    : {};
  window.__AURA3D_GAME_EVIDENCE__ = { ...prevEv, ...payload };
}

// ---------------------------------------------------------------------------
// shell wiring
function setModeButtons() {
  $("bz-btn-play").classList.toggle("active", mode === "descent");
  $("bz-btn-killhouse").classList.toggle("active", mode === "killhouse");
  document.querySelectorAll<HTMLButtonElement>(".floor-btn").forEach((b, i) =>
    b.classList.toggle("active", mode === "descent" && i === floorIdx));
}
function openMenu() { elMenu.classList.add("open"); setPaused("menu", true); if (pointerLocked) document.exitPointerLock(); renderRemap(); }
function closeMenu() { elMenu.classList.remove("open"); setPaused("menu", false); }
// C11: buttons give focus back to the game after a click, so Enter or Space never re-clicks them
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement | null)?.closest?.("button");
  if (b) setTimeout(() => b.blur(), 0);
}, { capture: true });
$("bz-btn-play").addEventListener("click", () => { closeMenu(); startFloor(0, "descent", { newRun: true }); });
$("bz-btn-killhouse").addEventListener("click", () => { closeMenu(); startFloor(0, "killhouse"); });
$("bz-btn-menu").addEventListener("click", () => (elMenu.classList.contains("open") ? closeMenu() : openMenu()));
$("bz-menu-close").addEventListener("click", () => closeMenu());
$("bz-resume").addEventListener("click", () => resume());
$("bz-results-restart").addEventListener("click", () => startFloor(0, "descent", { newRun: true }));
$("bz-results-menu").addEventListener("click", () => openMenu());
document.querySelectorAll<HTMLButtonElement>(".floor-btn").forEach((b) =>
  b.addEventListener("click", () => { closeMenu(); startFloor(parseInt(b.dataset.auraFloor!, 10), "descent", { newRun: true }); }));
$<HTMLInputElement>("bz-dogtag").addEventListener("input", (e) => { dogtag = (e.target as HTMLInputElement).value.toUpperCase() || "RAZOR-6"; lastHud = ""; });
// C22: the tint recolours the HUD accents (crosshair, frame, labels); the viewmodel keeps its textures
function applyTint(tint: string) {
  document.documentElement.style.setProperty("--bz-amber", tint);
  document.querySelectorAll<HTMLButtonElement>(".bz-swatch").forEach((x) => x.classList.toggle("active", x.dataset.tint === tint));
}
applyTint(store.get("bz-tint") ?? "#ffb648");
document.querySelectorAll<HTMLButtonElement>(".bz-swatch").forEach((b) =>
  b.addEventListener("click", () => { applyTint(b.dataset.tint!); store.set("bz-tint", b.dataset.tint!); }));
document.querySelectorAll<HTMLButtonElement>(".bz-hudscale").forEach((b) =>
  b.addEventListener("click", () => { applyHudScale(b.dataset.scale!); store.set("bz-hud-scale", b.dataset.scale!); }));
{
  const rm = $<HTMLInputElement>("bz-reduced-motion");
  rm.checked = reducedMotion();
  rm.addEventListener("change", () => { reducedMotionPref = rm.checked ? "1" : "0"; store.set("bz-reduced-motion", reducedMotionPref); });
}
const ACTION_LABEL: Partial<Record<BindAction, string>> = { forward: "FORWARD", back: "BACK", strafeLeft: "STRAFE LEFT", strafeRight: "STRAFE RIGHT", fire: "FIRE", use: "USE", reload: "RELOAD", map: "MAP" };
function renderRemap() {
  const host = $("bz-remap");
  host.replaceChildren(...REMAPPABLE.map((a) => {
    const row = document.createElement("div"); row.className = "bz-kv";
    const name = document.createElement("span"); name.textContent = ACTION_LABEL[a] ?? a;
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "bz-key";
    btn.textContent = remapAction === a ? "PRESS A KEY" : bindings[a].map(keyLabel).join(" / ");
    btn.addEventListener("click", () => { remapAction = a; renderRemap(); });
    row.append(name, btn);
    return row;
  }));
  updateHint();
}
$("bz-remap-reset").addEventListener("click", () => { bindings = parseBindings(null); store.set("bz-bindings", JSON.stringify(bindings)); renderRemap(); });
function updateHint() {
  const k = (a: BindAction) => keyLabel(bindings[a][0]);
  $("bz-controls-hint").textContent = `${k("forward")}${k("strafeLeft")}${k("back")}${k("strafeRight")} MOVE · MOUSE AIM · CLICK/${k("fire")} FIRE · ${k("reload")} RELOAD · ${k("use")} USE · 1–4/WHEEL WEAPONS · ${k("map")} MAP · P PAUSE`;
}

// floor select cards (C22: the medal mark shows the best medal earned on each floor)
const floorList = $("bz-floor-list");
function renderFloorCards() {
  floorList.replaceChildren(...FLOORS.map((f, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "bz-floor-card"; b.dataset.f = String(i);
    const medal = floorMedals[i] ?? "none";
    const mark = document.createElement("span"); mark.className = `medal medal-${medal}`; mark.textContent = MEDAL_MARK[medal] ?? "◎"; mark.title = medal === "none" ? "not cleared yet" : `best: ${medal}`;
    const strong = document.createElement("strong"); strong.textContent = `F${i + 1} — ${f.name}`;
    const small = document.createElement("small"); small.textContent = `par ${fmtTime(f.par)} · ${medal === "none" ? "descent" : `best ${medal}`}`;
    b.append(mark, strong, small);
    b.addEventListener("click", () => { closeMenu(); startFloor(i, "descent", { newRun: true }); });
    return b;
  }));
}
renderFloorCards();
$("bz-tour-stats").replaceChildren(...[
  ["WEAPONS", "knife · pistol · MG · rockets"],
  ["ENEMIES", "guard · hound · gunner · IRON WARDEN"],
  ["SECRETS", "push-walls on every floor"],
  ["BEST RUN", (() => { const b = loadJson<{ score: number; time: number } | null>("bz-best-run", null); return b ? `${b.score} in ${fmtTime(b.time)}` : "not set"; })()],
  ["ENGINE", "Aura3D · lit by its own fixtures"]
].map(([k, v]) => { const d = document.createElement("div"); d.className = "bz-kv"; const a = document.createElement("span"); a.textContent = k!; const c = document.createElement("span"); c.textContent = v!; d.append(a, c); return d; }));

// onboarding card (C27): controls and the objective before floor 1, once per browser
function dismissIntro() { elIntro.hidden = true; setPaused("intro", false); store.set("bz-intro-seen", "1"); }
$("bz-intro-go").addEventListener("click", () => { dismissIntro(); if (!touchMode) requestLock(); void mg.sound?.unlock(); cue("ambience"); });
if (!DEMO && !autoPilot && !BOOT_FLOOR && store.get("bz-intro-seen") !== "1") { elIntro.hidden = false; setPaused("intro", true); }

// ---------------------------------------------------------------------------
/**
 * BZ-20: `?floor=` boots that floor at its look row's reference viewpoint and holds the sim there, so the capture
 * variant `bunker-zero--<variant>` frames the same view every run. The player pose is set once at boot; with no
 * `?floor=` the boot path is unchanged.
 */
function placeAtReference() {
  if (!BOOT_FLOOR) return;
  const ref = lookOfSlot(BOOT_FLOOR.slot).reference;
  const p = sim.state.player;
  p.x = cellCenter(ref.cell[0]); p.z = cellCenter(ref.cell[1]);
  p.yaw = (ref.yawDeg * Math.PI) / 180;
  p.pitch = (ref.pitchDeg * Math.PI) / 180;
  qaFrozen = true;
  syncScenePose(NO_INPUT);
}
if (BOOT_FLOOR) startFloor(BOOT_FLOOR.floorIdx, BOOT_FLOOR.mode, { newRun: true });
else startFloor(0, "descent", { newRun: true });
placeAtReference();
updateHint();
elHud.classList.remove("hidden");
void loading.track(mg.ready(), 1, "Starting renderer");
void mg.ready().then(() => {
  appReady = true;
  loading.done();
  lastWall = performance.now();
  SURFACES.prepare(activeSlot());
  // C18: visibility set before the renderer mounted does not stick, so hide the inactive floors again once it is up
  hideAllRuntime();
  bindFloor();
  applyFloorLook(activeSlot());
  ensureVfx();
  syncScenePose(NO_INPUT);
  placeAtReference();
  publishQaCrops();
  document.body.dataset.aura3dReady = "true";
  installQa();
  window.__AURA3D_ROUTE_READY__ = { ready: true };
  if (isDocumentHidden()) app.pause?.();
}).catch((err: unknown) => {
  const el = document.getElementById("render-error") ?? document.createElement("div");
  el.id = "render-error"; el.className = "render-error";
  el.textContent = `Bunker Zero failed to start: ${err instanceof Error ? err.message : String(err)}`;
  document.body.append(el);
});
