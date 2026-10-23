/** sRGB hex -> linear RGB triples for `material.custom` colour uniforms and vertex tones. */
export type Rgb = readonly [number, number, number];

const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

export function hexLinear(hex: string): Rgb {
  const n = parseInt(hex.replace("#", ""), 16);
  return [lin(((n >> 16) & 255) / 255), lin(((n >> 8) & 255) / 255), lin((n & 255) / 255)];
}

export const FOG_VILLAGE = hexLinear("#b5c8c4");
export const FOG_FOREST = hexLinear("#809888");

/** Per-biome ground tones: [path, verge]. The original paints these with tiled procedural textures. */
export const BIOME_TONES: Readonly<Record<string, readonly [string, string]>> = {
  village: ["#b9a37d", "#6f9a4e"],
  alley: ["#7d6f66", "#5a6a46"],
  stairs: ["#9a8c7e", "#6b7a4f"],
  rooftops: ["#8b4f3d", "#5b3d33"],
  descent: ["#97805f", "#5f8049"],
  riverside: ["#8a8f84", "#4f7a54"],
  bridge: ["#8a6a45", "#6a7f6a"],
  forest_entry: ["#6f6a4a", "#40603a"],
  forest: ["#5b563c", "#2f4d2f"],
  forest_exit: ["#6f6a4a", "#46633f"],
  water: ["#9aa7ab", "#5d7f89"]
};
