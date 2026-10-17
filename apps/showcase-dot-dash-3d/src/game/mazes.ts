// Dot Dash 3D — the six maze circuits (19x21 ASCII grids) + per-maze look.
// Legend lives in grid.ts. Every maze carries a center ghost house (G ring
// with D door), a player spawn (P), a fruit tile (F), 4 power orbs (o), and a
// distinct neon palette (the "Tron garden" direction: near-black + emissive).

import type { FruitKind, MazeDef } from "./grid.js";

export const MAZE_ORDER = ["classic", "spiral", "twin", "garden", "foundry", "zerocore"] as const;
export type MazeId = (typeof MAZE_ORDER)[number];

export const MAZES: Record<MazeId, MazeDef> = {
  classic: {
    id: "classic",
    title: "Classic Grid",
    subtitle: "Maze 1 — the original circuit",
    desc: "The arcade legend: side tunnels, open mid-field, four orbs.",
    wrapX: true,
    wrapY: false,
    look: "neon-arcade",
    palette: { wall: "#102444", edge: "#22d3ee", floor: "#16264c", dot: "#ffd147", accent: "#22d3ee" },
    background: "#121f3d",
    fog: null,
    fruit: "cherry",
    theme: "grid",
    rows: [
      "###################",
      "#........#........#",
      "#o##.###.#.###.##o#",
      "#.................#",
      "#.##.#.#####.#.##.#",
      "#....#...#...#....#",
      "####.###.#.###.####",
      "   #.#       #.#   ",
      "####.# ##D## #.####",
      "  .    #GGG#    .  ",
      "####.# ##### #.####",
      "   #.#   F   #.#   ",
      "####.###.#.###.####",
      "#.................#",
      "#.##.###.#.###.##.#",
      "#o.#.....P.....#.o#",
      "##.#.#.#####.#.#.##",
      "#....#...#...#....#",
      "#.######.#.######.#",
      "#.................#",
      "###################"
    ]
  },

  spiral: {
    id: "spiral",
    title: "Spiral Circuit",
    subtitle: "Maze 2 — wind to the core",
    desc: "Concentric neon rings funnel the hunt inward.",
    wrapX: false,
    wrapY: false,
    look: "neon-arcade",
    palette: { wall: "#130b33", edge: "#9b5bff", floor: "#07050f", dot: "#ffc9e8", accent: "#c86bff" },
    background: "#07050f",
    fog: { color: "#07050f", near: 18, far: 60 },
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
    title: "Twin-Tower Loop",
    subtitle: "Maze 3 — orbit the pair",
    desc: "Two reactor towers; the hunt orbits each in turn.",
    wrapX: true,
    wrapY: false,
    look: "neon-arcade",
    palette: { wall: "#0a1626", edge: "#2bd9a9", floor: "#040a10", dot: "#d6f4ff", accent: "#39e6b0" },
    background: "#040a10",
    fog: { color: "#040a10", near: 18, far: 60 },
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
    title: "Garden Overgrown",
    subtitle: "Maze 4 — hedge walls of light",
    desc: "An overgrown circuit; light-dots bloom between hedges.",
    wrapX: true,
    wrapY: false,
    look: "neon-arcade",
    palette: { wall: "#0b1f14", edge: "#4dff88", floor: "#050f08", dot: "#ffe9a3", accent: "#7dff5e" },
    background: "#050f08",
    fog: { color: "#050f08", near: 18, far: 60 },
    fruit: "apple",
    theme: "garden",
    rows: [
      "###################",
      "#....#.......#....#",
      "#o##.#.#####.#.##o#",
      "#............#....#",
      "###.###.#.#.###.###",
      "#......#...#......#",
      "#.####.#.#.#.####.#",
      "#.#    .# ###    .#",
      "#.#.## ##D## ##.#.#",
      "  . .  #GGG#  . .  ",
      "#.#.## ##### ##.#.#",
      "#.#....#.F#....#..#",
      "#.####.#.#.####.#.#",
      "#......#.#......#.#",
      "#.####.#.#.####.#.#",
      "#o...#...#...#....#",
      "###.##.#####.##.###",
      "#....#...P...#....#",
      "#.##.###.#.###.##.#",
      "#.................#",
      "###################"
    ]
  },

  foundry: {
    id: "foundry",
    title: "Night Foundry",
    subtitle: "Maze 5 — the furnace floor",
    desc: "Industrial lattice over molten light.",
    wrapX: false,
    wrapY: false,
    look: "neon-arcade",
    palette: { wall: "#1c1206", edge: "#ff9d2e", floor: "#0d0803", dot: "#ffd27a", accent: "#ff7a2e" },
    background: "#0d0803",
    fog: { color: "#0d0803", near: 16, far: 55 },
    fruit: "melon",
    theme: "foundry",
    rows: [
      "###################",
      "#........#........#",
      "#o##.###.#.###.##o#",
      "#.................#",
      "#.##.#.#####.#.##.#",
      "#....#...#...#....#",
      "#.####.#.#.####.#.#",
      "   #.#       #.#   ",
      "####.# ##D## #.####",
      "##.    #GGG#    .##",
      "####.# ##### #.####",
      "   #.#   F   #.#   ",
      "#.####.#####.####.#",
      "#........#........#",
      "#.##.###.#.###.##.#",
      "#o.#.....P.....#.o#",
      "##.#.#.#####.#.#.##",
      "#....#...#...#....#",
      "#.######.#.######.#",
      "#.................#",
      "###################"
    ]
  },

  zerocore: {
    id: "zerocore",
    title: "Zero-Core",
    subtitle: "Maze 6 — the sphere illusion",
    desc: "Every edge wraps — the reactor ring has no walls to hide behind.",
    wrapX: true,
    wrapY: true,
    look: "neon-arcade",
    palette: { wall: "#14061c", edge: "#ff4dd8", floor: "#0a0310", dot: "#baf3ff", accent: "#ff4dd8" },
    background: "#0a0310",
    fog: { color: "#0a0310", near: 16, far: 52 },
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
  cherry: "CHERRY",
  strawberry: "STRAWBERRY",
  orange: "ORANGE",
  apple: "APPLE",
  melon: "MELON",
  star: "STAR"
};
