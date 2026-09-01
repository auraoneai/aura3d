/**
 * Gallery Shift model synth — generates original CC0 GLB props entirely in-repo.
 *
 * Authored low-poly museum props, flat-shaded and indexed, written as minimal
 * glTF 2.0 GLB containers with no dependencies:
 *   - galleryShiftMuseumInterior.glb : one hall in absolute meters — floor slab,
 *     perimeter walls, north service-alcove throat walls, the two floor-1 wing
 *     partitions, and raised skylight frames (floor-2-specific walls are route
 *     primitives and stay out of this shared GLB)
 *   - galleryShiftPedestal.glb       : exhibit pedestal, origin at base, 1.0 m tall
 *   - galleryShiftExhibitA.glb       : orb artifact (lunar sphere)
 *   - galleryShiftExhibitB.glb       : statue-ish stacked block artifact
 *   - galleryShiftExhibitC.glb       : capsule artifact
 *   - galleryShiftDisplayCase.glb    : glassy display case for the floor-2 row
 *
 * Units are meters. The interior is authored at world coordinates matching the
 * floor-1 layout in src/floor.ts and placed with scaleMode "world".
 *
 * Run from the repo root:  node apps/showcase-gallery-shift/scripts/build-models.mjs
 * Output: apps/showcase-gallery-shift/assets/models/*.glb
 *
 * After generation register each model with the CLI so it lands in the typed root
 * asset map the route imports (`../../../src/aura-assets`). This script documents
 * the commands but does NOT run them:
 *   pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts assets add apps/showcase-gallery-shift/assets/models/galleryShiftMuseumInterior.glb --name galleryShiftMuseumInterior --type model --license CC0-1.0 --author "Aura3D synthesis" --source-page "apps/showcase-gallery-shift/scripts/build-models.mjs"
 *   ... same for galleryShiftPedestal, galleryShiftExhibitA, galleryShiftExhibitB, galleryShiftExhibitC, galleryShiftDisplayCase
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

/** Tapered tube between two rings. */
function addBand(p, lower, upper) {
  const n = Math.min(lower.length, upper.length);
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    addQuad(p, lower[i], lower[j], upper[j], upper[i]);
  }
}

/** Cap a ring around the Y axis with an n-gon fan. */
function addCap(p, pts, y, up, cx = 0, cz = 0) {
  const center = [cx, y, cz];
  for (let i = 0; i < pts.length; i += 1) {
    const j = (i + 1) % pts.length;
    if (up) addTriangle(p, center, pts[i], pts[j]);
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

// ---- museum interior (floor-1 look, absolute meters) ------------------------
/**
 * Matches src/floor.ts FLOOR_1: perimeter x +/-10 (inner faces), z +/-7; wing
 * partitions at x = +/-5 spanning z in [-4, 1.5]; alcove throat walls at
 * x = +/-1.8 (each 2 m long) at z = -5.2 leaving a 1.6 m door to the exit.
 */
function buildMuseumInterior() {
  const floorSlab = part();
  addBox(floorSlab, 0, -0.25, 0, 10.2, 0.25, 7.2);

  const walls = part();
  // Perimeter.
  addBox(walls, 0, 1.8, -7.2, 10.4, 1.8, 0.2); // north
  addBox(walls, 0, 1.8, 7.2, 10.4, 1.8, 0.2);  // south
  addBox(walls, -10.2, 1.8, 0, 0.2, 1.8, 7.4); // west
  addBox(walls, 10.2, 1.8, 0, 0.2, 1.8, 7.4);  // east
  // Service alcove throat (north-center, exit door gap between x -0.8..0.8).
  addBox(walls, -1.8, 1.8, -5.2, 1.0, 1.8, 0.2);
  addBox(walls, 1.8, 1.8, -5.2, 1.0, 1.8, 0.2);
  // Floor-1 partitions mirror the real FloorLayout colliders.  The gaps are
  // deliberately left open: every visible gallery/rotunda threshold is a
  // route-authored passable opening, not a painted suggestion of a door.
  addBox(walls, -5, 1.8, -3.45, 0.2, 1.8, 1.55);
  addBox(walls, -5, 1.8, 1.25, 0.2, 1.8, 1.95);
  addBox(walls, 5, 1.8, -2.45, 0.2, 1.8, 2.55);
  addBox(walls, 5, 1.8, 2.35, 0.2, 1.8, 0.85);
  addBox(walls, -9.05, 1.8, 1.4, 0.95, 1.8, 0.2);
  addBox(walls, -5.95, 1.8, 1.4, 0.95, 1.8, 0.2);
  addBox(walls, 5.95, 1.8, -1.3, 0.95, 1.8, 0.2);
  addBox(walls, 9.05, 1.8, -1.3, 0.95, 1.8, 0.2);

  // Architecture is grouped by material so that the asset reads as a museum
  // rather than a grey collision blockout in the standalone asset probe.
  // The rooms are not a single dark slab.  Separate floor materials establish
  // a readable hierarchy even from the game camera: slate entry/rotunda,
  // petrol archive, warm treasury, and a deliberately pale service vault.
  // These are all shallow inlays on the same FloorLayout regions, never a
  // second movement surface or a substitute collision map.
  const foyerFloor = part();
  const rotundaFloor = part();
  const archiveFloor = part();
  const treasuryFloor = part();
  const vaultFloor = part();
  addBox(foyerFloor, 0, 0.012, 4.65, 4.75, 0.022, 1.65);
  addBox(rotundaFloor, 0, 0.018, 0.1, 4.7, 0.026, 2.95);
  addBox(vaultFloor, 0, 0.014, -5.45, 3.0, 0.022, 1.15);
  addBox(archiveFloor, -7.5, 0.014, -2.85, 2.3, 0.022, 1.95);
  addBox(archiveFloor, -7.5, 0.014, 4.05, 2.3, 0.022, 2.45);
  addBox(treasuryFloor, 7.5, 0.014, -4.15, 2.3, 0.022, 1.55);
  addBox(treasuryFloor, 7.5, 0.014, 2.75, 2.3, 0.022, 3.85);

  // Fine mosaic runners make the inter-room routes visible as circulation,
  // rather than reading as black gaps between detached prop islands.  The
  // runners sit exactly within the walkable rooms and frame, never cover, the
  // actual FloorLayout thresholds.
  const floorMosaics = part();
  for (const [x, z, hx, hz] of [
    [0, 3.18, 3.75, 0.045], [0, 1.95, 3.75, 0.045],
    [0, -1.55, 3.75, 0.045], [0, -3.15, 3.75, 0.045],
    [-7.5, -1.3, 1.65, 0.045], [-7.5, 1.4, 1.65, 0.045],
    [7.5, -1.3, 1.65, 0.045], [7.5, 0.8, 1.65, 0.045]
  ]) addBox(floorMosaics, x, 0.052, z, hx, 0.012, hz);
  for (const [x, z, hx, hz] of [
    [-5, -1.3, 0.045, 0.62], [-5, 1.4, 0.045, 0.55],
    [5, 0.8, 0.045, 0.62], [7.5, -1.3, 0.55, 0.045]
  ]) addBox(floorMosaics, x, 0.052, z, hx, 0.012, hz);

  const brassTrim = part();
  // Four real route thresholds get a full, recessed architectural portal.
  for (const [x, z, horizontal] of [
    [-5, -1.3, false], [-7.5, 1.4, true], [5, 0.8, false], [7.5, -1.3, true]
  ]) {
    if (horizontal) {
      addBox(brassTrim, x - 0.72, 1.5, z, 0.08, 1.5, 0.14);
      addBox(brassTrim, x + 0.72, 1.5, z, 0.08, 1.5, 0.14);
      addBox(brassTrim, x, 2.92, z, 0.84, 0.08, 0.14);
    } else {
      addBox(brassTrim, x, 1.5, z - 0.72, 0.14, 1.5, 0.08);
      addBox(brassTrim, x, 1.5, z + 0.72, 0.14, 1.5, 0.08);
      addBox(brassTrim, x, 2.92, z, 0.14, 0.08, 0.84);
    }
  }
  // Door to the north service vault—its opening remains exactly x -0.8..0.8.
  addBox(brassTrim, -0.92, 1.48, -5.2, 0.1, 1.48, 0.13);
  addBox(brassTrim, 0.92, 1.48, -5.2, 0.1, 1.48, 0.13);
  addBox(brassTrim, 0, 2.88, -5.2, 1.02, 0.1, 0.13);

  const galleryFurniture = part();
  // Built-in benches, plinth bays, and wall-mounted picture frames supply a
  // coherent exhibit language while remaining outside route collision/LOS.
  for (const [x, z, hx, hz] of [
    [-8.15, -5.65, 0.78, 0.28], [-8.15, 5.7, 0.78, 0.28],
    [8.15, -5.65, 0.78, 0.28], [8.15, 5.7, 0.78, 0.28],
    [-2.85, 4.55, 0.65, 0.25], [2.85, 4.55, 0.65, 0.25]
  ]) {
    addBox(galleryFurniture, x, 0.34, z, hx, 0.34, hz);
    addBox(galleryFurniture, x - hx * 0.72, 0.12, z, 0.08, 0.12, hz * 0.8);
    addBox(galleryFurniture, x + hx * 0.72, 0.12, z, 0.08, 0.12, hz * 0.8);
  }
  for (const [x, z, sx, sz] of [
    [-9.94, -3.8, 0.04, 1.05], [-9.94, 3.8, 0.04, 1.05],
    [9.94, -3.8, 0.04, 1.05], [9.94, 3.8, 0.04, 1.05],
    [-2.9, -6.95, 1.0, 0.04], [2.9, -6.95, 1.0, 0.04]
  ]) {
    addBox(galleryFurniture, x, 1.72, z, sx, 0.74, sz);
  }

  // Built-in artifact coves and archive stacks give each room a clear purpose
  // in the unoccluded view.  They intentionally hug the perimeter walls or
  // room corners, leaving the floor.ts patrol routes, objective approaches,
  // and every portal completely unobstructed.
  const exhibitCoves = part();
  for (const [x, z, hx, hz, tall] of [
    [-8.55, -4.65, 0.55, 0.22, 1], [-6.35, -5.6, 0.72, 0.2, 0],
    [-8.55, 5.65, 0.55, 0.22, 1], [-6.25, 5.8, 0.72, 0.2, 0],
    [8.55, -5.65, 0.55, 0.22, 1], [6.35, -5.6, 0.72, 0.2, 0],
    [8.55, 5.55, 0.55, 0.22, 1], [6.35, 5.8, 0.72, 0.2, 0],
    [-3.55, 5.85, 0.4, 0.16, 0], [3.55, 5.85, 0.4, 0.16, 0]
  ]) {
    addBox(exhibitCoves, x, tall ? 0.85 : 0.46, z, hx, tall ? 0.85 : 0.46, hz);
    addBox(exhibitCoves, x, tall ? 1.78 : 0.95, z, hx * 0.76, 0.06, hz * 1.18);
  }

  const archiveShelves = part();
  for (const [x, z, vertical] of [
    [-9.62, -1.9, true], [-9.62, 3.15, true], [9.62, -3.1, true],
    [9.62, 1.8, true], [-1.75, -6.72, false], [1.75, -6.72, false]
  ]) {
    for (let row = 0; row < 4; row += 1) {
      const y = 0.34 + row * 0.34;
      addBox(archiveShelves, x, y, z, vertical ? 0.09 : 0.72, 0.035, vertical ? 0.75 : 0.09);
    }
  }

  const accentFrames = part();
  for (const [x, z, sx, sz] of [
    [-9.88, -3.8, 0.055, 0.72], [-9.88, 3.8, 0.055, 0.72],
    [9.88, -3.8, 0.055, 0.72], [9.88, 3.8, 0.055, 0.72],
    [-2.9, -6.9, 0.72, 0.055], [2.9, -6.9, 0.72, 0.055]
  ]) addBox(accentFrames, x, 1.72, z, sx, 0.52, sz);

  const columns = part();
  for (const [x, z] of [[-4.25, -4.9], [4.25, -4.9], [-4.25, 3.2], [4.25, 3.2]]) {
    addBox(columns, x, 1.45, z, 0.18, 1.45, 0.18);
    addBox(columns, x, 2.95, z, 0.34, 0.08, 0.34);
  }

  const skylights = part();
  // Two raised skylight frames over the rotunda and the south approach.
  for (const center of [[0, 0], [0, 4.5]]) {
    const [sx, sz] = center;
    const half = 1.7;
    const railHalf = 0.12;
    addBox(skylights, sx, 3.42, sz - half, half + railHalf, 0.07, railHalf);
    addBox(skylights, sx, 3.42, sz + half, half + railHalf, 0.07, railHalf);
    addBox(skylights, sx - half, 3.42, sz, railHalf, 0.07, half);
    addBox(skylights, sx + half, 3.42, sz, railHalf, 0.07, half);
  }

  return [
    // The live route intentionally has a nocturnal security grade.  These
    // mid-tone floor values preserve room identity under that grade instead of
    // collapsing every wing into the same near-black rectangle.
    { name: "floorSlab", part: floorSlab, color: [0.12, 0.18, 0.25, 1], roughness: 0.3, metallic: 0.18 },
    { name: "foyerFloor", part: foyerFloor, color: [0.30, 0.43, 0.51, 1], roughness: 0.34, metallic: 0.2 },
    { name: "rotundaFloor", part: rotundaFloor, color: [0.20, 0.39, 0.48, 1], roughness: 0.31, metallic: 0.32 },
    { name: "archiveFloor", part: archiveFloor, color: [0.12, 0.48, 0.47, 1], roughness: 0.38, metallic: 0.22 },
    { name: "treasuryFloor", part: treasuryFloor, color: [0.50, 0.27, 0.20, 1], roughness: 0.37, metallic: 0.24 },
    { name: "vaultFloor", part: vaultFloor, color: [0.42, 0.52, 0.52, 1], roughness: 0.34, metallic: 0.18 },
    { name: "floorMosaics", part: floorMosaics, color: [0.67, 0.62, 0.35, 1], roughness: 0.22, metallic: 0.76 },
    { name: "walls", part: walls, color: [0.39, 0.45, 0.50, 1], roughness: 0.48, metallic: 0.12 },
    { name: "brassTrim", part: brassTrim, color: [0.82, 0.57, 0.20, 1], roughness: 0.25, metallic: 0.78 },
    { name: "galleryFurniture", part: galleryFurniture, color: [0.18, 0.24, 0.30, 1], roughness: 0.42, metallic: 0.2 },
    { name: "exhibitCoves", part: exhibitCoves, color: [0.50, 0.55, 0.57, 1], roughness: 0.36, metallic: 0.34 },
    { name: "archiveShelves", part: archiveShelves, color: [0.13, 0.17, 0.20, 1], roughness: 0.44, metallic: 0.2 },
    { name: "accentFrames", part: accentFrames, color: [0.66, 0.21, 0.24, 1], roughness: 0.34, metallic: 0.36 },
    { name: "columns", part: columns, color: [0.55, 0.61, 0.66, 1], roughness: 0.36, metallic: 0.45 },
    { name: "skylights", part: skylights, color: [0.23, 0.47, 0.55, 1], roughness: 0.26, metallic: 0.55 }
  ];
}

// ---- pedestal ----------------------------------------------------------------
/** Exhibit pedestal: base plate, tapered column, top plate; 1.0 m tall, origin at base. */
function buildPedestal() {
  const pedestal = part();
  addBox(pedestal, 0, 0.05, 0, 0.3, 0.05, 0.3);
  const rings = [
    ring(8, 0.24, 0.1),
    ring(8, 0.19, 0.9)
  ];
  addBand(pedestal, rings[0], rings[1]);
  addBox(pedestal, 0, 0.95, 0, 0.26, 0.05, 0.26);
  return [
    { name: "pedestal", part: pedestal, color: [0.2, 0.23, 0.3, 1], roughness: 0.45, metallic: 0.1 }
  ];
}

// ---- exhibit A: orb ------------------------------------------------------------
/** Lunar orb artifact: sphere with an equatorial ring, origin at base. */
function buildExhibitA() {
  const orb = part();
  const radius = 0.16;
  const longitudeSegments = 14;
  const latitudeSegments = 10;
  const rings = [];
  for (let i = 1; i < latitudeSegments; i += 1) {
    const phi = (-0.5 + i / latitudeSegments) * Math.PI;
    rings.push(ring(longitudeSegments, Math.cos(phi) * radius, Math.sin(phi) * radius + radius + 0.02));
  }
  for (let i = 0; i < rings.length - 1; i += 1) {
    addBand(orb, rings[i], rings[i + 1]);
  }
  addCap(orb, rings[0], 0.02, false);
  addCap(orb, rings[rings.length - 1], radius * 2 + 0.02, true);
  // Equatorial ring.
  addBand(orb, ring(16, 0.22, radius + 0.02), ring(16, 0.22, radius + 0.07));
  return [
    { name: "orb", part: orb, color: [0.85, 0.78, 0.55, 1], roughness: 0.25, metallic: 0.6 }
  ];
}

// ---- exhibit B: statue-ish block ------------------------------------------------
/** Statue-ish artifact: stacked tapered blocks, origin at base. */
function buildExhibitB() {
  const statue = part();
  addBox(statue, 0, 0.05, 0, 0.17, 0.05, 0.17);
  addBox(statue, 0, 0.16, 0, 0.12, 0.07, 0.12);
  addBox(statue, 0, 0.28, 0, 0.08, 0.06, 0.08);
  addBox(statue, 0, 0.38, 0, 0.05, 0.05, 0.05);
  addBox(statue, 0, 0.45, 0, 0.02, 0.03, 0.02);
  return [
    { name: "statue", part: statue, color: [0.55, 0.5, 0.58, 1], roughness: 0.6, metallic: 0.05 }
  ];
}

// ---- exhibit C: capsule ----------------------------------------------------------
/** Capsule artifact: cylinder with sphere caps, lying upright, origin at base. */
function buildExhibitC() {
  const capsule = part();
  const r = 0.11;
  const cylHeight = 0.2;
  addBand(capsule, ring(12, r, r + 0.02), ring(12, r, r + cylHeight + 0.02));
  // Top dome.
  const domeRings = [];
  for (let i = 1; i <= 4; i += 1) {
    const phi = (i / 5) * (Math.PI / 2);
    domeRings.push(ring(12, Math.cos(phi) * r, r + cylHeight + 0.02 + Math.sin(phi) * r));
  }
  for (let i = 0; i < domeRings.length - 1; i += 1) {
    addBand(capsule, domeRings[i], domeRings[i + 1]);
  }
  addCap(capsule, domeRings[domeRings.length - 1], r + cylHeight + 0.02 + r, true);
  addCap(capsule, ring(12, r, r + 0.02), r + 0.02, true);
  return [
    { name: "capsule", part: capsule, color: [0.4, 0.62, 0.66, 1], roughness: 0.3, metallic: 0.45 }
  ];
}

// ---- display case -----------------------------------------------------------------
/** Glassy display case: transparent-ish body with steel base, origin at base. */
function buildDisplayCase() {
  const base = part();
  addBox(base, 0, 0.04, 0, 0.5, 0.04, 0.5);
  const glass = part();
  addBox(glass, 0, 0.5, 0, 0.42, 0.42, 0.42);
  return [
    { name: "caseBase", part: base, color: [0.18, 0.2, 0.26, 1], roughness: 0.5, metallic: 0.35 },
    { name: "caseGlass", part: glass, color: [0.55, 0.68, 0.75, 0.4], roughness: 0.1, metallic: 0.2 }
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
    },
    ...(entry.color[3] !== undefined && entry.color[3] < 1 ? { alphaMode: "BLEND" } : {})
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
    asset: { version: "2.0", generator: "aura3d showcase-gallery-shift build-models (original CC0)" },
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

const builds = [
  ["galleryShiftMuseumInterior.glb", buildMuseumInterior],
  ["galleryShiftPedestal.glb", buildPedestal],
  ["galleryShiftExhibitA.glb", buildExhibitA],
  ["galleryShiftExhibitB.glb", buildExhibitB],
  ["galleryShiftExhibitC.glb", buildExhibitC],
  ["galleryShiftDisplayCase.glb", buildDisplayCase]
];
for (const [name, build] of builds) {
  const bytes = writeGlb(resolve(OUT_DIR, name), build());
  console.log("wrote", resolve(OUT_DIR, name), "(" + bytes + " bytes)");
}
