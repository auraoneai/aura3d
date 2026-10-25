// Region classifier and flat materials for the Gridlock Courier hero car (units are the baked GLB's).
// GLB units: the baked car is 1.9 long (z), 0.96 wide (x), 0.504 high (y), facing +z, lowest point at y = 0.
const WHEELS = [[-0.62, 0.125], [0.47, 0.125]]; // [z, y] of the rear and front wheel centres

// ny and nz are the triangle's averaged vertex normal. The baked mesh is a double shell: inward-facing fragments of the glass,
// lights and underside must not claim a region (they show through gaps in the outer skin as dark or red patches), so those
// regions only apply to outward-facing triangles. Callers that do not pass nz get the position-only rule.
export function classify(x, y, z, ny, nz) {
  const ax = Math.abs(x);
  for (const [wz, wy] of WHEELS) {
    const d = Math.hypot(z - wz, y - wy);
    if (ax > 0.3 && d < 0.135) return d < 0.075 ? "rim" : "tyre";
  }
  if (y > 0.3 && ax < 0.32 && z > -0.22 && z < 0.44 && !(ax < 0.1 && ny > 0.6)) return ny > 0.2 ? "glass" : "body";
  if (z > 0.78 && y > 0.12 && y < 0.24 && ax > 0.18) return nz === undefined || nz > 0.1 ? "headlight" : "body";
  if (z < -0.86 && y > 0.18 && y < 0.3 && ax > 0.2) return nz === undefined || nz < -0.1 ? "taillight" : "body";
  if (ny < -0.5 && y < 0.14) return "under";
  return "body";
}

export const MATERIALS = {
  body: { color: [0.05, 0.3, 0.45, 1], metallic: 0.2, roughness: 0.42 },
  glass: { color: [0.012, 0.018, 0.03, 1], metallic: 0.05, roughness: 0.35 },
  tyre: { color: [0.012, 0.012, 0.014, 1], metallic: 0, roughness: 0.92 },
  rim: { color: [0.55, 0.57, 0.6, 1], metallic: 0.6, roughness: 0.35 },
  headlight: { color: [1, 0.95, 0.8, 1], metallic: 0, roughness: 0.3, emissive: [0.9, 0.85, 0.6] },
  taillight: { color: [0.8, 0.03, 0.02, 1], metallic: 0, roughness: 0.3, emissive: [0.9, 0.05, 0.03] },
  under: { color: [0.025, 0.13, 0.21, 1], metallic: 0.1, roughness: 0.8 }
};


// Subtle vertical gradient on the paint: darker toward the sills, full colour at the roof (multiplied into the base colour).
export function paintShade(y) { return 0.72 + 0.28 * Math.min(1, Math.max(0, y / 0.45)); }
