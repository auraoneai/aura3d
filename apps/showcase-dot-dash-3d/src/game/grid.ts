import { createCountedRng } from "@aura3d/engine";
// Dot Dash 3D — grid model for ASCII-authored mazes.
//
// Tile chars:
//   '#' wall (blocks everyone)          ' ' corridor void (walkable, no dot)
//   '.' light-dot                       'o' power orb
//   'P' player spawn                    'F' fruit spawn
//   'G' ghost-house interior (specters) 'D' ghost-house door (specters)
//
// Wrap: per-maze flags let an entity stepping off a walkable edge cell land on
// the opposite edge of the same row/column when that cell is walkable too.

export interface Tile {
  readonly x: number;
  readonly y: number;
}

export interface Dir {
  readonly x: number;
  readonly z: number;
}

export const DIR_NONE: Dir = { x: 0, z: 0 };
export const DIR_LEFT: Dir = { x: -1, z: 0 };
export const DIR_RIGHT: Dir = { x: 1, z: 0 };
export const DIR_UP: Dir = { x: 0, z: -1 };
export const DIR_DOWN: Dir = { x: 0, z: 1 };
export const DIRS: readonly Dir[] = [DIR_UP, DIR_LEFT, DIR_DOWN, DIR_RIGHT];

export const sameDir = (a: Dir, b: Dir): boolean => a.x === b.x && a.z === b.z;
export const reverseDir = (d: Dir): Dir => ({ x: -d.x, z: -d.z });
export const isZero = (d: Dir): boolean => d.x === 0 && d.z === 0;

export interface MazeDef {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly desc: string;
  readonly rows: readonly string[];
  /** Edge wrap flags: stepping off a walkable edge lands on the far side. */
  readonly wrapX: boolean;
  readonly wrapY: boolean;
  /** Visual identity. */
  readonly look: "neon-arcade";
  readonly palette: {
    readonly wall: string;
    readonly edge: string;
    readonly floor: string;
    readonly dot: string;
    readonly accent: string;
  };
  /** Clear colour behind the board (world.ts lifts it to board 1's brightness). One global haze covers every board. */
  readonly background: string;
  readonly fruit: FruitKind;
  /** Set dressing flavor for the perimeter. */
  readonly theme: "grid" | "spiral" | "towers" | "garden" | "foundry" | "reactor";
}

export type FruitKind = "cherry" | "strawberry" | "orange" | "apple" | "melon" | "star";

export const FRUIT_SCORE: Record<FruitKind, number> = {
  cherry: 100,
  strawberry: 300,
  orange: 500,
  apple: 700,
  melon: 1000,
  star: 5000
};

export interface ParsedMaze {
  readonly def: MazeDef;
  readonly width: number;
  readonly height: number;
  readonly wall: boolean[];       // '#'
  readonly ghostOnly: boolean[];  // 'G' | 'D'
  readonly dots: number[];        // indices of '.'
  readonly orbs: number[];        // indices of 'o'
  readonly walkable: boolean[];   // player-walkable
  readonly spawn: Tile;
  readonly fruitTile: Tile;
  readonly houseTiles: number[];  // 'G' indices
  readonly door: Tile;            // 'D'
  readonly aboveDoor: Tile;       // first walkable cell outside the door
}

export const idx = (w: number, x: number, y: number): number => y * w + x;
export const inBounds = (m: ParsedMaze, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < m.width && y < m.height;

const GHOST_ONLY = new Set(["G", "D"]);

export function parseMaze(def: MazeDef): ParsedMaze {
  const height = def.rows.length;
  const width = def.rows[0]?.length ?? 0;
  const wall = new Array<boolean>(width * height).fill(false);
  const ghostOnly = new Array<boolean>(width * height).fill(false);
  const walkable = new Array<boolean>(width * height).fill(false);
  const dots: number[] = [];
  const orbs: number[] = [];
  const houseTiles: number[] = [];
  let spawn: Tile = { x: 1, y: 1 };
  let fruitTile: Tile = { x: 1, y: 1 };
  let door: Tile = { x: 1, y: 1 };
  for (let y = 0; y < height; y += 1) {
    const row = def.rows[y] ?? "";
    if (row.length !== width) throw new Error(`maze ${def.id} row ${y} width ${row.length} != ${width}`);
    for (let x = 0; x < width; x += 1) {
      const c = row[x] ?? " ";
      const i = idx(width, x, y);
      if (c === "#") { wall[i] = true; continue; }
      if (GHOST_ONLY.has(c)) {
        ghostOnly[i] = true;
        if (c === "G") houseTiles.push(i);
        else door = { x, y };
        continue;
      }
      walkable[i] = true;
      if (c === ".") dots.push(i);
      else if (c === "o") orbs.push(i);
      else if (c === "P") spawn = { x, y };
      else if (c === "F") fruitTile = { x, y };
    }
  }
  if (houseTiles.length === 0) throw new Error(`maze ${def.id}: no ghost house (G)`);
  // The cell the door opens onto: the walkable neighbor closest to the house.
  let aboveDoor: Tile = door;
  for (const d of DIRS) {
    const t = { x: door.x + d.x, y: door.y + d.z };
    if (inBounds({ width, height } as ParsedMaze, t.x, t.y) && walkable[idx(width, t.x, t.y)]) { aboveDoor = t; break; }
  }
  return { def, width, height, wall, ghostOnly, dots, orbs, walkable, spawn, fruitTile, houseTiles, door, aboveDoor };
}

/** Wrap-aware neighbor lookup. `ghost` permits house/door cells. */
export function stepTile(m: ParsedMaze, t: Tile, d: Dir, ghost = false): Tile | null {
  let { x, y } = { x: t.x + d.x, y: t.y + d.z };
  if (x < 0) { if (!m.def.wrapX) return null; x = m.width - 1; }
  else if (x >= m.width) { if (!m.def.wrapX) return null; x = 0; }
  if (y < 0) { if (!m.def.wrapY) return null; y = m.height - 1; }
  else if (y >= m.height) { if (!m.def.wrapY) return null; y = 0; }
  const i = idx(m.width, x, y);
  if (m.wall[i]) return null;
  if (m.ghostOnly[i] && !ghost) return null;
  // Ghosts in normal modes never re-enter the house through the door; the sim
  // gates that itself. Here `ghost=true` means "can stand on G/D".
  return { x, y };
}

export const tileWalkable = (m: ParsedMaze, t: Tile, ghost = false): boolean => {
  if (!inBounds(m, t.x, t.y)) return false;
  const i = idx(m.width, t.x, t.y);
  return !m.wall[i] && (ghost || !m.ghostOnly[i]);
};

/** Legal exits from a tile (for AI): open neighbors, optionally excluding the reverse. */
export function exits(m: ParsedMaze, t: Tile, dir: Dir, allowReverse: boolean, ghost = false): Tile[] {
  const out: Tile[] = [];
  const rev = reverseDir(dir);
  for (const d of DIRS) {
    if (!allowReverse && sameDir(d, rev) && !isZero(dir)) continue;
    const n = stepTile(m, t, d, ghost);
    if (n) out.push(n);
  }
  return out;
}

export const tileDist = (a: Tile, b: Tile): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Breadth-first distance field from `from` over walkable cells (specter pathing). */
export function bfsDistances(m: ParsedMaze, from: Tile, ghost = false): Int32Array {
  const dist = new Int32Array(m.width * m.height).fill(-1);
  const q: number[] = [idx(m.width, from.x, from.y)];
  dist[q[0]!] = 0;
  for (let head = 0; head < q.length; head += 1) {
    const cur = q[head]!;
    const cx = cur % m.width;
    const cy = (cur / m.width) | 0;
    for (const d of DIRS) {
      const n = stepTile(m, { x: cx, y: cy }, d, ghost);
      if (!n) continue;
      const ni = idx(m.width, n.x, n.y);
      if (dist[ni] !== -1) continue;
      dist[ni] = dist[cur]! + 1;
      q.push(ni);
    }
  }
  return dist;
}

/** Deterministic RNG (mulberry32) for frightened-mode + fruit jitter. */
export function mulberry32(seed: number): () => number {
  const rng = createCountedRng(seed);
  return () => rng.next();
}

/** Dev-time sanity: every dot/orb reachable from spawn for the player. */
export function validateMaze(m: ParsedMaze): string[] {
  const problems: string[] = [];
  const dist = bfsDistances(m, m.spawn);
  for (const i of m.dots) if (dist[i] < 0) problems.push(`dot unreachable at ${i % m.width},${(i / m.width) | 0}`);
  for (const i of m.orbs) if (dist[i] < 0) problems.push(`orb unreachable at ${i % m.width},${(i / m.width) | 0}`);
  if (dist[idx(m.width, m.fruitTile.x, m.fruitTile.y)]! < 0) problems.push("fruit tile unreachable");
  const gd = bfsDistances(m, m.aboveDoor, true);
  for (const i of m.houseTiles) if (gd[i]! < 0) problems.push(`house tile sealed at ${i % m.width},${(i / m.width) | 0}`);
  if (m.dots.length < 20) problems.push(`suspiciously few dots (${m.dots.length})`);
  if (m.orbs.length === 0) problems.push("no power orbs");
  return problems;
}
