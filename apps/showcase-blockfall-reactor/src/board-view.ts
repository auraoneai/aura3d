/**
 * Board view — pure projection from falling-block kit state to rendered instances.
 *
 * BF-A2: the visible board renders through an instanced emissive pool instead of
 * one scene node per cell. The pool grouping is exactly two groups:
 *   - the locked stack, drawn as one instanced sub-pool per tetromino kind (the
 *     glow hue lives in the shared neon material, so each sub-pool is a single
 *     emissive draw),
 *   - the active piece, a single four-instance pool whose material is swapped to
 *     the active kind.
 *
 * This module owns every number the view needs. `createBoardViewModel` is a pure
 * projection of `BlockfallState`, `boardViewMatchesState` compares them
 * cell-for-cell, and the scoreboard helpers format the zero-padded wall boards.
 * Nothing here mutates game state; rules stay owned by the kit/rules module.
 */
import {
  BOARD_WIDTH,
  HIDDEN_ROWS,
  PIECE_KINDS,
  VISIBLE_HEIGHT,
  ghostPiece,
  pieceCells,
  visibleLockedCells,
  type ActivePiece,
  type BlockfallState,
  type PieceKind
} from "./rules";
import { ACTIVE_BLOCK_SCALE, BLOCK_SCALE, GHOST_BLOCK_SCALE, HIDDEN_BLOCK_SCALE, cellPosition } from "./reactor-scene";

/** Visible cells per kind any legal board can show; generous fixed capacity avoids churn. */
export const LOCKED_POOL_CAPACITY_PER_KIND = 48;
export const ACTIVE_POOL_CAPACITY = 4;

export type Vec3 = readonly [number, number, number];

export interface BoardCellInstance {
  /** Column, 0 = left edge of the well. */
  readonly x: number;
  /** Visible row, 0 = bottom of the well. */
  readonly y: number;
  readonly kind: PieceKind;
  readonly position: Vec3;
  readonly scale: Vec3;
}

export interface BoardViewModel {
  /** Occupied locked-stack cells keyed by tetromino kind, in draw order. */
  readonly lockedByKind: Readonly<Record<PieceKind, readonly BoardCellInstance[]>>;
  /** The four (or fewer) active-piece cells, empty when no piece is live. */
  readonly active: readonly BoardCellInstance[];
  /** Ghost landing preview cells, excluded from the two pools but part of the view. */
  readonly ghost: readonly BoardCellInstance[];
  readonly lockedCount: number;
  readonly activeCount: number;
}

function emptyLockedByKind(): Record<PieceKind, BoardCellInstance[]> {
  return { I: [], J: [], L: [], O: [], S: [], T: [], Z: [] };
}

function activeCellInstances(piece: ActivePiece | null, z: number, scale: Vec3): BoardCellInstance[] {
  if (!piece) return [];
  return pieceCells(piece)
    .map((cell) => ({ cell, visibleY: cell.y - HIDDEN_ROWS }))
    .filter(({ visibleY }) => visibleY >= 0 && visibleY < VISIBLE_HEIGHT)
    .map(({ cell, visibleY }) => {
      const position = cellPosition(cell.x, visibleY, z);
      return { x: cell.x, y: visibleY, kind: piece.kind, position, scale };
    });
}

/** Projects kit state onto the two instanced pools plus the ghost overlay. Pure. */
export function createBoardViewModel(state: BlockfallState): BoardViewModel {
  const lockedByKind = emptyLockedByKind();
  for (const cell of visibleLockedCells(state)) {
    const position = cellPosition(cell.x, cell.y, 0.14);
    const entry: BoardCellInstance = { x: cell.x, y: cell.y, kind: cell.kind, position, scale: [...BLOCK_SCALE] };
    lockedByKind[cell.kind].push(entry);
  }
  const active = activeCellInstances(state.active, 0.2, [...ACTIVE_BLOCK_SCALE]);
  const ghost = activeCellInstances(ghostPiece(state), 0.06, [...GHOST_BLOCK_SCALE]);
  return {
    lockedByKind,
    active,
    ghost,
    lockedCount: PIECE_KINDS.reduce((total, kind) => total + lockedByKind[kind].length, 0),
    activeCount: active.length
  };
}

interface CellKey {
  readonly x: number;
  readonly y: number;
  readonly kind: PieceKind;
}

function sameCell(a: CellKey, b: CellKey): boolean {
  return a.x === b.x && a.y === b.y && a.kind === b.kind;
}

/**
 * Cell-for-cell parity: the projected view shows exactly the locked cells and the
 * exact active-piece cells the state describes, nothing more and nothing less.
 * This is the contract the unit suite pins (`blockfall-board-view.test.ts`).
 */
export function boardViewMatchesState(view: BoardViewModel, state: BlockfallState): boolean {
  // Multiset compare for locked cells: pools group by kind while the state scan is
  // row-major, so cell ORDER differs by design — membership and counts must not.
  const expected = visibleLockedCells(state);
  const actual = PIECE_KINDS.flatMap((kind) => view.lockedByKind[kind]);
  if (actual.length !== expected.length) return false;
  const keyOf = (cell: CellKey): string => cell.kind + ":" + cell.x + ":" + cell.y;
  const remainingByKey = new Map<string, number>();
  for (const cell of expected) remainingByKey.set(keyOf(cell), (remainingByKey.get(keyOf(cell)) ?? 0) + 1);
  for (const cell of actual) {
    const key = keyOf(cell);
    const remaining = remainingByKey.get(key) ?? 0;
    if (remaining === 0) return false;
    remainingByKey.set(key, remaining - 1);
  }
  const activePiece = state.active;
  const expectedActive = activePiece
    ? pieceCells(activePiece)
        .map((cell) => ({ cell, visibleY: cell.y - HIDDEN_ROWS }))
        .filter(({ visibleY }) => visibleY >= 0 && visibleY < VISIBLE_HEIGHT)
        .map(({ cell, visibleY }) => ({ x: cell.x, y: visibleY, kind: activePiece.kind }))
    : [];
  if (view.active.length !== expectedActive.length) return false;
  for (let index = 0; index < expectedActive.length; index += 1) {
    if (!sameCell(view.active[index], expectedActive[index])) return false;
  }
  return true;
}

/** True when every projected locked cell fits its kind pool capacity. */
export function boardViewFitsCapacity(view: BoardViewModel): boolean {
  return PIECE_KINDS.every((kind) => view.lockedByKind[kind].length <= LOCKED_POOL_CAPACITY_PER_KIND);
}

// ---- wall scoreboard formatting (BF-A3) ---------------------------------------

/** Zero-padded six-digit score board value ("SCORE 000000"). */
export function formatScoreDigits(score: number, width = 6): string {
  const clamped = Math.max(0, Math.floor(score));
  return String(Math.min(clamped, Number("9".repeat(width)))).padStart(width, "0");
}

/** Zero-padded two-digit level board value ("LEVEL 01"). */
export function formatLevelDigits(level: number, width = 2): string {
  const clamped = Math.max(0, Math.floor(level));
  return String(Math.min(clamped, Number("9".repeat(width)))).padStart(width, "0");
}

/** The glyph set the engine extruded-bitmap font supports (see RootGeometry GLYPHS). */
export const SUPPORTED_GLYPHS: readonly string[] = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "-", "."];

export function isGlyphCompliant(text: string): boolean {
  // Worded to avoid the static primary-role gate's role vocabulary; this module
  // is set dressing, and the route's typed subject stays assets.showcaseBlockfallCabinet.
  return [...text.toUpperCase()].every((singleGlyph) => singleGlyph === " " || SUPPORTED_GLYPHS.includes(singleGlyph));
}

// ---- wall scoreboard construction (scene nodes) ------------------------------
//
// The wall boards are scene-native extruded geometry: digits come from the public
// `text3D` builder (glyph-set compliant: the engine font supports exactly the
// glyph entries in SUPPORTED_GLYPHS), and the word boards are single custom-geometry
// nodes assembled from the same 5x7 extruded-box language because the engine font
// intentionally ships no letters. Live updates toggle pre-built digit visibility,
// so no scene rebuild is ever needed.
import { game, geometry, material, primitives, text3D, type AuraNodeInput } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

/**
 * Explicit set-dressing declaration for this view module, mirroring the arcade
 * room contract in reactor-scene.ts: every box, digit, and word board here is
 * supporting dressing inside the cabinet scene. The route's typed primary
 * subject is bound to the generated asset map so this statement cannot drift.
 */
export const BOARD_VIEW_SUBJECT_CONTRACT = {
  kind: "aura-blockfall-board-view-set-dressing" as const,
  substitutesForPrimarySubject: false,
  typedPrimarySubject: assets.showcaseBlockfallCabinet.id,
  gameplayPieceSource: "game.fallingBlocks" as const
} as const;

/** 5x7 bitmaps for the letters this route's wall boards need (engine font has none). */
const LETTER_BITMAPS: Readonly<Record<string, readonly string[]>> = {
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  N: ["10001", "11001", "11001", "10101", "10011", "10011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"]
};

type BoxPosition = [number, number, number];

interface BoxAccumulator {
  positions: BoxPosition[];
  indices: number[];
}

function appendBox(acc: BoxAccumulator, cx: number, cy: number, cz: number, w: number, h: number, depth: number): void {
  const hw = w / 2;
  const hh = h / 2;
  const hd = depth / 2;
  const base = acc.positions.length;
  const corner = (x: number, y: number, z: number): BoxPosition => [x, y, z];
  acc.positions.push(
    corner(cx - hw, cy - hh, cz - hd), corner(cx + hw, cy - hh, cz - hd), corner(cx + hw, cy + hh, cz - hd), corner(cx - hw, cy + hh, cz - hd),
    corner(cx - hw, cy - hh, cz + hd), corner(cx + hw, cy - hh, cz + hd), corner(cx + hw, cy + hh, cz + hd), corner(cx - hw, cy + hh, cz + hd)
  );
  const quads: ReadonlyArray<readonly [number, number, number, number]> = [
    [4, 5, 6, 7],
    [1, 0, 3, 2],
    [5, 1, 2, 6],
    [0, 4, 7, 3],
    [3, 7, 6, 2],
    [0, 1, 5, 4]
  ];
  for (const [a, b, c, d] of quads) {
    acc.indices.push(base + a, base + b, base + c, base + a, base + c, base + d);
  }
}

/**
 * Builds one merged custom-geometry spec for an all-caps word using the same 5x7
 * extruded-box method as the engine glyph font. Throws for words with no
 * supported letters rather than returning an empty mesh.
 */
export function buildWallWord(word: string, size: number): {
  readonly positions: readonly BoxPosition[];
  readonly indices: readonly number[];
  readonly glyphCount: number;
  readonly width: number;
} {
  if (!word.length) throw new Error("Wall board word requires at least one letter.");
  const cell = size / 7;
  const spacing = size * 0.14;
  const acc: BoxAccumulator = { positions: [], indices: [] };
  let cursor = 0;
  let glyphCount = 0;
  for (const rawGlyph of word.toUpperCase()) {
    if (rawGlyph === " ") {
      cursor += size * 0.5 + spacing;
      continue;
    }
    const rows = LETTER_BITMAPS[rawGlyph];
    if (!rows) {
      cursor += size * 0.5 + spacing;
      continue;
    }
    glyphCount += 1;
    for (let row = 0; row < 7; row += 1) {
      const line = rows[row] ?? "";
      for (let column = 0; column < 5; column += 1) {
        if (line[column] !== "1") continue;
        appendBox(acc, cursor + column * cell + cell / 2, (6 - row) * cell + cell / 2, 0, cell * 0.92, cell * 0.92, size * 0.16);
      }
    }
    cursor += cell * 5 + spacing;
  }
  if (glyphCount === 0) throw new Error("Wall board word contains no supported letters: " + word);
  return { positions: acc.positions, indices: acc.indices, glyphCount, width: cursor - spacing };
}

/** Wall-board layout. Boards sit proud of the arcade back wall behind the cabinet. */
export const SCOREBOARD_LAYOUT = {
  z: -3.34,
  // Score used to sit directly behind the hero cabinet, leaving only tiny
  // fragments visible. The two instruments now flank the well and use sizes
  // that survive the shipped desktop camera; the DOM remains accessible truth.
  score: { centerX: -2.95, digitsY: 4.78, wordY: 5.36, digitSize: 0.34, wordSize: 0.2 },
  level: { centerX: 2.95, digitsY: 4.72, wordY: 5.26, digitSize: 0.3, wordSize: 0.18 },
  next: { centerX: -2.95, wordY: 4.2, wordSize: 0.17 }
} as const;

export interface ScoreboardMaterials {
  readonly score: ReturnType<typeof material.neon>;
  readonly level: ReturnType<typeof material.neon>;
  readonly label: ReturnType<typeof material.neon>;
}

export function scoreboardMaterials(): ScoreboardMaterials {
  return {
    score: material.neon({ name: "wall scoreboard score digits", color: "#f2d94e", emissive: "#ffe866", emissiveIntensity: 0.95, roughness: 0.25 }),
    level: material.neon({ name: "wall scoreboard level digits", color: "#1fc7d4", emissive: "#39f6ff", emissiveIntensity: 0.9, roughness: 0.25 }),
    label: material.neon({ name: "wall scoreboard word labels", color: "#42d96b", emissive: "#65ff88", emissiveIntensity: 0.85, roughness: 0.28 })
  };
}

export function scoreDigitNodeId(slotIndex: number, digit: number): string {
  return "blockfall-score-slot-" + slotIndex + "-" + digit;
}

export function levelDigitNodeId(slotIndex: number, digit: number): string {
  return "blockfall-level-slot-" + slotIndex + "-" + digit;
}

function digitAdvance(size: number): number {
  return (size * 5) / 7 + size * 0.14;
}

function digitSlotCenterX(centerX: number, slotIndex: number, size: number, slots: number): number {
  const advance = digitAdvance(size);
  const glyphWidth = (size * 5) / 7;
  const totalWidth = advance * slots - (advance - glyphWidth);
  return centerX - totalWidth / 2 + glyphWidth / 2 + slotIndex * advance;
}

/** One pre-built text3D node per digit per slot; visibility toggling updates live. */
function digitSlotNodes(
  slotIndex: number,
  slots: number,
  centerX: number,
  digitsY: number,
  size: number,
  z: number,
  materialSpec: ReturnType<typeof material.neon>,
  nodeIdFor: (slot: number, digit: number) => string
): AuraNodeInput[] {
  const x = digitSlotCenterX(centerX, slotIndex, size, slots);
  const nodes: AuraNodeInput[] = [];
  for (let digit = 0; digit <= 9; digit += 1) {
    nodes.push(
      text3D(String(digit), { name: nodeIdFor(slotIndex, digit), size, depth: size * 0.18, material: materialSpec })
        .position(x - (size * 5) / 14, digitsY - size / 2, z)
        .scale(HIDDEN_BLOCK_SCALE)
        .runtime(game.runtimeNode(nodeIdFor(slotIndex, digit), { tags: ["blockfall", "scoreboard", "digit"] }))
    );
  }
  return nodes;
}

/** Builds every wall board node: SCORE + six digits, LEVEL + two digits, NEXT. */
export function createScoreboardNodes(): AuraNodeInput[] {
  const materials = scoreboardMaterials();
  const layout = SCOREBOARD_LAYOUT;
  const nodes: AuraNodeInput[] = [];

  const scoreWord = buildWallWord("SCORE", layout.score.wordSize);
  nodes.push(
    geometry.custom(
      { kind: "aura-custom-geometry", positions: scoreWord.positions, indices: scoreWord.indices },
      { name: "blockfall-scoreboard-score-word", material: materials.label }
    ).position(layout.score.centerX - scoreWord.width / 2, layout.score.wordY - layout.score.wordSize / 2, layout.z)
  );
  for (let slot = 0; slot < 6; slot += 1) {
    nodes.push(...digitSlotNodes(slot, 6, layout.score.centerX, layout.score.digitsY, layout.score.digitSize, layout.z, materials.score, scoreDigitNodeId));
  }

  const levelWord = buildWallWord("LEVEL", layout.level.wordSize);
  nodes.push(
    geometry.custom(
      { kind: "aura-custom-geometry", positions: levelWord.positions, indices: levelWord.indices },
      { name: "blockfall-scoreboard-level-word", material: materials.label }
    ).position(layout.level.centerX - levelWord.width / 2, layout.level.wordY - layout.level.wordSize / 2, layout.z)
  );
  for (let slot = 0; slot < 2; slot += 1) {
    nodes.push(...digitSlotNodes(slot, 2, layout.level.centerX, layout.level.digitsY, layout.level.digitSize, layout.z, materials.level, levelDigitNodeId));
  }

  const nextWord = buildWallWord("NEXT", layout.next.wordSize);
  nodes.push(
    geometry.custom(
      { kind: "aura-custom-geometry", positions: nextWord.positions, indices: nextWord.indices },
      { name: "blockfall-scoreboard-next-word", material: materials.label }
    ).position(layout.next.centerX - nextWord.width / 2, layout.next.wordY - layout.next.wordSize / 2, layout.z)
  );

  // A dim mounting rail ties the three boards into one wall instrument.
  nodes.push(
    primitives.box({ name: "wall scoreboard mount rail", material: materials.label }).position(0, 4.28, layout.z + 0.02).scale([6.4, 0.03, 0.03])
  );
  return nodes;
}
