/**
 * Vault Breakers model synth — generates original CC0 GLB props entirely in-repo.
 *
 * Four authored low-poly props for the neon pinball table, flat-shaded and
 * indexed, written as minimal glTF 2.0 GLB containers with no dependencies:
 *   - vaultBreakersTable.glb     : pinball cabinet shell (playfield, walls, back panel, legs)
 *   - vaultBreakersMechanisms.glb: readable bumper, target-bank, orbit, and vault landmarks
 *   - vaultBreakersFlipper.glb   : flipper bat, pivot at origin pointing +X
 *   - vaultBreakersBall.glb      : chrome playfield ball
 *   - vaultBreakersVaultDoor.glb : vault door disc with spoke handle
 *
 * Units are meters. Table origin sits at the playfield center on the playfield
 * surface (y = 0 is playfield level).
 *
 * Run from the repo root:  node apps/showcase-vault-breakers/scripts/build-models.mjs
 * Output: apps/showcase-vault-breakers/assets/models/*.glb
 *
 * After generation register each model with the CLI so it lands in the typed root
 * asset map the route imports (`../../../src/aura-assets`). This script documents
 * the commands but does NOT run them:
 *   pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts assets add apps/showcase-vault-breakers/assets/models/vaultBreakersTable.glb --name vaultBreakersTable --type model --license CC0-1.0 --author "Aura3D synthesis" --source-page "apps/showcase-vault-breakers/scripts/build-models.mjs"
 *   pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts assets add apps/showcase-vault-breakers/assets/models/vaultBreakersFlipper.glb --name vaultBreakersFlipper --type model --license CC0-1.0 --author "Aura3D synthesis" --source-page "apps/showcase-vault-breakers/scripts/build-models.mjs"
 *   pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts assets add apps/showcase-vault-breakers/assets/models/vaultBreakersBall.glb --name vaultBreakersBall --type model --license CC0-1.0 --author "Aura3D synthesis" --source-page "apps/showcase-vault-breakers/scripts/build-models.mjs"
 *   pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts assets add apps/showcase-vault-breakers/assets/models/vaultBreakersVaultDoor.glb --name vaultBreakersVaultDoor --type model --license CC0-1.0 --author "Aura3D synthesis" --source-page "apps/showcase-vault-breakers/scripts/build-models.mjs"
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/models");

// ---- geometry helpers -------------------------------------------------------
/**
 * A part accumulates flat-shaded triangles: every triangle carries its own three
 * vertices and face normal, which reads cleanly at low polygon counts.
 */
function part() {
  return { positions: [], normals: [], indices: [], nextVertex: 0 };
}

function addTriangle(p, a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  for (const v of [a, b, c]) {
    p.positions.push(v[0], v[1], v[2]);
    p.normals.push(nx, ny, nz);
  }
  p.indices.push(p.nextVertex, p.nextVertex + 1, p.nextVertex + 2);
  p.nextVertex += 3;
}

/** Quad split into two triangles, wound outward in the provided corner order. */
function addQuad(p, a, b, c, d) {
  addTriangle(p, a, b, c);
  addTriangle(p, a, c, d);
}

/** Ring of points around the Y axis at height y with radius r. */
function ring(n, r, y) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const angle = (i / n) * Math.PI * 2;
    pts.push([Math.cos(angle) * r, y, Math.sin(angle) * r]);
  }
  return pts;
}

/** Ring of points around the Z axis at depth z with radius r (vault door disc). */
function ringZ(n, r, z) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const angle = (i / n) * Math.PI * 2;
    pts.push([Math.cos(angle) * r, Math.sin(angle) * r, z]);
  }
  return pts;
}

/** Tapered tube between two rings. */
function addBand(p, lower, upper) {
  const n = Math.min(lower.length, upper.length);
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    addQuad(p, lower[i], lower[j], upper[j], upper[i]);
  }
}

/** Cap a ring around the Y axis with an n-gon fan around an offset center. */
function addCap(p, pts, y, up, cx = 0, cz = 0) {
  const center = [cx, y, cz];
  for (let i = 0; i < pts.length; i += 1) {
    const j = (i + 1) % pts.length;
    if (up) addTriangle(p, center, pts[i], pts[j]);
    else addTriangle(p, center, pts[j], pts[i]);
  }
}

/** Cap a ring around the Z axis with an n-gon fan facing +Z (front) or -Z. */
function addZCap(p, pts, z, front, cx = 0, cy = 0) {
  const center = [cx, cy, z];
  for (let i = 0; i < pts.length; i += 1) {
    const j = (i + 1) % pts.length;
    if (front) addTriangle(p, center, pts[i], pts[j]);
    else addTriangle(p, center, pts[j], pts[i]);
  }
}

/** Axis-aligned box from center + half extents. */
function addBox(p, cx, cy, cz, hx, hy, hz) {
  const v = [
    [cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz],
    [cx + hx, cy - hy, cz + hz], [cx - hx, cy - hy, cz + hz],
    [cx - hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz - hz],
    [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz]
  ];
  addQuad(p, v[0], v[3], v[2], v[1]); // bottom
  addQuad(p, v[4], v[5], v[6], v[7]); // top
  addQuad(p, v[1], v[2], v[6], v[5]); // +Z
  addQuad(p, v[3], v[0], v[4], v[7]); // -Z
  addQuad(p, v[0], v[1], v[5], v[4]); // -X
  addQuad(p, v[2], v[3], v[7], v[6]); // +X
}

/** Box rolled around the Z axis (vault door spokes). */
function addRollBox(p, cx, cy, cz, hx, hy, hz, roll) {
  const cos = Math.cos(roll), sin = Math.sin(roll);
  const rot = ([x, y, z]) => [cx + x * cos - y * sin, cy + x * sin + y * cos, cz + z];
  const local = [
    [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz],
    [-hx, hy, -hz], [hx, hy, -hz], [hx, hy, hz], [-hx, hy, hz]
  ].map(rot);
  addQuad(p, local[0], local[3], local[2], local[1]);
  addQuad(p, local[4], local[5], local[6], local[7]);
  addQuad(p, local[1], local[2], local[6], local[5]);
  addQuad(p, local[3], local[0], local[4], local[7]);
  addQuad(p, local[0], local[1], local[5], local[4]);
  addQuad(p, local[2], local[3], local[7], local[6]);
}

function addCylinderY(p, r0, r1, y0, y1, cx = 0, cz = 0, segments = 16) {
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const x0a = cx + Math.cos(a0) * r0, z0a = cz + Math.sin(a0) * r0;
    const x1a = cx + Math.cos(a1) * r0, z1a = cz + Math.sin(a1) * r0;
    const x0b = cx + Math.cos(a0) * r1, z0b = cz + Math.sin(a0) * r1;
    const x1b = cx + Math.cos(a1) * r1, z1b = cz + Math.sin(a1) * r1;

    addQuad(p, [x0a, y0, z0a], [x1a, y0, z1a], [x1b, y1, z1b], [x0b, y1, z0b]);
    addTriangle(p, [cx, y1, cz], [x0b, y1, z0b], [x1b, y1, z1b]);
    addTriangle(p, [cx, y0, cz], [x1a, y0, z1a], [x0a, y0, z0a]);
  }
}

// ---- pinball table ----------------------------------------------------------
/**
 * Complete 3D Pinball Cabinet:
 * - Slanted Main Cabinet Body with Cyberpunk Side Graphics
 * - Upright Backbox / Marquee Head with Neon Frame
 * - 4 Angled Chrome Steel Tubular Legs with Foot Levelers
 * - Chrome Side Rails & Lockdown Bar
 * - Front Coin Door with Backlit 25¢ Insert Slots & Plunger Housing
 */
function buildTable() {
  const playfield = part();
  const cabinet = part();
  const chrome = part();
  const backbox = part();
  const neon = part();
  const mechanisms = part();
  const mechanismGlow = part();
  const targetFaces = part();

  // 1. Playfield Base Bed (top surface at y = 0)
  addBox(playfield, 0, -0.12, 0, 2.9, 0.12, 4.2);

  // The root-safe renderer composes this typed cabinet with route-local
  // physics nodes. Keep the table's essential mission landmarks in the typed
  // primary-world mesh as well so the exact composed artifact remains readable
  // even when a browser/driver clips densely layered runtime primitives.
  // These are visual landmarks only; Rapier colliders and sensors in table.ts
  // remain the sole gameplay authority.
  for (const [x, z] of [[-0.9, -1.7], [0.9, -1.7], [0, -0.7]]) {
    addCylinderY(mechanisms, 0.34, 0.29, 0.02, 0.26, x, z, 18);
    addCylinderY(mechanismGlow, 0.22, 0.22, 0.26, 0.34, x, z, 18);
  }

  const targetBanks = [
    [[-2.32, -2.4], [-2.32, -2.8], [-2.32, -3.2]],
    [[-2.42, -0.6], [-2.42, -0.2], [-2.42, 0.2]],
    [[-0.5, -2.5], [0, -2.62], [0.5, -2.5]],
    [[1.95, -0.6], [1.95, -0.2], [1.95, 0.2]],
    [[1.95, -2.4], [1.95, -2.8], [1.95, -3.2]]
  ];
  for (const bank of targetBanks) {
    for (const [x, z] of bank) {
      addBox(targetFaces, x, 0.14, z, 0.15, 0.14, 0.08);
    }
  }

  // Five bank-status lamps form a strong central mission read. Their visual
  // grouping matches the five logical banks; runtime evidence separately
  // proves target-down and bank-clear state changes.
  for (let index = 0; index < 5; index += 1) {
    addCylinderY(mechanismGlow, 0.13, 0.13, 0.01, 0.08, -0.72 + index * 0.36, -2.02, 12);
  }

  // Vault focus and shooter/orbit markings. The vault medallion sits directly
  // in front of the route-local vault throat; cyan studs outline the orbit and
  // keep the upper half of the table legible from the fixed review camera.
  addCylinderY(mechanisms, 0.48, 0.42, 0.02, 0.15, 0, -3.36, 20);
  addCylinderY(mechanismGlow, 0.22, 0.22, 0.15, 0.22, 0, -3.36, 16);
  for (const [x, z] of [[-2.35, -3.4], [-2.48, -2.9], [-2.52, -2.35], [2.42, -2.9], [2.42, -2.3], [2.42, -1.7]]) {
    addCylinderY(mechanismGlow, 0.08, 0.08, 0.01, 0.07, x, z, 10);
  }

  // 2. Slanted Pinball Cabinet Body
  // Main wooden / composite tub enclosure
  addBox(cabinet, 0, -0.42, 0, 3.1, 0.28, 4.4);
  // Bottom taper towards player
  addBox(cabinet, 0, -0.78, 0.4, 3.0, 0.12, 4.0);

  // 3. Four Angled Chrome Steel Legs
  for (const [x, z, h] of [
    [-2.95, 4.1, 0.45], [2.95, 4.1, 0.45],
    [-2.95, -4.1, 0.65], [2.95, -4.1, 0.65]
  ]) {
    // Leg strut
    addBox(chrome, x, -0.9 - h / 2, z, 0.08, h / 2 + 0.3, 0.08);
    // Foot leveler pad
    addBox(chrome, x, -1.25, z, 0.14, 0.04, 0.14);
  }

  // 4. Chrome Side Rails & Lockdown Bar
  addBox(chrome, -2.85, 0.22, 0, 0.12, 0.22, 4.3);
  addBox(chrome, 2.85, 0.22, 0, 0.12, 0.22, 4.3);
  addBox(chrome, 0, 0.22, 4.25, 2.95, 0.22, 0.14);

  // 5. Front Coin Door & Plunger
  addBox(chrome, 0, -0.52, 4.42, 0.95, 0.72, 0.04);
  // Dual Coin Return Inserts (Orange Backlit)
  addBox(neon, -0.32, -0.42, 4.46, 0.12, 0.18, 0.02);
  addBox(neon, 0.32, -0.42, 4.46, 0.12, 0.18, 0.02);
  // Shooter Rod Housing
  addBox(chrome, 2.45, 0.05, 4.45, 0.12, 0.12, 0.22);

  // 6. Upright Backbox / Head (Z: -4.4 to -4.8, Y: 0.2 to 2.4)
  addBox(backbox, 0, 1.35, -4.55, 3.0, 1.05, 0.35);
  // Neon Perimeter Marquee Frame
  addBox(neon, 0, 2.42, -4.4, 2.95, 0.06, 0.06); // top
  addBox(neon, -2.95, 1.35, -4.4, 0.06, 1.05, 0.06); // left
  addBox(neon, 2.95, 1.35, -4.4, 0.06, 1.05, 0.06); // right
  addBox(neon, 0, 0.35, -4.4, 2.95, 0.06, 0.06); // bottom
  // Speaker Panel Grille
  addBox(cabinet, 0, 0.75, -4.38, 2.8, 0.32, 0.04);

  return [
    { name: "playfield", part: playfield, color: [0.06, 0.1, 0.18, 1], roughness: 0.18, metallic: 0.2 },
    { name: "cabinet", part: cabinet, color: [0.12, 0.15, 0.22, 1], roughness: 0.55, metallic: 0.4 },
    { name: "chrome", part: chrome, color: [0.92, 0.95, 0.98, 1], roughness: 0.12, metallic: 0.95 },
    { name: "backbox", part: backbox, color: [0.08, 0.1, 0.15, 1], roughness: 0.45, metallic: 0.5 },
    { name: "neon", part: neon, color: [0.2, 0.9, 1.0, 1], roughness: 0.1, metallic: 0.0, emissive: [0.4, 1.5, 2.0] },
    { name: "mechanisms", part: mechanisms, color: [0.95, 0.55, 0.16, 1], roughness: 0.2, metallic: 0.7, emissive: [0.38, 0.12, 0.01] },
    { name: "mechanismGlow", part: mechanismGlow, color: [0.28, 0.96, 1.0, 1], roughness: 0.12, metallic: 0.15, emissive: [0.3, 1.35, 1.55] },
    { name: "targetFaces", part: targetFaces, color: [1.0, 0.84, 0.42, 1], roughness: 0.28, metallic: 0.35, emissive: [0.85, 0.28, 0.02] }
  ];
}

/**
 * Typed mechanism overlay for the composed route. The production renderer
 * resolves GLBs asynchronously; keeping these landmarks in their own model
 * lets them sit on the route-local playfield without a second cabinet bed
 * occluding the Rapier-synchronised flippers and balls.
 */
function buildMechanisms() {
  const brass = part();
  const cyan = part();
  const targets = part();

  for (const [x, z] of [[-0.9, -1.7], [0.9, -1.7], [0, -0.7]]) {
    addCylinderY(brass, 0.34, 0.29, 0.02, 0.26, x, z, 18);
    addCylinderY(cyan, 0.22, 0.22, 0.26, 0.34, x, z, 18);
  }
  const targetBanks = [
    [[-2.32, -2.4], [-2.32, -2.8], [-2.32, -3.2]],
    [[-2.42, -0.6], [-2.42, -0.2], [-2.42, 0.2]],
    [[-0.5, -2.5], [0, -2.62], [0.5, -2.5]],
    [[1.95, -0.6], [1.95, -0.2], [1.95, 0.2]],
    [[1.95, -2.4], [1.95, -2.8], [1.95, -3.2]]
  ];
  for (const bank of targetBanks) {
    for (const [x, z] of bank) addBox(targets, x, 0.14, z, 0.15, 0.14, 0.08);
  }
  for (let index = 0; index < 5; index += 1) {
    addCylinderY(cyan, 0.13, 0.13, 0.01, 0.08, -0.72 + index * 0.36, -2.02, 12);
  }
  addCylinderY(brass, 0.48, 0.42, 0.02, 0.15, 0, -3.36, 20);
  addCylinderY(cyan, 0.22, 0.22, 0.15, 0.22, 0, -3.36, 16);
  for (const [x, z] of [[-2.35, -3.4], [-2.48, -2.9], [-2.52, -2.35], [2.42, -2.9], [2.42, -2.3], [2.42, -1.7]]) {
    addCylinderY(cyan, 0.08, 0.08, 0.01, 0.07, x, z, 10);
  }
  return [
    { name: "brassMechanisms", part: brass, color: [0.95, 0.55, 0.16, 1], roughness: 0.2, metallic: 0.7, emissive: [0.38, 0.12, 0.01] },
    { name: "cyanMechanisms", part: cyan, color: [0.28, 0.96, 1.0, 1], roughness: 0.12, metallic: 0.15, emissive: [0.3, 1.35, 1.55] },
    { name: "targetFaces", part: targets, color: [1.0, 0.84, 0.42, 1], roughness: 0.28, metallic: 0.35, emissive: [0.85, 0.28, 0.02] }
  ];
}

// ---- flipper bat ------------------------------------------------------------
/**
 * Tournament Flipper Bat:
 * - Pivot Boss with Chrome Pivot Cap
 * - Tapered Flipper Bat Body
 * - High-Traction Neon Silicone Rubber Band
 */
function buildFlipper() {
  const bat = part();
  const rubber = part();
  const chromeCap = part();

  // Pivot cap at origin
  addCylinderY(chromeCap, 0.1, 0.1, 0.03, 0.065, 0, 0, 14);

  // Tapered Flipper Body (Z width: 0.14 down to 0.06, length X: 0 to 0.92)
  const segments = 8;
  for (let i = 0; i < segments; i += 1) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const x0 = t0 * 0.92, x1 = t1 * 0.92;
    const w0 = 0.075 * (1 - t0 * 0.55);
    const w1 = 0.075 * (1 - t1 * 0.55);
    const h = 0.045;

    addBox(bat, (x0 + x1) / 2, 0, 0, (x1 - x0) / 2, h, (w0 + w1) / 2);
  }
  // Rounded Tip Cap
  addCylinderY(bat, 0.032, 0.032, -0.045, 0.045, 0.92, 0, 10);

  // High-Visibility Neon Rubber Ring along the perimeter
  for (let i = 0; i < segments; i += 1) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const x0 = t0 * 0.92, x1 = t1 * 0.92;
    const w0 = 0.082 * (1 - t0 * 0.55);
    const w1 = 0.082 * (1 - t1 * 0.55);

    // Left rubber edge
    addBox(rubber, (x0 + x1) / 2, 0, (w0 + w1) / 2, (x1 - x0) / 2, 0.03, 0.015);
    // Right rubber edge
    addBox(rubber, (x0 + x1) / 2, 0, -(w0 + w1) / 2, (x1 - x0) / 2, 0.03, 0.015);
  }
  addCylinderY(rubber, 0.038, 0.038, -0.03, 0.03, 0.92, 0, 10);

  return [
    { name: "bat", part: bat, color: [0.15, 0.18, 0.25, 1], roughness: 0.35, metallic: 0.5 },
    { name: "rubber", part: rubber, color: [0.1, 0.85, 1.0, 1], roughness: 0.2, metallic: 0.0, emissive: [0.3, 1.4, 1.8] },
    { name: "chromeCap", part: chromeCap, color: [0.95, 0.95, 1.0, 1], roughness: 0.08, metallic: 0.95 }
  ];
}

// ---- ball -------------------------------------------------------------------
/** Mirror-finish Chrome Pinball */
function buildBall() {
  const sphere = part();
  const rings = 14, sectors = 18, radius = 0.14;

  for (let r = 0; r < rings; r += 1) {
    const phi0 = (r / rings) * Math.PI - Math.PI / 2;
    const phi1 = ((r + 1) / rings) * Math.PI - Math.PI / 2;
    const y0 = Math.sin(phi0) * radius, y1 = Math.sin(phi1) * radius;
    const rad0 = Math.cos(phi0) * radius, rad1 = Math.cos(phi1) * radius;

    for (let s = 0; s < sectors; s += 1) {
      const theta0 = (s / sectors) * Math.PI * 2;
      const theta1 = ((s + 1) / sectors) * Math.PI * 2;
      const x0a = Math.cos(theta0) * rad0, z0a = Math.sin(theta0) * rad0;
      const x1a = Math.cos(theta1) * rad0, z1a = Math.sin(theta1) * rad0;
      const x0b = Math.cos(theta0) * rad1, z0b = Math.sin(theta0) * rad1;
      const x1b = Math.cos(theta1) * rad1, z1b = Math.sin(theta1) * rad1;

      addQuad(sphere, [x0a, y0, z0a], [x1a, y0, z1a], [x1b, y1, z1b], [x0b, y1, z0b]);
    }
  }

  return [
    { name: "chrome", part: sphere, color: [0.95, 0.98, 1.0, 1], roughness: 0.04, metallic: 1.0 }
  ];
}

// ---- vault door -------------------------------------------------------------
/** Reinforced Vault Door Hatch with Central Locking Wheel & Neon Status Lugs */
function buildVaultDoor() {
  const rim = part();
  const disc = part();
  const wheel = part();
  const statusLeds = part();

  const radius = 0.26;
  const segments = 18;

  // Outer locking collar
  const outerRing = ringZ(segments, radius, 0.04);
  const backRing = ringZ(segments, radius, 0);
  addBand(rim, backRing, outerRing);
  addZCap(rim, backRing, 0, false);

  // Recessed door face
  const innerRing = ringZ(segments, radius * 0.88, 0.04);
  addBand(rim, outerRing, innerRing);
  addZCap(disc, innerRing, 0.04, true);

  // Central 6-Spoke Locking Wheel
  for (let i = 0; i < 6; i += 1) {
    const roll = (i / 6) * Math.PI;
    addRollBox(wheel, 0, 0, 0.07, radius * 0.55, 0.016, 0.016, roll);
  }
  // Wheel center hub
  const hubRing = ringZ(12, 0.06, 0.09);
  const hubBase = ringZ(12, 0.06, 0.04);
  addBand(wheel, hubBase, hubRing);
  addZCap(wheel, hubRing, 0.09, true);

  // 4 Radial Neon Status Leds
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2;
    const lx = Math.cos(angle) * radius * 0.72;
    const ly = Math.sin(angle) * radius * 0.72;
    addBox(statusLeds, lx, ly, 0.05, 0.025, 0.025, 0.015);
  }

  return [
    { name: "rim", part: rim, color: [0.22, 0.25, 0.32, 1], roughness: 0.45, metallic: 0.75 },
    { name: "disc", part: disc, color: [0.12, 0.15, 0.22, 1], roughness: 0.35, metallic: 0.85 },
    { name: "wheel", part: wheel, color: [0.92, 0.95, 0.98, 1], roughness: 0.15, metallic: 0.95 },
    { name: "statusLeds", part: statusLeds, color: [0.95, 0.8, 0.1, 1], roughness: 0.1, metallic: 0.0, emissive: [1.6, 1.2, 0.2] }
  ];
}

// ---- GLB writer -------------------------------------------------------------
function writeGlb(path, parts) {
  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const nodes = [];
  const materials = parts.map((entry) => ({
    name: entry.name + "-material",
    pbrMetallicRoughness: {
      baseColorFactor: entry.color,
      metallicFactor: entry.metallic ?? 0.05,
      roughnessFactor: entry.roughness
    }
  }));

  let offset = 0;
  const pushView = (typedArray, target) => {
    const bytes = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    const pad = (4 - (bytes.length % 4)) % 4;
    chunks.push(bytes);
    if (pad > 0) chunks.push(Buffer.alloc(pad));
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target });
    offset += bytes.length + pad;
    return bufferViews.length - 1;
  };

  parts.forEach((entry, partIndex) => {
    const positionCount = entry.part.positions.length / 3;
    if (positionCount === 0 || entry.part.indices.length === 0) {
      throw new Error("part " + entry.name + " has no triangles.");
    }
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < entry.part.positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], entry.part.positions[i + axis]);
        max[axis] = Math.max(max[axis], entry.part.positions[i + axis]);
      }
    }
    const positions = new Float32Array(entry.part.positions);
    const normals = new Float32Array(entry.part.normals);
    const indices = new Uint32Array(entry.part.indices);
    const posView = pushView(positions, 34962);
    const normView = pushView(normals, 34962);
    const idxView = pushView(indices, 34963);
    accessors.push({ bufferView: posView, componentType: 5126, count: positionCount, type: "VEC3", min, max });
    accessors.push({ bufferView: normView, componentType: 5126, count: positionCount, type: "VEC3" });
    accessors.push({ bufferView: idxView, componentType: 5125, count: indices.length, type: "SCALAR" });
    meshes.push({
      name: entry.name,
      primitives: [{
        attributes: { POSITION: accessors.length - 3, NORMAL: accessors.length - 2 },
        indices: accessors.length - 1,
        material: partIndex
      }]
    });
    nodes.push({ name: entry.name, mesh: partIndex });
  });

  const body = Buffer.concat(chunks);
  const document = {
    asset: {
      version: "2.0",
      generator: "aura3d showcase-vault-breakers build-models (original CC0)",
      extras: { aura3d: { orientation: { forwardAxis: "+Z", upAxis: "+Y" } } }
    },
    scene: 0,
    scenes: [{ name: "root", nodes: nodes.map((_, index) => index) }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: body.length }]
  };

  const jsonSource = Buffer.from(JSON.stringify(document), "utf8");
  const jsonPadding = (4 - (jsonSource.length % 4)) % 4;
  const jsonData = Buffer.concat([jsonSource, Buffer.alloc(jsonPadding, 0x20)]);
  const binPadding = (4 - (body.length % 4)) % 4;
  const binData = Buffer.concat([body, Buffer.alloc(binPadding)]);
  const total = 12 + 8 + jsonData.length + 8 + binData.length;
  const output = Buffer.alloc(total);
  output.write("glTF", 0, "ascii");
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(total, 8);
  output.writeUInt32LE(jsonData.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16); // "JSON"
  jsonData.copy(output, 20);
  const binHead = 20 + jsonData.length;
  output.writeUInt32LE(binData.length, binHead);
  output.writeUInt32LE(0x004e4942, binHead + 4); // "BIN\0"
  binData.copy(output, binHead + 8);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, output);
  return total;
}

mkdirSync(OUT_DIR, { recursive: true });

const tableParts = buildTable();
const tableBytes = writeGlb(resolve(OUT_DIR, "vaultBreakersTable.glb"), tableParts);
console.log("wrote", resolve(OUT_DIR, "vaultBreakersTable.glb"), "(" + tableBytes + " bytes)");

const mechanismParts = buildMechanisms();
const mechanismBytes = writeGlb(resolve(OUT_DIR, "vaultBreakersMechanisms.glb"), mechanismParts);
console.log("wrote", resolve(OUT_DIR, "vaultBreakersMechanisms.glb"), "(" + mechanismBytes + " bytes)");

const flipperParts = buildFlipper();
const flipperBytes = writeGlb(resolve(OUT_DIR, "vaultBreakersFlipper.glb"), flipperParts);
console.log("wrote", resolve(OUT_DIR, "vaultBreakersFlipper.glb"), "(" + flipperBytes + " bytes)");

const ballParts = buildBall();
const ballBytes = writeGlb(resolve(OUT_DIR, "vaultBreakersBall.glb"), ballParts);
console.log("wrote", resolve(OUT_DIR, "vaultBreakersBall.glb"), "(" + ballBytes + " bytes)");

const doorParts = buildVaultDoor();
const doorBytes = writeGlb(resolve(OUT_DIR, "vaultBreakersVaultDoor.glb"), doorParts);
console.log("wrote", resolve(OUT_DIR, "vaultBreakersVaultDoor.glb"), "(" + doorBytes + " bytes)");
