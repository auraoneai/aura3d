export function classify(x: number, y: number, z: number, ny: number): "body" | "glass" | "tyre" | "rim" | "headlight" | "taillight" | "under";
export const MATERIALS: Record<string, { color: readonly [number, number, number, number]; metallic: number; roughness: number; emissive?: readonly [number, number, number] }>;
