import { SIGN_BAND } from "../native/world";

/** One axis-aligned box of a sign gantry, relative to the gantry's road position (x across, y up, z along the road). */
export interface GantryBox {
  readonly part: "steel" | "board" | "trim";
  readonly center: readonly [number, number, number];
  readonly size: readonly [number, number, number];
}

const BOARD_GAP = 0.3;
const BOARD_SPAN = 10.6;

/**
 * The drawn gantry, built from the collision band (world.ts SIGN_BAND), so what crashes the car is what is drawn (audit RR-6):
 * the two sign boards fill exactly minY..maxY across the lanes, the beam sits on top, the trims mark the clearance edges.
 */
export function gantryBoxes(): readonly GantryBox[] {
  const height = SIGN_BAND.maxY - SIGN_BAND.minY;
  const y = (SIGN_BAND.maxY + SIGN_BAND.minY) / 2;
  const width = BOARD_SPAN - BOARD_GAP / 2;
  const x = BOARD_GAP / 2 + width / 2;
  const pillar = SIGN_BAND.maxY + 0.5;
  const out: GantryBox[] = [
    { part: "steel", center: [-10.9, pillar / 2, 0], size: [0.55, pillar, 0.55] },
    { part: "steel", center: [10.9, pillar / 2, 0], size: [0.55, pillar, 0.55] },
    { part: "steel", center: [0, SIGN_BAND.maxY + 0.26, 0], size: [22.6, 0.52, 0.55] }
  ];
  for (const side of [-1, 1] as const) {
    out.push({ part: "board", center: [side * x, y, 0.22], size: [width, height, 0.22] });
    out.push({ part: "trim", center: [side * x, SIGN_BAND.minY + 0.11, 0.36], size: [width - 0.4, 0.22, 0.06] });
    out.push({ part: "trim", center: [side * x, SIGN_BAND.maxY - 0.5, 0.36], size: [width - 1.2, 0.18, 0.06] });
  }
  return out;
}
