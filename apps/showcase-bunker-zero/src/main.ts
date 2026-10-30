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
import {
  camera, effects, environments, game, gameFeel, lights, material, model,
  primitives, scene, type AuraNodeBuilder, type AuraSceneNode
} from "@aura3d/engine";
import { createGame, sfxUrl, type ForwardAxis } from "@aura3d/engine/game";
import { assets } from "./aura-assets";
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
import { VIEWMODEL_ASSET, VIEWMODEL_YAW_OFFSET, weaponHudLabel } from "./weapons-view";
import { ENEMY_FORWARD, enemyFacingError, nextEnemyYaw } from "./enemy-facing";
import { installBlackFrameGuard } from "@aura3d/debug";
import {
  BZ_ENV_INTENSITY, BZ_HDRI, BZ_HDRI_URL, BZ_PALETTE, BZ_POST, BZ_VARIANTS, lookOfSlot, parseFloorParam, underHatch
} from "./art/look";
import { buildLightRig, createLightRigDriver, type QualityTierName, type RigLightHandle } from "./art/lightRig";
import { BZ_FLOOR_TEXTURES, bunkerTexture } from "./art/textures";
import { damageArcDeg, deathFade, deathRoll, descentSeconds, doorOffset, reloadDip, viewmodelSway } from "./art/motion";
import { BZ_VFX_EVENTS, atmosphereEmitters, registerBunkerVfx, type BunkerVfxKind } from "./art/vfx";
import { BZ_CA_PULSE, caPulseLevel, lutOfSlot, lutUrlOfSlot } from "./art/lut";
import { HATCH_BACKDROP, HATCH_COLLAR, hatchBackdrop, hatchCeiling, hatchCollar, hatchShaftSpec, shaftOnSlot } from "./art/hatch";

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
/** BZ-06: F2 standing water, and the wet-ground amount per floor slot (F2 flooded cellars, F6 the hatch rain). */
const BZ_WATER = { color: "#0b1714", roughness: 0.06 } as const;
/** BZ-04: base colour under the texture sets (slightly warm white; the lamps carry each floor's colour). */
const BZ_SURFACE_WHITE = "#ece8df";
const BZ_WETNESS = [0, 0.7, 0, 0, 0, 0.45, 0] as const;
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

// BZ-14: hostiles read by light, not glow: no emissive lift and no eye spheres; a faint cool rim (E-D) separates the
// silhouette from the walls between the lamp pools.
const HOSTILE_OVERRIDES = [
  { color: "#f2f7fb", colorMode: "multiply" as const, roughness: 0.66, metallic: 0.08, rim: { color: "#9fb4c8", power: 3.2, intensity: 0.35 } }
];

// Pickups keep their baked textures: a multiply tint plus a faint emissive lift reads as "item" without flattening it.
const pickupGlow = (color: string, emissive: string, emissiveIntensity: number, extra: { metallic?: number; roughness?: number } = {}) => [
  { color, colorMode: "multiply" as const, emissive, emissiveIntensity, ...extra }
];

// ---------------------------------------------------------------------------
// scene graph — everything exists from boot; runtime nodes move per frame
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
      name: "bunker ibl", intensity: BZ_ENV_INTENSITY, background: false,
      texture: { type: "texture", format: "hdr", url: BZ_HDRI_URL } as never
    })
  ];

  for (const { def, slot } of ALL_FLOORS) {
    const rows = def.rows;
    const h = rows.length, w = rows[0].length;
    const wallH = SLOT_WALL_H[slot]!;
    const look = lookOfSlot(slot);
    // BZ-04: each floor's own ambientCG set, one repeat per 3 m cell (box faces are 0..1 per face). The renderer multiplies
    // material and instance colours, so the material is near white and the instance colour is only a +-6% jitter.
    const tex = BZ_FLOOR_TEXTURES[slot]!;
    const wallTex = bunkerTexture(tex.wall), altTex = bunkerTexture(tex.accent), floorTex = bunkerTexture(tex.floor);
    const metalWall = tex.wall.startsWith("metal");
    const wallMat = material.pbr({ color: BZ_SURFACE_WHITE, texture: wallTex.color, normal: wallTex.normal, normalScale: 0.9, roughness: metalWall ? 0.55 : 0.88, metalness: metalWall ? 0.45 : 0 });
    const altMat = material.pbr({ color: BZ_SURFACE_WHITE, texture: altTex.color, normal: altTex.normal, normalScale: 0.9, roughness: 0.8, metalness: tex.accent.startsWith("metal") ? 0.45 : 0 });
    const jitter = (x: number, z: number) => scaleHex(BZ_SURFACE_WHITE, 1 + (hash2(x, z) - 0.5) * 0.12);
    const wallInst: { position: [number, number, number]; scale: [number, number, number] }[] = [];
    const wallCol: string[] = [];
    const altInst: { position: [number, number, number]; scale: [number, number, number] }[] = [];
    const altCol: string[] = [];
    const faltInst: { position: [number, number, number]; scale: [number, number, number] }[] = [];
    const stripInst: { position: [number, number, number]; scale: [number, number, number] }[] = [];
    const ceilInst: { position: [number, number, number]; scale: [number, number, number] }[] = [];

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
      }
      // Ceiling work lights over open corridor cells.
      if (ch !== "#" && ch !== "%" && ch !== " " && ch !== "P" && (x * 7 + z * 13) % 9 === 0 && !underHatch(def, x, z)) {
        ceilInst.push({ position: [wx, wallH - 0.06, wz], scale: [1.55, 0.035, 0.2] });
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
      }
    }
    nodes.push(
      // structural walls — one instanced draw call per material group
      primitives.box({ name: `f${slot} walls`, material: wallMat, instances: wallInst, instanceColors: wallCol }).runtime(staticNode(slot, "walls")),
      primitives.box({ name: `f${slot} accent`, material: altMat, instances: altInst, instanceColors: altCol }).runtime(staticNode(slot, "accent")),
      // slab floor + sealed ceiling: the ceiling now meets the wall tops so the
      // corridors read as enclosed rooms instead of an open-topped flat plane.
      primitives.box({ name: `f${slot} floor`, size: [w * CELL, 0.3, h * CELL], position: [slot * FLOOR_SPAN + w * CELL / 2, -0.15, h * CELL / 2], material: material.pbr({
        color: BZ_SURFACE_WHITE, texture: floorTex.color, normal: floorTex.normal, normalScale: 0.8, roughness: 0.82, metalness: tex.floor.startsWith("metal") ? 0.4 : 0,
        texTransforms: { baseColor: { scale: [w, h] }, normal: { scale: [w, h] } }
      }) }).runtime(staticNode(slot, "floor")),
      // BZ-07: F6's ceiling is four slabs around the 3x3 hatch (one instanced draw); every other floor stays sealed.
      def.id === 5
        ? primitives.box({ name: `f${slot} ceil`, instances: hatchCeiling(w, h, wallH), material: material.pbr({ color: shade(def.palette.ceil, 0.1), roughness: 0.92, metalness: 0 }) }).runtime(staticNode(slot, "ceil"))
        : primitives.box({ name: `f${slot} ceil`, size: [w * CELL, 0.24, h * CELL], position: [slot * FLOOR_SPAN + w * CELL / 2, wallH + 0.14, h * CELL / 2], material: material.pbr({ color: shade(def.palette.ceil, 0.1), roughness: 0.92, metalness: 0 }) }).runtime(staticNode(slot, "ceil")),
      primitives.box({
        name: `f${slot} wall-trim`,
        // BZ-01: the glowing baseboard is gone; a painted hazard-yellow kick strip only reads where a lamp reaches it
        material: material.pbr({ color: BZ_PALETTE.hazard, roughness: 0.58, metalness: 0.1 }),
        instances: stripInst,
        castShadow: false,
        receiveShadow: false
      }).runtime(staticNode(slot, "trim"))
    );
    if (def.id === 5) {
      // BZ-07: the olive steel collar lining the shaft and the night backdrop closing it (+2 draws on F6 only)
      nodes.push(
        primitives.box({ name: `f${slot} hatch collar`, instances: hatchCollar(wallH), material: material.pbr({ color: HATCH_COLLAR.color, roughness: 0.6, metalness: 0.5 }) }).runtime(staticNode(slot, "hatch-collar")),
        primitives.box({
          name: `f${slot} hatch night backdrop`, instances: [hatchBackdrop(wallH)], castShadow: false, receiveShadow: false,
          material: material.emissive({ color: HATCH_BACKDROP.color, emissive: HATCH_BACKDROP.emissive, emissiveIntensity: HATCH_BACKDROP.emissiveIntensity, roughness: 1 })
        }).runtime(staticNode(slot, "hatch-backdrop"))
      );
    }
    if (ceilInst.length) {
      nodes.push(primitives.box({
        name: `f${slot} work-lights`,
        // BZ-01/02: the fixtures glow in the floor's one lamp colour (a light only under the ones the rig's pool holds)
        material: material.emissive({ color: look.lamp.color, emissive: look.lamp.color, emissiveIntensity: look.fixtures.height === "grate" ? 0.6 : 2.4, roughness: 0.3 }),
        instances: ceilInst,
        castShadow: false,
        receiveShadow: false
      }).runtime(staticNode(slot, "work-lights")));
    }
    if (faltInst.length) {
      nodes.push(primitives.box({
        name: `f${slot} floor-alt`, instances: faltInst,
        // BZ-06: only the F3 forge grates glow. F2's flood is dark standing water (a near-black, glossy tint that the
        // lamps and the IBL catch as highlights) instead of the cyan emissive slab.
        material: slot === 2 && def.palette.floorEmissive
          ? material.emissive({ color: def.palette.floorAlt, emissive: def.palette.floorEmissive, emissiveIntensity: 1.6, roughness: 0.4, ...(tex.floorAlt ? { texture: bunkerTexture(tex.floorAlt).color } : {}) })
          : slot === 1
            ? material.pbr({ color: BZ_WATER.color, roughness: BZ_WATER.roughness, metalness: 0 })
            : material.pbr({ color: def.palette.floorAlt, roughness: 0.75 })
      }).runtime(staticNode(slot, "floor-alt")));
    }
    // ---- per-cell runtime 3D Meshy entities & props -----------------------
    let dI = 0, pI = 0, eI = 0, kI = 0;
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
      const ch = rows[z][x];
      const wx = cellX(slot, x), wz = cellCenter(z);
      switch (ch) {
        case "D":
          nodes.push(
            model(assets.pulseNeonGateArchMeshy, { name: `f${slot} door ${dI}`, targetHeight: wallH * 0.96 })
              .position(wx, 0, wz)
              .runtime(slotNode(slot, `f${slot}-door-${x}-${z}`, ["door"]))
          );
          dI++;
          break;
        case "P": {
          // push block — 3D Meshy reinforced bunker cover wall + glowing secret beacon
          const side = pushFace(rows, x, z);
          nodes.push(
            model(assets.fpsSciFiCoverCrateMeshy, { name: `f${slot} push ${pI}`, targetHeight: wallH * 0.92 })
              .position(wx, 0, wz)
              .runtime(slotNode(slot, `f${slot}-pw-${x}-${z}`, ["pushwall"])),
            model(assets.auroraPadBeacon, { name: `f${slot} crack ${pI}`, targetHeight: 0.85 })
              .position(wx + side[0] * CELL * 0.44, 0.2, wz + side[1] * CELL * 0.44)
              .runtime(slotNode(slot, `f${slot}-crack-${x}-${z}`, ["crack"]))
          );
          pI++;
          break;
        }
        case "E":
          nodes.push(
            model(assets.pulseNeonGateArchMeshy, { name: `f${slot} exit`, targetHeight: wallH * 0.98 })
              .position(wx, 0, wz).runtime(staticNode(slot, "exit")),
            model(assets.auroraPadBeacon, { name: `f${slot} exitpost`, targetHeight: 1.5 })
              .position(wx, 0.05, wz).runtime(staticNode(slot, "exitpost"))
          );
          break;
        case "K":
          nodes.push(
            model(assets.bunkerKeyMeshy, { name: `f${slot} key`, materialOverrides: pickupGlow("#fff0b8", "#ff9d2a", 0.45, { metallic: 0.7, roughness: 0.35 }) })
              .position(wx, 1.1, wz).scale(0.18)
              .runtime(slotNode(slot, `f${slot}-pk-${x}-${z}`, ["pickup", "key"]))
          );
          break;
        case "t": case "T":
          nodes.push(
            model(assets.bunkerTreasureMeshy, {
              name: `f${slot} treasure ${kI}`,
              materialOverrides: pickupGlow("#ffe9a0", "#ffd76a", ch === "T" ? 0.7 : 0.4, { metallic: 0.8, roughness: 0.3 })
            })
              .position(wx, 0.55, wz).scale(ch === "T" ? 0.38 : 0.28)
              .runtime(slotNode(slot, `f${slot}-pk-${x}-${z}`, ["pickup", "treasure"]))
          );
          kI++;
          break;
        case "+": case "*":
          nodes.push(
            model(assets.fpsEnergyCorePickupMeshy, { name: `f${slot} medkit ${x}-${z}`, targetHeight: 0.82 })
              .position(wx, 0.45, wz)
              .runtime(slotNode(slot, `f${slot}-pk-${x}-${z}`, ["pickup", "health"]))
          );
          break;
        case "a":
          nodes.push(
            model(assets.corridorFireAmmoCrateMeshy, { name: `f${slot} ammo`, materialOverrides: pickupGlow("#d8e6a8", "#5a6a2a", 0.18) })
              .position(wx, 0.0, wz).scale(0.42)
              .runtime(slotNode(slot, `f${slot}-pk-${x}-${z}`, ["pickup", "ammo"]))
          );
          break;
        case "r":
          nodes.push(
            model(assets.bzArmorMeshy, { name: `f${slot} armor`, materialOverrides: pickupGlow("#b8dcf2", "#3a8aaa", 0.3) })
              .position(wx, 0.0, wz).scale(0.36)
              .runtime(slotNode(slot, `f${slot}-pk-${x}-${z}`, ["pickup", "armor"]))
          );
          break;
        case "w":
          nodes.push(
            model(assets.corridorPulseRifleMeshy, { name: `f${slot} mgpickup`, materialOverrides: pickupGlow("#e6f4f8", "#7dfcff", 0.25) })
              .position(wx, 0.55, wz).rotate(0, 0.7, 0).scale(0.48)
              .runtime(slotNode(slot, `f${slot}-pk-${x}-${z}`, ["pickup", "weapon"]))
          );
          break;
        case "W":
          nodes.push(
            model(assets.mechWeaponB, { name: `f${slot} rocketpickup`, targetHeight: 0.55, materialOverrides: pickupGlow("#ffe2cc", "#ff8a3a", 0.3) })
              .position(wx, 0.55, wz).rotate(0, -0.7, 0)
              .runtime(slotNode(slot, `f${slot}-pk-${x}-${z}`, ["pickup", "weapon"]))
          );
          break;
        case "b":
          nodes.push(
            model(assets.bzBarrelMeshy, { name: `f${slot} barrel ${x}-${z}`, materialOverrides: pickupGlow("#ffc4a8", "#c44a22", 0.14, { roughness: 0.55 }) })
              .position(wx, 0, wz).scale(0.88)
              .runtime(slotNode(slot, `f${slot}-prop-${x}-${z}`, ["prop", "barrel"]))
          );
          break;
        case "c":
          nodes.push(
            model(assets.bzCrateMeshy, { name: `f${slot} crate ${x}-${z}` })
              .position(wx, 0, wz).scale(0.72)
              .runtime(slotNode(slot, `f${slot}-prop-${x}-${z}`, ["prop", "crate"]))
          );
          break;
        case "o":
          nodes.push(
            model(assets.blockfallReactorContainmentPylonMeshy, { name: `f${slot} column ${x}-${z}`, targetHeight: wallH })
              .position(wx, 0, wz).runtime(staticNode(slot, `col-${x}-${z}`))
          );
          break;
        case "g":
          nodes.push(
            model(assets.bzGuardMeshy, { name: `f${slot} guard ${eI}`, targetHeight: 1.9, materialOverrides: HOSTILE_OVERRIDES })
              .position(wx, 0, wz)
              .animate({ clip: "Walk_Loop", loop: true, speed: 1.05 })
              .runtime(slotNode(slot, `f${slot}-en-${x}-${z}`, ["enemy", "guard"]))
          );
          eI++;
          break;
        case "d":
          nodes.push(
            model(assets.bzHoundMeshy, {
              name: `f${slot} hound ${eI}`, targetHeight: 1.05, materialOverrides: HOSTILE_OVERRIDES
            })
              .position(wx, 0, wz)
              .animate({ clip: "Walk_Loop", loop: true, speed: 1.35 })
              .runtime(slotNode(slot, `f${slot}-en-${x}-${z}`, ["enemy", "dog"]))
          );
          eI++;
          break;
        case "G":
          nodes.push(
            model(assets.bzGunnerMeshy, {
              name: `f${slot} gunner ${eI}`, targetHeight: 2.0, materialOverrides: HOSTILE_OVERRIDES
            })
              .position(wx, 0, wz)
              .animate({ clip: "Walk_Loop", loop: true, speed: 1.0 })
              .runtime(slotNode(slot, `f${slot}-en-${x}-${z}`, ["enemy", "gunner"]))
          );
          eI++;
          break;
        case "B":
          nodes.push(
            model(assets.bzWardenMeshy, {
              name: `f${slot} boss ${eI}`, targetHeight: 3.1, materialOverrides: HOSTILE_OVERRIDES
            })
              .position(wx, 0, wz)
              .animate({ clip: "Idle_Loop", loop: true, speed: 0.95 })
              .runtime(slotNode(slot, `f${slot}-en-${x}-${z}`, ["enemy", "boss"]))
          );
          eI++;
          break;
      }
    }
    // C1: hidden guard nodes for the guards the Iron Warden summons (sim.MAX_SUMMONS), mapped by Enemy.summonSlot
    if (rows.some((r) => r.includes("B"))) {
      for (let i = 0; i < MAX_SUMMONS; i++) {
        nodes.push(
          model(assets.bzGuardMeshy, { name: `f${slot} summon ${i}`, targetHeight: 1.9, materialOverrides: HOSTILE_OVERRIDES })
            .position(slot * FLOOR_SPAN, -50, 0)
            .animate({ clip: "Run", loop: true, speed: 1.3 })
            .runtime(slotNode(slot, `f${slot}-summon-${i}`, ["enemy", "guard", "summon"]))
        );
      }
    }
  }

  // ---- player rig: 3D Meshy viewmodels + muzzle flash + pooled FX ---------
  nodes.push(
    model(assets[VIEWMODEL_ASSET.knife], { name: "vm knife", targetHeight: 0.34 })
      .position(0, 0, 0)
      .runtime(game.runtimeNode("vm-knife", { tags: ["viewmodel"] })),
    model(assets[VIEWMODEL_ASSET.pistol], { name: "vm pistol" })
      .position(0, 0, 0).scale(0.2)
      .runtime(game.runtimeNode("vm-pistol", { tags: ["viewmodel"] })),
    model(assets[VIEWMODEL_ASSET.mg], { name: "vm mg" })
      .position(0, 0, 0).scale(0.45)
      .runtime(game.runtimeNode("vm-mg", { tags: ["viewmodel"] })),
    model(assets[VIEWMODEL_ASSET.rocket], { name: "vm rocket", targetHeight: 0.48 })
      .position(0, 0, 0)
      .runtime(game.runtimeNode("vm-rocket", { tags: ["viewmodel"] })),
    model(assets.corridorMuzzleFlameBurstMeshy, {
      name: "muzzle flash", material: material.emissive({ color: "#ffd27a", emissive: "#ff9a2a", emissiveIntensity: 2.2, roughness: 0.3 })
    }).position(0, -50, 0).scale(0.14)
      .runtime(game.runtimeNode("muzzle-flash", { tags: ["vfx"] })),
    // C27: the Iron Warden's vent glows while it is vulnerable
    lights.point({ name: "warden vent light", color: "#ff5a1a", intensity: 7, distance: 9, decay: 1.6, position: [0, -50, 0] })
      .runtime(game.runtimeNode("vent-light", { tags: ["vfx"] }))
  );
  // C8: enemy gunshots get a tracer, misses included; the muzzle flash at the shooter is the bz-enemy-muzzle preset (BZ-03)
  for (let i = 0; i < ENEMY_TRACERS; i++)
    nodes.push(
      primitives.sphere({
        name: `enemy tracer ${i}`, size: [1, 1, 1], position: [0, -50, 0], castShadow: false, receiveShadow: false,
        material: material.emissive({ color: "#ffe2a8", emissive: "#ff8a2a", emissiveIntensity: 7.5, roughness: 0.2 })
      }).runtime(game.runtimeNode(`etracer-${i}`, { tags: ["vfx"] }))
    );
  // BZ-03: impact sparks and explosion balls are the effect pack's bursts now (art/vfx.ts); no pooled flash nodes.
  for (let i = 0; i < MAX_ROCKETS; i++)
    nodes.push(
      model(assets.corridorFireAmmoBoltMeshy, { name: `rocket ${i}`, material: material.emissive({ color: "#ffd27a", emissive: "#ff7a1a", emissiveIntensity: 8.5 }) })
        .position(0, -50, 0).scale(0.28)
        .runtime(game.runtimeNode(`rocket-${i}`, { tags: ["vfx"] })),
      primitives.sphere({
        name: `tracer ${i}`,
        size: [0.14, 0.14, 0.46],
        position: [0, -50, 0],
        material: material.emissive({ color: "#fff4b8", emissive: "#ffaa2a", emissiveIntensity: 9.0, roughness: 0.2 })
      }).runtime(game.runtimeNode(`tracer-${i}`, { tags: ["vfx"] }))
    );

  // C24: no effects.contactShadows. The only shadow-casting light is the look's key above the sealed ceilings, so the mask
  // changed nothing on screen (remote A/B g11-after-7: mean luma 74.98 with it, 74.99 without) and cost 52 draw calls (217 vs 165).
  // BZ-02: dust haze at 30% of the lamp value per floor (re-applied by applyFloorLook). BZ-08: AO, bloom, grade,
  // vignette and grain at the WP's numbers; ACES comes from createGame's output.
  return b.addMany(nodes)
    .add(effects.fog({ color: boot.fog.color, density: boot.fog.density }))
    .add(effects.ambientOcclusion({ intensity: BZ_POST.ao.intensity, radius: BZ_POST.ao.radius }))
    .add(effects.bloom({ threshold: BZ_POST.bloom.threshold, intensity: BZ_POST.bloom.intensity }))
    .add(effects.colorGrade({
      contrast: BZ_POST.grade.contrast, saturation: BZ_POST.grade.saturation,
      temperature: boot.grade.temperature, tint: boot.grade.tint,
      // BZ-18: the floor's split-tone LUT (swapped per floor by applyFloorLook)
      ...(floorLut(BOOT_SLOT) ? { lut: floorLut(BOOT_SLOT)!, lutIntensity: 1 } : {})
    }))
    // BZ-18: chromatic aberration at rest 0, pulsed on heavy hits (S10; the engine drops it on Low)
    .add(effects.chromaticAberration({ intensity: 0 }))
    // BZ-07: the moon shaft through the F6 hatch (S4 god rays, Medium tier and up); disabled off F6 by applyFloorLook.
    .add(effects.volumetricFog(hatchShaftSpec(lookOfSlot(5).fog.density)))
    .add(effects.vignette({ intensity: BZ_POST.vignette }))
    .add(effects.filmGrain({ intensity: BZ_POST.grain }))
    .camera(camera.perspective({ position: [4.5, EYE, 4.5], target: [12.5, EYE, 4.5], fov: 72 }));
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
const mg = createGame({
  id: "showcase-bunker-zero",
  target: "#app",
  autoStart: true,
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
  // BZ-08: ACES through the output, never a look preset
  output: { toneMapping: "aces" },
  evidence: { schema: 1, sections: { bunkerZero: () => window.__gameEvidence ?? { status: "unbound" } } }
});
const app = mg.app;
mg.start();
const feel = gameFeel.create({ app, time: app.time });
const cue = (id: CueId) => { void mg.sound?.cue(id); };

// ---------------------------------------------------------------------------
// sim + node-handle caches
type NodeHandle = ReturnType<typeof app.nodes.require>;
let sim: Sim;
let mode: "descent" | "killhouse" = "descent";
let floorIdx = 0;
let dogtag = "RAZOR-6";
const nodeCache = new Map<string, NodeHandle | null>();
const enemyAnimCache = new Map<string, string>();
/** Node by id, or null when the scene has no such node: per-frame code skips missing nodes instead of throwing (C1). */
function opt(id: string): NodeHandle | null {
  let n = nodeCache.get(id);
  if (n === undefined) { n = app.nodes.get(id) ?? null; if (n) nodeCache.set(id, n); }
  return n;
}
function req(id: string): NodeHandle {
  const n = opt(id);
  if (!n) throw new Error(`Bunker Zero: scene node "${id}" is missing`);
  return n;
}
function setEnemyClip(id: string, node: NodeHandle, clip: string, speed: number) {
  const key = `${clip}:${speed.toFixed(2)}`;
  if (enemyAnimCache.get(id) === key) return;
  enemyAnimCache.set(id, key);
  node.setAnimation({ clip, loop: true, speed });
}
const vmNodes = { knife: req("vm-knife"), pistol: req("vm-pistol"), mg: req("vm-mg"), rocket: req("vm-rocket") };
const muzzleFlash = req("muzzle-flash");
const ventLight = req("vent-light");
const rocketNodes = Array.from({ length: MAX_ROCKETS }, (_, i) => req(`rocket-${i}`));
const tracerNodes = Array.from({ length: MAX_ROCKETS }, (_, i) => req(`tracer-${i}`));
const enemyTracerNodes = Array.from({ length: ENEMY_TRACERS }, (_, i) => req(`etracer-${i}`));
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
/** BZ-02 / BZ-05: one lamp colour, fog, IBL scale and white balance per floor (presentation only, PRD D8). */
function applyFloorLook(slot: number, transitionSeconds = 0) {
  const look = lookOfSlot(slot);
  lightRig.applyFloor(slot);
  try { app.atmosphere?.setFog({ color: look.fog.color, density: look.fog.density }, { transitionSeconds }); } catch { /* fog runtime not mounted */ }
  try { app.lighting?.setEnvironmentIntensity(look.environmentIntensity / BZ_ENV_INTENSITY); } catch { /* lighting runtime not mounted */ }
  try { app.atmosphere?.setWetness(BZ_WETNESS[slot] ?? 0, { transitionSeconds }); } catch { /* wetness not mounted */ }
  const lut = floorLut(slot);
  try { app.post?.setEffect("colorGrade", { temperature: look.grade.temperature, tint: look.grade.tint, lut: lut ? lutUrlOfSlot(slot) : "", lutIntensity: lut ? 1 : 0 }); } catch { /* post runtime not mounted */ }
  try { app.post?.setEffectEnabled("volumetricFog", shaftOnSlot(slot)); } catch { /* post runtime not mounted */ }
  document.documentElement.style.setProperty("--bz-lamp", look.lamp.color);
  startAtmosphere(slot);
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
const enemyIds = (slot: number, e: Enemy) => { const st = enemyNodeStem(e); return { body: `f${slot}-${st.body}`, eye: `f${slot}-${st.eye}` }; };

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
  for (let s = 0; s < ALL_FLOORS.length; s++) {
    for (const id of SLOT_IDS[s]!) opt(id)?.setVisible(false);
    if (s === slot) for (const id of SLOT_STATIC_IDS[s]!) opt(id)?.setVisible(true);
  }
  for (const v of Object.values(vmNodes)) v.setVisible(false);
  muzzleFlash.setVisible(false);
}
function bindFloor() {
  const slot = activeSlot();
  enemyAnimCache.clear();
  for (const e of sim.state.enemies) {
    const { body } = enemyIds(slot, e);
    const node = opt(body);
    if (!node) continue;
    setEnemyClip(body, node, e.kind === "boss" ? "Idle_Loop" : "Walk_Loop", e.kind === "dog" ? 1.35 : 1.05);
  }
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
  elArc = $("bz-damage-arc");
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
  FEED.push({ text: s, warn });
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
function drawMap() {
  const s = sim.state, p = s.player;
  const px = 9;
  if (elMap.width !== s.w * px) { elMap.width = s.w * px; elMap.height = s.h * px; }
  const ctx = elMap.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "rgba(6,8,11,0.88)"; ctx.fillRect(0, 0, elMap.width, elMap.height);
  for (let z = 0; z < s.h; z++) for (let x = 0; x < s.w; x++) {
    const ch = s.grid[z * s.w + x]!;
    const col = ch === "#" || ch === " " ? "#4b4f57" : ch === "%" ? "#6a5a40" : ch === "P" ? "#4b4f57" : ch === "D" ? "#ffb648" : ch === "E" ? "#58e08a" : ch === "o" || ch === "b" || ch === "c" ? "#2a2e35" : "#14181e";
    ctx.fillStyle = col; ctx.fillRect(x * px, z * px, px - 1, px - 1);
  }
  for (const k of s.pickups) if (k.kind === "key" && !k.taken) { ctx.fillStyle = "#ffe066"; ctx.beginPath(); ctx.arc((k.cx + 0.5) * px, (k.cz + 0.5) * px, px * 0.38, 0, Math.PI * 2); ctx.fill(); }
  const mx = (p.x / CELL) * px, mz = (p.z / CELL) * px;
  ctx.save(); ctx.translate(mx, mz); ctx.rotate(p.yaw);
  ctx.fillStyle = "#7dfcff"; ctx.beginPath(); ctx.moveTo(0, -px * 0.7); ctx.lineTo(px * 0.45, px * 0.45); ctx.lineTo(-px * 0.45, px * 0.45); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// the camera, viewmodel, enemies and props follow the sim
function syncScenePose(inp: SimInput) {
  const p = sim.state.player;
  poseDt = lastPoseTime < 0 ? 1 : Math.min(0.1, Math.max(0, sim.state.time - lastPoseTime));
  lastPoseTime = sim.state.time;
  const motion = motionScale();
  // ---- camera: eye pose + shake + tactical flashlight tracking (C21: both scale down under reduced motion)
  const shake = (sim.state.shake + (p.hurtT > 0 ? 0.3 : 0)) * motion;
  const shakeYaw = shake * Math.sin(sim.state.time * 91) * 0.012;
  const moveMag = Math.min(1, Math.abs(inp.moveZ) + Math.abs(inp.moveX));
  const eyeY = EYE + Math.sin(sim.state.time * 8.4) * 0.024 * moveMag * motion;
  const ox = sim.state.ox;
  const fx = Math.sin(p.yaw + shakeYaw), fz = -Math.cos(p.yaw + shakeYaw);
  // BZ-16: death roll 12 deg (reduced motion: none); no sprint in the sim, so no sprint FOV
  if (p.alive) deadAt = -1; else if (deadAt < 0) deadAt = sim.state.time;
  const sinceDeath = deadAt < 0 ? 0 : sim.state.time - deadAt;
  app.camera?.setPose({
    position: [p.x + ox, eyeY + p.pitch * 0.4, p.z],
    target: [p.x + ox + fx, eyeY + Math.tan(p.pitch), p.z + fz],
    roll: deathRoll(sinceDeath, reducedMotion()),
    fov: 72
  });
  deathFadeLevel = deathFade(sinceDeath, reducedMotion());
  try { mg.sound?.setListener?.({ position: [p.x + ox, EYE, p.z], forward: [fx, 0, fz], up: [0, 1, 0] }); } catch { /* audio not ready */ }
  // BZ-01: the rig follows the camera (carried lamp, fixture pool, flicker, F6 beacon); cosmetic, never the sim's RNG
  lightRig.update({ x: p.x + ox, y: eyeY, z: p.z, fx, fz }, sim.state.time);

  // ---- viewmodel (with crisp recoil kickback on fire)
  const bob = Math.sin(sim.state.time * 9) * 0.018 * moveMag * motion;
  const muzzleFrac = Math.min(1, (sim.state.muzzle ?? 0) / 0.06);
  const recoil = muzzleFrac * 0.12;
  const rx = Math.cos(p.yaw), rz = Math.sin(p.yaw);
  // portrait screens see a narrow horizontal slice: pull the weapon toward the centre so it stays in frame (C12)
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  const side = 0.26 * Math.max(0.3, Math.min(1, aspect / 1.6));
  // BZ-15: sway from the turn rate and a reload dip (both off under reduced motion)
  const [swayX, swayY] = viewmodelSway(inp.turn / Math.max(poseDt, 1 / 240), sim.state.time, moveMag, reducedMotion());
  const dip = reloadDip(p.reloading, p.weapon === "rocket" ? 1.4 : 1.1, reducedMotion());
  const vmx = p.x + ox + fx * (0.62 - recoil) + rx * (side + swayX);
  const vmy = EYE - 0.34 + bob - p.pitch * 0.12 + recoil * 0.38 + swayY - dip;
  const vmz = p.z + fz * (0.62 - recoil) + rz * (side + swayX);
  for (const [id, node] of Object.entries(vmNodes) as [WeaponId, typeof vmNodes.knife][]) {
    if (id === p.weapon && p.alive) {
      node.setPosition(vmx, vmy, vmz);
      node.setRotation((id === "knife" ? -0.6 : 0) - recoil * 1.5, -p.yaw + Math.PI / 2 + VIEWMODEL_YAW_OFFSET[id], id === "knife" ? 0.5 : 0);
      node.setVisible(true);
    } else node.setVisible(false);
  }

  // ---- muzzle flash; the room light of every shot is the bz-muzzle preset's transient light (BZ-03, fireVfx)
  if (sim.state.muzzle > 0) {
    const mx = p.x + ox + fx * 0.95 + rx * 0.22, my = EYE - 0.22, mz = p.z + fz * 0.95 + rz * 0.22;
    muzzleFlash.setPosition(mx, my, mz);
    muzzleFlash.setRotation(0, -p.yaw + Math.PI / 2, sim.state.time * 25);
    // C17: cosmetic jitter comes from its own RNG, never the sim's seeded stream
    muzzleFlash.setScale(0.11 + fxRng() * 0.05);
    muzzleFlash.setVisible(true);
    if (!muzzleWasLit) fireVfx("player-fire", [mx, my, mz]);
    muzzleWasLit = true;
  } else {
    muzzleFlash.setVisible(false);
    muzzleFlash.setPosition(0, -50, 0);
    muzzleWasLit = false;
  }

  // ---- enemies (skeletal animation + procedural stride cadence); nodes that do not exist are skipped (C1)
  const slot = activeSlot();
  let vulnerable: Enemy | null = null;
  for (const e of sim.state.enemies) {
    const ids = enemyIds(slot, e);
    const node = opt(ids.body);
    const eye = opt(ids.eye);
    if (!node) continue;
    if (e.state === "dead") {
      eye?.setVisible(false);
      if (e.deathT < 4) {
        setEnemyClip(ids.body, node, "Idle_Loop", 0.2);
        node.setPosition(e.x + ox, Math.max(-0.6, -e.deathT * 0.2), e.z);
        node.setRotation(Math.min(Math.PI / 2, e.deathT * 4), enemyYaw.get(ids.body) ?? nextEnemyYaw(0, e.kind, e.facing, 1, enemyForward(e.kind)), 0);
        node.setVisible(true);
      } else node.setVisible(false);
      continue;
    }
    let clip = "Idle_Loop";
    let speed = 1.0;
    let strideBob = Math.sin(sim.state.time * 3.2 + e.sx) * 0.015;
    let strideRoll = 0;
    if (e.state === "patrol") {
      clip = "Walk_Loop";
      speed = e.kind === "dog" ? 1.35 : 1.08;
      strideBob = Math.abs(Math.sin(sim.state.time * 7.5 + e.sx)) * 0.045;
      strideRoll = Math.sin(sim.state.time * 7.5 + e.sx) * 0.04;
    } else if (e.state === "chase") {
      clip = e.kind === "dog" ? "Sprint_Loop" : "Run";
      speed = e.kind === "dog" ? 1.6 : 1.3;
      strideBob = Math.abs(Math.sin(sim.state.time * 11.0 + e.sx)) * 0.065;
      strideRoll = Math.sin(sim.state.time * 11.0 + e.sx) * 0.055;
    } else if (e.state === "attack") {
      clip = e.kind === "dog" ? "Attack" : "Shoot";
      speed = 1.45;
      strideBob = e.kind === "boss" ? Math.sin(sim.state.time * 30) * 0.035 : 0.02;
    } else if (e.state === "pain") {
      clip = "Contest";
      speed = 1.4;
    }
    setEnemyClip(ids.body, node, clip, speed);
    node.setPosition(e.x + ox, strideBob, e.z);
    const yaw = nextEnemyYaw(enemyYaw.get(ids.body) ?? nextEnemyYaw(0, e.kind, e.facing, 1, enemyForward(e.kind)), e.kind, e.facing, poseDt, enemyForward(e.kind));
    enemyYaw.set(ids.body, yaw);
    node.setRotation(0, yaw, strideRoll);
    node.setVisible(true);
    const eyeY = e.kind === "dog" ? 0.8 : e.kind === "boss" ? 2.62 : e.kind === "gunner" ? 1.76 : 1.66;
    if (e.kind === "boss" && e.vulnerableT > 0) vulnerable = e;
    if (eye) {
      eye.setPosition(e.x + ox, eyeY + strideBob, e.z);
      // C27: the Warden's eyes flare while its vent is open
      if (e.kind === "boss") {
        const flare = e.vulnerableT > 0 ? 2.1 + Math.sin(sim.state.time * 14) * 0.35 : 1;
        eye.setScale([0.26 * flare, 0.075 * flare, 0.26 * flare]);
      }
      eye.setVisible(true);
    }
  }
  if (vulnerable) ventLight.setPosition(vulnerable.x + ox, 1.9, vulnerable.z);
  else ventLight.setPosition(0, -50, 0);
  elVuln.hidden = !vulnerable;

  // ---- pickups (bob + spin)
  for (const pk of sim.state.pickups) {
    const node = opt(`f${slot}-pk-${pk.cx}-${pk.cz}`);
    if (!node) continue;
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
    crack.setPosition(px, 0.2, pz);
    if (pw.state === "open") crack.setVisible(false);
  }

  // ---- props (barrels extinguish)
  for (const pr of sim.state.props) {
    if (pr.kind === "column") continue;
    opt(`f${slot}-prop-${pr.cx}-${pr.cz}`)?.setVisible(pr.alive);
  }

  // ---- 3D ammo projectiles (rockets + plasma/bullet bolts + glowing tracer cores)
  const rockets = sim.state.rockets;
  for (let i = 0; i < rocketNodes.length; i++) {
    if (i < rockets.length) {
      const r = rockets[i]!;
      const ry = r.y ?? 1.18;
      const projYaw = Math.atan2(r.vx, r.vz);
      const isRocket = r.kind === "rocket" || r.fromEnemy;
      rocketNodes[i]!.setPosition(r.x + ox, ry, r.z);
      rocketNodes[i]!.setRotation(0, projYaw, r.t * 16);
      rocketNodes[i]!.setScale(isRocket ? 0.36 : 0.28);
      rocketNodes[i]!.setVisible(true);
      tracerNodes[i]!.setPosition(r.x + ox - r.dx * 0.16, ry, r.z - r.dz * 0.16);
      tracerNodes[i]!.setRotation(0, projYaw, 0);
      tracerNodes[i]!.setScale(isRocket ? [1.25, 1.25, 1.4] : [0.95, 0.95, 1.15]);
      tracerNodes[i]!.setVisible(true);
    } else {
      rocketNodes[i]!.setVisible(false);
      rocketNodes[i]!.setPosition(0, -50, 0);
      tracerNodes[i]!.setVisible(false);
      tracerNodes[i]!.setPosition(0, -50, 0);
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
      if (firstSight(s)) fireVfx("enemy-fire", [s.x0 + ox, s.y0, s.z0]);
    } else {
      enemyTracerNodes[i]!.setVisible(false); enemyTracerNodes[i]!.setPosition(0, -50, 0);
    }
  }
  // ---- BZ-03: blasts and impacts are one burst each, fired the first frame the sim record is seen
  for (const e of sim.state.explosions) if (e.t < 0.55 && firstSight(e)) fireVfx("rocket-or-barrel-blast", [e.x + ox, 1.0, e.z]);
  for (const s of sim.state.shots) {
    if (s.t >= 0.25 || !firstSight(s)) continue;
    fireVfx("bullet-impact", [s.x + ox, 1.18, s.z]);
    fireVfx("wall-chip", [s.x + ox, 1.18, s.z]);
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
  const totalStepDt = Math.min(0.1, Math.max(1 / 240, dt));
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
  if (!appReady || !sim) return;
  const now = performance.now();
  const wallDt = Math.min(1, Math.max(0, (now - lastWall) / 1000));
  lastWall = now;
  const paused = isPaused();
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
});

// ---------------------------------------------------------------------------
function handleEvent(ev: string) {
  const [type, a, b] = ev.split(":");
  switch (type) {
    case "fire": cue(a === "pistol" ? "pistol" : a === "mg" ? "mg" : a === "rocket" ? "rocket" : a === "dry" ? "dry" : "knife"); mg.juice?.fire("fire"); break;
    case "hit": cue("hit"); elCross.classList.add("hit"); setTimeout(() => elCross.classList.remove("hit"), 90); break;
    case "kill": cue("kill"); mg.juice?.fire("kill"); feed(`kill confirmed — ${a}`); break;
    case "hurt": cue("hurt"); mg.juice?.fire("hurt"); if (Number(a) >= BZ_CA_PULSE.minDamage) caHitAt = performance.now(); break;
    case "dog": cue("bite"); break;
    case "step": cue("step"); break;
    case "secret": cue("secret"); mg.juice?.fire("secret"); feed("push-wall revealed a secret"); eventVfx("push-wall"); break;
    case "pickup": cue(a === "key" ? "key" : a === "mg" || a === "rocket" ? "weapon" : "pickup"); feed(a === "key" ? "brass key secured" : `${a} collected`); eventVfx("pickup"); break;
    case "door": cue("door"); eventVfx("door-slide"); break;
    case "reload": cue("reload"); break;
    case "weapon": cue("switch"); break;
    case "rocket": cue("boom"); break;
    case "barrel": cue("boom"); mg.juice?.fire("fire"); break;
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
    elAmmo.textContent = p.reloading > 0 ? "RELOADING" : ammoStr;
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
    dismissIntro() { dismissIntro(); return true; }
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
void mg.ready().then(() => {
  appReady = true;
  lastWall = performance.now();
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
}).catch((err: unknown) => {
  const el = document.getElementById("render-error") ?? document.createElement("div");
  el.id = "render-error"; el.className = "render-error";
  el.textContent = `Bunker Zero failed to start: ${err instanceof Error ? err.message : String(err)}`;
  document.body.append(el);
});
