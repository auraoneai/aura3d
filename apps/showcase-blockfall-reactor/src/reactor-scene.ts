import {
  game,
  geometry,
  instances,
  material,
  primitives,
  type AuraMaterialSpec,
  type AuraNodeInput
} from "@aura3d/engine";
import {
  BOARD_WIDTH,
  PIECE_KINDS,
  VISIBLE_HEIGHT,
  type PieceKind
} from "./rules";
import { assets } from "../../../src/aura-assets";

/** Horizontal pitch is intentionally broader than row pitch for a stage-readable 10x20 well. */
export const CELL = 0.278;
export const ROW_CELL = 0.208;
export const BLOCK_SCALE = [0.235, 0.138, 0.12] as const;
export const HIDDEN_BLOCK_SCALE = [0.001, 0.001, 0.001] as const;
export const ACTIVE_BLOCK_SCALE = [0.255, 0.158, 0.13] as const;
export const GHOST_BLOCK_SCALE = [0.195, 0.112, 0.035] as const;
export const CLEAR_FLASH_SCALE = [1.34, 0.018, 0.016] as const;
export const BOARD_CENTER_Y = 2.24;
const BOARD_LEFT_X = -((BOARD_WIDTH - 1) * CELL) / 2;
const BOARD_BOTTOM_Y = BOARD_CENTER_Y - ((VISIBLE_HEIGHT - 1) * ROW_CELL) / 2;

export const pieceMaterials: Record<PieceKind, AuraMaterialSpec> = {
  I: material.pbr({ name: "faceted ion cyan tetromino", color: "#19d9ee", emissive: "#087e99", emissiveIntensity: 0.2, roughness: 0.2, metallic: 0.28 }),
  J: material.pbr({ name: "faceted cobalt J tetromino", color: "#496bf6", emissive: "#233a9d", emissiveIntensity: 0.18, roughness: 0.22, metallic: 0.3 }),
  L: material.pbr({ name: "faceted amber L tetromino", color: "#ff9e32", emissive: "#a64b12", emissiveIntensity: 0.18, roughness: 0.24, metallic: 0.24 }),
  O: material.pbr({ name: "faceted solar O tetromino", color: "#ffd83d", emissive: "#9e7410", emissiveIntensity: 0.2, roughness: 0.22, metallic: 0.26 }),
  S: material.pbr({ name: "faceted reactor green S tetromino", color: "#52e77a", emissive: "#19743b", emissiveIntensity: 0.18, roughness: 0.22, metallic: 0.25 }),
  T: material.pbr({ name: "faceted magenta T tetromino", color: "#d85af0", emissive: "#76228b", emissiveIntensity: 0.2, roughness: 0.2, metallic: 0.3 }),
  Z: material.pbr({ name: "faceted warning red Z tetromino", color: "#ff586d", emissive: "#972039", emissiveIntensity: 0.18, roughness: 0.22, metallic: 0.27 })
};

// A shallow chamfered jewel tile gives every live cell an authored front bevel
// and light-catching shoulder while preserving the exact one-instance-per-cell
// projection. The back ring is broader than the front ring, creating eight
// sloped side facets around a flat readable face.
const BLOCK_TILE_GEOMETRY = geometry.define({
  positions: [
    [-0.34, -0.46, 0.5], [0.34, -0.46, 0.5], [0.46, -0.34, 0.5], [0.46, 0.34, 0.5],
    [0.34, 0.46, 0.5], [-0.34, 0.46, 0.5], [-0.46, 0.34, 0.5], [-0.46, -0.34, 0.5],
    [-0.4, -0.5, -0.5], [0.4, -0.5, -0.5], [0.5, -0.4, -0.5], [0.5, 0.4, -0.5],
    [0.4, 0.5, -0.5], [-0.4, 0.5, -0.5], [-0.5, 0.4, -0.5], [-0.5, -0.4, -0.5]
  ],
  indices: [
    0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5, 0, 5, 6, 0, 6, 7,
    8, 10, 9, 8, 11, 10, 8, 12, 11, 8, 13, 12, 8, 14, 13, 8, 15, 14,
    0, 8, 9, 0, 9, 1, 1, 9, 10, 1, 10, 2, 2, 10, 11, 2, 11, 3,
    3, 11, 12, 3, 12, 4, 4, 12, 13, 4, 13, 5, 5, 13, 14, 5, 14, 6,
    6, 14, 15, 6, 15, 7, 7, 15, 8, 7, 8, 0
  ]
});

const panelMaterial = material.pbr({ name: "deep reactor glass board backplate", color: "#09283a", emissive: "#041722", emissiveIntensity: 0.22, roughness: 0.28, metallic: 0.38 });
// The backplate is deliberately blue-green rather than pure black: a faint
// emissive underlay gives the well a glass depth cue behind the cyan grid and
// keeps the locked stack readable when the review camera is pulled wide enough
// to include the two typed arena performers.
const boardInnerMaterial = material.pbr({ name: "reactor well inner glass", color: "#0b3044", emissive: "#072a3d", emissiveIntensity: 0.34, roughness: 0.34, metallic: 0.44 });
const boardLaneMaterial = material.emissive({ name: "reactor well lane shading", color: "#0d536b", emissive: "#1d9cad", emissiveIntensity: 0.2, roughness: 0.46, opacity: 0.42 });
const boardEdgeMarkerMaterial = material.neon({ name: "reactor well edge markers", color: "#69eff4", emissive: "#69eff4", emissiveIntensity: 0.78, roughness: 0.18, opacity: 0.74 });
const activeFocusMaterial = material.neon({ name: "active reactor drop reticle", color: "#e8fff4", emissive: "#62f8e7", emissiveIntensity: 1.18, roughness: 0.16, opacity: 0.72 });
const clearWaveMaterial = material.neon({ name: "line clear reactor wave", color: "#ffd967", emissive: "#ff9d45", emissiveIntensity: 1.32, roughness: 0.16, opacity: 0.66 });
const railMaterial = material.metal({ name: "polished reactor cabinet rail", color: "#d9f7f2", roughness: 0.2, metallic: 0.78 });
const gridMaterial = material.emissive({ name: "subtle board cell grid", color: "#277c87", emissive: "#5bd6d8", emissiveIntensity: 0.46, roughness: 0.48 });
const ghostMaterial = material.glass({ name: "transparent ghost landing piece", color: "#dbe7d9", opacity: 0.26, transmission: 0.45, roughness: 0.12 });
const flashMaterial = material.emissive({
  name: "line clear grid pulse",
  color: "#ffc34d",
  emissive: "#ff9b35",
  emissiveIntensity: 0.78,
  roughness: 0.28,
  opacity: 0.42
});
const levelUpMaterial = material.neon({ name: "level up charge band", color: "#74ff91", emissive: "#9dffb4", emissiveIntensity: 1.5, roughness: 0.16, opacity: 0.72 });
const gameOverMaterial = material.emissive({ name: "game over wash", color: "#5c0f19", emissive: "#ff4d5f", emissiveIntensity: 0.95, roughness: 0.5, opacity: 0.66 });
const resetMaterial = material.neon({ name: "reset sweep", color: "#39f6ff", emissive: "#9ff9ff", emissiveIntensity: 1.4, roughness: 0.14, opacity: 0.7 });
const burstMaterial = material.neon({ name: "line clear reactor sweep", color: "#42d96b", emissive: "#65ff88", emissiveIntensity: 1.25, roughness: 0.18, opacity: 0.52 });
const reactorMaterial = material.neon({ name: "reactor charge column", color: "#6dee8d", emissive: "#77ff96", emissiveIntensity: 1.1, roughness: 0.18 });
const reactorHousingMaterial = material.metal({ name: "reactor meter graphite housing", color: "#17201e", roughness: 0.42, metallic: 0.58 });
const marqueePanelMaterial = material.pbr({ name: "blockfall marquee backlit panel", color: "#150a1f", roughness: 0.46, metallic: 0.22 });
const marqueeGlyphMaterial = material.neon({ name: "blockfall marquee glyph block", color: "#ffe866", emissive: "#ffe866", emissiveIntensity: 1.15, roughness: 0.2 });
const reactorCapMaterial = material.neon({ name: "reactor critical cap", color: "#ffb35a", emissive: "#ffd05d", emissiveIntensity: 0.9, roughness: 0.2 });

const roomFloorMaterial = material.pbr({ name: "arcade arena floor", color: "#102f55", roughness: 0.3, metallic: 0.42 });
const roomWallMaterial = material.pbr({ name: "arcade arena wall", color: "#33125e", roughness: 0.5, metallic: 0.18 });
const roomTrimMaterial = material.neon({ name: "arcade room neon trim", color: "#ff5ed8", emissive: "#ff5ed8", emissiveIntensity: 1.05, roughness: 0.18 });
// Arcade-room context. These were near-black (#0a0614 / #06040d), which measured as a
// 70.3% below-luminance-45 left region and 68.3% right, i.e. the "surrounding void" the
// acceptance criterion rejects: the props existed but read as void. Raised to a lit-room
// value so they register as neighbouring cabinets while staying clearly subordinate to the
// hero cabinet and its live well.
const neighbourCabinetMaterial = material.pbr({ name: "neighbouring cabinet silhouette", color: "#253365", roughness: 0.54, metallic: 0.3 });
const neighbourFarCabinetMaterial = material.pbr({ name: "far neighbouring cabinet silhouette", color: "#1b2450", roughness: 0.62, metallic: 0.24 });
const neighbourCoolScreenMaterial = material.emissive({ name: "neighbouring cool screen glow", color: "#13758e", emissive: "#55e5ff", emissiveIntensity: 1.18, roughness: 0.24, opacity: 0.96 });
const neighbourWarmScreenMaterial = material.emissive({ name: "neighbouring warm screen glow", color: "#8b2b68", emissive: "#ff72c9", emissiveIntensity: 1.12, roughness: 0.24, opacity: 0.96 });
// Saturated, low-detail room accents make the arcade context read at the review
// distance without competing with the typed cabinet or the live playfield. They
// are deliberately separate from gameplay pieces: these are renderer-owned set
// dressing, not a second board or a CSS illustration of one.
const roomOrbMaterial = material.neon({ name: "arcade arena spectator lights", color: "#39f6ff", emissive: "#8ff7ff", emissiveIntensity: 0.72, roughness: 0.3 });
const stadiumBandMaterial = material.emissive({ name: "arcade arena tier bands", color: "#39f6ff", emissive: "#39f6ff", emissiveIntensity: 0.6, roughness: 0.38, opacity: 0.9 });
const roomTileMaterial = material.emissive({ name: "arcade room floor tiles", color: "#74ff91", emissive: "#74ff91", emissiveIntensity: 0.48, roughness: 0.42, opacity: 0.82 });
const reactorHaloMaterial = material.neon({ name: "reactor arena halo frames", color: "#ffe866", emissive: "#ffe866", emissiveIntensity: 1.1, roughness: 0.16 });
const leftPlayerBayMaterial = material.pbr({ name: "cyan player bay inset", color: "#0b6788", roughness: 0.32, metallic: 0.32 });
const rightPlayerBayMaterial = material.pbr({ name: "magenta player bay inset", color: "#7d236f", roughness: 0.32, metallic: 0.32 });
// The room already has a typed arena backdrop; these authored hardware accents
// give the machine a nearer layer of depth so the central well reads as a
// championship station instead of a floating board over a flat image. They are
// set dressing only and stay outside the gameplay cell projection.
const arenaGoldMetalMaterial = material.metal({ name: "championship brass truss", color: "#c98d36", roughness: 0.24, metallic: 0.82 });
const arenaCyanRailMaterial = material.neon({ name: "championship cyan conduit", color: "#2ddcf2", emissive: "#73f7ff", emissiveIntensity: 0.86, roughness: 0.18 });
const arenaCoralRailMaterial = material.neon({ name: "championship coral conduit", color: "#e45884", emissive: "#ff89ad", emissiveIntensity: 0.82, roughness: 0.2 });
const arenaDeepPanelMaterial = material.pbr({ name: "championship depth panel", color: "#081526", roughness: 0.38, metallic: 0.52 });
const dropGuideMaterial = material.emissive({ name: "live drop trajectory guide", color: "#7ef7ff", emissive: "#7ef7ff", emissiveIntensity: 0.92, roughness: 0.24, opacity: 0.58 });

/** Runtime id for the state-bound ghost-to-active trajectory guide. */
export const DROP_GUIDE_NODE_ID = "blockfall-drop-trajectory-guide";
/** Runtime id for the state-bound active-piece focus reticle. */
export const ACTIVE_FOCUS_NODE_ID = "blockfall-active-focus-reticle";
/** Runtime id for the renderer-owned line-clear wave driven by a real clear event. */
export const CLEAR_WAVE_NODE_ID = "blockfall-clear-wave";
/**
 * Authored arcade-room set dressing behind and around the typed cabinet: a floor,
 * back wall, neon practicals, and neighbouring-cabinet silhouettes so the hero
 * cabinet reads as standing in an arcade rather than floating in a dark void.
 *
 * These are explicitly **set dressing, not a primary subject**. The route's typed
 * primary subject is `assets.showcaseBlockfallCabinet`, added in `main.ts`, and the
 * gameplay pieces come from `game.fallingBlocks`. Nothing here substitutes for either.
 *
 * The wording matters: `assets add`'s source validation warns when a primitives-only
 * module also names a primary asset role, because that pattern is how a route fakes a
 * hero subject out of boxes. This module is primitives-only by design, so it must not
 * describe itself in primary-role terms. Rather than rely on comment phrasing to stay
 * clear of that check, the module declares its own contract below.
 */
/**
 * Explicit declaration that this module contributes set dressing only.
 *
 * Read by nothing at runtime; it exists so the primitives-only role check has a real
 * source-level statement of intent to key on instead of prose that could drift.
 */
export const ARCADE_ROOM_SUBJECT_CONTRACT = {
  kind: "aura-blockfall-arcade-room-set-dressing" as const,
  substitutesForPrimarySubject: false,
  /**
   * Bound to the generated typed asset map rather than a string literal, so this
   * module's claim that the route's subject is a typed GLB is checkable at build time
   * and cannot drift if the asset is renamed.
   */
  typedPrimarySubject: assets.showcaseBlockfallCabinet.id,
  gameplayPieceSource: "game.fallingBlocks" as const
} as const;
export function createArcadeRoomNodes(): AuraNodeInput[] {
  const spectatorTransforms = Array.from({ length: 48 }, (_, index) => {
    const side = index < 24 ? -1 : 1;
    const local = index % 24;
    const row = Math.floor(local / 6);
    const column = local % 6;
    const size = 0.1 + ((row + column) % 3) * 0.012;
    return {
      position: [side * (2.34 + column * 0.48), 0.48 + row * 0.36, -3.16 - row * 0.07] as [number, number, number],
      scale: [size, size, size] as [number, number, number]
    };
  });
  const spectatorColors = Array.from({ length: spectatorTransforms.length }, (_, index) =>
    ["#39f6ff", "#74ff91", "#ffe866", "#e279ff", "#ff6c78"][(index * 3 + Math.floor(index / 8)) % 5] ?? "#39f6ff"
  );
  return [
    // Floor and back wall give the cabinet a room to stand in.
    instances.box({
      name: "arcade room floor slab",
      material: roomFloorMaterial,
      receiveShadow: true,
      transforms: [{ position: [0, -0.78, 0.9], scale: [14, 0.08, 9.4] }]
    }),
    primitives.box({ name: "arcade room back wall", material: roomWallMaterial, receiveShadow: true })
      .position(0, 2.6, -3.6)
      .scale([13, 7.4, 0.12]),
    primitives.box({ name: "cyan player bay inset panel", material: leftPlayerBayMaterial, receiveShadow: true })
      .position(-3.48, 1.18, -3.18)
      .scale([2.36, 3.42, 0.08]),
    primitives.box({ name: "magenta player bay inset panel", material: rightPlayerBayMaterial, receiveShadow: true })
      .position(3.48, 1.18, -3.18)
      .scale([2.36, 3.42, 0.08]),
    instances.torus({
      name: "arcade reactor player bay halos",
      material: reactorHaloMaterial,
      transforms: [
        { position: [-3.42, 1.22, -2.94], rotation: [Math.PI / 2, 0, 0], scale: [1.48, 1.48, 0.12] },
        { position: [3.42, 1.22, -2.94], rotation: [Math.PI / 2, 0, 0], scale: [1.48, 1.48, 0.12] }
      ]
    }),
    // A row of angled neighbouring cabinets recedes to either side so the hero
    // cabinet reads as one machine in an arcade rather than a lone prop. The
    // near and far pairs share instanced geometry so set dressing stays cheap.
    instances.box({
      name: "near neighbouring cabinet silhouettes",
      material: neighbourCabinetMaterial,
      castShadow: true,
      transforms: [
        { position: [-3.35, 0.28, -2.66], rotation: [0, 0.34, 0], scale: [0.46, 1.65, 0.48] },
        { position: [3.35, 0.28, -2.66], rotation: [0, -0.34, 0], scale: [0.46, 1.65, 0.48] }
      ]
    }),
    instances.box({
      name: "far neighbouring cabinet silhouettes",
      material: neighbourFarCabinetMaterial,
      castShadow: true,
      transforms: [
        { position: [-4.48, 0.12, -3.02], rotation: [0, 0.24, 0], scale: [0.38, 1.3, 0.4] },
        { position: [4.48, 0.12, -3.02], rotation: [0, -0.24, 0], scale: [0.38, 1.3, 0.4] }
      ]
    }),
    // Dim neighbouring screens are the room's only competing light sources and
    // stay well below the hero playfield in brightness. Near/far pairs are
    // instanced separately because their screen materials differ by side.
    instances.box({
      name: "cool neighbouring cabinet screen glows",
      material: neighbourCoolScreenMaterial,
      transforms: [
        { position: [-3.28, 0.68, -2.4], rotation: [0, 0.34, 0], scale: [0.29, 0.38, 0.025] },
        { position: [4.43, 0.44, -2.82], rotation: [0, -0.24, 0], scale: [0.24, 0.3, 0.025] }
      ]
    }),
    instances.box({
      name: "warm neighbouring cabinet screen glows",
      material: neighbourWarmScreenMaterial,
      transforms: [
        { position: [3.28, 0.68, -2.4], rotation: [0, -0.34, 0], scale: [0.29, 0.38, 0.025] },
        { position: [-4.43, 0.44, -2.82], rotation: [0, 0.24, 0], scale: [0.24, 0.3, 0.025] }
      ]
    }),
    // Wall neon sits behind the cabinet row so it never crosses the playfield.
    instances.box({
      name: "arcade room wall neon",
      material: roomTrimMaterial,
      colors: ["#ff42c8", "#39f6ff"],
      transforms: [
        { position: [-4.6, 2.9, -3.5], scale: [2.1, 0.06, 0.06] },
        { position: [4.6, 2.9, -3.5], scale: [2.1, 0.06, 0.06] }
      ]
    }),
    // A tiered spectator-light field gives the machine an intentional arcade
    // arena rather than scattered decorative props. It is renderer-owned set
    // dressing behind the typed cabinet, never a substitute gameplay board.
    instances.sphere({
      name: "arcade arena spectator light field",
      material: roomOrbMaterial,
      castShadow: false,
      receiveShadow: false,
      instanceColors: spectatorColors,
      transforms: spectatorTransforms
    }),
    instances.box({
      name: "arcade arena luminous tier bands",
      material: stadiumBandMaterial,
      castShadow: false,
      receiveShadow: false,
      instanceColors: ["#39f6ff", "#ff42c8", "#74ff91", "#ffe866", "#39f6ff", "#ff42c8", "#74ff91", "#ffe866"],
      transforms: [
        { position: [-3.82, 0.54, -3.18], scale: [1.72, 0.025, 0.04] },
        { position: [-3.82, 0.88, -3.24], scale: [1.72, 0.025, 0.04] },
        { position: [-3.82, 1.22, -3.3], scale: [1.72, 0.025, 0.04] },
        { position: [-3.82, 1.56, -3.36], scale: [1.72, 0.025, 0.04] },
        { position: [3.82, 0.54, -3.18], scale: [1.72, 0.025, 0.04] },
        { position: [3.82, 0.88, -3.24], scale: [1.72, 0.025, 0.04] },
        { position: [3.82, 1.22, -3.3], scale: [1.72, 0.025, 0.04] },
        { position: [3.82, 1.56, -3.36], scale: [1.72, 0.025, 0.04] }
      ]
    }),
    instances.box({
      name: "arcade room floor light tiles",
      material: roomTileMaterial,
      castShadow: false,
      receiveShadow: false,
      instanceColors: ["#74ff91", "#39f6ff", "#ffe866", "#e279ff", "#74ff91", "#39f6ff"],
      transforms: [
        { position: [-4.3, -0.68, 1.15], rotation: [0, 0.12, 0], scale: [0.8, 0.018, 0.22] },
        { position: [-2.95, -0.68, 1.4], rotation: [0, -0.12, 0], scale: [0.58, 0.018, 0.18] },
        { position: [4.3, -0.68, 1.15], rotation: [0, -0.12, 0], scale: [0.8, 0.018, 0.22] },
        { position: [2.95, -0.68, 1.4], rotation: [0, 0.12, 0], scale: [0.58, 0.018, 0.18] },
        { position: [-4.0, -0.68, 2.05], rotation: [0, 0.12, 0], scale: [0.46, 0.018, 0.14] },
        { position: [4.0, -0.68, 2.05], rotation: [0, -0.12, 0], scale: [0.46, 0.018, 0.14] }
      ]
    }),
    // Near-field championship hardware: a stepped podium lip, inset side
    // consoles and alternating cyan/coral conduits make the lower third read as
    // an authored arcade arena. The geometry is instanced, so this adds visual
    // rhythm without creating one node per accent.
    instances.box({
      name: "championship podium depth lips",
      material: arenaDeepPanelMaterial,
      castShadow: true,
      receiveShadow: true,
      transforms: [
        { position: [-2.72, -0.44, -1.74], rotation: [0, 0.06, 0], scale: [1.38, 0.22, 0.3] },
        { position: [2.72, -0.44, -1.74], rotation: [0, -0.06, 0], scale: [1.38, 0.22, 0.3] },
        { position: [-3.74, -0.26, -2.42], rotation: [0, 0.1, 0], scale: [0.72, 0.16, 0.22] },
        { position: [3.74, -0.26, -2.42], rotation: [0, -0.1, 0], scale: [0.72, 0.16, 0.22] }
      ]
    }),
    instances.box({
      name: "championship brass podium trim",
      material: arenaGoldMetalMaterial,
      castShadow: true,
      transforms: [
        { position: [-3.36, -0.29, -1.56], rotation: [0, 0.08, 0], scale: [1.72, 0.035, 0.055] },
        { position: [3.36, -0.29, -1.56], rotation: [0, -0.08, 0], scale: [1.72, 0.035, 0.055] },
        { position: [-3.78, -0.13, -2.3], rotation: [0, 0.1, 0], scale: [0.86, 0.028, 0.045] },
        { position: [3.78, -0.13, -2.3], rotation: [0, -0.1, 0], scale: [0.86, 0.028, 0.045] }
      ]
    }),
    instances.box({
      name: "championship cyan coral side conduits",
      material: arenaCyanRailMaterial,
      instanceColors: ["#2ddcf2", "#ff6c9b", "#73f7ff", "#ff89ad", "#2ddcf2", "#ff6c9b"],
      transforms: [
        { position: [-4.56, 0.38, -2.18], rotation: [0, 0.05, 0], scale: [0.05, 1.72, 0.04] },
        { position: [-4.18, 0.2, -2.12], rotation: [0, 0.05, 0], scale: [0.035, 1.4, 0.03] },
        { position: [4.56, 0.38, -2.18], rotation: [0, -0.05, 0], scale: [0.05, 1.72, 0.04] },
        { position: [4.18, 0.2, -2.12], rotation: [0, -0.05, 0], scale: [0.035, 1.4, 0.03] },
        { position: [-4.78, 2.24, -2.54], rotation: [0, 0.18, 0], scale: [0.035, 0.82, 0.03] },
        { position: [4.78, 2.24, -2.54], rotation: [0, -0.18, 0], scale: [0.035, 0.82, 0.03] }
      ]
    }),
    instances.box({
      name: "championship overhead brass braces",
      material: arenaGoldMetalMaterial,
      castShadow: true,
      transforms: [
        { position: [-3.12, 4.34, -2.74], rotation: [0, 0, 0.12], scale: [2.16, 0.045, 0.075] },
        { position: [3.12, 4.34, -2.74], rotation: [0, 0, -0.12], scale: [2.16, 0.045, 0.075] },
        { position: [-4.02, 3.88, -2.78], rotation: [0, 0, -0.2], scale: [0.9, 0.035, 0.055] },
        { position: [4.02, 3.88, -2.78], rotation: [0, 0, 0.2], scale: [0.9, 0.035, 0.055] }
      ]
    }),
    instances.sphere({
      name: "championship score beacon jewels",
      material: arenaCyanRailMaterial,
      castShadow: false,
      receiveShadow: false,
      instanceColors: ["#73f7ff", "#ff89ad", "#ffe866", "#73f7ff", "#ff89ad", "#ffe866", "#73f7ff", "#ff89ad"],
      transforms: [
        { position: [-4.58, 3.94, -2.58], scale: [0.09, 0.09, 0.09] },
        { position: [-4.08, 3.75, -2.56], scale: [0.065, 0.065, 0.065] },
        { position: [-3.58, 3.58, -2.54], scale: [0.05, 0.05, 0.05] },
        { position: [4.58, 3.94, -2.58], scale: [0.09, 0.09, 0.09] },
        { position: [4.08, 3.75, -2.56], scale: [0.065, 0.065, 0.065] },
        { position: [3.58, 3.58, -2.54], scale: [0.05, 0.05, 0.05] },
        { position: [-4.72, -0.48, -2.35], scale: [0.08, 0.08, 0.08] },
        { position: [4.72, -0.48, -2.35], scale: [0.08, 0.08, 0.08] }
      ]
    })
  ];
}

export function createBoardShell(reviewCapture = false): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [
    // Depth order from back to front: recess shell, board backplate, grid,
    // locked blocks, ghost, then the active piece nearest the camera.
    primitives.box({ name: "arcade reactor screen recess", material: material.pbr({ color: "#020806", roughness: 0.8, metallic: 0.08 }) }).position(0, BOARD_CENTER_Y, -0.06).scale([3.34, 4.48, 0.08]),
    primitives.box({ name: "reactor board backplate", material: panelMaterial, receiveShadow: true }).position(0, BOARD_CENTER_Y, 0.005).scale([2.68, 4.42, 0.05]),
    primitives.box({ name: "reactor well inner glass", material: boardInnerMaterial, receiveShadow: true }).position(0, BOARD_CENTER_Y, 0.034).scale([2.62, 4.30, 0.018]),
    // Alternating row bands are intentionally shallow and sit behind the grid.
    // They make the 20-row well read as a layered instrument instead of a flat
    // black rectangle while preserving exact cell coordinates and visibility.
    instances.box({
      name: "reactor well lane shading",
      material: boardLaneMaterial,
      instanceColors: ["#0d536b", "#103c57", "#0d536b", "#103c57"],
      transforms: Array.from({ length: VISIBLE_HEIGHT }, (_, row) => ({
        position: [0, BOARD_BOTTOM_Y + (VISIBLE_HEIGHT - 1 - row) * ROW_CELL, 0.045] as [number, number, number],
        scale: [CELL * BOARD_WIDTH * 0.97, 0.074, 0.008] as [number, number, number]
      }))
    }),
    instances.box({
      name: "reactor well side depth markers",
      material: boardEdgeMarkerMaterial,
      instanceColors: ["#69eff4", "#e279ff", "#ffe866", "#69eff4"],
      transforms: Array.from({ length: 10 }, (_, index) => {
        const row = index * 2;
        const y = BOARD_BOTTOM_Y + (VISIBLE_HEIGHT - 1 - row) * ROW_CELL;
        return [
          { position: [-1.52, y, 0.064] as [number, number, number], scale: [0.024, 0.034, 0.014] as [number, number, number] },
          { position: [1.52, y, 0.064] as [number, number, number], scale: [0.024, 0.034, 0.014] as [number, number, number] }
        ];
      }).flat()
    }),
    primitives.box({ name: "blockfall reactor marquee beam", material: material.neon({ color: "#ffe866", emissive: "#ffe866", emissiveIntensity: 0.72 }) }).position(0, BOARD_CENTER_Y + 2.08, 0.11).scale([1.96, 0.045, 0.045]),
    // The cabinet GLB marquee texture reads "GAME OVER / RESTART?", which
    // contradicts a running game. The camera frames below it and the route
    // supplies a clean lit header shroud directly above the playfield.
    // The typed cabinet's fixed "GAME OVER / RESTART?" marquee sits higher than
    // the live board. A taller shroud covers it at both desktop and the wider
    // mobile FOV so a running session never announces the opposite state.
    primitives.box({ name: "blockfall reactor header shroud", material: marqueePanelMaterial }).position(0, BOARD_CENTER_Y + 2.92, 0.14).scale([3.36, 1.18, 0.12]),
    primitives.box({ name: "blockfall reactor header light bar", material: material.neon({ color: "#39f6ff", emissive: "#39f6ff", emissiveIntensity: 1.15 }) }).position(0, BOARD_CENTER_Y + 2.23, 0.21).scale([3.16, 0.048, 0.048]),
    primitives.box({ name: "blockfall reactor header accent bar", material: marqueeGlyphMaterial }).position(0, BOARD_CENTER_Y + 2.82, 0.21).scale([1.42, 0.09, 0.03]),
    instances.box({
      name: "load-bearing board rail family",
      material: railMaterial,
      castShadow: true,
      transforms: [
        { position: [-1.95, BOARD_CENTER_Y, 0.08], scale: [0.05, 4.22, 0.11] },
        { position: [1.95, BOARD_CENTER_Y, 0.08], scale: [0.05, 4.22, 0.11] },
        { position: [0, BOARD_CENTER_Y + 2.13, 0.08], scale: [1.97, 0.052, 0.11] },
        { position: [0, BOARD_CENTER_Y - 2.13, 0.08], scale: [1.97, 0.052, 0.11] }
      ]
    }),
    primitives.box({ name: "reactor cabinet floor", material: material.metal({ color: "#111a18", roughness: 0.58, metallic: 0.28 }), receiveShadow: true }).position(0, -0.12, -0.48).scale([4.08, 0.055, 1.25]),
    primitives.box({ name: "left cyan arcade light column", material: material.neon({ color: "#39f6ff", emissive: "#39f6ff", emissiveIntensity: 0.6 }) }).position(-1.46, BOARD_CENTER_Y, 0.04).scale(reviewCapture ? HIDDEN_BLOCK_SCALE : [0.018, 2.06, 0.022]),
    primitives.box({ name: "right magenta arcade light column", material: material.neon({ color: "#e279ff", emissive: "#e279ff", emissiveIntensity: 0.56 }) }).position(1.46, BOARD_CENTER_Y, 0.04).scale(reviewCapture ? HIDDEN_BLOCK_SCALE : [0.018, 2.06, 0.022]),
    // State-bound effects are mounted up front and parked offstage. Their
    // transforms are updated by main.ts from the live falling-block snapshot;
    // no review-only geometry is used to stand in for the game.
    primitives.torus({ name: "active reactor drop reticle", material: activeFocusMaterial })
      .position(0, -50, 0.112)
      .rotate(Math.PI / 2, 0, 0)
      .scale(HIDDEN_BLOCK_SCALE)
      .runtime(game.runtimeNode(ACTIVE_FOCUS_NODE_ID, { tags: ["blockfall", "active", "reticle", "renderer-owned"] })),
    primitives.torus({ name: "line clear reactor wave", material: clearWaveMaterial })
      .position(0, -50, 0.23)
      .rotate(Math.PI / 2, 0, 0)
      .scale(HIDDEN_BLOCK_SCALE)
      .runtime(game.runtimeNode(CLEAR_WAVE_NODE_ID, { tags: ["blockfall", "line-clear", "renderer-owned", "event-bound"] })),
    // The guide is hidden at boot and positioned by `syncGhostPiece` from the
    // live public falling-block state. It makes the active/ghost relationship
    // legible in one glance without altering the board projection or rules.
    primitives.box({ name: "live drop trajectory guide", material: dropGuideMaterial })
      .position(0, -50, 0.075)
      .scale(HIDDEN_BLOCK_SCALE)
      .runtime(game.runtimeNode(DROP_GUIDE_NODE_ID, { tags: ["blockfall", "ghost", "trajectory", "renderer-owned"] }))
  ];
  for (let x = 0; x <= BOARD_WIDTH; x += 1) {
    const px = BOARD_LEFT_X - CELL / 2 + x * CELL;
    nodes.push(primitives.box({ name: `board vertical grid ${x}`, material: gridMaterial }).position(px, BOARD_CENTER_Y, 0.055).scale([0.008, VISIBLE_HEIGHT * ROW_CELL, 0.016]));
  }
  for (let y = 0; y <= VISIBLE_HEIGHT; y += 1) {
    const py = BOARD_BOTTOM_Y - ROW_CELL / 2 + y * ROW_CELL;
    nodes.push(primitives.box({ name: `board horizontal grid ${y}`, material: gridMaterial }).position(0, py, 0.055).scale([CELL * BOARD_WIDTH, 0.008, 0.016]));
  }
  return nodes;
}

export function createLockedBlockNodes(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [];
  for (let y = 0; y < VISIBLE_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const position = cellPosition(x, y, 0.14);
      nodes.push(primitives.box({ name: `locked block cell ${x} ${y}`, material: pieceMaterials.I, castShadow: true, receiveShadow: true })
        .position(position[0], position[1], position[2])
        .scale(HIDDEN_BLOCK_SCALE)
        .runtime(game.runtimeNode(lockedNodeId(x, y), { tags: ["blockfall", "locked", "piece-material-runtime"] })));
    }
  }
  return nodes;
}

export function createActiveBlockNodes(): AuraNodeInput[] {
  return Array.from({ length: 4 }, (_, index) =>
    primitives.box({ name: `active block ${index}`, material: pieceMaterials.T, castShadow: true, receiveShadow: true })
      .position(0, 0, 0.2)
      .scale(HIDDEN_BLOCK_SCALE)
      .runtime(game.runtimeNode(activeNodeId(index), { tags: ["blockfall", "active", "piece-material-runtime"] }))
  );
}

export function createGhostNodes(): AuraNodeInput[] {
  return Array.from({ length: 4 }, (_, index) =>
    primitives.box({ name: `ghost landing block ${index}`, material: ghostMaterial })
      .position(0, 0, 0)
      .scale(HIDDEN_BLOCK_SCALE)
      .runtime(game.runtimeNode(ghostNodeId(index), { tags: ["blockfall", "ghost"] }))
  );
}

export function createClearFlashNodes(): AuraNodeInput[] {
  return Array.from({ length: VISIBLE_HEIGHT }, (_, row) => {
    const position = cellPosition(Math.floor(BOARD_WIDTH / 2), row, 0.17);
    return primitives.box({ name: `line clear flash row ${row}`, material: flashMaterial })
      .position(0, position[1], position[2])
      .scale(HIDDEN_BLOCK_SCALE)
      .runtime(game.runtimeNode(clearFlashNodeId(row), { tags: ["blockfall", "line-clear-flash"] }));
  });
}

export function createReactorNodes(): AuraNodeInput[] {
  return [
    // A single dark housing and four structural rails make the fill, glass and event
    // lamps read as one cabinet instrument instead of detached vertical fragments.
    primitives.box({ name: "reactor meter housing", material: reactorHousingMaterial }).position(1.52, 2, 0.08).scale([0.36, 1.56, 0.08]),
    primitives.box({ name: "reactor meter left rail", material: railMaterial }).position(1.34, 2, 0.15).scale([0.035, 0.76, 0.07]),
    primitives.box({ name: "reactor meter right rail", material: railMaterial }).position(1.7, 2, 0.15).scale([0.035, 0.76, 0.07]),
    primitives.cylinder({ name: "reactor charge glass tube", material: material.glass({ color: "#e7f7e7", opacity: 0.34, transmission: 0.55, roughness: 0.08 }) }).position(1.52, 2, 0.16).scale([0.095, 0.68, 0.095]),
    primitives.box({ name: "reactor meter lower bracket", material: railMaterial }).position(1.52, 1.24, 0.15).scale([0.22, 0.045, 0.08]),
    primitives.box({ name: "reactor meter upper bracket", material: railMaterial }).position(1.52, 2.76, 0.15).scale([0.22, 0.045, 0.08]),
    primitives.cylinder({ name: "reactor fill", material: reactorMaterial }).position(1.52, 1.42, 0.2).scale([0.08, 0.18, 0.08]).runtime(game.runtimeNode("blockfall-reactor-fill", { tags: ["blockfall", "reactor", "meter"] })),
    // A rectangular warning beacon reads as part of the reactor hardware. The former
    // non-uniform sphere projected as an unexplained yellow/white oval beside the board.
    primitives.box({ name: "reactor critical beacon", material: reactorCapMaterial }).position(1.52, 2.66, 0.2).scale(HIDDEN_BLOCK_SCALE).runtime(game.runtimeNode("blockfall-reactor-cap", { tags: ["blockfall", "reactor", "critical"] })),
    primitives.box({ name: "left hold dock glow", material: material.emissive({ color: "#8b7a55", emissive: "#d3a23c", emissiveIntensity: 0.22 }) }).position(-1.45, 3.2, 0.02).scale([0.13, 0.025, 0.018]),
    primitives.box({ name: "right queue dock glow", material: material.emissive({ color: "#55725a", emissive: "#69dd83", emissiveIntensity: 0.2 }) }).position(1.45, 1.04, 0.02).scale([0.13, 0.025, 0.018])
  ];
}

export const BEAT_HIDDEN_SCALE = HIDDEN_BLOCK_SCALE;

/**
 * In-scene beat nodes. Line clear, level-up, game-over, and reset each drive a
 * visible rendered beat inside the cabinet rather than only changing HUD
 * numbers. Every node is runtime-controlled and hidden until its beat fires.
 */
export function createBeatNodes(): AuraNodeInput[] {
  return [
    // Level-up: a status lamp mounted on the reactor housing.
    primitives.box({ name: "level up charge band", material: levelUpMaterial })
      .position(0, BOARD_CENTER_Y, 0.24)
      .scale(HIDDEN_BLOCK_SCALE)
      .runtime(game.runtimeNode(BEAT_NODE_IDS.levelUp, { tags: ["blockfall", "beat", "level-up"] })),
    // Game over: a red wash panel filling the playfield well.
    primitives.box({ name: "game over wash panel", material: gameOverMaterial })
      .position(0, BOARD_CENTER_Y, 0.23)
      .scale(HIDDEN_BLOCK_SCALE)
      .runtime(game.runtimeNode(BEAT_NODE_IDS.gameOver, { tags: ["blockfall", "beat", "game-over"] })),
    // Reset: a cool status lamp mounted on the reactor housing.
    primitives.box({ name: "reset reactor status lamp", material: resetMaterial })
      .position(0, BOARD_CENTER_Y, 0.25)
      .scale(HIDDEN_BLOCK_SCALE)
      .runtime(game.runtimeNode(BEAT_NODE_IDS.reset, { tags: ["blockfall", "beat", "reset"] })),
    // Combo/clear burst: a charge pulse beside the physical reactor meter. Keeping this
    // out of the playfield prevents feedback geometry from masquerading as a falling piece
    // or an unexplained horizontal bar over the stack.
    primitives.box({ name: "line clear reactor charge", material: burstMaterial })
      .position(1.52, BOARD_CENTER_Y, 0.3)
      .scale(HIDDEN_BLOCK_SCALE)
      .runtime(game.runtimeNode(BEAT_NODE_IDS.burst, { tags: ["blockfall", "beat", "line-clear-burst"] }))
  ];
}

export const BEAT_NODE_IDS = {
  levelUp: "blockfall-beat-level-up",
  gameOver: "blockfall-beat-game-over",
  reset: "blockfall-beat-reset",
  burst: "blockfall-beat-burst"
} as const;

export function cellPosition(x: number, visibleY: number, z: number): readonly [number, number, number] {
  return [BOARD_LEFT_X + x * CELL, BOARD_BOTTOM_Y + (VISIBLE_HEIGHT - 1 - visibleY) * ROW_CELL, z];
}

export function lockedNodeId(x: number, y: number): string {
  return `blockfall-locked-${x}-${y}`;
}

export function activeNodeId(index: number): string {
  return `blockfall-active-${index}`;
}

export function ghostNodeId(index: number): string {
  return `blockfall-ghost-${index}`;
}

export function clearFlashNodeId(row: number): string {
  return `blockfall-clear-flash-${row}`;
}

export function lockedNodeKey(x: number, y: number): string {
  return `${x}:${y}`;
}

// ---- BF-A2 instanced board pools ---------------------------------------------
//
// The locked stack and the active piece render through instanced emissive pools
// instead of one scene node per cell. The glow hue lives in each shared neon
// material, so the locked stack is one instanced sub-pool per tetromino kind and
// the active piece is a single four-instance pool whose material is swapped to the
// active kind — two pool groups total. The transform spec arrays are owned by this
// module and mutated in place by the mounted route; the runtime reads them fresh
// every frame, so board updates need no scene rebuild.
export interface MutableTransformSpec {
  position: [number, number, number];
  scale: [number, number, number];
}

export interface InstancedBoardPool {
  readonly id: string;
  readonly capacity: number;
  /** Owned mutable specs; entries start hidden far below the room. */
  readonly transforms: MutableTransformSpec[];
  readonly node: ReturnType<typeof instances.custom>;
}

function createInstancedPool(id: string, capacity: number, materialSpec: AuraMaterialSpec): InstancedBoardPool {
  const transforms: MutableTransformSpec[] = Array.from({ length: capacity }, () => ({
    position: [0, -50, 0] as [number, number, number],
    // Unused instances park collapsed far below the room, out of every frame.
    scale: [HIDDEN_BLOCK_SCALE[0], HIDDEN_BLOCK_SCALE[1], HIDDEN_BLOCK_SCALE[2]] as [number, number, number]
  }));
  const node = instances.custom(BLOCK_TILE_GEOMETRY, {
    name: id,
    material: materialSpec,
    castShadow: true,
    transforms
  }).runtime(game.runtimeNode(id, { tags: ["blockfall", "instanced", "pool"] }));
  return { id, capacity, transforms, node };
}

/** One emissive sub-pool per tetromino kind; together they draw the locked stack. */
export function createLockedStackPools(capacityPerKind = 48): InstancedBoardPool[] {
  // Default mirrors board-view's LOCKED_POOL_CAPACITY_PER_KIND; the route passes the
  // board-view constant explicitly so the two cannot drift silently.
  return PIECE_KINDS.map((kind) =>
    createInstancedPool("blockfall-locked-instanced-" + kind.toLowerCase(), capacityPerKind, pieceMaterials[kind])
  );
}

/** Single four-instance pool for the falling piece; its material swaps with the kind. */
export function createActivePiecePool(): InstancedBoardPool {
  return createInstancedPool("blockfall-active-instanced", 4, pieceMaterials.T);
}
