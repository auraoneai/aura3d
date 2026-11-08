/** Pure colour helpers shared by runner looks, HUDs and batches. Colours are linear RGB unless named srgb. */

export type Rgb = readonly [number, number, number];

export const hexSrgb = (hex: string): Rgb => {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};

const toLinear = (s: number): number => (s < 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4));

export const hexToLinear = (hex: string): Rgb => {
  const [r, g, b] = hexSrgb(hex);
  return [toLinear(r), toLinear(g), toLinear(b)];
};

/** Unit vector towards the sun: azimuth 0 looks down the road (-z), positive to the right (+x). */
export function sunDirection(elevationDeg: number, azimuthDeg: number): Rgb {
  const el = (elevationDeg * Math.PI) / 180, az = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}