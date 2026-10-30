/**
 * GU47 QA crops for E-I's capture (`window.__AURA_QA__.crops`, normalised 0..1). The player band follows the
 * tilt-shift focus row; the top 20 % and bottom 10 % bands are the CH47-05 blur comparison regions.
 */
export interface QaCrop { readonly name: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number }

export function qaCrops(bandCenter: number, diorama: boolean): QaCrop[] {
  const c = Math.max(0.1, Math.min(0.9, bandCenter));
  const crops: QaCrop[] = [
    { name: "player", x: 0.4, y: Math.max(0, c - 0.12), w: 0.2, h: 0.2 },
    { name: "player-band", x: 0, y: Math.max(0, c - 0.1), w: 1, h: 0.2 },
    { name: "top-20", x: 0, y: 0, w: 1, h: 0.2 },
    { name: "bottom-10", x: 0, y: 0.9, w: 1, h: 0.1 },
    { name: "bottom-third", x: 0, y: 2 / 3, w: 1, h: 1 / 3 }
  ];
  return diorama ? crops : crops.slice(0, 1);
}
