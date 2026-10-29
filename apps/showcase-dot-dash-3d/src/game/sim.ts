// Glint Courier — core simulation: grid-snapped movement with buffered turns,
// four Specter personalities (BFS retargeting at junctions), chase/scatter
// wave timer, Power Orb fright + chain scoring + eyes return, fruit, lives,
// dash, and maze progression. Pure logic — no engine imports except types.

import {
  DIR_NONE, DIR_LEFT, DIR_RIGHT, DIR_UP, DIR_DOWN,
  bfsDistances, exits, idx, isZero, mulberry32, parseMaze, reverseDir,
  sameDir, stepTile, tileWalkable, FRUIT_SCORE,
  type Dir, type ParsedMaze, type Tile
} from "./grid.js";
import { MAZE_ORDER, MAZES, FRUIT_LABEL, mazeSpec, type MazeId } from "./mazes.js";
import { loadProfile, saveProfile, type Profile } from "./save.js";

// ---------------------------------------------------------------- tuning ---
export const PLAYER_SPEED = 6.1;          // tiles / second
export const GHOST_SPEED_RATIO = 0.94;    // of player speed, before level scale
export const FRIGHT_SPEED_RATIO = 0.55;
export const EYES_SPEED_RATIO = 1.85;
export const TUNNEL_SPEED_RATIO = 0.55;   // ghosts slow on wrap-edge cells
export const DASH_MULT = 1.9;
export const DASH_TIME = 0.26;
export const DASH_COOLDOWN = 1.7;
export const READY_TIME = 1.5;           // board-intro banner (DD-6: 0.25 s was barely visible)
export const DEATH_TIME = 1.6;
export const CLEAR_TIME = 2.4;
export const FRUIT_LIFE = 14.0;
export const FRUIT_TRIGGERS = [12, 65, 130];
export const EAT_RADIUS = 0.58;
export const TOUCH_RADIUS = 0.56;
export const FRIGHT_BASE = 6.0;
export const WAVE_SCHEDULE = [6, 18, 6, 18, 5, 18, 5, Infinity]; // scatter/chase alternating
/** Sentry Lab runs the whole board at this time scale (the "slow-mo practice" the menu promises). */
export const SCHOOL_TIME_SCALE = 0.6;
/** Corridor spawns keep at least this many path tiles between a sentry and the courier. */
export const MIN_SPAWN_PATH = 10;
/** Seconds between staggered sentry releases on board 1; shrinks by RELEASE_STEP_DECAY per board, floored at 0. */
export const RELEASE_STEP = 1.6;
export const RELEASE_STEP_DECAY = 0.32;
/** One extra life when the score first reaches this. */
export const EXTRA_LIFE_AT = 10000;
export const MAX_LIVES = 5;
const EYE_FX_EVERY = 0.09;

export type GhostId = "blitz" | "sly" | "flick" | "dim";
export const GHOST_ORDER: readonly GhostId[] = ["blitz", "sly", "flick", "dim"];

export const GHOST_LABEL: Record<GhostId, string> = {
  blitz: "HUNTER",
  sly: "AMBUSHER",
  flick: "DRIFTER",
  dim: "SKITTISH"
};
export const GHOST_TINT: Record<GhostId, string> = {
  blitz: "#ff6a3c",
  sly: "#b78bff",
  flick: "#46ffb0",
  dim: "#ffe066"
};
export const GHOST_BLURB: Record<GhostId, string> = {
  blitz: "Locks onto your tile and follows your path.",
  sly: "Ambushes 4 tiles ahead of you.",
  flick: "Mirrors Hunter through your position.",
  dim: "Closes in, then breaks away to its corner."
};

/** Scatter corner per specter. */
const SCATTER: Record<GhostId, Tile> = {
  blitz: { x: 17, y: 1 },
  sly: { x: 1, y: 1 },
  flick: { x: 17, y: 19 },
  dim: { x: 1, y: 19 }
};

export type Mode =
  | "title"      // menu visible
  | "ready"      // READY! banner, actors frozen
  | "play"
  | "dying"      // death anim → respawn / gameover
  | "cleared"    // maze-clear anim → next maze / win
  | "gameover"
  | "win";

export type RunKind = "quick" | "circuit" | "school";

export type GhostState = "house" | "exiting" | "active" | "eyes" | "entering";

export interface Ghost {
  readonly id: GhostId;
  /** continuous tile-space position (may go out of bounds during wrap transit) */
  px: number; py: number;
  dir: Dir;
  state: GhostState;
  /** current retarget decision target (for school overlay) */
  target: Tile;
  /** tiles traveled since spawn — used for release schedule */
  releaseAt: number;           // seconds after run start when house releases
  frightFlash: boolean;        // frightened white-flash phase
  eyesFxT: number;
  eaten: number;               // times eaten this run
}

export interface Player {
  px: number; py: number;
  dir: Dir;
  /** buffered next direction (classic buffered turn) */
  want: Dir;
  /** seconds left before an un-held buffered direction expires */
  wantT: number;
  dashT: number;
  dashCd: number;
  dashQueued: boolean;
}

export interface SimEvents {
  /** fired once per discrete gameplay moment (sfx/juce hooks read these) */
  dot: boolean;
  orb: boolean;
  ghostEat: { ghost: GhostId; points: number } | null;
  fruit: { kind: string; points: number } | null;
  death: boolean;
  dash: boolean;
  clear: boolean;
  ready: boolean;
  eyesHome: { ghost: GhostId } | null;
  fruitSpawn: boolean;
  /** Points scored this frame at a tile (score pop-ups). */
  points: { x: number; y: number; points: number }[];
  extraLife: boolean;
}

export interface Sim {
  mode: Mode;
  runKind: RunKind;
  mazeId: MazeId;
  maze: ParsedMaze;
  level: number;               // 1-based speed/difficulty index
  score: number;
  lives: number;
  time: number;                // sim-time inside run (pauses in ready/dying)
  /** Seconds of play since the courier first moved on this life; sentry releases count from here. */
  runT: number;
  /** Total simulated seconds since page load (evidence beacon: tells a slow sim from a stalled one). */
  simTime: number;
  /** Duration of the current surge, for the HUD bar. */
  frightMax: number;
  /** Boards cleared in this run (win card). */
  boardsCleared: number;
  /** The board just cleared beat its previous best (clear card flourish). */
  newBoardBest: boolean;
  extraLifeAwarded: boolean;
  dotsEaten: number;
  dotsLeft: number;
  dots: Uint8Array;            // per-cell: 1 = still present dot
  orbs: Uint8Array;
  player: Player;
  ghosts: Ghost[];
  fright: number;
  chain: number;
  wave: number;
  waveT: number;
  fruitActive: boolean;
  fruitT: number;
  fruitStage: number;
  readyT: number;
  deathT: number;
  clearT: number;
  camera: "follow" | "overhead";
  school: boolean;             // ghost-school overlay mode
  autopilot: boolean;
  hasMoved: boolean;
  events: SimEvents;
  msg: string;
  msgT: number;
  feed: string[];
  rng: () => number;
  profile: Profile;
  nodesOk: boolean;
}

export const st: Sim = {
  mode: "play",
  runKind: "quick",
  mazeId: "classic",
  maze: parseMaze(MAZES.classic),
  level: 1,
  score: 0,
  lives: 3,
  time: 0,
  runT: 0,
  simTime: 0,
  frightMax: FRIGHT_BASE,
  boardsCleared: 0,
  newBoardBest: false,
  extraLifeAwarded: false,
  dotsEaten: 0,
  dotsLeft: 0,
  dots: new Uint8Array(19 * 21),
  orbs: new Uint8Array(19 * 21),
  player: { px: 9, py: 15, dir: DIR_LEFT, want: DIR_LEFT, wantT: 0, dashT: 0, dashCd: 0, dashQueued: false },
  ghosts: [],
  fright: 0,
  chain: 0,
  wave: 0,
  waveT: 0,
  fruitActive: true,
  fruitT: FRUIT_LIFE,
  fruitStage: 0,
  readyT: 0,
  deathT: 0,
  clearT: 0,
  camera: "follow",
  school: false,
  autopilot: false,
  hasMoved: false,
  events: freshEvents(),
  msg: "",
  msgT: 0,
  feed: [],
  rng: mulberry32(1),
  profile: loadProfile(),
  nodesOk: true
};

function freshEvents(): SimEvents {
  return { dot: false, orb: false, ghostEat: null, fruit: null, death: false, dash: false, clear: false, ready: false, eyesHome: null, fruitSpawn: false, points: [], extraLife: false };
}

export function pushMsg(s: string): void {
  st.msg = s; st.msgT = 2.6;
  st.feed.push(s);
  if (st.feed.length > 6) st.feed.shift();
}

// ------------------------------------------------------------- lifecycle ---

export function startRun(kind: RunKind, mazeId: MazeId): void {
  st.runKind = kind;
  st.mazeId = mazeId;
  st.maze = parseMaze(mazeSpec(mazeId));
  st.level = MAZE_ORDER.indexOf(mazeId) + 1;
  st.school = kind === "school";
  if (kind !== "circuit" || st.mode === "title" || st.mode === "gameover" || st.mode === "win") {
    st.score = 0;
    st.lives = 3;
    st.boardsCleared = 0;
    st.extraLifeAwarded = false;
  }
  resetBoard();
  st.mode = "play";
  st.readyT = 0;
  st.camera = st.profile.cameraDefault;
  st.profile.mazesPlayed += 1;
  saveProfile(st.profile);
  pushMsg(kind === "school" ? `Sentry Lab — ${MAZES[mazeId].title}` : `${MAZES[mazeId].title} — GO!`);
}

function resetBoard(): void {
  const m = st.maze;
  st.dots = new Uint8Array(m.width * m.height);
  st.orbs = new Uint8Array(m.width * m.height);
  for (const i of m.dots) st.dots[i] = 1;
  for (const i of m.orbs) st.orbs[i] = 1;
  st.dotsLeft = m.dots.length;
  st.dotsEaten = 0;
  st.fright = 0;
  st.chain = 0;
  st.wave = 0;
  st.waveT = 0;
  st.fruitActive = true;
  st.fruitT = FRUIT_LIFE;
  st.fruitStage = 0;
  st.time = 0;
  st.rng = mulberry32((Date.now() % 0xffffffff) >>> 0);
  resetActors();
}

/**
 * Nearest corridor tile to (prefX, prefY) that is at least MIN_SPAWN_PATH path tiles from the courier spawn
 * (`fromSpawn` is a BFS from the spawn). The straight-line test this replaced let a sentry start 6 tiles away.
 */
export function pickCorridorTile(m: ParsedMaze, prefX: number, prefY: number, fromSpawn: Int32Array = bfsDistances(m, m.spawn, false)): Tile {
  const far = (x: number, y: number): boolean => (fromSpawn[idx(m.width, x, y)] ?? -1) >= MIN_SPAWN_PATH;
  if (tileWalkable(m, { x: prefX, y: prefY }, false) && far(prefX, prefY)) return { x: prefX, y: prefY };
  let best: Tile = m.aboveDoor;
  let bestDist = Infinity;
  for (let y = 1; y < m.height - 1; y++) {
    for (let x = 1; x < m.width - 1; x++) {
      if (!tileWalkable(m, { x, y }, false)) continue;
      if (!far(x, y)) continue;
      const d = Math.hypot(x - prefX, y - prefY);
      if (d < bestDist) {
        bestDist = d;
        best = { x, y };
      }
    }
  }
  return best;
}

/** Seconds between staggered releases on the current board (0 from board 6: everyone starts at once). */
export function releaseStep(level: number): number {
  return Math.max(0, RELEASE_STEP - RELEASE_STEP_DECAY * (level - 1));
}

function resetActors(): void {
  const m = st.maze;
  st.hasMoved = false;
  st.runT = 0;
  const fromSpawn = bfsDistances(m, m.spawn, false);
  st.player = { px: m.spawn.x, py: m.spawn.y, dir: DIR_LEFT, want: DIR_LEFT, wantT: 0, dashT: 0, dashCd: 0, dashQueued: false };
  // All four sentries start in corridors (so the board reads as a live chase), but each at least MIN_SPAWN_PATH path
  // tiles from the courier, and on early boards they start moving one after another (blitz first).
  const spawns: Record<GhostId, Tile> = {
    blitz: m.aboveDoor,
    flick: pickCorridorTile(m, 4, 5, fromSpawn),
    dim: pickCorridorTile(m, 14, 5, fromSpawn),
    sly: pickCorridorTile(m, 13, 13, fromSpawn)
  };
  const step = releaseStep(st.level);
  const releaseOrder: Record<GhostId, number> = { blitz: 0, flick: 1, dim: 2, sly: 3 };
  const dirs: Record<GhostId, Dir> = {
    blitz: DIR_LEFT,
    flick: DIR_RIGHT,
    dim: DIR_LEFT,
    sly: DIR_UP
  };
  st.ghosts = GHOST_ORDER.map((id) => ({
    id,
    px: spawns[id].x,
    py: spawns[id].y,
    dir: dirs[id],
    state: "active" as GhostState,
    target: { ...SCATTER[id] },
    releaseAt: releaseOrder[id] * step,
    frightFlash: false,
    eyesFxT: 0,
    eaten: 0
  }));
}

export function endToTitle(): void {
  st.mode = "title";
  st.school = false;
  saveProfile(st.profile);
}

// -------------------------------------------------------------- movement ---
// Continuous position in tile space. pos may drift out of bounds while
// crossing a wrap edge; normalizeTile() folds it back.

function normX(m: ParsedMaze, x: number): number {
  if (!m.def.wrapX) return x;
  if (x < -0.5) return x + m.width;
  if (x >= m.width - 0.5) return x - m.width;
  return x;
}
function normY(m: ParsedMaze, y: number): number {
  if (!m.def.wrapY) return y;
  if (y < -0.5) return y + m.height;
  if (y >= m.height - 0.5) return y - m.height;
  return y;
}
/** render-space normalized position (for visuals/collision only) */
export function normPos(m: ParsedMaze): { x: number; y: number } {
  return { x: normX(m, st.player.px), y: normY(m, st.player.py) };
}
export function normGhostPos(g: Ghost): { x: number; y: number } {
  return { x: normX(st.maze, g.px), y: normY(st.maze, g.py) };
}

interface Mover { px: number; py: number; dir: Dir }

/**
 * Advance a mover by `dist` tiles along its direction, honoring wall stops.
 * At every tile center crossed, calls `decide(mover)` which may rewrite
 * mover.dir (return the dir to continue in). Returns true if still moving.
 */
function advance(m: ParsedMaze, mv: Mover, dist: number, ghost: boolean, decide: (tile: Tile) => Dir): void {
  let guard = 12;
  while (dist > 1e-6 && guard-- > 0) {
    if (!isZero(mv.dir)) {
      if (mv.dir.x !== 0) mv.py = Math.round(mv.py);
      if (mv.dir.z !== 0) mv.px = Math.round(mv.px);
    }
    const cx = Math.round(mv.px), cy = Math.round(mv.py);
    const onCenter = Math.abs(mv.px - cx) < 1e-3 && Math.abs(mv.py - cy) < 1e-3;
    if (onCenter) {
      mv.px = normX(m, cx);
      mv.py = normY(m, cy);
      const ncx = Math.round(mv.px), ncy = Math.round(mv.py);
      mv.px = ncx;
      mv.py = ncy;
      if (!ghost) eatThings();
      const d = decide({ x: ncx, y: ncy });
      mv.dir = d;
      if (isZero(d)) return;
    }
    // Compute the exact next tile center along mv.dir from the current continuous position
    let tx: number, ty: number;
    if (onCenter) {
      tx = Math.round(mv.px) + mv.dir.x;
      ty = Math.round(mv.py) + mv.dir.z;
    } else {
      tx = mv.dir.x > 0 ? Math.ceil(mv.px - 1e-6) : mv.dir.x < 0 ? Math.floor(mv.px + 1e-6) : Math.round(mv.px);
      ty = mv.dir.z > 0 ? Math.ceil(mv.py - 1e-6) : mv.dir.z < 0 ? Math.floor(mv.py + 1e-6) : Math.round(mv.py);
    }
    const fromX = Math.round(normX(m, tx - mv.dir.x));
    const fromY = Math.round(normY(m, ty - mv.dir.z));
    const legality = stepTile(m, { x: fromX, y: fromY }, mv.dir, ghost);
    if (!legality) {
      mv.px = fromX;
      mv.py = fromY;
      mv.dir = DIR_NONE;
      if (!ghost) eatThings();
      return;
    }
    const remain = Math.hypot(tx - mv.px, ty - mv.py);
    if (remain < 1e-6) {
      mv.px = normX(m, tx);
      mv.py = normY(m, ty);
      if (!ghost) eatThings();
      continue;
    }
    const step = Math.min(remain, dist);
    mv.px += mv.dir.x * step;
    mv.py += mv.dir.z * step;
    dist -= step;
    if (step >= remain - 1e-9) {
      mv.px = normX(m, tx);
      mv.py = normY(m, ty);
    }
    if (!ghost) eatThings();
  }
}

// ------------------------------------------------------------ player step ---

function autopilotDecide(m: ParsedMaze, tile: Tile): Dir {
  const p = st.player;
  let opts = exits(m, tile, p.dir, false, false);
  if (opts.length === 0) opts = exits(m, tile, p.dir, false, true);
  if (opts.length === 0) return DIR_NONE;

  // Score each candidate neighbor tile: avoid active ghosts, seek frightened ghosts / orbs / fruit / dots
  const distFromHere = bfsDistances(m, tile, false);
  // Find nearest desirable target (frightened ghost > orb > fruit > dot)
  let targetTile: Tile | null = null;
  let bestTargetDist = Infinity;

  if (st.fright > 0.8) {
    for (const g of st.ghosts) {
      if (g.state === "active") {
        const gt = { x: Math.round(normX(m, g.px)), y: Math.round(normY(m, g.py)) };
        const d = distFromHere[idx(m.width, gt.x, gt.y)] ?? -1;
        if (d >= 0 && d < bestTargetDist) { bestTargetDist = d; targetTile = gt; }
      }
    }
  }
  if (!targetTile && st.fruitActive) {
    const d = distFromHere[idx(m.width, m.fruitTile.x, m.fruitTile.y)] ?? -1;
    if (d >= 0 && d <= 8) { bestTargetDist = d; targetTile = m.fruitTile; }
  }
  if (!targetTile) {
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        const i = idx(m.width, x, y);
        if (st.orbs[i] || st.dots[i]) {
          const d = distFromHere[i]!;
          const weight = st.orbs[i] ? Math.max(0, d - 3) : d;
          if (d >= 0 && weight < bestTargetDist) {
            bestTargetDist = weight;
            targetTile = { x, y };
          }
        }
      }
    }
  }

  const distToTarget = targetTile ? bfsDistances(m, targetTile, false) : null;
  let bestOpt = opts[0]!;
  let bestScore = -Infinity;

  for (const o of opts) {
    let score = 0;
    if (distToTarget) {
      const td = distToTarget[idx(m.width, o.x, o.y)] ?? 50;
      score -= td * 2.5;
    }
    if (st.dots[idx(m.width, o.x, o.y)]) score += 4;
    if (st.orbs[idx(m.width, o.x, o.y)]) score += 12;

    // Penalize moving toward dangerous active ghosts
    if (st.fright <= 0.4) {
      for (const g of st.ghosts) {
        if (g.state !== "active") continue;
        const gx = normX(m, g.px), gy = normY(m, g.py);
        const gd = Math.hypot(o.x - gx, o.y - gy);
        if (gd < 2.2) score -= 200;
        else if (gd < 4.0) score -= 45 / gd;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestOpt = o;
    }
  }

  if (p.dashCd <= 0 && st.profile.dashEnabled && st.rng() < 0.18) {
    p.dashQueued = true;
  }

  return dirToward(tile, bestOpt) ?? p.dir;
}

function movePlayer(m: ParsedMaze, dt: number): void {
  const p = st.player;
  const speed = PLAYER_SPEED * (p.dashT > 0 ? DASH_MULT : 1);
  p.dashT = Math.max(0, p.dashT - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  if (p.dashQueued && p.dashCd <= 0 && st.profile.dashEnabled) {
    p.dashT = DASH_TIME;
    p.dashCd = DASH_COOLDOWN;
    st.events.dash = true;
  }
  p.dashQueued = false;

  if (!st.autopilot && !isZero(p.want)) {
    const rawCx = Math.round(p.px), rawCy = Math.round(p.py);
    const cx = Math.round(normX(m, rawCx)), cy = Math.round(normY(m, rawCy));
    // 1. Instant mid-corridor reversal
    if (!isZero(p.dir) && sameDir(p.want, reverseDir(p.dir))) {
      const onCenter = Math.abs(p.px - rawCx) < 1e-3 && Math.abs(p.py - rawCy) < 1e-3;
      if (!onCenter || stepTile(m, { x: cx, y: cy }, p.want, false)) {
        p.dir = p.want;
      }
    } else if (!sameDir(p.want, p.dir)) {
      // 2. Corner-snap / pre-turn assist within 0.32 tiles of a junction center
      const distToCenter = Math.hypot(p.px - rawCx, p.py - rawCy);
      if (distToCenter < 0.32 && stepTile(m, { x: cx, y: cy }, p.want, false)) {
        p.px = cx;
        p.py = cy;
        eatThings();
        p.dir = p.want;
      }
    }
  }

  advance(m, p, speed * dt, false, (tile) => {
    if (st.autopilot) {
      const aiDir = autopilotDecide(m, tile);
      p.want = aiDir;
      return aiDir;
    }
    // buffered turn: adopt want if legal
    if (!isZero(p.want) && !sameDir(p.want, p.dir)) {
      const n = stepTile(m, tile, p.want, false);
      if (n) return p.want;
    }
    const fwd = stepTile(m, tile, p.dir, false);
    if (fwd) return p.dir;
    // 3. Auto-guide around 1-way corners when blocked along p.dir while input is active
    if (p.wantT > 0) {
      const open = exits(m, tile, p.dir, false, false);
      if (open.length === 1) {
        const cornerDir = dirToward(tile, open[0]!);
        if (cornerDir) {
          p.want = cornerDir;
          return cornerDir;
        }
      }
    }
    return DIR_NONE;
  });
  eatThings();
}

// ------------------------------------------------------------- ghost step ---

function ghostTargetTile(g: Ghost): Tile {
  const p = { x: Math.round(normX(st.maze, st.player.px)), y: Math.round(normY(st.maze, st.player.py)) };
  const pd = st.player.dir;
  const blitz = st.ghosts.find((x) => x.id === "blitz")!;
  switch (g.id) {
    case "blitz":
      return p;
    case "sly": {
      // 4 tiles ahead of player heading (clamped into bounds)
      return {
        x: Math.min(st.maze.width - 1, Math.max(0, p.x + pd.x * 4)),
        y: Math.min(st.maze.height - 1, Math.max(0, p.y + pd.z * 4))
      };
    }
    case "flick": {
      // mirror Blitz's tile across the player tile
      const b = { x: Math.round(normX(st.maze, blitz.px)), y: Math.round(normY(st.maze, blitz.py)) };
      return {
        x: Math.min(st.maze.width - 1, Math.max(0, 2 * p.x - b.x)),
        y: Math.min(st.maze.height - 1, Math.max(0, 2 * p.y - b.y))
      };
    }
    case "dim": {
      // chase until close, then scatter to corner
      const d = Math.hypot(g.px - st.player.px, g.py - st.player.py);
      return d > 7 ? p : SCATTER.dim;
    }
  }
}

function ghostSpeed(g: Ghost, tileX: number, tileY: number): number {
  const base = PLAYER_SPEED * GHOST_SPEED_RATIO * (1 + (st.level - 1) * 0.045);
  if (g.state === "eyes") return base * EYES_SPEED_RATIO;
  if (st.fright > 0) return base * FRIGHT_SPEED_RATIO;
  // tunnel slowdown near wrap edges (classic)
  if (st.maze.def.wrapX && (tileX <= 1 || tileX >= st.maze.width - 2)) return base * TUNNEL_SPEED_RATIO;
  return base;
}

function ghostDecide(g: Ghost): (tile: Tile) => Dir {
  return (tile) => {
    const m = st.maze;
    if (g.state === "eyes") {
      // head for the door, then sink in
      const opts = exits(m, tile, g.dir, false, true).filter((t) => !m.ghostOnly[idx(m.width, t.x, t.y)]);
      if (opts.length === 0) return reverseDir(g.dir);
      const dist = bfsDistances(m, m.aboveDoor, false);
      let best = opts[0]!, bestD = Infinity;
      for (const o of opts) {
        const d = dist[idx(m.width, o.x, o.y)]!;
        if (d >= 0 && d < bestD) { bestD = d; best = o; }
      }
      g.target = m.aboveDoor;
      if (best.x === tile.x && best.y === tile.y) return DIR_NONE;
      return dirToward(tile, best) ?? g.dir;
    }
    if (g.state !== "active") return g.dir;

    // active: chase/scatter/fright at junctions
    const opts = exits(m, tile, g.dir, false, false);
    if (opts.length === 0) return DIR_NONE;
    if (opts.length === 1) return dirToward(tile, opts[0]!) ?? g.dir;

    const frightened = st.fright > 0;
    if (frightened) {
      const pick = opts[(st.rng() * opts.length) | 0]!;
      return dirToward(tile, pick) ?? g.dir;
    }

    const scatter = st.wave % 2 === 0; // even waves scatter
    g.target = scatter ? SCATTER[g.id] : ghostTargetTile(g);
    const dist = bfsDistances(m, g.target, false);
    let best = opts[0]!, bestD = Infinity;
    for (const o of opts) {
      const d = dist[idx(m.width, o.x, o.y)]!;
      if (d >= 0 && d < bestD) { bestD = d; best = o; }
      // tie-break: prefer continuing straight
      else if (d >= 0 && d === bestD && dirToward(tile, o) && sameDir(dirToward(tile, o)!, g.dir)) best = o;
    }
    return dirToward(tile, best) ?? g.dir;
  };
}

function dirToward(from: Tile, to: Tile): Dir | null {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (dx === 1 && dy === 0) return DIR_RIGHT;
  if (dx === -1 && dy === 0) return DIR_LEFT;
  if (dx === 0 && dy === 1) return DIR_DOWN;
  if (dx === 0 && dy === -1) return DIR_UP;
  // wrapped exits
  const m = st.maze;
  if (m.def.wrapX) {
    if (dx === m.width - 1) return DIR_LEFT;
    if (dx === -(m.width - 1)) return DIR_RIGHT;
  }
  if (m.def.wrapY) {
    if (dy === m.height - 1) return DIR_UP;
    if (dy === -(m.height - 1)) return DIR_DOWN;
  }
  return null;
}

function moveGhost(g: Ghost, dt: number): void {
  const m = st.maze;
  if (g.state === "house") {
    // bob inside the pen until release time
    if (st.runT >= g.releaseAt) g.state = "exiting";
    return;
  }
  if (g.state === "exiting") {
    // path: house tile → door → aboveDoor, then active
    const target = Math.abs(g.px - m.door.x) < 1e-3 && Math.abs(g.py - m.door.y) < 1e-3
      ? m.aboveDoor
      : m.door;
    const dx = target.x - g.px, dy = target.y - g.py;
    const d = Math.hypot(dx, dy);
    const speed = PLAYER_SPEED * 0.8;
    if (d < speed * dt) {
      g.px = target.x; g.py = target.y;
      if (target === m.aboveDoor) { g.state = "active"; g.dir = DIR_LEFT; }
      else g.dir = dirToward({ x: Math.round(g.px), y: Math.round(g.py) }, m.aboveDoor) ?? DIR_UP;
    } else {
      g.px += (dx / d) * speed * dt;
      g.py += (dy / d) * speed * dt;
      g.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? DIR_RIGHT : DIR_LEFT) : (dy > 0 ? DIR_DOWN : DIR_UP);
    }
    return;
  }
  if (g.state === "entering") {
    // sink from door to center house tile, revive
    const home = m.houseTiles[1] ?? m.houseTiles[0]!;
    const hx = home % m.width, hy = (home / m.width) | 0;
    const dx = hx - g.px, dy = hy - g.py;
    const d = Math.hypot(dx, dy);
    const speed = PLAYER_SPEED * 1.2;
    if (d < speed * dt) {
      g.px = hx; g.py = hy;
      g.state = "house";
      g.releaseAt = st.runT + 1.2;
      st.events.eyesHome = { ghost: g.id };
    } else {
      g.px += (dx / d) * speed * dt;
      g.py += (dy / d) * speed * dt;
    }
    return;
  }
  // staggered release: an active sentry holds its spawn tile until its release time (counted from the first move)
  if (g.state === "active" && st.runT < g.releaseAt) return;
  // eyes or active → tile movement
  const speed = ghostSpeed(g, Math.round(normX(m, g.px)), Math.round(normY(m, g.py)));
  advance(m, g, speed * dt, g.state === "eyes", ghostDecide(g));
  // eyes reached door → enter
  if (g.state === "eyes") {
    const nx = normX(m, g.px), ny = normY(m, g.py);
    if (Math.hypot(nx - m.aboveDoor.x, ny - m.aboveDoor.y) < 0.6) {
      g.state = "entering";
      g.px = m.door.x; g.py = m.door.y;
    }
  }
}

// ----------------------------------------------------------------- update ---

const WANT_LIFE = 0.75;

export function input(dt: number, ctl: { held(a: string): boolean; consume(a: string): boolean; pressed(a: string): boolean }): void {
  const p = st.player;
  const userPressed =
    ctl.pressed("left") || ctl.pressed("right") || ctl.pressed("up") || ctl.pressed("down") ||
    ctl.held("left") || ctl.held("right") || ctl.held("up") || ctl.held("down");
  if (userPressed) {
    st.autopilot = false;
    st.hasMoved = true;
  }
  // buffered turn: a fresh press queues the direction and it stays buffered
  // briefly after release so mid-corridor taps still take at the next junction.
  if (ctl.pressed("left") || ctl.held("left")) { p.want = DIR_LEFT; p.wantT = WANT_LIFE; }
  else if (ctl.pressed("right") || ctl.held("right")) { p.want = DIR_RIGHT; p.wantT = WANT_LIFE; }
  else if (ctl.pressed("up") || ctl.held("up")) { p.want = DIR_UP; p.wantT = WANT_LIFE; }
  else if (ctl.pressed("down") || ctl.held("down")) { p.want = DIR_DOWN; p.wantT = WANT_LIFE; }

  // If Byte is stopped against a wall (or starting from spawn) when the user presses a key,
  // snap to the tile center and set p.dir to a walkable corridor direction without drifting off-center.
  if (userPressed && !isZero(p.want)) {
    const rawCx = Math.round(p.px), rawCy = Math.round(p.py);
    const curTile = { x: Math.round(normX(st.maze, rawCx)), y: Math.round(normY(st.maze, rawCy)) };
    if (!isZero(p.dir) && sameDir(p.want, reverseDir(p.dir))) {
      p.dir = p.want;
    } else if (isZero(p.dir)) {
      p.px = curTile.x;
      p.py = curTile.y;
      if (stepTile(st.maze, curTile, p.want, false)) {
        p.dir = p.want;
      } else {
        if (stepTile(st.maze, curTile, DIR_LEFT, false)) p.dir = DIR_LEFT;
        else if (stepTile(st.maze, curTile, DIR_RIGHT, false)) p.dir = DIR_RIGHT;
        else if (stepTile(st.maze, curTile, DIR_UP, false)) p.dir = DIR_UP;
        else if (stepTile(st.maze, curTile, DIR_DOWN, false)) p.dir = DIR_DOWN;
      }
    }
  }

  // while still held the buffer never expires; on release it decays
  const wantHeld =
    (sameDir(p.want, DIR_LEFT) && ctl.held("left")) ||
    (sameDir(p.want, DIR_RIGHT) && ctl.held("right")) ||
    (sameDir(p.want, DIR_UP) && ctl.held("up")) ||
    (sameDir(p.want, DIR_DOWN) && ctl.held("down"));
  if (wantHeld) p.wantT = WANT_LIFE;
  else if (!st.autopilot) {
    p.wantT -= dt;
    if (p.wantT <= 0) p.want = p.dir;
  }
  if (ctl.consume("dash")) {
    st.autopilot = false;
    st.hasMoved = true;
    p.dashQueued = true;
  }
  if (ctl.consume("camera")) {
    st.camera = st.camera === "follow" ? "overhead" : "follow";
    pushMsg(`Camera: ${st.camera}`);
  }
}

export function frame(dt: number, ctl: { held(a: string): boolean; consume(a: string): boolean; pressed(a: string): boolean }): void {
  st.events = freshEvents();
  if (st.school) dt *= SCHOOL_TIME_SCALE;
  if (st.mode !== "title") st.simTime += dt;
  if (st.msgT > 0) st.msgT -= dt;

  switch (st.mode) {
    case "title":
      return;
    case "gameover":
    case "win":
      if (st.autopilot) {
        st.time += dt;
        if (st.time > 1.5) startRun("quick", st.mazeId);
      }
      return;
    case "ready":
      st.readyT -= dt;
      if (st.readyT <= 0) { st.mode = "play"; st.events.ready = true; }
      // idle ghost bobbing anim data
      st.time += dt;
      return;
    case "dying":
      st.deathT -= dt;
      if (st.deathT <= 0) {
        if (st.lives <= 0) {
          if (st.autopilot) { startRun("quick", st.mazeId); return; }
          gameOver();
          return;
        }
        resetActors();
        st.mode = "play";
        st.readyT = 0;
        pushMsg("GO!");
      }
      st.time += dt;
      return;
    case "cleared":
      st.clearT -= dt;
      st.time += dt;
      if (st.clearT <= 0) advanceMaze();
      return;
    case "play":
      break;
  }

  st.time += dt;
  input(dt, ctl);
  if (!st.autopilot && !st.hasMoved) {
    eatThings();
    return;
  }
  st.runT += dt;
  movePlayer(st.maze, dt);
  for (const g of st.ghosts) moveGhost(g, dt);
  eatThings();
  updateFruit(dt);
  updateWaves(dt);
  if (st.fright > 0) {
    st.fright = Math.max(0, st.fright - dt);
    if (st.fright === 0) st.chain = 0;
  }
  checkCollisions();
  if (st.dotsLeft <= 0 && st.mode === "play") {
    st.mode = "cleared";
    st.clearT = CLEAR_TIME;
    st.events.clear = true;
    const bonus = 100 * st.level;
    st.score += bonus;
    st.newBoardBest = st.score > (st.profile.mazeBest[st.mazeId] ?? 0);
    pushMsg(`${st.maze.def.title} cleared! +${bonus}`);
  }
  checkExtraLife();
}

function checkExtraLife(): void {
  if (st.extraLifeAwarded || st.score < EXTRA_LIFE_AT) return;
  st.extraLifeAwarded = true;
  st.lives = Math.min(MAX_LIVES, st.lives + 1);
  st.events.extraLife = true;
  pushMsg(`EXTRA LIFE at ${EXTRA_LIFE_AT}!`);
}

/** Clear card "Next Board": skip the rest of the clear pause and advance like the timer would (keeps score and lives). */
export function skipClear(): void {
  if (st.mode !== "cleared") return;
  st.clearT = 0;
  advanceMaze();
}

function eatThings(): void {
  const m = st.maze;
  const px = normX(m, st.player.px), py = normY(m, st.player.py);
  const cx = Math.round(px), cy = Math.round(py);
  if (Math.abs(px - cx) < EAT_RADIUS && Math.abs(py - cy) < EAT_RADIUS && tileWalkable(m, { x: cx, y: cy })) {
    const i = idx(m.width, cx, cy);
    if (st.dots[i]) {
      st.dots[i] = 0;
      st.dotsLeft--;
      st.dotsEaten++;
      st.score += 10;
      st.events.dot = true;
    }
    if (st.orbs[i]) {
      st.orbs[i] = 0;
      st.score += 50;
      st.events.orb = true;
      const dur = Math.max(2.2, FRIGHT_BASE - (st.level - 1) * 0.45);
      st.fright = dur;
      st.frightMax = dur;
      st.chain = 0;
      for (const g of st.ghosts) {
        if (g.state === "active") g.dir = reverseDir(g.dir); // classic reversal
        g.frightFlash = false;
      }
      pushMsg("SURGE — sentries overloaded!");
    }
    // fruit pickup
    if (st.fruitActive && cx === m.fruitTile.x && cy === m.fruitTile.y) {
      st.fruitActive = false;
      const kind = m.def.fruit;
      const pts = FRUIT_SCORE[kind];
      st.score += pts;
      st.events.fruit = { kind, points: pts };
      st.events.points.push({ x: cx, y: cy, points: pts });
      pushMsg(`${FRUIT_LABEL[kind]} +${pts}`);
    }
  }
}

function updateFruit(dt: number): void {
  if (st.fruitActive) {
    st.fruitT -= dt;
    if (st.fruitT <= 0) st.fruitActive = false;
    return;
  }
  if (st.fruitStage < FRUIT_TRIGGERS.length && st.dotsEaten >= FRUIT_TRIGGERS[st.fruitStage]) {
    st.fruitActive = true;
    st.fruitT = FRUIT_LIFE;
    st.fruitStage++;
    st.events.fruitSpawn = true;
    pushMsg(`${FRUIT_LABEL[st.maze.def.fruit]} cache unlocked below the hub!`);
  }
}

function updateWaves(dt: number): void {
  if (st.fright > 0) return; // waves pause during fright (classic)
  st.waveT += dt;
  const dur = WAVE_SCHEDULE[st.wave] ?? Infinity;
  if (st.waveT >= dur && st.wave < WAVE_SCHEDULE.length - 1) {
    st.wave++;
    st.waveT = 0;
    for (const g of st.ghosts) if (g.state === "active") g.dir = reverseDir(g.dir); // classic reversal on wave switch
  }
}

function checkCollisions(): void {
  const m = st.maze;
  const px = normX(m, st.player.px), py = normY(m, st.player.py);
  for (const g of st.ghosts) {
    if (g.state !== "active" && g.state !== "eyes") continue;
    const gx = normX(m, g.px), gy = normY(m, g.py);
    const d = Math.hypot(gx - px, gy - py);
    if (d > TOUCH_RADIUS) continue;
    if (g.state === "eyes") continue; // eyes pass through
    if (st.fright > 0) {
      // eat the specter
      const pts = 200 << Math.min(st.chain, 3);
      st.chain++;
      st.score += pts;
      g.state = "eyes";
      g.eaten++;
      g.frightFlash = false;
      st.events.ghostEat = { ghost: g.id, points: pts };
      st.events.points.push({ x: gx, y: gy, points: pts });
      pushMsg(`${GHOST_LABEL[g.id]} disabled +${pts}${st.chain > 1 ? ` x${st.chain}` : ""}`);
    } else if (!st.school) {
      loseLife();
      return;
    }
  }
}

function loseLife(): void {
  st.lives--;
  st.mode = "dying";
  st.deathT = DEATH_TIME;
  st.events.death = true;
  st.fright = 0;
  st.chain = 0;
  pushMsg(st.lives > 0 ? `Intercepted! ${st.lives} ${st.lives === 1 ? "life" : "lives"} left` : "Intercepted! Game over");
}

function gameOver(): void {
  st.mode = "gameover";
  st.school = false;
  if (st.score > st.profile.best) {
    st.profile.best = st.score;
    pushMsg(`NEW BEST — ${st.score}`);
  }
  saveProfile(st.profile);
}

function advanceMaze(): void {
  // record per-maze best + cleared
  const id = st.mazeId;
  st.boardsCleared += 1;
  if (!st.profile.cleared.includes(id)) st.profile.cleared.push(id);
  if (st.score > (st.profile.mazeBest[id] ?? 0)) st.profile.mazeBest[id] = st.score;
  if (st.score > st.profile.best) st.profile.best = st.score;
  saveProfile(st.profile);

  const nextIdx = MAZE_ORDER.indexOf(id) + 1;
  const hasNext = nextIdx < MAZE_ORDER.length;
  // circuit + school runs end at the picked maze; quick play chains all six
  if (st.runKind !== "quick" || !hasNext) {
    st.mode = "win";
    return;
  }
  const nextId = MAZE_ORDER[nextIdx]!;
  st.mazeId = nextId;
  st.maze = parseMaze(mazeSpec(nextId));
  st.level = nextIdx + 1;
  resetBoard();
  st.mode = "ready";
  st.readyT = READY_TIME;
  pushMsg(`${MAZES[nextId].title} — LINK UP!`);
}

// -------------------------------------------------------------- evidence ---
export function evidenceExtra(): Record<string, unknown> {
  const px = +normX(st.maze, st.player.px).toFixed(2);
  const pz = +normY(st.maze, st.player.py).toFixed(2);
  const totalDots = st.maze.dots.length;
  return {
    mode: st.mode,
    runKind: st.runKind,
    maze: st.mazeId,
    mazeTitle: st.maze.def.title,
    level: st.level,
    score: st.score,
    lives: st.lives,
    best: st.profile.best,
    totalDots,
    dotsLeft: st.dotsLeft,
    dotsEaten: totalDots - st.dotsLeft,
    playerTile: [px, pz],
    fright: +st.fright.toFixed(2),
    simTime: +st.simTime.toFixed(3),
    boardsCleared: st.boardsCleared,
    wave: st.wave,
    wavePhase: st.wave % 2 === 0 ? "scatter" : "chase",
    chain: st.chain,
    camera: st.camera,
    school: st.school,
    fruitActive: st.fruitActive,
    player: { x: px, y: pz, dir: st.player.dir },
    dash: { active: st.player.dashT > 0, cooldown: +st.player.dashCd.toFixed(2), enabled: st.profile.dashEnabled },
    ghosts: st.ghosts.map((g) => ({
      id: g.id,
      state: g.state,
      x: +normX(st.maze, g.px).toFixed(2),
      y: +normY(st.maze, g.py).toFixed(2),
      target: g.target,
      eaten: g.eaten
    })),
    events: st.feed.slice(-6),
    nodesOk: st.nodesOk
  };
}
