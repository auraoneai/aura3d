// Glint Courier — the six maze boards (19x21 ASCII grids) + per-maze look.
// Legend lives in grid.ts. Every maze carries a center ghost house (G ring
// with D door), a player spawn (P), a cache tile (F), 4 surge cells (o), and a
// distinct neon palette (dark board + emissive trace lines).

import type { FruitKind, MazeDef } from "./grid.js";

export const MAZE_ORDER = ["classic", "spiral", "twin", "garden", "foundry", "zerocore"] as const;
export type MazeId = (typeof MAZE_ORDER)[number];

export const MAZES: Record<MazeId, MazeDef> = {
  classic: {
    id: "classic",
    title: "Relay Grid",
    subtitle: "Maze 1 — warm-up board",
    desc: "A copper relay board: long runs, offset bays, side tunnels and four surge cells.",
    wrapX: true,
    wrapY: false,
    look: "neon-arcade",
    palette: { wall: "#5c4630", edge: "#ffb23e", floor: "#24443a", dot: "#5ff3ff", accent: "#ffb23e" },
    background: "#0e1a17",
    fruit: "cherry",
    theme: "grid",
    rows: [
      "###################",
      "#o....#.....#....o#",
      "#.####.#.#.#.####.#",
      "#......#...#......#",
      "###.##.#.#.#.##.###",
      "#...#.........#...#",
      "#.#.#.###.###.#.#.#",
      "#.....       .....#",
      "#.###. ##D## .###.#",
      "  .... #GGG# ....  ",
      "#.###. ##### .###.#",
      "#.....   F   .....#",
      "#.#.#.###.###.#.#.#",
      "#...#.........#...#",
      "###.##.#.#.#.##.###",
      "#o.....#.P.#.....o#",
      "#.####.#.#.#.####.#",
      "#......#...#......#",
      "#.####.#####.####.#",
      "#.................#",
      "###################"
    ]
  },

  spiral: {
    id: "spiral",
    title: "Coil Loop",
    subtitle: "Maze 2 — wind to the core",
    desc: "Concentric coils funnel the patrol inward.",
    wrapX: false,
    wrapY: false,
    look: "neon-arcade",
    palette: { wall: "#130b33", edge: "#9b5bff", floor: "#07050f", dot: "#ffc9e8", accent: "#c86bff" },
    background: "#07050f",
    fruit: "strawberry",
    theme: "spiral",
    rows: [
      "###################",
      "#.................#",
      "#.########.########",
      "#.................#",
      "########.########.#",
      "#.................#",
      "#.########.########",
      "#........ ........#",
      "###.##.##D##.##.###",
      "#...#..#GGG#..#..##",
      "#.#.#.#.#####.#.#.#",
      "#.#.#.#...F...#.#.#",
      "#.#.###.#####.###.#",
      "#.#.....#...#.....#",
      "#.#####.#.#.#####.#",
      "#o......#.#......o#",
      "##.####.#.#.####.##",
      "#.....#...P...#...#",
      "#.###.#.#####.#.###",
      "#.................#",
      "###################"
    ]
  },

  twin: {
    id: "twin",
    title: "Twin Pylons",
    subtitle: "Maze 3 — orbit the pair",
    desc: "Two relay pylons; the patrol orbits each in turn.",
    wrapX: true,
    wrapY: false,
    look: "neon-arcade",
    palette: { wall: "#0a1626", edge: "#2bd9a9", floor: "#040a10", dot: "#d6f4ff", accent: "#39e6b0" },
    background: "#040a10",
    fruit: "orange",
    theme: "towers",
    rows: [
      "###################",
      "#........#........#",
      "#o###.##.#.##.###o#",
      "#.................#",
      "#.###.#.###.#.###.#",
      "#.#...#.....#...#.#",
      "#.#.###.#.#.###.#.#",
      "#.#.#       ###.#.#",
      "#.#..# ##D## #.#..#",
      "  .    #GGG#    .  ",
      "#.#..# ##### #.#..#",
      "#.#.#...F.#...#.#.#",
      "#.#.###.#.###.#.#.#",
      "#.#...#.#.#...#.#.#",
      "#.###.#.#.#.###.#.#",
      "#.................#",
      "#o###.##.#.##.###o#",
      "#....#....P....#..#",
      "#.##.#.#####.#.##.#",
      "#.................#",
      "###################"
    ]
  },

  garden: {
    id: "garden",
    title: "Overgrowth",
    subtitle: "Maze 4 — vines on the board",
    desc: "A board reclaimed by glowing vines; shards bloom between the hedges.",
    wrapX: true,
    wrapY: false,
    look: "neon-arcade",
    palette: { wall: "#0b1f14", edge: "#4dff88", floor: "#050f08", dot: "#ffe9a3", accent: "#7dff5e" },
    background: "#050f08",
    fruit: "apple",
    theme: "garden",
    rows: [
      "###################",
      "#o.#...........#.o#",
      "#.##.####.####.##.#",
      "#....#.......#....#",
      "####.#.##.##.#.####",
      "#.................#",
      "#.##.###.#.###.##.#",
      "#..#.         .#..#",
      "#.##.. ##D## ..##.#",
      "  .#.. #GGG# ..#.  ",
      "#.##.. ##### ..##.#",
      "#..#.    F    .#..#",
      "#.##.###.#.###.##.#",
      "#.................#",
      "####.#.##.##.#.####",
      "#o...#...P...#...o#",
      "#.##.####.####.##.#",
      "#....#.......#....#",
      "#.####.##.##.####.#",
      "#.................#",
      "###################"
    ]
  },

  foundry: {
    id: "foundry",
    title: "Smelter Rows",
    subtitle: "Maze 5 — the furnace floor",
    desc: "Long horizontal ingots over molten light; the rows are the whole game.",
    wrapX: false,
    wrapY: false,
    look: "neon-arcade",
    palette: { wall: "#1c1206", edge: "#ff9d2e", floor: "#0d0803", dot: "#ffd27a", accent: "#ff7a2e" },
    background: "#0d0803",
    fruit: "melon",
    theme: "foundry",
    rows: [
      "###################",
      "#.................#",
      "#o######.#.######o#",
      "#.................#",
      "#.#####.#.#.#####.#",
      "#.#.....#.#.....#.#",
      "#...###.....###...#",
      "##..#.       .#..##",
      "##.#.. ##D## ..#.##",
      "  .#.. #GGG# ..#.  ",
      "##.#.. ##### ..#.##",
      "##..#.   F   .#..##",
      "#...###.....###...#",
      "#.#.....#.#.....#.#",
      "#.#####.#.#.#####.#",
      "#o.......P.......o#",
      "#.######...######.#",
      "#.................#",
      "#.#.###.#.#.###.#.#",
      "#.................#",
      "###################"
    ]
  },

  zerocore: {
    id: "zerocore",
    title: "Zero-Core",
    subtitle: "Maze 6 — no edges",
    desc: "Every edge wraps — the reactor ring has no walls to hide behind.",
    wrapX: true,
    wrapY: true,
    look: "neon-arcade",
    palette: { wall: "#14061c", edge: "#ff4dd8", floor: "#0a0310", dot: "#baf3ff", accent: "#ff4dd8" },
    background: "#0a0310",
    fruit: "star",
    theme: "reactor",
    rows: [
      "######### #########",
      "#.................#",
      "#.o###.#####.###o.#",
      "#.................#",
      "#.###.#.###.#.###.#",
      "#.....#..#..#.....#",
      "#####.#..#..#.#####",
      "   #.#       #.#   ",
      "####.# ##D## #.####",
      "....   #GGG#   ....",
      "####.# ##### #.####",
      "   #.#   F   #.#   ",
      "#####.###.###.#####",
      "#.....#..#..#.....#",
      "#.###.#.###.#.###.#",
      "#.................#",
      "#.o###.#####.###o.#",
      "#.....#...P...#...#",
      "#.###.#.###.#.###.#",
      "#.................#",
      "######### #########"
    ]
  }
};

export const mazeSpec = (id: MazeId): MazeDef => MAZES[id];
export const nextMazeId = (id: MazeId): MazeId | null => {
  const i = MAZE_ORDER.indexOf(id);
  return i >= 0 && i < MAZE_ORDER.length - 1 ? MAZE_ORDER[i + 1]! : null;
};

/** Fruit icon labels for HUD/circuit map. */
export const FRUIT_LABEL: Record<FruitKind, string> = {
  cherry: "RUBY",
  strawberry: "ROSE QUARTZ",
  orange: "AMBER",
  apple: "EMERALD",
  melon: "AQUA",
  star: "PRISM"
};
