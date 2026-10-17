/** Cross Hop — theme + lane-type tables. Pure data; no engine imports. */

export type LaneType = "meadow" | "road" | "tram" | "river" | "rail" | "lava";

export interface ThemeDef {
  readonly id: string;
  readonly label: string;
  readonly look: string;
  readonly fogScale: number;
  readonly exposureEv: number;
  readonly palette: {
    readonly sky: string;
    readonly horizon: string;
    readonly meadow: string;
    readonly road: string;
    readonly shoulder: string;
    readonly water: string;
    readonly railbed: string;
    readonly lava: string;
    readonly crust: string;
    readonly accent: string;
    readonly dressingA: string;
    readonly dressingB: string;
  };
  /** lane-type weights (meadow implied rest); order: meadow, road, tram, river, rail, lava */
  readonly laneWeights: readonly [number, number, number, number, number, number];
  readonly dress: "trees" | "city" | "reeds" | "basalt" | "neon" | "candy";
  readonly vehicleSet: "cars" | "trams" | "mixed" | "hover";
}

export const LANE_D = 1.15;      // depth of one row on z
export const COL_W = 1.0;        // width of one column on x
export const COL_MIN = -7;
export const COL_MAX = 7;
export const FIELD_HALF = 12.5;  // movers travel within ±FIELD_HALF
export const STRIP_W = 34;       // lane strip visual width

export const THEMES: readonly ThemeDef[] = [
  {
    id: "meadow",
    label: "Meadow Roads",
    look: "outdoor-day",
    fogScale: 0,
    exposureEv: -0.15,
    palette: {
      sky: "#4a7ab5", horizon: "#6da0d6",
      meadow: "#58a75c", road: "#3a3f46", shoulder: "#6fbf6e", water: "#3f8fd2",
      railbed: "#5c564e", lava: "#ff6a2a", crust: "#4a3a33", accent: "#ffd166",
      dressingA: "#3e8e4f", dressingB: "#8a5a3b"
    },
    laneWeights: [34, 40, 0, 14, 8, 0],
    dress: "trees",
    vehicleSet: "cars"
  },
  {
    id: "downtown",
    label: "Downtown Trams",
    look: "overcast",
    fogScale: 0,
    exposureEv: -0.15,
    palette: {
      sky: "#4f6d92", horizon: "#7391b5",
      meadow: "#7ba05b", road: "#40444c", shoulder: "#8f8f98", water: "#5b7f9e",
      railbed: "#6e6a63", lava: "#ff6a2a", crust: "#4a3a33", accent: "#f2c94c",
      dressingA: "#8d97a3", dressingB: "#5e6773"
    },
    laneWeights: [22, 30, 26, 6, 12, 0],
    dress: "city",
    vehicleSet: "trams"
  },
  {
    id: "riverbend",
    label: "Riverbend",
    look: "golden-hour",
    fogScale: 0,
    exposureEv: -0.15,
    palette: {
      sky: "#4d7bb0", horizon: "#76a2d1",
      meadow: "#7caa54", road: "#4a423c", shoulder: "#97b765", water: "#4e8fb8",
      railbed: "#5c5044", lava: "#ff6a2a", crust: "#4a3a33", accent: "#ffb347",
      dressingA: "#4f7d3a", dressingB: "#c98a5a"
    },
    laneWeights: [26, 22, 0, 38, 8, 0],
    dress: "reeds",
    vehicleSet: "cars"
  },
  {
    id: "emberline",
    label: "Emberline",
    look: "night-city",
    fogScale: 0,
    exposureEv: -0.15,
    palette: {
      sky: "#283852", horizon: "#4a5d7a",
      meadow: "#4e5548", road: "#2c2724", shoulder: "#6b5346", water: "#402d26",
      railbed: "#3a2e28", lava: "#ff5a1f", crust: "#352520", accent: "#ff9c41",
      dressingA: "#6e3b26", dressingB: "#2c1e18"
    },
    laneWeights: [16, 26, 0, 0, 24, 32],
    dress: "basalt",
    vehicleSet: "mixed"
  },
  {
    id: "neon",
    label: "Neon District",
    look: "neon-arcade",
    fogScale: 0,
    exposureEv: -0.15,
    palette: {
      sky: "#1d2c52", horizon: "#31497d",
      meadow: "#3f5a52", road: "#221d33", shoulder: "#342b52", water: "#2a3f66",
      railbed: "#241f38", lava: "#ff4fd8", crust: "#2c2038", accent: "#37f5ff",
      dressingA: "#37f5ff", dressingB: "#ff4fd8"
    },
    laneWeights: [14, 34, 16, 12, 20, 0],
    dress: "neon",
    vehicleSet: "hover"
  },
  {
    id: "crittercore",
    label: "Critter Core",
    look: "character-showcase",
    fogScale: 0,
    exposureEv: -0.15,
    palette: {
      sky: "#5282c2", horizon: "#7caae3",
      meadow: "#8fd67c", road: "#7a6cc9", shoulder: "#ffd9ec", water: "#67d6e8",
      railbed: "#a08ecb", lava: "#ff8a5c", crust: "#5b4a8f", accent: "#ffe14f",
      dressingA: "#ff9ed2", dressingB: "#7ce8c9"
    },
    laneWeights: [18, 24, 10, 20, 12, 14],
    dress: "candy",
    vehicleSet: "mixed"
  }
] as const;

export const CRITTER_CORE_MIN_ROW = 100;
export const THEME_STRIDE = 25;

/** Deterministic theme for a hop count: 5 base themes cycle every 25 hops;
 *  Critter Core enters the rotation only post-100 (PRD exotic tier). */
export function themeIndexForRow(row: number, seed: number): number {
  const shift = Math.floor(row / THEME_STRIDE);
  if (shift <= 0) return 0;
  const pool = row >= CRITTER_CORE_MIN_ROW ? THEMES.length : THEMES.length - 1;
  // deterministic-but-remixed pick: stride index + seed scatter
  const h = Math.sin(shift * 127.1 + seed * 311.7) * 43758.5453;
  return Math.abs(Math.floor(h)) % pool;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
