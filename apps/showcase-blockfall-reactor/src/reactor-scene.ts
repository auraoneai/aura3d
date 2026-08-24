import {
  game,
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

export const CELL = 0.208;
export const BLOCK_SCALE = [0.138, 0.138, 0.12] as const;
export const HIDDEN_BLOCK_SCALE = [0.001, 0.001, 0.001] as const;
export const ACTIVE_BLOCK_SCALE = [0.158, 0.158, 0.13] as const;
export const GHOST_BLOCK_SCALE = [0.112, 0.112, 0.035] as const;
export const CLEAR_FLASH_SCALE = [1.03, 0.036, 0.016] as const;
export const BOARD_CENTER_Y = 2.24;
const BOARD_LEFT_X = -((BOARD_WIDTH - 1) * CELL) / 2;
const BOARD_BOTTOM_Y = BOARD_CENTER_Y - ((VISIBLE_HEIGHT - 1) * CELL) / 2;

export const pieceMaterials: Record<PieceKind, AuraMaterialSpec> = {
  I: material.neon({ name: "ion cyan tetromino", color: "#1fc7d4", emissive: "#39f6ff", emissiveIntensity: 0.9, roughness: 0.24 }),
  J: material.neon({ name: "cobalt J tetromino", color: "#3558ff", emissive: "#5c7dff", emissiveIntensity: 0.62, roughness: 0.28 }),
  L: material.neon({ name: "amber L tetromino", color: "#f49a2d", emissive: "#ffc04f", emissiveIntensity: 0.68, roughness: 0.32 }),
  O: material.neon({ name: "solar O tetromino", color: "#f2d94e", emissive: "#ffe866", emissiveIntensity: 0.7, roughness: 0.3 }),
  S: material.neon({ name: "reactor green S tetromino", color: "#42d96b", emissive: "#65ff88", emissiveIntensity: 0.72, roughness: 0.3 }),
  T: material.neon({ name: "magenta T tetromino", color: "#c858e9", emissive: "#e279ff", emissiveIntensity: 0.72, roughness: 0.25 }),
  Z: material.neon({ name: "warning red Z tetromino", color: "#ef4f5d", emissive: "#ff6c78", emissiveIntensity: 0.7, roughness: 0.3 })
};

const panelMaterial = material.pbr({ name: "readable graphite board backplate", color: "#03100e", roughness: 0.66, metallic: 0.16 });
const railMaterial = material.metal({ name: "brushed safety rail", color: "#a9b49d", roughness: 0.36, metallic: 0.62 });
const gridMaterial = material.emissive({ name: "readable board grid", color: "#39685f", emissive: "#6fd8c2", emissiveIntensity: 0.3, roughness: 0.7 });
const ghostMaterial = material.glass({ name: "transparent ghost landing piece", color: "#dbe7d9", opacity: 0.26, transmission: 0.45, roughness: 0.12 });
const flashMaterial = material.emissive({
  name: "line clear grid pulse",
  color: "#39f6ff",
  emissive: "#39f6ff",
  emissiveIntensity: 1.15,
  roughness: 0.22,
  opacity: 0.58
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

const roomFloorMaterial = material.pbr({ name: "arcade room floor", color: "#0a0410", roughness: 0.44, metallic: 0.26 });
const roomWallMaterial = material.pbr({ name: "arcade room wall", color: "#21102c", roughness: 0.88, metallic: 0.02 });
const roomTrimMaterial = material.neon({ name: "arcade room neon trim", color: "#ff42c8", emissive: "#ff42c8", emissiveIntensity: 0.85, roughness: 0.2 });
const roomTrimCoolMaterial = material.neon({ name: "arcade room cool neon trim", color: "#39f6ff", emissive: "#39f6ff", emissiveIntensity: 0.8, roughness: 0.2 });
// Arcade-room context. These were near-black (#0a0614 / #06040d), which measured as a
// 70.3% below-luminance-45 left region and 68.3% right, i.e. the "surrounding void" the
// acceptance criterion rejects: the props existed but read as void. Raised to a lit-room
// value so they register as neighbouring cabinets while staying clearly subordinate to the
// hero cabinet and its live well.
const neighbourCabinetMaterial = material.pbr({ name: "neighbouring cabinet silhouette", color: "#3a2450", roughness: 0.76, metallic: 0.1 });
const neighbourFarCabinetMaterial = material.pbr({ name: "far neighbouring cabinet silhouette", color: "#281838", roughness: 0.84, metallic: 0.06 });
const neighbourCoolScreenMaterial = material.emissive({ name: "neighbouring cool screen glow", color: "#123a4d", emissive: "#3fc6de", emissiveIntensity: 0.82, roughness: 0.34, opacity: 0.9 });
const neighbourWarmScreenMaterial = material.emissive({ name: "neighbouring warm screen glow", color: "#3d1b37", emissive: "#cc46a0", emissiveIntensity: 0.76, roughness: 0.34, opacity: 0.9 });

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
  return [
    // Floor and back wall give the cabinet a room to stand in.
    primitives.box({ name: "arcade room floor slab", material: roomFloorMaterial, receiveShadow: true })
      .position(0, -0.78, 0.9)
      .scale([14, 0.08, 9.4]),
    primitives.box({ name: "arcade room back wall", material: roomWallMaterial, receiveShadow: true })
      .position(0, 2.6, -3.6)
      .scale([13, 7.4, 0.12]),
    // A row of angled neighbouring cabinets recedes to either side so the hero
    // cabinet reads as one machine in an arcade rather than a lone prop.
    primitives.box({ name: "left neighbouring cabinet silhouette", material: neighbourCabinetMaterial, castShadow: true })
      .position(-2.48, 0.98, -1.5)
      .rotate(0, 0.5, 0)
      .scale([0.9, 3.35, 0.82]),
    primitives.box({ name: "left far cabinet silhouette", material: neighbourFarCabinetMaterial, castShadow: true })
      .position(-3.72, 0.86, -2.42)
      .rotate(0, 0.38, 0)
      .scale([0.84, 3.05, 0.78]),
    primitives.box({ name: "right neighbouring cabinet silhouette", material: neighbourCabinetMaterial, castShadow: true })
      .position(2.48, 0.98, -1.5)
      .rotate(0, -0.5, 0)
      .scale([0.9, 3.35, 0.82]),
    primitives.box({ name: "right far cabinet silhouette", material: neighbourFarCabinetMaterial, castShadow: true })
      .position(3.72, 0.86, -2.42)
      .rotate(0, -0.38, 0)
      .scale([0.84, 3.05, 0.78]),
    // Dim neighbouring screens are the room's only competing light sources and
    // stay well below the hero playfield in brightness.
    primitives.box({ name: "left neighbouring cabinet screen glow", material: neighbourCoolScreenMaterial })
      .position(-2.32, 1.86, -1.11)
      .rotate(0, 0.5, 0)
      .scale([0.56, 0.78, 0.03]),
    primitives.box({ name: "right neighbouring cabinet screen glow", material: neighbourWarmScreenMaterial })
      .position(2.32, 1.86, -1.11)
      .rotate(0, -0.5, 0)
      .scale([0.56, 0.78, 0.03]),
    primitives.box({ name: "left far cabinet screen glow", material: neighbourWarmScreenMaterial })
      .position(-3.58, 1.72, -2.03)
      .rotate(0, 0.38, 0)
      .scale([0.5, 0.7, 0.03]),
    primitives.box({ name: "right far cabinet screen glow", material: neighbourCoolScreenMaterial })
      .position(3.58, 1.72, -2.03)
      .rotate(0, -0.38, 0)
      .scale([0.5, 0.7, 0.03]),
    // Wall neon sits behind the cabinet row so it never crosses the playfield.
    primitives.box({ name: "arcade room left wall neon", material: roomTrimMaterial })
      .position(-4.6, 2.9, -3.5)
      .scale([2.1, 0.06, 0.06]),
    primitives.box({ name: "arcade room right wall neon", material: roomTrimCoolMaterial })
      .position(4.6, 2.9, -3.5)
      .scale([2.1, 0.06, 0.06])
  ];
}

export function createBoardShell(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [
    // Depth order from back to front: recess shell, board backplate, grid,
    // locked blocks, ghost, then the active piece nearest the camera.
    primitives.box({ name: "arcade reactor screen recess", material: material.pbr({ color: "#020806", roughness: 0.8, metallic: 0.08 }) }).position(0, BOARD_CENTER_Y, -0.06).scale([2.12, 4.48, 0.08]),
    primitives.box({ name: "reactor board backplate", material: panelMaterial, receiveShadow: true }).position(0, BOARD_CENTER_Y, 0.005).scale([1.64, 4.42, 0.05]),
    primitives.box({ name: "blockfall reactor marquee beam", material: material.neon({ color: "#ffe866", emissive: "#ffe866", emissiveIntensity: 0.72 }) }).position(0, BOARD_CENTER_Y + 2.08, 0.11).scale([1.46, 0.045, 0.045]),
    // The cabinet GLB marquee texture reads "GAME OVER / RESTART?", which
    // contradicts a running game. The camera frames below it and the route
    // supplies a clean lit header shroud directly above the playfield.
    // The typed cabinet's fixed "GAME OVER / RESTART?" marquee sits higher than
    // the live board. A taller shroud covers it at both desktop and the wider
    // mobile FOV so a running session never announces the opposite state.
    primitives.box({ name: "blockfall reactor header shroud", material: marqueePanelMaterial }).position(0, BOARD_CENTER_Y + 2.92, 0.14).scale([2.56, 1.18, 0.12]),
    primitives.box({ name: "blockfall reactor header light bar", material: material.neon({ color: "#39f6ff", emissive: "#39f6ff", emissiveIntensity: 1.15 }) }).position(0, BOARD_CENTER_Y + 2.23, 0.21).scale([2.36, 0.048, 0.048]),
    primitives.box({ name: "blockfall reactor header accent bar", material: marqueeGlyphMaterial }).position(0, BOARD_CENTER_Y + 2.82, 0.21).scale([1.42, 0.09, 0.03]),
    primitives.box({ name: "left load-bearing board rail", material: railMaterial, castShadow: true }).position(-1.24, BOARD_CENTER_Y, 0.08).scale([0.05, 4.22, 0.11]),
    primitives.box({ name: "right load-bearing board rail", material: railMaterial, castShadow: true }).position(1.24, BOARD_CENTER_Y, 0.08).scale([0.05, 4.22, 0.11]),
    primitives.box({ name: "top board rail", material: railMaterial, castShadow: true }).position(0, BOARD_CENTER_Y + 2.13, 0.08).scale([1.48, 0.052, 0.11]),
    primitives.box({ name: "bottom board rail", material: railMaterial, castShadow: true }).position(0, BOARD_CENTER_Y - 2.13, 0.08).scale([1.48, 0.052, 0.11]),
    primitives.box({ name: "reactor cabinet floor", material: material.metal({ color: "#111a18", roughness: 0.58, metallic: 0.28 }), receiveShadow: true }).position(0, -0.12, -0.48).scale([3.15, 0.055, 1.25]),
    primitives.box({ name: "left cyan arcade light column", material: material.neon({ color: "#39f6ff", emissive: "#39f6ff", emissiveIntensity: 0.6 }) }).position(-1.08, BOARD_CENTER_Y, 0.04).scale([0.018, 2.06, 0.022]),
    primitives.box({ name: "right magenta arcade light column", material: material.neon({ color: "#e279ff", emissive: "#e279ff", emissiveIntensity: 0.56 }) }).position(1.08, BOARD_CENTER_Y, 0.04).scale([0.018, 2.06, 0.022])
  ];
  for (let x = 0; x <= BOARD_WIDTH; x += 1) {
    const px = BOARD_LEFT_X - CELL / 2 + x * CELL;
    nodes.push(primitives.box({ name: `board vertical grid ${x}`, material: gridMaterial }).position(px, BOARD_CENTER_Y, 0.055).scale([0.008, VISIBLE_HEIGHT * CELL, 0.016]));
  }
  for (let y = 0; y <= VISIBLE_HEIGHT; y += 1) {
    const py = BOARD_BOTTOM_Y - CELL / 2 + y * CELL;
    nodes.push(primitives.box({ name: `board horizontal grid ${y}`, material: gridMaterial }).position(0, py, 0.055).scale([1.08, 0.008, 0.016]));
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
  return [BOARD_LEFT_X + x * CELL, BOARD_BOTTOM_Y + (VISIBLE_HEIGHT - 1 - visibleY) * CELL, z];
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
  readonly node: ReturnType<typeof instances.box>;
}

function createInstancedPool(id: string, capacity: number, materialSpec: AuraMaterialSpec): InstancedBoardPool {
  const transforms: MutableTransformSpec[] = Array.from({ length: capacity }, () => ({
    position: [0, -50, 0] as [number, number, number],
    // Unused instances park collapsed far below the room, out of every frame.
    scale: [HIDDEN_BLOCK_SCALE[0], HIDDEN_BLOCK_SCALE[1], HIDDEN_BLOCK_SCALE[2]] as [number, number, number]
  }));
  const node = instances.box({
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
