// Authoring layer — the scene is described with the @aura3d/engine public API.
//
// Aura3D positions itself as "the editable scene layer for agent-written
// browser 3D": agents declare a scene with the public builders, the engine
// produces a typed `AuraSceneSnapshot`. We use exactly that public surface
// (`scene`, `primitives`, `material`, `lights`, `camera`, `interactions`) to
// author the 6x6 bar grid, then realise that snapshot with the engine's own
// renderer (three.js) in `renderer.ts`, adding the interaction systems the
// prompt requires (height animation, hover-highlight, axis labels, an
// orbiting camera) on top of the authored scene.
import {
  scene,
  primitives,
  material,
  lights,
  camera,
  interactions,
  type AuraSceneSnapshot,
} from "@aura3d/engine";

export const ROWS = 6;
export const COLS = 6;
export const COUNT = ROWS * COLS; // 36 bars

export const SPACING = 1.15;
export const FOOTPRINT = 0.74;
export const MIN_HEIGHT = 0.5;
export const MAX_HEIGHT = 3.6;

export const BACKGROUND = "#0a1022";

/** Logical datum backing a single bar in the grid. */
export interface BarDatum {
  readonly index: number;
  readonly row: number;
  readonly col: number;
  /** Column centre on the X axis. */
  readonly x: number;
  /** Row centre on the Z axis. */
  readonly z: number;
  /** Authored (initial) height, in world units. */
  readonly value: number;
  /** Authored colour for that height, `#rrggbb`. */
  readonly color: string;
}

/** Half-extent of the grid footprint on each axis (for axis placement). */
export const HALF_X = ((COLS - 1) / 2) * SPACING + FOOTPRINT / 2;
export const HALF_Z = ((ROWS - 1) / 2) * SPACING + FOOTPRINT / 2;

export function columnX(col: number): number {
  return (col - (COLS - 1) / 2) * SPACING;
}

export function rowZ(row: number): number {
  return (row - (ROWS - 1) / 2) * SPACING;
}

/** A random height in the configured range. */
export function randomHeight(): number {
  return MIN_HEIGHT + Math.random() * (MAX_HEIGHT - MIN_HEIGHT);
}

/** Normalise a height to [0,1] against the fixed value range. */
export function heightToUnit(height: number): number {
  const t = (height - MIN_HEIGHT) / (MAX_HEIGHT - MIN_HEIGHT);
  return Math.min(1, Math.max(0, t));
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * Colour for a given height: a perceptual blue -> cyan -> green -> yellow ->
 * red ramp. Low bars are cool/blue, tall bars are warm/red, so colour maps
 * directly to height.
 */
export function colorForHeight(height: number): string {
  const t = heightToUnit(height);
  // hue 220 (blue) at t=0 down to 0 (red) at t=1.
  const hue = 220 * (1 - t);
  const sat = 0.72;
  const light = 0.4 + 0.16 * t;
  return hslToHex(hue, sat, light);
}

/** Generate the backing data for all 36 bars. */
export function generateBars(): BarDatum[] {
  const bars: BarDatum[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const value = randomHeight();
      bars.push({
        index: row * COLS + col,
        row,
        col,
        x: columnX(col),
        z: rowZ(row),
        value,
        color: colorForHeight(value),
      });
    }
  }
  return bars;
}

/**
 * Build the Aura3D scene snapshot for the bar grid using only public
 * `@aura3d/engine` authoring imports. Each bar is a unit box primitive scaled
 * to its height and tinted by that height; lights, ground, orbit interaction
 * and an orbit camera complete the scene.
 */
export function buildAuraScene(bars: BarDatum[]): AuraSceneSnapshot {
  const builder = scene().background(BACKGROUND);

  // 36 bars — one box primitive per datum. A unit box scaled to [w, h, w]
  // with its centre raised to h/2 sits on the ground plane.
  for (const bar of bars) {
    builder.add(
      primitives
        .box({ name: `bar-r${bar.row}-c${bar.col}` })
        .position(bar.x, bar.value / 2, bar.z)
        .scale([FOOTPRINT, bar.value, FOOTPRINT])
        .material(
          material.pbr({ color: bar.color, roughness: 0.32, metallic: 0.08 }),
        ),
    );
  }

  // Ground plane the bars rest on.
  builder.add(
    primitives
      .plane({ name: "floor" })
      .position(0, 0, 0)
      .scale([HALF_X * 2 + 2.4, 1, HALF_Z * 2 + 2.4])
      .material(material.pbr({ color: "#0d1530", roughness: 0.95 })),
  );

  // Lighting: studio key + a directional fill + ambient base.
  builder.add(lights.studio({ intensity: 1.05 }));
  builder.add(
    lights.directional({
      position: [5, 8, 5],
      intensity: 1.35,
      color: "#ffffff",
    }),
  );
  builder.add(lights.ambient({ intensity: 0.45, color: "#7f9bd8" }));

  // Declare orbit interaction + an orbit camera framing the grid.
  builder.add(interactions.orbit());
  builder.camera(camera.orbit({ distance: 13, target: [0, 1.5, 0] }));

  return builder.toJSON();
}
