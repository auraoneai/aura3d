/**
 * GU47 AO-W1: skyway dressing, all world-anchored and instanced. Cyan beacon rings every 30 m mark the sky lane's edges above
 * the piers, an interchange span crosses overhead every 600 m above the 24 m flight ceiling, shadowless billboard frames
 * stand beside the deck every 210 m, and each sign gantry carries one SDF label. Draws: rings 1, span decks 1, span piers 1,
 * billboard frames 1, billboard faces 1, gantry labels 5 (one per gantry slot) = 10 (budget 12). The Meshy interchange span
 * and billboard frame (WP-36) replace the primitive pieces through these layouts.
 */
import { HAZE_FLOOR_Y } from "../art/ground";

export const RING_STRIDE_Z = 30;
export const RING_ROWS = 14;
export const RING_X = 13.4;
export const RING_Y = 9.6;
export const RING_SIZE: readonly [number, number, number] = [2.4, 2.4, 0.12];

export const SPAN_STRIDE_Z = 600;
/** Spans visible from one behind to the far plane: at most two slots. */
export const SPAN_SLOTS = 2;
/** Above the 24 m flight ceiling (constants.ts CEILING) plus the car and a margin, so nothing ever clips through it. */
export const SPAN_DECK_Y = 29.5;
export const SPAN_DECK_SIZE: readonly [number, number, number] = [150, 1.8, 14];
export const SPAN_PIER_X = 52;
export const SPAN_PIER_SIZE: readonly [number, number, number] = [3.2, SPAN_DECK_Y - HAZE_FLOOR_Y, 3.2];

export const BILLBOARD_STRIDE_Z = 210;
export const BILLBOARD_SLOTS = 4;
export const BILLBOARD_X = 19.5;
export const BILLBOARD_Y = 9;
export const BILLBOARD_FRAME_SIZE: readonly [number, number, number] = [9.6, 4.6, 0.5];
export const BILLBOARD_FACE_SIZE: readonly [number, number, number] = [9, 4, 0.12];

/** Gantry label: on the left board's front face (render/gantry.ts board centre x -5.375, y 9.025, front z 0.33). */
export const GANTRY_LABEL_OFFSET: readonly [number, number, number] = [-5.4, 9.55, 0.36];
export const GANTRY_LABELS: readonly string[] = ["SKYWAY 9  CENTRAL", "EXIT 4B  HARBOUR", "SKYWAY 9  TOWERS", "EXIT 5  OLD TOWN", "SKYWAY 9  AIRPORT"];

export interface Placement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** World-anchored rows ahead of the player at world z `pz` (forward is -z), from one behind the camera. */
function rows(pz: number, stride: number, count: number): number[] {
  const base = Math.floor(pz / stride) * stride + stride;
  return Array.from({ length: count }, (_, i) => base - i * stride);
}

export function ringLayout(pz: number): Placement[] {
  const out: Placement[] = [];
  for (const z of rows(pz, RING_STRIDE_Z, RING_ROWS)) out.push({ x: -RING_X, y: RING_Y, z }, { x: RING_X, y: RING_Y, z });
  return out;
}

export function spanLayout(pz: number): { readonly decks: Placement[]; readonly piers: Placement[] } {
  const decks: Placement[] = [];
  const piers: Placement[] = [];
  for (const z of rows(pz, SPAN_STRIDE_Z, SPAN_SLOTS)) {
    decks.push({ x: 0, y: SPAN_DECK_Y, z });
    piers.push({ x: -SPAN_PIER_X, y: (SPAN_DECK_Y + HAZE_FLOOR_Y) / 2, z }, { x: SPAN_PIER_X, y: (SPAN_DECK_Y + HAZE_FLOOR_Y) / 2, z });
  }
  return { decks, piers };
}

export function billboardLayout(pz: number): Placement[] {
  return rows(pz, BILLBOARD_STRIDE_Z, BILLBOARD_SLOTS).map((z) => {
    const side = Math.round(z / BILLBOARD_STRIDE_Z) % 2 === 0 ? -1 : 1;
    return { x: side * BILLBOARD_X, y: BILLBOARD_Y, z };
  });
}
