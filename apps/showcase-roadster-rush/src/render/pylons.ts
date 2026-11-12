/**
 * GU47 AO-E2 / WP-02: sculpted architectural deck pylons. Fluted Y-pier columns every 40 m drop from the deck into the haze
 * floor under a haunched prestressed hammerhead cap beam that spans the deck. Two instanced nodes (columns, caps), at most
 * 2 draws, world-anchored and recycled only after a row passes the camera.
 */
import type { AuraCustomGeometrySpec } from "@aura3d/engine";
import { HAZE_FLOOR_Y } from "../art/ground";
import { buildDeckPylonCapSpec, buildDeckPylonColumnSpec } from "../art/proceduralModels";

export const PYLON_STRIDE_Z = 40;
/** Rows from one behind the camera to about 400 m ahead. */
export const PYLON_ROWS = 11;
/** Column centre offset from the road centre: just outside the 24 m deck (|x| <= 12). */
export const PYLON_X = 13.4;
export const PYLON_DECK_Y = -0.2;

export const PYLON_KIT = {
  column: { size: [1.6, PYLON_DECK_Y - HAZE_FLOOR_Y, 1.6] as const },
  cap: { size: [29.5, 1.1, 2.4] as const }
} as const;

export interface PylonTransform {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** World-space pier rows for a player at world z `pz` (forward is -z): columns (two per row) and caps (one per row). */
export function pylonLayout(pz: number): { readonly columns: PylonTransform[]; readonly caps: PylonTransform[] } {
  const base = Math.floor(pz / PYLON_STRIDE_Z) * PYLON_STRIDE_Z + PYLON_STRIDE_Z;
  const columnY = (PYLON_DECK_Y + HAZE_FLOOR_Y) / 2;
  const capY = PYLON_DECK_Y - PYLON_KIT.cap.size[1] / 2;
  const columns: PylonTransform[] = [];
  const caps: PylonTransform[] = [];
  for (let row = 0; row < PYLON_ROWS; row++) {
    const z = base - row * PYLON_STRIDE_Z;
    columns.push({ x: -PYLON_X, y: columnY, z }, { x: PYLON_X, y: columnY, z });
    caps.push({ x: 0, y: capY, z });
  }
  return { columns, caps };
}

/** Procedural fluted Y-pier column & haunched hammerhead cap-beam geometry specs sized to `PYLON_KIT`. */
export function pylonGeometrySpecs(): {
  readonly column: AuraCustomGeometrySpec;
  readonly cap: AuraCustomGeometrySpec;
} {
  return {
    column: buildDeckPylonColumnSpec(PYLON_KIT.column.size),
    cap: buildDeckPylonCapSpec(PYLON_KIT.cap.size)
  };
}
