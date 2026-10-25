// Region classifier and flat materials for the Teleoperator robotaxi (units are the GLB's).
// GLB units: 1.9 long (z), 0.93 wide (x), 0.94 high (y); the front (sloped nose, windshield, mirrors) is -z, the tall tailgate is +z; lowest point at y = 0.
const WHEELS = [[-0.67, 0.16], [0.74, 0.16]]; // [z, y] of the front and rear wheel centres
const WHEEL_R = 0.165;

export function classify(x, y, z, ny) {
  const ax = Math.abs(x);
  for (const [wz, wy] of WHEELS) {
    const d = Math.hypot(z - wz, y - wy);
    if (ax > 0.28 && d < WHEEL_R) return d < 0.09 ? "rim" : "tyre";
  }
  if (y > 0.86 && ax < 0.3) return "pod";
  if (ax > 0.4 && y > 0.5 && y < 0.7 && z < -0.15 && z > -0.5) return "mirror";
  if (z > 0.86 && y > 0.26 && y < 0.42 && ax > 0.28) return "taillight";
  if (y > 0.5 && y < 0.8 && ax < 0.42 && z > -0.55) return "glass";
  if (z < -0.86 && y > 0.12 && y < 0.34 && ax > 0.12) return "headlight";
  if (ny < -0.5 && y < 0.2) return "under";
  return "body";
}

export const MATERIALS = {
  body: { color: [0.82, 0.84, 0.86, 1], metallic: 0.25, roughness: 0.38 },
  glass: { color: [0.02, 0.035, 0.05, 1], metallic: 0.05, roughness: 0.3 },
  tyre: { color: [0.012, 0.012, 0.014, 1], metallic: 0, roughness: 0.92 },
  rim: { color: [0.55, 0.57, 0.6, 1], metallic: 0.6, roughness: 0.35 },
  headlight: { color: [1, 0.95, 0.8, 1], metallic: 0, roughness: 0.3, emissive: [0.9, 0.85, 0.6] },
  taillight: { color: [0.8, 0.03, 0.02, 1], metallic: 0, roughness: 0.3, emissive: [0.9, 0.05, 0.03] },
  under: { color: [0.03, 0.03, 0.035, 1], metallic: 0.1, roughness: 0.8 },
  pod: { color: [0.08, 0.1, 0.12, 1], metallic: 0.3, roughness: 0.4 },
  mirror: { color: [0.07, 0.08, 0.09, 1], metallic: 0.2, roughness: 0.5 }
};

export const PREVIEW_COLORS = {
  body: [220, 222, 226], glass: [30, 60, 90], tyre: [10, 10, 10], rim: [150, 155, 160],
  headlight: [255, 240, 150], taillight: [220, 40, 30], under: [60, 40, 40], pod: [120, 60, 150], mirror: [200, 120, 40]
};
