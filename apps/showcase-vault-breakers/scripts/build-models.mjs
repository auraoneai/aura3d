/**
 * Vault Breakers model synth — generates original CC0 GLB props entirely in-repo.
 *
 * REVAMPED: Higher-detail geometry, proper pinball shapes, neon emissive parts.
 *
 * Five authored low-poly props for the neon pinball table, flat-shaded and
 * indexed, written as minimal glTF 2.0 GLB containers with no dependencies:
 *   - vaultBreakersTable.glb     : pinball cabinet shell (playfield, walls, back panel, legs, neon trim)
 *   - vaultBreakersMechanisms.glb: readable bumper, target-bank, slingshot, orbit, and vault landmarks
 *   - vaultBreakersFlipper.glb   : flipper bat with tapered body, rubber band, pivot collar
 *   - vaultBreakersBall.glb      : chrome playfield ball (higher resolution)
 *   - vaultBreakersVaultDoor.glb : vault door disc with spoke handle and status LEDs
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
 *   pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts assets add apps/showcase-vault-breakers/assets/models/vaultBreakersMechanisms.glb --name vaultBreakersMechanisms --type model --license CC0-1.0 --author "Aura3D synthesis" --source-page "apps/showcase-vault-breakers/scripts/build-models.mjs"
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/models");

// ---- geometry helpers -------------------------------------------------------
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

function addQuad(p, a, b, c, d) {
  addTriangle(p, a, b, c);
  addTriangle(p, a, c, d);
}

function ring(n, r, y) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const angle = (i / n) * Math.PI * 2;
    pts.push([Math.cos(angle) * r, y, Math.sin(angle) * r]);
  }
  return pts;
}

function ringZ(n, r, z) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const angle = (i / n) * Math.PI * 2;
    pts.push([Math.cos(angle) * r, Math.sin(angle) * r, z]);
  }
  return pts;
}

function addBand(p, lower, upper) {
  const n = Math.min(lower.length, upper.length);
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    addQuad(p, lower[i], lower[j], upper[j], upper[i]);
  }
}

function addCap(p, pts, y, up, cx = 0, cz = 0) {
  const center = [cx, y, cz];
  for (let i = 0; i < pts.length; i += 1) {
    const j = (i + 1) % pts.length;
    if (up) addTriangle(p, center, pts[i], pts[j]);
    else addTriangle(p, center, pts[j], pts[i]);
  }
}

function addZCap(p, pts, z, front, cx = 0, cy = 0) {
  const center = [cx, cy, z];
  for (let i = 0; i < pts.length; i += 1) {
    const j = (i + 1) % pts.length;
    if (front) addTriangle(p, center, pts[i], pts[j]);
    else addTriangle(p, center, pts[j], pts[i]);
  }
}

function addBox(p, cx, cy, cz, hx, hy, hz) {
  const v = [
    [cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz],
    [cx + hx, cy - hy, cz + hz], [cx - hx, cy - hy, cz + hz],
    [cx - hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz - hz],
    [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz]
  ];
  addQuad(p, v[0], v[3], v[2], v[1]);
  addQuad(p, v[4], v[5], v[6], v[7]);
  addQuad(p, v[1], v[2], v[6], v[5]);
  addQuad(p, v[3], v[0], v[4], v[7]);
  addQuad(p, v[0], v[1], v[5], v[4]);
  addQuad(p, v[2], v[3], v[7], v[6]);
}

function addBoxOutward(p, cx, cy, cz, hx, hy, hz) {
  const v = [
    [cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz],
    [cx + hx, cy - hy, cz + hz], [cx - hx, cy - hy, cz + hz],
    [cx - hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz - hz],
    [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz]
  ];
  addQuad(p, v[0], v[1], v[2], v[3]);
  addQuad(p, v[4], v[7], v[6], v[5]);
  addQuad(p, v[1], v[5], v[6], v[2]);
  addQuad(p, v[0], v[3], v[7], v[4]);
  addQuad(p, v[3], v[2], v[6], v[7]);
  addQuad(p, v[0], v[4], v[5], v[1]);
}

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

/** Cylinder around Z axis (for vault door, horizontal elements). */
function addCylinderZ(p, r0, r1, z0, z1, cx = 0, cy = 0, segments = 16) {
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const x0a = cx + Math.cos(a0) * r0, y0a = cy + Math.sin(a0) * r0;
    const x1a = cx + Math.cos(a1) * r0, y1a = cy + Math.sin(a1) * r0;
    const x0b = cx + Math.cos(a0) * r1, y0b = cy + Math.sin(a0) * r1;
    const x1b = cx + Math.cos(a1) * r1, y1b = cy + Math.sin(a1) * r1;
    addQuad(p, [x0a, y0a, z0], [x1a, y1a, z0], [x1b, y1b, z1], [x0b, y0b, z1]);
    addTriangle(p, [cx, cy, z1], [x0b, y0b, z1], [x1b, y1b, z1]);
    addTriangle(p, [cx, cy, z0], [x1a, y1a, z0], [x0a, y0a, z0]);
  }
}

/** Torus ring around Y axis at height y, centered at (cx, cz). */
function addTorus(p, R, r, cx, y, cz, segsR = 16, segsr = 8) {
  for (let i = 0; i < segsR; i += 1) {
    const a0 = (i / segsR) * Math.PI * 2;
    const a1 = ((i + 1) / segsR) * Math.PI * 2;
    for (let j = 0; j < segsr; j += 1) {
      const b0 = (j / segsr) * Math.PI * 2;
      const b1 = ((j + 1) / segsr) * Math.PI * 2;
      const p00 = [cx + (R + r * Math.cos(b0)) * Math.cos(a0), y + r * Math.sin(b0), cz + (R + r * Math.cos(b0)) * Math.sin(a0)];
      const p10 = [cx + (R + r * Math.cos(b0)) * Math.cos(a1), y + r * Math.sin(b0), cz + (R + r * Math.cos(b0)) * Math.sin(a1)];
      const p11 = [cx + (R + r * Math.cos(b1)) * Math.cos(a1), y + r * Math.sin(b1), cz + (R + r * Math.cos(b1)) * Math.sin(a1)];
      const p01 = [cx + (R + r * Math.cos(b1)) * Math.cos(a0), y + r * Math.sin(b1), cz + (R + r * Math.cos(b1)) * Math.sin(a0)];
      addQuad(p, p00, p10, p11, p01);
    }
  }
}

// ---- pinball table ----------------------------------------------------------
function buildTable() {
  const playfield = part();
  const cabinet = part();
  const chrome = part();
  const backbox = part();
  const backboxDisplay = part();
  const neon = part();
  const neonPink = part();
  const sideArt = part();

  // 1. Playfield bed — slightly recessed surface
  addBox(playfield, 0, -0.06, 0, 2.85, 0.06, 4.15);
  // Playfield border lip
  addBox(playfield, 0, 0.02, -4.1, 2.9, 0.04, 0.08); // top wall lip
  addBox(playfield, -2.82, 0.02, 0, 0.08, 0.04, 4.15); // left wall lip
  addBox(playfield, 2.82, 0.02, 0, 0.08, 0.04, 4.15); // right wall lip

  // 2. Cabinet body — main enclosure with beveled look
  addBox(cabinet, 0, -0.35, 0, 3.05, 0.28, 4.35);
  // Lower taper
  addBox(cabinet, 0, -0.68, 0.3, 2.95, 0.12, 4.0);
  // Side panels with slight inset for depth
  addBox(sideArt, -3.02, -0.35, 0, 0.04, 0.26, 4.2);
  addBox(sideArt, 3.02, -0.35, 0, 0.04, 0.26, 4.2);

  // Neon trim strips along cabinet edges
  addBox(neon, -3.06, -0.08, 0, 0.02, 0.02, 4.3); // left top edge
  addBox(neon, 3.06, -0.08, 0, 0.02, 0.02, 4.3); // right top edge
  addBox(neon, 0, -0.08, 4.32, 3.06, 0.02, 0.02); // front top edge
  addBox(neon, 0, -0.08, -4.32, 3.06, 0.02, 0.02); // back top edge
  // Bottom neon strip
  addBox(neonPink, -3.06, -0.62, 0, 0.02, 0.02, 4.3);
  addBox(neonPink, 3.06, -0.62, 0, 0.02, 0.02, 4.3);

  // 3. Four angled chrome legs — cylindrical with foot pads
  for (const [x, z, h] of [
    [-2.85, 4.0, 0.5], [2.85, 4.0, 0.5],
    [-2.85, -4.0, 0.7], [2.85, -4.0, 0.7]
  ]) {
    addCylinderY(chrome, 0.06, 0.05, -0.63 - h, -0.63, x, z, 10);
    // Foot pad
    addCylinderY(chrome, 0.1, 0.12, -0.63 - h - 0.04, -0.63 - h, x, z, 10);
    // Leg bracket
    addBox(chrome, x, -0.63, z, 0.1, 0.04, 0.1);
  }

  // 4. Chrome side rails
  addBox(chrome, -2.88, 0.15, 0, 0.06, 0.15, 4.2);
  addBox(chrome, 2.88, 0.15, 0, 0.06, 0.15, 4.2);
  // Lockdown bar
  addBox(chrome, 0, 0.15, 4.18, 2.88, 0.08, 0.06);
  // Lockdown bar neon accent
  addBox(neon, 0, 0.22, 4.18, 2.6, 0.015, 0.015);

  // 5. Front coin door & plunger housing
  addBox(chrome, 0, -0.48, 4.38, 0.9, 0.65, 0.04);
  // Coin slots — orange backlit
  addBox(neon, -0.3, -0.38, 4.42, 0.1, 0.15, 0.02);
  addBox(neon, 0.3, -0.38, 4.42, 0.1, 0.15, 0.02);
  // Plunger housing
  addCylinderZ(chrome, 0.08, 0.08, 4.2, 4.5, 2.42, 0.05, 10);
  // Plunger knob
  addCylinderZ(chrome, 0.1, 0.1, 4.48, 4.55, 2.42, 0.05, 10);

  // 6. Backbox / head — taller, more prominent
  addBoxOutward(backbox, 0, 1.5, -4.55, 2.95, 1.2, 0.35);
  // Backbox top cap
  addBoxOutward(backbox, 0, 2.72, -4.55, 3.0, 0.04, 0.38);
  // Recessed display face
  addBoxOutward(backboxDisplay, 0, 1.55, -4.14, 2.65, 0.85, 0.04);
  // Display inner bezel
  addBoxOutward(backboxDisplay, 0, 1.55, -4.09, 2.45, 0.7, 0.01);

  // Neon marquee frame — bright cyan perimeter
  addBoxOutward(neon, 0, 2.42, -4.08, 2.75, 0.04, 0.04); // top
  addBoxOutward(neon, -2.75, 1.55, -4.08, 0.04, 0.85, 0.04); // left
  addBoxOutward(neon, 2.75, 1.55, -4.08, 0.04, 0.85, 0.04); // right
  addBoxOutward(neon, 0, 0.68, -4.08, 2.75, 0.04, 0.04); // bottom

  // Marquee title bars — geometric glyphs
  addBoxOutward(neon, 0, 1.85, -4.06, 1.8, 0.06, 0.03);
  addBoxOutward(neonPink, -0.9, 1.35, -4.06, 0.65, 0.05, 0.03);
  addBoxOutward(neonPink, 0.9, 1.35, -4.06, 0.65, 0.05, 0.03);
  // Decorative dots on backbox
  for (let i = 0; i < 7; i += 1) {
    addBoxOutward(neon, -1.5 + i * 0.5, 2.15, -4.06, 0.04, 0.04, 0.03);
  }

  // Speaker grille
  addBoxOutward(cabinet, 0, 0.82, -4.38, 2.7, 0.35, 0.04);
  // Speaker grille lines
  for (let i = 0; i < 5; i += 1) {
    addBoxOutward(chrome, 0, 0.62 + i * 0.1, -4.34, 2.4, 0.015, 0.01);
  }

  // Apron / lower front
  addBox(cabinet, 0, -0.55, 3.8, 2.8, 0.15, 0.5);
  // Apron neon strip
  addBox(neonPink, 0, -0.42, 4.28, 2.0, 0.02, 0.02);

  return [
    { name: "playfield", part: playfield, color: [0.03, 0.02, 0.06, 1], roughness: 0.15, metallic: 0.25 },
    { name: "cabinet", part: cabinet, color: [0.06, 0.07, 0.12, 1], roughness: 0.45, metallic: 0.5 },
    { name: "chrome", part: chrome, color: [0.88, 0.92, 0.96, 1], roughness: 0.08, metallic: 0.95 },
    { name: "backbox", part: backbox, color: [0.04, 0.05, 0.1, 1], roughness: 0.35, metallic: 0.55 },
    { name: "backboxDisplay", part: backboxDisplay, color: [0.01, 0.02, 0.06, 1], roughness: 0.25, metallic: 0.3 },
    { name: "neon", part: neon, color: [0.0, 0.95, 1.0, 1], roughness: 0.05, metallic: 0.0, emissive: [0.0, 2.5, 3.0] },
    { name: "neonPink", part: neonPink, color: [1.0, 0.0, 0.65, 1], roughness: 0.05, metallic: 0.0, emissive: [2.5, 0.0, 1.5] },
    { name: "sideArt", part: sideArt, color: [0.08, 0.04, 0.15, 1], roughness: 0.3, metallic: 0.4 }
  ];
}

// ---- mechanisms overlay -----------------------------------------------------
function buildMechanisms() {
  const brass = part();
  const cyan = part();
  const targets = part();
  const slingshots = part();
  const laneGuides = part();

  // Pop bumpers — proper domed shape with glowing ring
  for (const [x, z] of [[-0.9, -1.7], [0.9, -1.7], [0, -0.7]]) {
    // Base cylinder
    addCylinderY(brass, 0.32, 0.28, 0.02, 0.18, x, z, 20);
    // Domed cap
    addCylinderY(brass, 0.28, 0.15, 0.18, 0.3, x, z, 20);
    addCylinderY(brass, 0.15, 0.02, 0.3, 0.34, x, z, 12);
    // Glowing ring around bumper
    addTorus(cyan, 0.3, 0.03, x, 0.2, z, 20, 8);
    // Skirt ring
    addTorus(brass, 0.34, 0.02, x, 0.04, z, 20, 6);
  }

  // Standup targets — thin tall paddles with rounded tops on posts
  const targetBanks = [
    [[-2.32, -2.4], [-2.32, -2.8], [-2.32, -3.2]],
    [[-2.42, -0.6], [-2.42, -0.2], [-2.42, 0.2]],
    [[-0.5, -2.5], [0, -2.62], [0.5, -2.5]],
    [[1.95, -0.6], [1.95, -0.2], [1.95, 0.2]],
    [[1.95, -2.4], [1.95, -2.8], [1.95, -3.2]]
  ];
  for (const bank of targetBanks) {
    for (const [x, z] of bank) {
      // Post
      addCylinderY(brass, 0.03, 0.03, 0.0, 0.12, x, z, 8);
      // Paddle face
      addBox(targets, x, 0.22, z, 0.12, 0.12, 0.025);
      // Rounded top
      addCylinderY(targets, 0.12, 0.12, 0.32, 0.34, x, z, 10);
    }
  }

  // Bank status lamps — larger, more prominent
  for (let index = 0; index < 5; index += 1) {
    const lx = -0.72 + index * 0.36;
    addCylinderY(cyan, 0.11, 0.11, 0.01, 0.1, lx, -2.02, 14);
    // Lamp housing ring
    addTorus(brass, 0.13, 0.015, lx, 0.06, -2.02, 14, 6);
  }

  // Slingshots — triangular shapes
  // Left slingshot
  addTriangle(slingshots, [-1.5, 0.05, 2.5], [-0.9, 0.05, 1.7], [-1.5, 0.05, 1.7]);
  addTriangle(slingshots, [-1.5, 0.25, 2.5], [-1.5, 0.25, 1.7], [-0.9, 0.25, 1.7]);
  addQuad(slingshots, [-1.5, 0.05, 2.5], [-1.5, 0.25, 2.5], [-0.9, 0.25, 1.7], [-0.9, 0.05, 1.7]);
  addQuad(slingshots, [-1.5, 0.05, 1.7], [-0.9, 0.05, 1.7], [-0.9, 0.25, 1.7], [-1.5, 0.25, 1.7]);
  addQuad(slingshots, [-1.5, 0.05, 2.5], [-0.9, 0.05, 1.7], [-0.9, 0.25, 1.7], [-1.5, 0.25, 2.5]);
  addQuad(slingshots, [-1.5, 0.05, 1.7], [-1.5, 0.05, 2.5], [-1.5, 0.25, 2.5], [-1.5, 0.25, 1.7]);
  // Right slingshot
  addTriangle(slingshots, [1.5, 0.05, 2.5], [1.5, 0.05, 1.7], [0.9, 0.05, 1.7]);
  addTriangle(slingshots, [1.5, 0.25, 2.5], [0.9, 0.25, 1.7], [1.5, 0.25, 1.7]);
  addQuad(slingshots, [1.5, 0.05, 2.5], [0.9, 0.05, 1.7], [0.9, 0.25, 1.7], [1.5, 0.25, 2.5]);
  addQuad(slingshots, [1.5, 0.05, 1.7], [1.5, 0.25, 1.7], [0.9, 0.25, 1.7], [0.9, 0.05, 1.7]);
  addQuad(slingshots, [1.5, 0.05, 2.5], [1.5, 0.25, 2.5], [0.9, 0.25, 1.7], [0.9, 0.05, 1.7]);
  addQuad(slingshots, [1.5, 0.05, 1.7], [1.5, 0.05, 2.5], [1.5, 0.25, 2.5], [1.5, 0.25, 1.7]);

  // Vault medallion — larger, more dramatic
  addCylinderY(brass, 0.45, 0.4, 0.02, 0.18, 0, -3.36, 24);
  addCylinderY(cyan, 0.25, 0.25, 0.18, 0.26, 0, -3.36, 18);
  // Vault ring
  addTorus(brass, 0.42, 0.025, 0, 0.12, -3.36, 24, 6);

  // Orbit markers — larger cyan studs
  for (const [x, z] of [[-2.35, -3.4], [-2.48, -2.9], [-2.52, -2.35], [2.42, -2.9], [2.42, -2.3], [2.42, -1.7]]) {
    addCylinderY(cyan, 0.07, 0.07, 0.01, 0.08, x, z, 10);
  }

  // Lane guide arrows
  addBox(laneGuides, 2.42, 0.04, 3.0, 0.12, 0.02, 0.25);
  addBox(laneGuides, 2.42, 0.04, 2.2, 0.12, 0.02, 0.25);
  addBox(laneGuides, 2.42, 0.04, 1.4, 0.12, 0.02, 0.25);

  return [
    { name: "brassMechanisms", part: brass, color: [0.85, 0.55, 0.12, 1], roughness: 0.18, metallic: 0.75, emissive: [0.3, 0.08, 0.0] },
    { name: "cyanMechanisms", part: cyan, color: [0.0, 0.95, 1.0, 1], roughness: 0.08, metallic: 0.1, emissive: [0.0, 2.0, 2.5] },
    { name: "targetFaces", part: targets, color: [1.0, 0.75, 0.2, 1], roughness: 0.22, metallic: 0.3, emissive: [1.2, 0.4, 0.0] },
    { name: "slingshots", part: slingshots, color: [1.0, 0.35, 0.0, 1], roughness: 0.15, metallic: 0.2, emissive: [1.5, 0.3, 0.0] },
    { name: "laneGuides", part: laneGuides, color: [0.0, 0.8, 1.0, 1], roughness: 0.1, metallic: 0.0, emissive: [0.0, 1.5, 2.0] }
  ];
}

// ---- flipper bat ------------------------------------------------------------
function buildFlipper() {
  const bat = part();
  const rubber = part();
  const chromeCap = part();

  // Pivot collar — wider, more detailed
  addCylinderY(chromeCap, 0.12, 0.12, 0.02, 0.07, 0, 0, 16);
  addCylinderY(chromeCap, 0.09, 0.09, 0.07, 0.09, 0, 0, 16);
  // Pivot bushing ring
  addTorus(chromeCap, 0.1, 0.015, 0, 0.05, 0, 16, 6);

  // Tapered flipper body — more segments for smoother taper
  const segments = 14;
  for (let i = 0; i < segments; i += 1) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const x0 = t0 * 0.92, x1 = t1 * 0.92;
    const w0 = 0.072 * (1 - t0 * 0.6);
    const w1 = 0.072 * (1 - t1 * 0.6);
    const h = 0.042;
    addBox(bat, (x0 + x1) / 2, 0, 0, (x1 - x0) / 2, h, (w0 + w1) / 2);
  }
  // Rounded tip
  addCylinderY(bat, 0.028, 0.028, -0.042, 0.042, 0.92, 0, 12);

  // Neon rubber band — thicker, more prominent
  for (let i = 0; i < segments; i += 1) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const x0 = t0 * 0.92, x1 = t1 * 0.92;
    const w0 = 0.082 * (1 - t0 * 0.6);
    const w1 = 0.082 * (1 - t1 * 0.6);
    // Top rubber edge
    addBox(rubber, (x0 + x1) / 2, 0.035, (w0 + w1) / 2, (x1 - x0) / 2, 0.012, 0.018);
    // Bottom rubber edge
    addBox(rubber, (x0 + x1) / 2, -0.035, (w0 + w1) / 2, (x1 - x0) / 2, 0.012, 0.018);
    // Top rubber edge (other side)
    addBox(rubber, (x0 + x1) / 2, 0.035, -(w0 + w1) / 2, (x1 - x0) / 2, 0.012, 0.018);
    // Bottom rubber edge (other side)
    addBox(rubber, (x0 + x1) / 2, -0.035, -(w0 + w1) / 2, (x1 - x0) / 2, 0.012, 0.018);
  }
  // Tip rubber cap
  addCylinderY(rubber, 0.035, 0.035, -0.035, 0.035, 0.92, 0, 12);

  return [
    { name: "bat", part: bat, color: [0.1, 0.12, 0.18, 1], roughness: 0.3, metallic: 0.55 },
    { name: "rubber", part: rubber, color: [0.0, 0.9, 1.0, 1], roughness: 0.15, metallic: 0.0, emissive: [0.0, 2.0, 2.5] },
    { name: "chromeCap", part: chromeCap, color: [0.9, 0.93, 0.97, 1], roughness: 0.06, metallic: 0.95 }
  ];
}

// ---- ball -------------------------------------------------------------------
function buildBall() {
  const sphere = part();
  const rings = 20, sectors = 24, radius = 0.14;

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
    { name: "chrome", part: sphere, color: [0.92, 0.95, 1.0, 1], roughness: 0.03, metallic: 1.0 }
  ];
}

// ---- vault door -------------------------------------------------------------
function buildVaultDoor() {
  const rim = part();
  const disc = part();
  const wheel = part();
  const statusLeds = part();

  const radius = 0.26;
  const segments = 22;

  // Outer locking collar
  const outerRing = ringZ(segments, radius, 0.04);
  const backRing = ringZ(segments, radius, 0);
  addBand(rim, backRing, outerRing);
  addZCap(rim, backRing, 0, false);

  // Recessed door face
  const innerRing = ringZ(segments, radius * 0.88, 0.04);
  addBand(rim, outerRing, innerRing);
  addZCap(disc, innerRing, 0.04, true);

  // Concentric ring detail on door face
  const midRing = ringZ(segments, radius * 0.65, 0.045);
  addBand(disc, innerRing, midRing);

  // Central 8-spoke locking wheel (was 6)
  for (let i = 0; i < 8; i += 1) {
    const roll = (i / 8) * Math.PI;
    addRollBox(wheel, 0, 0, 0.07, radius * 0.55, 0.014, 0.014, roll);
  }
  // Wheel center hub
  const hubRing = ringZ(14, 0.065, 0.09);
  const hubBase = ringZ(14, 0.065, 0.04);
  addBand(wheel, hubBase, hubRing);
  addZCap(wheel, hubRing, 0.09, true);

  // 6 radial neon status LEDs (was 4)
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const lx = Math.cos(angle) * radius * 0.72;
    const ly = Math.sin(angle) * radius * 0.72;
    addBox(statusLeds, lx, ly, 0.055, 0.022, 0.022, 0.015);
  }

  return [
    { name: "rim", part: rim, color: [0.18, 0.2, 0.28, 1], roughness: 0.35, metallic: 0.8 },
    { name: "disc", part: disc, color: [0.08, 0.1, 0.18, 1], roughness: 0.25, metallic: 0.85 },
    { name: "wheel", part: wheel, color: [0.88, 0.92, 0.96, 1], roughness: 0.1, metallic: 0.95 },
    { name: "statusLeds", part: statusLeds, color: [1.0, 0.85, 0.0, 1], roughness: 0.05, metallic: 0.0, emissive: [2.5, 1.8, 0.0] }
  ];
}

// ---- GLB writer -------------------------------------------------------------
function writeGlb(path, parts) {
  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const nodes = [];
  const materials = parts.map((entry) => {
    const mat = {
      name: entry.name + "-material",
      pbrMetallicRoughness: {
        baseColorFactor: entry.color,
        metallicFactor: entry.metallic ?? 0.05,
        roughnessFactor: entry.roughness
      }
    };
    if (entry.emissive) {
      mat.emissiveFactor = entry.emissive;
    }
    return mat;
  });

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
      generator: "aura3d showcase-vault-breakers build-models REVAMPED (original CC0)",
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
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonData.copy(output, 20);
  const binHead = 20 + jsonData.length;
  output.writeUInt32LE(binData.length, binHead);
  output.writeUInt32LE(0x004e4942, binHead + 4);
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
