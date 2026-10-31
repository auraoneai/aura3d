// Glint Courier — GU47 look table ("Night shift on the workbench", WP-23). One row per board: the six boards are six
// PCB types under the same desk lamp late at night. Pure data and maths (no engine imports) so it is unit-tested.
// The pre-GU47 per-board palette (palette.ts boardLook / REFERENCE_LOOK) is no longer drawn; mazes.ts keeps its
// colours for the Board Map cards.

import type { MazeId } from "./mazes.js";

/** Catalogue HDRI (E-A, served at /hdri/indoor-workshop_1k.hdr): image-based fill only, never drawn as the background. */
export const LOOK_HDRI = { id: "indoor-workshop", url: "/hdri/indoor-workshop_1k.hdr" } as const;

/** Desk-lamp key (DD47-L1): one shadowed PCSS spot from the upper left of the bench. */
export const LAMP = {
  position: [-13, 19, 9] as const,
  target: [-1.5, 0, -0.5] as const,
  /** Half-angle in radians: the cone covers the board and falls off past its right third. */
  angle: 0.8,
  /** Phase 3 (4.7.1): a wider, softer cone (was 0.66 / 0.62) so the lamp's falloff reaches the far bench and the
   * top of the frame reads as lit walnut instead of a void (rubric: environment, lighting). */
  penumbra: 0.78,
  /** Range window (world units); the lamp is ~24 units from the board centre, so the default 12 would cut it off. */
  distance: 90,
  decay: 2
} as const;

/** Cool unshadowed bounce (DD47-L1): the old directional, now 0.25 from the far right of the room. */
export const BOUNCE = { position: [15, 11, -13] as const, target: [0, 0, 0] as const, color: "#9db4d8", intensity: 0.25 } as const;

/**
 * The PCB and what it sits on (DD47-E2). The board is the maze (19 x 21 tiles, +-9.5 x +-10.5) plus a component margin
 * for the perimeter kit (pedestals at x +-10.8, stubs out to x +-16.1): 34 x 26, top at y -0.02 like the old slab. The
 * anti-static mat and the walnut top reach far past every camera edge (phones pull back ~2.7x), so the frame never ends
 * in a void.
 */
export const BENCH = {
  board: { size: [34, 0.32, 26] as const, y: -0.18 },
  /** Anti-static mat between the board and the wood (top at -0.35). */
  mat: { size: [44, 0.05, 34] as const, y: -0.375 },
  /** Walnut bench top (top at -0.40). */
  wood: { size: [180, 1, 130] as const, y: -0.9 }
} as const;

/**
 * Moving practicals (DD47-L2): a cyan point rides the courier; four pooled points sit amber on live surge cells and
 * turn slate on the sentries while a surge runs. Six non-key lights with the bounce (art direction `practicals: 6`).
 * Unshadowed; the engine caps punctual lights per tier.
 */
export const PRACTICALS = {
  courier: { color: "#5ff3ff", intensity: 4, distance: 4.5, decay: 2, height: 1.1 },
  surge: { color: "#ffb23e", intensity: 2.4, distance: 3.6, decay: 2, height: 0.9 },
  sentry: { color: "#8fa6b8", intensity: 1.6, distance: 3.2, decay: 2, height: 1.2 },
  pooled: 4
} as const;

/** Parallax-corrected reflection probe over the board (DD47-E1). */
export const BOARD_PROBE = {
  position: [0, 2.5, 0] as const,
  box: { min: [-17.5, -0.5, -13.5] as const, max: [17.5, 6, 13.5] as const },
  resolution: 128 as const,
  intensity: 1
} as const;

/** Signature macro DOF (DD47-P1): metric lens; the focus distance follows the camera to the board centre. */
/**
 * Phase 3 (4.7.1) lamp haze: a thin height-bound volumetric inscatter lit from the lamp and a faint cone mesh along the
 * lamp axis, so the warm cone reads in the air above the board (rubric: atmosphere). Both stay low so the board
 * and the HUD read through them.
 */
export const LAMP_HAZE = {
  fog: { density: 0.008, color: "#6a5238", intensity: 0.4, heightFalloff: 0.16, godRayDensity: 0.45 },
  cone: { color: "#ffd9a8", intensity: 0.32, length: 24, softness: 0.85 }
} as const;

/**
 * Phase 3 (4.7.1) room: the bench meets a painted wall behind the board with a pegboard and a shelf, so the top of
 * the frame is a workshop instead of a void (rubric: environment). Primitives only (no generated assets; the bench
 * props stay WP-36). The desktop camera looks steeply down, so it sees the foot of the wall and the pegboard; phones
 * (which pull back) see more of it.
 */
export const ROOM = {
  wall: { z: -19, height: 26, color: "#4a4038", roughness: 0.92 },
  pegboard: { x: 2, y: 2.4, width: 30, height: 4.4, color: "#8a7255", roughness: 0.85 },
  holes: { cols: 29, rows: 4, pitch: 1, color: "#2a221c" },
  shelf: { y: 5.4, depth: 1.6, color: "#6a4630", roughness: 0.6 },
  /** Printed grid on the anti-static mat (every 2 units), so the margin reads as a mat rather than a flat slab. */
  matGrid: { pitch: 2, width: 0.05, color: "#8a9cab" }
} as const;

/** Phase 3 (4.7.1): the board sits a little smaller in frame so the bench and the room show around it. */
export const FRAME_PULL_BACK = 1.06;

export const MACRO_DOF = { fStop: 2, focalLength: 85, maxBlur: 6 } as const;
/** Camera-to-board-centre distance of the base rig ([0, 17.2, 13.8] -> origin), before the aspect pull-back. */
export const BASE_FOCUS_DISTANCE = Math.hypot(17.2, 13.8);

/**
 * Per-board display LUT strength (DD47-P3). The six `.cube` files are procedural split tones written by
 * `scripts/write-board-luts.mjs` into `public/luts/dot-dash-3d/`; the S10b grade binds the identity LUT until a file
 * loads, so the first frames read as the plain grade.
 */
export const LUT_INTENSITY = 0.8;

/** Lens stack (DD47-P2), shared by every board; per-board grade terms live in the rows. */
export const LENS = {
  bloom: { intensity: 0.55, threshold: 0.92, radius: 0.42 },
  vignette: { intensity: 0.2, smoothness: 0.7 },
  chromaticAberration: 0.0012,
  grain: 0.02,
  toneMapping: "aces" as const
} as const;

export interface BoardLookRow {
  readonly board: MazeId;
  /** PCB type this board is (identity sheet). */
  readonly pcb: string;
  readonly timeOfDay: "late night";
  /** Solder mask over bare substrate (slab albedo between the traces). */
  readonly mask: string;
  /** Mask roughness (glossy mask catches the lamp). */
  readonly maskRoughness: number;
  /** Trace and pad metal (HASL, ENIG gold or bare copper). */
  readonly copper: string;
  /** Silkscreen ink (labels, pad outlines). */
  readonly silk: string;
  /** Shard LED lens colour: the collectible (accent). */
  readonly led: string;
  /** Colour the copper traces glow behind the courier (signature effect). */
  readonly traceGlow: string;
  /** Desk lamp: colour, intensity (candela-like, inverse square) and the colour temperature it stands for. */
  readonly lamp: { readonly color: string; readonly intensity: number; readonly temperatureK: number };
  readonly hdri: { readonly id: typeof LOOK_HDRI.id; readonly intensity: number; readonly rotationDeg: number };
  /** Room haze (exp2 density) and the clear colour behind the bench. */
  readonly fog: { readonly color: string; readonly density: number };
  readonly background: string;
  /** Per-board grade over the lens stack (DD47-P3); `lut` is the board's .cube (served path). */
  readonly grade: { readonly contrast: number; readonly saturation: number; readonly temperature: number; readonly tint: number; readonly lut: string };
}

// Phase 3 (4.7.1): the dark-mask boards (classic, foundry, zerocore) take a brighter lamp (+25-35%) so their
// steady-state frames reach the declared luma band (mean 42-60, p95 >= 200) instead of sitting at mean 32-40.
const ROOM_FOG = "#1a120c";

const row = (r: Omit<BoardLookRow, "timeOfDay" | "hdri" | "fog" | "background"> & { readonly hdriIntensity?: number; readonly fogDensity?: number }): BoardLookRow => {
  const { hdriIntensity, fogDensity, ...rest } = r;
  return {
    ...rest,
    timeOfDay: "late night",
    hdri: { id: LOOK_HDRI.id, intensity: hdriIntensity ?? 0.45, rotationDeg: 205 },
    fog: { color: ROOM_FOG, density: fogDensity ?? 0.006 },
    background: ROOM_FOG
  };
};

/** One row per board (MAZE_ORDER): the luma targets `dot-dash-3d--<board>` shoot each through `?maze=<board>`. */
export const BOARD_LOOKS: Readonly<Record<MazeId, BoardLookRow>> = {
  classic: row({
    board: "classic",
    pcb: "green FR-4 relay board, bare copper, silver pads",
    mask: "#1f4a38", maskRoughness: 0.3, copper: "#c8743a", silk: "#e9e6d6", led: "#5ff3ff", traceGlow: "#ffb070",
    lamp: { color: "#ffc58a", intensity: 4300, temperatureK: 3000 },
    grade: { contrast: 1.08, saturation: 1.06, temperature: 0.08, tint: 0, lut: "/luts/dot-dash-3d/classic.cube" }
  }),
  spiral: row({
    board: "spiral",
    pcb: "lilac-mask RF coil board, ENIG gold",
    // Blind-panel fix pass: the deep purple mask read flat and dark around black chips; a pale lilac mask (garden's
    // white-mask recipe, which the panel preferred) lets the lamp model the board and the chips stand out.
    mask: "#c6b8e2", maskRoughness: 0.4, copper: "#c99a3e", silk: "#3a2856", led: "#ff6fd0", traceGlow: "#ffc24a",
    lamp: { color: "#fff0dc", intensity: 2600, temperatureK: 3900 },
    grade: { contrast: 1.1, saturation: 1.04, temperature: 0.04, tint: 0.06, lut: "/luts/dot-dash-3d/spiral.cube" }
  }),
  twin: row({
    board: "twin",
    pcb: "pale-blue power board, ENIG gold",
    // Blind-panel fix pass: the navy mask read flat and dark; a pale blue-white mask (garden's recipe) with gold
    // traces gives the lamp something to model and makes the cyan courier read.
    mask: "#b9cbe4", maskRoughness: 0.4, copper: "#cda04a", silk: "#1c3058", led: "#2fd6ff", traceGlow: "#4fe3ff",
    lamp: { color: "#fff2e0", intensity: 2600, temperatureK: 4100 },
    grade: { contrast: 1.07, saturation: 1.02, temperature: -0.04, tint: -0.02, lut: "/luts/dot-dash-3d/twin.cube" }
  }),
  garden: row({
    board: "garden",
    pcb: "white-mask LED lighting board, ENIG gold",
    mask: "#cfd5c4", maskRoughness: 0.42, copper: "#cfa24c", silk: "#3b4a2c", led: "#8dff6a", traceGlow: "#c4ff7a",
    lamp: { color: "#fff0d8", intensity: 2600, temperatureK: 4000 },
    grade: { contrast: 1.06, saturation: 1.08, temperature: 0, tint: -0.04, lut: "/luts/dot-dash-3d/garden.cube" }
  }),
  foundry: row({
    board: "foundry",
    pcb: "red heavy-copper power board",
    mask: "#7a2018", maskRoughness: 0.34, copper: "#d4834a", silk: "#f6efe4", led: "#ffd27a", traceGlow: "#ff9a5a",
    lamp: { color: "#ffbe80", intensity: 4200, temperatureK: 2800 },
    grade: { contrast: 1.1, saturation: 1.02, temperature: 0.1, tint: 0.02, lut: "/luts/dot-dash-3d/foundry.cube" }
  }),
  zerocore: row({
    board: "zerocore",
    pcb: "matte black reactor board, ENIG gold",
    mask: "#1f1f28", maskRoughness: 0.5, copper: "#d7a74e", silk: "#d8d2e6", led: "#ff5fdc", traceGlow: "#ff9cf0",
    lamp: { color: "#ffd9b0", intensity: 4800, temperatureK: 3400 },
    grade: { contrast: 1.12, saturation: 1.05, temperature: 0.02, tint: 0.08, lut: "/luts/dot-dash-3d/zerocore.cube" }
  })
};

/** Fixed parts of the board, the same on every PCB type. */
export const BOARD_PARTS = {
  /** Black epoxy chip walls (DD47-M2). */
  epoxy: { color: "#141416", roughness: 0.38, clearcoat: 0.6 },
  /** Gull-wing pins along every corridor face (DD47-M2). */
  pin: { color: "#c9ced6", roughness: 0.22, metalness: 1 },
  /** Walnut bench and anti-static mat (DD47-E2). */
  walnut: { color: "#7a4c2e", roughness: 0.55 },
  mat: { color: "#3a4752", roughness: 0.8 },
  /** Surge cells are capacitor cans with glowing vents (DD47-M3). */
  can: { color: "#2b2d33", roughness: 0.3, metalness: 0.8 },
  vent: "#ffb23e"
} as const;

/** Perimeter gem pedestals (x, z), 1.25 wide: drawn by world.ts, outlined in silkscreen by the board bake. */
export const PEDESTALS: readonly (readonly [number, number])[] = [
  [-10.8, 9.2], [10.8, 9.2],
  [-10.8, 6.0], [10.8, 6.0],
  [-10.8, 1.5], [10.8, 1.5],
  [-10.8, -3.5], [10.8, -3.5],
  [-10.8, -8.5], [10.8, -8.5]
];

/** sRGB hex to [r, g, b] in 0..1. */
export function hexRgb(hex: string): readonly [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

/** Rec. 709 luma (0..255) of an sRGB hex colour. */
export function hexLuma(hex: string): number {
  const [r, g, b] = hexRgb(hex);
  return 255 * (0.2126 * r + 0.7152 * g + 0.0722 * b);
}

/** Distance from the camera to the point it looks at: the macro DOF focus (DD47-P1). */
export function focusDistance(position: readonly [number, number, number], target: readonly [number, number, number]): number {
  return Math.hypot(position[0] - target[0], position[1] - target[1], position[2] - target[2]);
}
