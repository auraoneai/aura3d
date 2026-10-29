/**
 * Bunker Zero floor maps — ASCII-grid authored corridor mazes.
 *
 * Legend:
 *   #  wall            %  accent wall         .  floor            ,  floor variant (water/grate)
 *   S  player start    K  brass key           E  elevator exit    D  sliding door
 *   P  push-wall secret (cracked texture cue, slides open with E)
 *   g  guard           d  patrol dog          G  heavy gunner     B  Iron Warden boss
 *   t  treasure 100    T  treasure 500        +  medkit 25        *  plate 10
 *   a  ammo box        r  armor               w  machine gun      W  rocket launcher
 *   !  surplus kit     b  explosive barrel    c  crate prop       o  column
 *   (space) void — renders as wall, unreachable
 */

export const CELL = 3;          // metres per grid cell
export const WALL_H = 3;        // corridor ceiling height
export const SILO_H = 5.4;      // floor-6 silo height

export interface FloorDef {
  readonly id: number;
  readonly name: string;
  readonly subtitle: string;
  readonly par: number;               // medal par time in seconds
  readonly rows: readonly string[];
  readonly palette: {
    readonly wall: string;            // primary wall tint
    readonly wallAlt: string;         // accent wall tint
    readonly floor: string;
    readonly floorAlt: string;        // `,` cells (water / grate)
    readonly ceil: string;
    readonly accent: string;          // trim / key / door tint
    readonly floorEmissive?: string;  // floor-alt emissive (lava/water glow)
  };
}

export const FLOORS: readonly FloorDef[] = [
  {
    id: 0,
    name: "Stone Gatehouse",
    subtitle: "find the brass key · reach the elevator",
    par: 210,
    palette: {
      wall: "#8a8476", wallAlt: "#746e5e", floor: "#524e46", floorAlt: "#635e52",
      ceil: "#3e3c36", accent: "#ffb648"
    },
    rows: [
      "######################",
      "#S..w...g.....b....K.#",
      "#..t..b...d...c......#",
      "#..r..a....g..D...#..#",
      "#.....c....b......#..#",
      "#........g....P...#..#",
      "#..D..g.......c..T#..#",
      "#.....b.......a..##..#",
      "#..####.####..##..#..#",
      "#.#....#....#..#..#..#",
      "#.#.a..#.g..#..#..#..#",
      "#.#.####....#.##P..T##",
      "#.#......d..#.##..#..#",
      "#.#######.###..#..#..#",
      "#....+....#...#...E..#",
      "######################"
    ]
  },
  {
    id: 1,
    name: "Flooded Cellars",
    subtitle: "the water hides what the guards forgot",
    par: 240,
    palette: {
      wall: "#5c706a", wallAlt: "#4e605b", floor: "#3d4845", floorAlt: "#28626c",
      ceil: "#2c3633", accent: "#59d8c9", floorEmissive: "#247b88"
    },
    rows: [
      "######################",
      "#S....#....,,,,..#..K#",
      "#..t..D....,,,,..D...#",
      "#.....#....,,,,..#...#",
      "#.#####.####,,####.###",
      "#.#....#......#...#..#",
      "#.#.a..D..d.g.D...#*.#",
      "#.#....#......#...#..#",
      "#.###.##########.###.#",
      "#...#.....#....P..##.#",
      "#.w.D..#..#..a.t#..#.#",
      "###.####.#T##.###.##.#",
      "#...#..#.#t.#..#..d..#",
      "#.c......T.#..#..#...#",
      "#....#.g.P..#..D..E..#",
      "######################"
    ]
  },
  {
    id: 2,
    name: "Forge Halls",
    subtitle: "mind the grates — the forge never sleeps",
    par: 270,
    palette: {
      wall: "#6e5e50", wallAlt: "#85563b", floor: "#453c34", floorAlt: "#75381c",
      ceil: "#332c26", accent: "#ff8a3a", floorEmissive: "#9e3e0c"
    },
    rows: [
      "######################",
      "#S....#....b..#...T..#",
      "#..t..D......o.D..#..#",
      "#.....#..####..#..#..#",
      "#.###.#..#,,#..#.#.G.#",
      "#.#...#..#,,#..#.#...#",
      "#.#.a.D..P,,#..D..####",
      "#.#...#..#T,#..#.....#",
      "#.###.#..####..###.###",
      "#.#...#..#....P..##..#",
      "#.#.g.D..#.a..#..#.#.#",
      "#.#...#..#....#..#.#.#",
      "#.##..#######.#..#.#.#",
      "#.#K........T..#..#d.#",
      "#..........#..D..E...#",
      "######################"
    ]
  },
  {
    id: 3,
    name: "Officer's Vault",
    subtitle: "the arsenal unlocks here — rockets below",
    par: 300,
    palette: {
      wall: "#4f4438", wallAlt: "#63513a", floor: "#352e26", floorAlt: "#46392c",
      ceil: "#211d18", accent: "#d8b25a"
    },
    rows: [
      "######################",
      "#S....%....t...%....K#",
      "#......%..###..%.##..#",
      "#.g..D...#...#..D.#..#",
      "#......%.#.g.#.%..#..#",
      "#.####...#...#.##.#..#",
      "#.#..#...D...#..#.#..#",
      "#.#..P...###.#..#.####",
      "#.#..#.T.#...#.W.#...#",
      "#.###..#.#.t.#.###.#.#",
      "#...#..#.#...#..a..#.#",
      "#.G.#..#.#####.###.#.#",
      "#...#..#.....#..#..#.#",
      "#.####.###.###P..#.D.#",
      "#..T......G..#...E...#",
      "######################"
    ]
  },
  {
    id: 4,
    name: "The Descent",
    subtitle: "cold steel all the way down",
    par: 300,
    palette: {
      wall: "#46505e", wallAlt: "#3a4554", floor: "#2a3038", floorAlt: "#33404e",
      ceil: "#1c222b", accent: "#7dfcff"
    },
    rows: [
      "######################",
      "#S....#..........#..K#",
      "#..g..D.########.##..#",
      "#.....#.#......#..#..#",
      "#.#####.#.G..d.#..#..#",
      "#.#...#.#......#..#..#",
      "#.#.a.#.###.###..#..##",
      "#.#...#.#...#.#..#...#",
      "#.###.#.#.t.#.#.###.##",
      "#.#...#.###.#.#...P..#",
      "#.#...#..#..#.###.##.#",
      "#.D...#.#.a...#...#..#",
      "#.#####.###.###.P..#.#",
      "#.#.*...#..b..#..W.#.#",
      "#..T....#.....D..E...#",
      "######################"
    ]
  },
  {
    id: 5,
    name: "Bunker Zero",
    subtitle: "the Iron Warden guards the last door",
    par: 420,
    palette: {
      wall: "#4c3f2e", wallAlt: "#63513a", floor: "#32291e", floorAlt: "#413425",
      ceil: "#201a12", accent: "#ffc95e"
    },
    rows: [
      "######################",
      "#S.w..%.......%.....K#",
      "#..t...%.b.b..%..##..#",
      "#..g..D........D..#.*#",
      "#....P.%.c.c..%..#...#",
      "#.###....G....##.#...#",
      "#.#..D....##....#..g.#",
      "#.#a.#...#..#...#....#",
      "#.#..P...#....#.##.###",
      "#.#..#T..#.B.#..#..T.#",
      "#.#..#.a.#....#.##...#",
      "#.####...#.#..#..#.g.#",
      "#W.d..#..#.#..D..#...#",
      "#.....#..#.#..#..#.r.#",
      "#..G....#..#..#..D..E#",
      "######################"
    ]
  }
];

/** Kill House Skill Lab: one arena, every enemy placed at the start, 90-second clock. */
export const KILL_HOUSE: FloorDef = {
  id: 90,
  name: "Kill House",
  subtitle: "timed gallery · clear the floor",
  par: 90,
  palette: {
    wall: "#55463a", wallAlt: "#443830", floor: "#2c2620", floorAlt: "#3a3028",
    ceil: "#1c1712", accent: "#ffb648"
  },
  rows: [
    "######################",
    "#S......#.......#....#",
    "#.......D..b.c..D..g.#",
    "#..t....#.......#....#",
    "###.#####..d..#####..#",
    "#...#.....g...#...#..#",
    "#.a.#..o....o.#.a.#..#",
    "#...D...#.#...D...#..#",
    "#...#..o...o..#...#..#",
    "#.+.#....G....#.+.#..#",
    "###.#####..######..###",
    "#...#...g..d.#.....#.#",
    "#...D........D..G..#.#",
    "#...#....#...#.....#.#",
    "#..T..#..#...#..t..E.#",
    "######################"
  ]
};

export interface CellSpawn {
  readonly cx: number;
  readonly cz: number;
  readonly ch: string;
}

export function parseFloor(def: FloorDef) {
  const h = def.rows.length;
  const w = def.rows[0].length;
  const cells: string[] = [];
  const spawns: CellSpawn[] = [];
  for (let z = 0; z < h; z++) {
    const row = def.rows[z];
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? " ";
      cells.push(ch);
      if (ch !== "#" && ch !== "%" && ch !== " " && ch !== "." && ch !== ",") spawns.push({ cx: x, cz: z, ch });
    }
  }
  const at = (x: number, z: number) => (x < 0 || z < 0 || x >= w || z >= h ? " " : cells[z * w + x]);
  return { w, h, cells, at, spawns };
}

/** A solid wall cell (or a closed push-wall) blocks movement and sight. */
export const isSolid = (ch: string) => ch === "#" || ch === "%" || ch === " " || ch === "P";
/** A prop-occupied cell blocks movement but is still floor for BFS/AI paths. */
export const isBlocked = (ch: string) => isSolid(ch) || ch === "o" || ch === "b" || ch === "c";
