/**
 * Bank Shot model synth — generates original CC0 GLB props entirely in-repo.
 *
 * Eighteen authored low-poly props for the billiards hall, flat-shaded and
 * indexed, written as minimal glTF 2.0 GLB containers with no dependencies:
 *   - bankShotTable.glb       : billiards table (felt slab top at y = 0,
 *                               cushioned walnut rails, pocket collars, four
 *                               legs) centered on the origin
 *   - bankShotCue.glb         : tapered cue stick, tip at origin, local +X = tip
 *                               direction, two-tone wood
 *   - bankShotBall00.glb      : unit-normalized white cue ball (radius 0.5, 24x18 UV sphere)
 *   - bankShotBall01..15.glb  : solids 1-7 (yellow/blue/red/purple/orange/green/
 *                               maroon), the black 8, stripes 9-15 (same hues
 *                               with a white equatorial band ~40% of the diameter
 *                               so the stripe reads from the GLB materials — no
 *                               route-side tinting anywhere)
 *
 * The table and cue are authored in metres. Balls are unit-normalized so each
 * release asset remains independently inspectable; the route applies the
 * regulation 0.07 m diameter while synchronizing its public Rapier body.
 *
 * Run from the repo root:  node apps/showcase-bank-shot/scripts/build-models.mjs
 * Output: apps/showcase-bank-shot/assets/models/*.glb
 *
 * After generation register each model with the CLI so it lands in the typed root
 * asset map the route imports (`../../../src/aura-assets`). This script documents
 * the commands but does NOT run them; ids are bankShotBall00..bankShotBall15,
 * bankShotTable, and bankShotCue, e.g.:
 *   pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts assets add apps/showcase-bank-shot/assets/models/bankShotTable.glb --name bankShotTable --type model --license CC0-1.0 --author "Aura3D synthesis" --source-page "apps/showcase-bank-shot/scripts/build-models.mjs"
 *   pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts assets add apps/showcase-bank-shot/assets/models/bankShotCue.glb --name bankShotCue --type model --license CC0-1.0 --author "Aura3D synthesis" --source-page "apps/showcase-bank-shot/scripts/build-models.mjs"
 *   ... and one assets add per ball file bankShotBall00.glb .. bankShotBall15.glb
 *       with --name bankShotBall00 .. bankShotBall15.
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

/** Ring of points around the X axis at x with radius r (cue stick shaft). */
function ringX(n, r, x) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const angle = (i / n) * Math.PI * 2;
    pts.push([x, Math.cos(angle) * r, Math.sin(angle) * r]);
  }
  return pts;
}

/** Low-poly torus around the Y axis, used for the authored pocket collars. */
function addTorusY(p, cx, cy, cz, majorRadius, tubeRadius, segments = 18, tubeSegments = 6) {
  const rings = [];
  for (let tube = 0; tube <= tubeSegments; tube += 1) {
    const v = (tube / tubeSegments) * Math.PI * 2;
    const ringPoints = [];
    for (let segment = 0; segment < segments; segment += 1) {
      const u = (segment / segments) * Math.PI * 2;
      const ringRadius = majorRadius + tubeRadius * Math.cos(v);
      ringPoints.push([
        cx + ringRadius * Math.cos(u),
        cy + tubeRadius * Math.sin(v),
        cz + ringRadius * Math.sin(u)
      ]);
    }
    rings.push(ringPoints);
  }
  for (let tube = 0; tube < rings.length - 1; tube += 1) addBand(p, rings[tube], rings[tube + 1]);
}

/** Tapered tube between two rings. */
function addBand(p, lower, upper) {
  const n = Math.min(lower.length, upper.length);
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    addQuad(p, lower[i], lower[j], upper[j], upper[i]);
  }
}

/**
 * Outward-wound Y-axis band used by the billiard spheres. `addBand` is kept
 * for the existing cue/torus generator topology; applying it to latitude
 * rings points the faces inward, so backface culling leaves only far-side
 * crescents in the rendered rack.
 */
function addSphereBand(p, lower, upper) {
  const n = Math.min(lower.length, upper.length);
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    addQuad(p, lower[i], upper[i], upper[j], lower[j]);
  }
}

/** Outward-wound cap for a Y-axis sphere. */
function addSphereCap(p, pts, y, up) {
  const center = [0, y, 0];
  for (let i = 0; i < pts.length; i += 1) {
    const j = (i + 1) % pts.length;
    if (up) addTriangle(p, center, pts[j], pts[i]);
    else addTriangle(p, center, pts[i], pts[j]);
  }
}

/** Replace flat triangle normals with radial normals for glossy ball shading. */
function smoothSphereNormals(p) {
  for (let index = 0; index < p.positions.length; index += 3) {
    const x = p.positions[index];
    const y = p.positions[index + 1];
    const z = p.positions[index + 2];
    const length = Math.hypot(x, y, z) || 1;
    p.normals[index] = x / length;
    p.normals[index + 1] = y / length;
    p.normals[index + 2] = z / length;
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

/** Cap a ring around the X axis with an n-gon fan facing +X (tip) or -X (butt). */
function addXCap(p, pts, x, plusX, cx = 0) {
  const center = [cx, 0, 0];
  for (let i = 0; i < pts.length; i += 1) {
    const j = (i + 1) % pts.length;
    if (plusX) addTriangle(p, center, pts[i], pts[j]);
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

/**
 * Long-axis rail prism with a real chamfered cross-section. Unlike stacked
 * rectangular trim, the four bevel faces carry distinct normals, so the typed
 * walnut rail catches a continuous pendant-light rolloff at the review angle.
 */
function addChamferedPrismX(p, cx, cy, cz, hx, hy, hz, bevel) {
  const section = (x) => [
    [x, cy - hy + bevel, cz - hz],
    [x, cy - hy, cz - hz + bevel],
    [x, cy - hy, cz + hz - bevel],
    [x, cy - hy + bevel, cz + hz],
    [x, cy + hy - bevel, cz + hz],
    [x, cy + hy, cz + hz - bevel],
    [x, cy + hy, cz - hz + bevel],
    [x, cy + hy - bevel, cz - hz]
  ];
  const left = section(cx - hx);
  const right = section(cx + hx);
  addBand(p, left, right);
  addCapPolygon(p, left, false);
  addCapPolygon(p, right, true);
}

/** Short-axis companion to addChamferedPrismX. */
function addChamferedPrismZ(p, cx, cy, cz, hx, hy, hz, bevel) {
  const section = (z) => [
    [cx - hx, cy - hy + bevel, z],
    [cx - hx + bevel, cy - hy, z],
    [cx + hx - bevel, cy - hy, z],
    [cx + hx, cy - hy + bevel, z],
    [cx + hx, cy + hy - bevel, z],
    [cx + hx - bevel, cy + hy, z],
    [cx - hx + bevel, cy + hy, z],
    [cx - hx, cy + hy - bevel, z]
  ];
  const near = section(cz - hz);
  const far = section(cz + hz);
  addBand(p, near, far);
  addCapPolygon(p, near, false);
  addCapPolygon(p, far, true);
}

/** Cap any convex section with a triangle fan. */
function addCapPolygon(p, points, forward) {
  const center = points.reduce(
    (sum, point) => [sum[0] + point[0] / points.length, sum[1] + point[1] / points.length, sum[2] + point[2] / points.length],
    [0, 0, 0]
  );
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    if (forward) addTriangle(p, center, points[index], points[next]);
    else addTriangle(p, center, points[next], points[index]);
  }
}

/** Horizontal, upward-facing disc for a pocket mouth or ball identity patch. */
function addDisc(p, cx, cy, cz, radius, segments = 20) {
  const center = [cx, cy, cz];
  const edge = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    edge.push([cx + Math.cos(angle) * radius, cy, cz + Math.sin(angle) * radius]);
  }
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    // Reversed x/z winding produces a +Y normal.
    addTriangle(p, center, edge[next], edge[index]);
  }
}

/** Upward-facing top quad used by the seven-segment ball-number marks. */
function addTopQuad(p, x0, z0, x1, z1, y) {
  addQuad(p, [x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]);
}

/** A horizontal elliptical ribbon used for cloth graphics authored in the table GLB. */
function addEllipseRibbon(p, cx, cy, cz, radiusX, radiusZ, width, segments = 64) {
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    const a0 = (index / segments) * Math.PI * 2;
    const a1 = (next / segments) * Math.PI * 2;
    const outer0 = [cx + Math.cos(a0) * radiusX, cy, cz + Math.sin(a0) * radiusZ];
    const outer1 = [cx + Math.cos(a1) * radiusX, cy, cz + Math.sin(a1) * radiusZ];
    const inner0 = [cx + Math.cos(a0) * (radiusX - width), cy, cz + Math.sin(a0) * (radiusZ - width)];
    const inner1 = [cx + Math.cos(a1) * (radiusX - width), cy, cz + Math.sin(a1) * (radiusZ - width)];
    addQuad(p, inner0, inner1, outer1, outer0);
  }
}

/**
 * Recessed leather drop-pocket cup.  The table physics still uses the same
 * six sensor regions; this is only the authored typed geometry that gives the
 * mouth a visible wall and a real dark lower catch instead of a floating decal.
 */
function addPocketWell(p, cx, cz, radius, segments = 24) {
  const upper = ring(segments, radius * 0.76, 0.006).map(([x, y, z]) => [x + cx, y, z + cz]);
  const lower = ring(segments, radius * 0.48, -0.052).map(([x, y, z]) => [x + cx, y, z + cz]);
  addBand(p, lower, upper);
  addCap(p, lower, -0.052, false, cx, cz);
}

/** A small horizontal diamond for the table's integrated rail sights. */
function addDiamond(p, cx, cy, cz, radiusX, radiusZ) {
  addQuad(
    p,
    [cx - radiusX, cy, cz],
    [cx, cy, cz + radiusZ],
    [cx + radiusX, cy, cz],
    [cx, cy, cz - radiusZ]
  );
}

/**
 * A shallow triangulated nap over the typed felt bed. The microscopic height
 * variation gives the PBR lighting a continuous cloth response instead of one
 * perfectly flat blue quad, while staying below the public physics plane.
 */
function addFeltWeave(parts, xMin, xMax, zMin, zMax, columns = 72, rows = 40) {
  // Keep the cloth nap below silhouette scale. The earlier 3-material,
  // 5-millimetre tessellation read as a checkerboard from the review camera,
  // not as woven felt. One continuous material and sub-millimetre undulation
  // let the pendant lights supply tactile variation without visible tiles.
  const wave = (x, z) => 0.0011 + Math.sin(x * 13.0 + z * 7.0) * 0.00032 + Math.cos(z * 17.0 - x * 5.0) * 0.00018;
  for (let row = 0; row < rows; row += 1) {
    const z0 = zMin + (zMax - zMin) * (row / rows);
    const z1 = zMin + (zMax - zMin) * ((row + 1) / rows);
    for (let column = 0; column < columns; column += 1) {
      const p = parts[(row + column * 2) % parts.length];
      const x0 = xMin + (xMax - xMin) * (column / columns);
      const x1 = xMin + (xMax - xMin) * ((column + 1) / columns);
      addQuad(p,
        [x0, wave(x0, z0), z0],
        [x0, wave(x0, z1), z1],
        [x1, wave(x1, z1), z1],
        [x1, wave(x1, z0), z0]
      );
    }
  }
}

// ---- billiards table --------------------------------------------------------
/**
 * Origin is the felt center on the felt surface (y = 0), +X is the long axis
 * (the rack apex end is +X in world space once posed), +Z toward the player.
 * The felt slab is 2.9 x 0.12 x 1.7 with its TOP face exactly at y = 0.
 */
function buildTable() {
  const felt = part();
  const feltWeave = [part()];
  // Felt slab: top face at y = 0.
  addBox(felt, 0, -0.06, 0, 1.45, 0.06, 0.85);
  addFeltWeave(feltWeave, -1.31, 1.31, -0.70, 0.70);

  const rails = part();
  // Chamfered walnut rails ~0.12 tall above the felt. The bevel faces are
  // physical typed geometry with their own normals, not a route-side shine.
  addChamferedPrismX(rails, 0, 0.06, -0.85, 1.63, 0.06, 0.13, 0.028); // far long rail
  addChamferedPrismX(rails, 0, 0.06, 0.85, 1.63, 0.06, 0.13, 0.028); // near long rail
  addChamferedPrismZ(rails, -1.45, 0.06, 0, 0.13, 0.06, 0.72, 0.028); // left short rail
  addChamferedPrismZ(rails, 1.45, 0.06, 0, 0.13, 0.06, 0.72, 0.028); // right short rail

  const cushions = part();
  // Separate low-profile cushion faces make the playable edge read as an
  // upholstered rail instead of a single flat brown slab. They are authored
  // in the typed table asset and stay aligned with the public physics bounds.
  addBox(cushions, 0, 0.095, -0.735, 1.30, 0.035, 0.042);
  addBox(cushions, 0, 0.095, 0.735, 1.30, 0.035, 0.042);
  addBox(cushions, -1.335, 0.095, 0, 0.042, 0.035, 0.62);
  addBox(cushions, 1.335, 0.095, 0, 0.042, 0.035, 0.62);

  const railTrim = part();
  // Fine top caps catch the pendant key light and give the walnut rail a
  // readable bevel-like break without introducing a renderer-side overlay.
  addBox(railTrim, 0, 0.126, -0.85, 1.51, 0.012, 0.105);
  addBox(railTrim, 0, 0.126, 0.85, 1.51, 0.012, 0.105);
  addBox(railTrim, -1.45, 0.126, 0, 0.105, 0.012, 0.62);
  addBox(railTrim, 1.45, 0.126, 0, 0.105, 0.012, 0.62);

  const railVeneer = part();
  // Paired inset grain ribbons break the broad rail tops into lacquered wood
  // layers and give the oblique key light a second, warmer response.
  for (const z of [-0.888, -0.812, 0.812, 0.888]) {
    addBox(railVeneer, 0, 0.141, z, 1.43, 0.003, 0.008);
  }
  for (const x of [-1.488, -1.412, 1.412, 1.488]) {
    addBox(railVeneer, x, 0.141, 0, 0.008, 0.003, 0.58);
  }

  const railSights = part();
  for (const x of [-1.05, -0.70, -0.35, 0, 0.35, 0.70, 1.05]) {
    addDiamond(railSights, x, 0.141, -0.85, 0.017, 0.011);
    addDiamond(railSights, x, 0.141, 0.85, 0.017, 0.011);
  }
  for (const z of [-0.42, 0, 0.42]) {
    addDiamond(railSights, -1.45, 0.141, z, 0.011, 0.017);
    addDiamond(railSights, 1.45, 0.141, z, 0.011, 0.017);
  }

  const clothMarkings = part();
  // A restrained asymmetrical league crest gives the table its own identity
  // without replacing the continuous felt or reading as a route-side overlay.
  // Keep the identity mark at a cue-sports scale.  The earlier half-metre
  // crest dominated the close camera and read as a debug target; this compact
  // double-line oval is still visible in the asset probe without competing
  // with the live rack or cue ball.
  addEllipseRibbon(clothMarkings, -0.78, 0.0045, 0.31, 0.12, 0.08, 0.007, 48);
  addEllipseRibbon(clothMarkings, -0.78, 0.0046, 0.31, 0.065, 0.043, 0.005, 48);
  addBox(clothMarkings, -0.78, 0.0045, 0.31, 0.008, 0.00035, 0.068);
  // A compact break-zone ring anchors the rack in the cloth and echoes the
  // asymmetric identity treatment of a premium pool table without becoming a
  // giant debug target.  It is part of the table GLB, not route-side UI.
  addEllipseRibbon(clothMarkings, 0.55, 0.0048, 0, 0.24, 0.17, 0.008, 64);
  addEllipseRibbon(clothMarkings, 0.55, 0.0049, 0, 0.17, 0.115, 0.005, 64);
  // Regulation head string and spots remain subtle under the live rack/cue.
  addBox(clothMarkings, -0.65, 0.0045, 0, 0.004, 0.00035, 0.54);
  addDisc(clothMarkings, 0.55, 0.0046, 0, 0.014, 24);
  addDisc(clothMarkings, -0.65, 0.0046, 0, 0.011, 24);

  const apron = part();
  // A darker inset apron under each rail catches the warm key as a reflected
  // band and makes the typed table read as assembled furniture.
  addBox(apron, 0, -0.10, -0.91, 1.58, 0.075, 0.055);
  addBox(apron, 0, -0.10, 0.91, 1.58, 0.075, 0.055);
  addBox(apron, -1.51, -0.10, 0, 0.055, 0.075, 0.70);
  addBox(apron, 1.51, -0.10, 0, 0.055, 0.075, 0.70);
  for (const [x, z] of [[-1.53, -0.91], [1.53, -0.91], [-1.53, 0.91], [1.53, 0.91]]) {
    addBox(apron, x, -0.08, z, 0.09, 0.09, 0.09);
  }

  const legs = part();
  // Four square legs dropping from the slab to the floor at y = -0.78.
  addBox(legs, -1.25, -0.45, -0.65, 0.08, 0.33, 0.08);
  addBox(legs, 1.25, -0.45, -0.65, 0.08, 0.33, 0.08);
  addBox(legs, -1.25, -0.45, 0.65, 0.08, 0.33, 0.08);
  addBox(legs, 1.25, -0.45, 0.65, 0.08, 0.33, 0.08);

  // Six zero-thickness dark mouth planes live in the typed table asset. They
  // remain clean circles at a grazing camera angle and cannot cast the detached
  // crescent shadows produced by route-side flattened volume primitives.
  const pockets = part();
  const pocketInteriors = part();
  const pocketWells = part();
  const pocketRims = part();
  for (const [x, z, radius] of [
    [-1.3, -0.7, 0.115], [1.3, -0.7, 0.115],
    [-1.3, 0.7, 0.115], [1.3, 0.7, 0.115],
    [0, -0.7, 0.095], [0, 0.7, 0.095]
  ]) {
    // The mouth is intentionally smaller than the outer collar.  This leaves
    // a visible felt/rail lip instead of a flat black decal and gives the
    // layered pocket materials a readable scale in the close break frame.
    addDisc(pockets, x, 0.006, z, radius * 0.78, 28);
    addTorusY(pocketInteriors, x, 0.014, z, radius * 0.64, 0.017, 22, 6);
    addPocketWell(pocketWells, x, z, radius, 24);
    addTorusY(pocketRims, x, 0.022, z, radius + 0.004, 0.012, 18, 5);
  }

  return [
    // Tournament-blue felt is part of the typed table asset itself. Keeping
    // the bed continuous with the rail geometry avoids a route-side rectangle
    // that reads as an overlay and gives the PBR path one grounded surface to
    // shade, reflect, and receive ball contact shadows across.
    { name: "felt", part: felt, color: [0.012, 0.055, 0.245, 1], roughness: 0.86, specular: 0.34, clearcoat: 0.05, clearcoatRoughness: 0.28 },
    { name: "felt-weave", part: feltWeave[0], color: [0.021, 0.082, 0.31, 1], roughness: 0.9, specular: 0.3, clearcoat: 0.02, clearcoatRoughness: 0.36 },
    { name: "cloth-markings", part: clothMarkings, color: [0.41, 0.65, 0.75, 1], roughness: 0.7, metallic: 0, specular: 0.4 },
    { name: "rails", part: rails, color: [0.055, 0.009, 0.003, 1], roughness: 0.3, clearcoat: 0.76, clearcoatRoughness: 0.18, specular: 0.84 },
    { name: "cushions", part: cushions, color: [0.005, 0.032, 0.13, 1], roughness: 0.56, metallic: 0.01, clearcoat: 0.22, clearcoatRoughness: 0.22, specular: 0.7 },
    { name: "rail-trim", part: railTrim, color: [0.17, 0.032, 0.008, 1], roughness: 0.27, metallic: 0.08, clearcoat: 0.76, clearcoatRoughness: 0.14, specular: 0.88 },
    { name: "rail-veneer", part: railVeneer, color: [0.28, 0.06, 0.014, 1], roughness: 0.23, metallic: 0.05, clearcoat: 0.82, clearcoatRoughness: 0.11, specular: 0.92 },
    { name: "rail-sights", part: railSights, color: [0.74, 0.78, 0.72, 1], roughness: 0.2, metallic: 0.45 },
    { name: "apron", part: apron, color: [0.038, 0.007, 0.004, 1], roughness: 0.44, metallic: 0.05 },
    { name: "legs", part: legs, color: [0.075, 0.016, 0.006, 1], roughness: 0.6 },
    { name: "pocket-mouths", part: pockets, color: [0.003, 0.006, 0.012, 1], roughness: 0.74, metallic: 0, specular: 0.42 },
    { name: "pocket-interiors", part: pocketInteriors, color: [0.012, 0.02, 0.04, 1], roughness: 0.45, metallic: 0.15, clearcoat: 0.35, clearcoatRoughness: 0.18, specular: 0.8 },
    { name: "pocket-wells", part: pocketWells, color: [0.004, 0.006, 0.012, 1], roughness: 0.62, metallic: 0.04, clearcoat: 0.18, clearcoatRoughness: 0.3, specular: 0.55 },
    { name: "pocket-rims", part: pocketRims, color: [0.07, 0.095, 0.14, 1], roughness: 0.18, metallic: 0.55, clearcoat: 0.65, clearcoatRoughness: 0.12, specular: 0.92 }
  ];
}

// ---- cue stick --------------------------------------------------------------
/**
 * Tapered cue, tip at the origin, local +X = tip direction, butt at x = -1.45.
 * Light maple shaft with a dark wrap butt and a small leather tip cap.
 */
function buildCue() {
  const shaft = part();
  const tip = part();
  const butt = part();
  const segments = 10;
  // Leather tip: x = -0.012 .. 0, radius ~0.006.
  addBand(tip, ringX(segments, 0.006, -0.012), ringX(segments, 0.0045, 0));
  addXCap(tip, ringX(segments, 0.006, -0.012), -0.012, false, -0.012);
  addXCap(tip, ringX(segments, 0.0045, 0), 0, true, 0);
  // Maple shaft: x = -0.62 .. -0.012, radius 0.0065 -> 0.0085.
  const shaftRings = [-0.012, -0.22, -0.42, -0.62].map((x, i, xs) => {
    const t = i / (xs.length - 1);
    return ringX(segments, 0.0065 + t * 0.002, x);
  });
  for (let i = 0; i < shaftRings.length - 1; i += 1) addBand(shaft, shaftRings[i], shaftRings[i + 1]);
  // Dark butt: x = -1.45 .. -0.62, radius 0.0085 -> 0.0145.
  const buttRings = [-0.62, -0.9, -1.2, -1.45].map((x, i, xs) => {
    const t = i / (xs.length - 1);
    return ringX(segments, 0.0085 + t * 0.006, x);
  });
  for (let i = 0; i < buttRings.length - 1; i += 1) addBand(butt, buttRings[i], buttRings[i + 1]);
  addXCap(butt, buttRings[buttRings.length - 1], -1.45, false, -1.45);

  return [
    { name: "tip", part: tip, color: [0.35, 0.25, 0.2, 1], roughness: 0.8 },
    { name: "shaft", part: shaft, color: [0.87, 0.72, 0.45, 1], roughness: 0.4 },
    { name: "butt", part: butt, color: [0.24, 0.12, 0.06, 1], roughness: 0.5 }
  ];
}

// ---- ball set ---------------------------------------------------------------
const BALL_RADIUS = 0.5;
const BALL_GEOMETRY_SCALE = BALL_RADIUS / 0.035;
const LONGITUDE_SEGMENTS = 36;
const LATITUDE_BANDS = 26;

/** Classic 8-ball hues: balls 1-7 solids, 8 black, 9-15 stripes of the same hues. */
const BALL_HUES = {
  1: [0.99, 0.82, 0.09],
  2: [0.10, 0.28, 0.75],
  3: [0.85, 0.12, 0.10],
  4: [0.45, 0.12, 0.55],
  5: [0.95, 0.45, 0.05],
  6: [0.05, 0.55, 0.20],
  7: [0.55, 0.10, 0.15]
};
const BALL_WHITE = [0.93, 0.93, 0.9, 1];
const BALL_BLACK = [0.05, 0.05, 0.06, 1];
const BALL_SHININESS = {
  roughness: 0.055,
  metallic: 0,
  clearcoat: 0.94,
  clearcoatRoughness: 0.042,
  specular: 0.96
};

/** Latitude rings (around Y) for a full sphere split into LATITUDE_BANDS bands. */
function fullSphereRings() {
  const rings = [];
  for (let i = 1; i < LATITUDE_BANDS; i += 1) {
    const phi = (-0.5 + i / LATITUDE_BANDS) * Math.PI;
    rings.push(ring(LONGITUDE_SEGMENTS, Math.cos(phi) * BALL_RADIUS, Math.sin(phi) * BALL_RADIUS));
  }
  return rings;
}

/** White equatorial band ~40% of the diameter: |y| <= 0.2 * radius. */
const BAND_LIMIT = Math.asin(0.2);

/** Colored cap rings from `fromRad` to the `pole` (+/- PI/2), inclusive edges. */
function capRings(fromRad, pole) {
  const rings = [];
  const steps = 5;
  for (let i = 0; i <= steps; i += 1) {
    const phi = fromRad + (pole - fromRad) * (i / steps);
    rings.push(ring(LONGITUDE_SEGMENTS, Math.cos(phi) * BALL_RADIUS, Math.sin(phi) * BALL_RADIUS));
  }
  return rings;
}

/** Solid-color ball: one part, one colored material. */
function buildSolidBall(color) {
  const sphere = part();
  const rings = fullSphereRings();
  for (let i = 0; i < rings.length - 1; i += 1) addSphereBand(sphere, rings[i], rings[i + 1]);
  addSphereCap(sphere, rings[0], -BALL_RADIUS, false);
  addSphereCap(sphere, rings[rings.length - 1], BALL_RADIUS, true);
  return [
    { name: "ball", part: sphere, color: [...color, 1], ...BALL_SHININESS }
  ];
}

/** Stripe ball: colored top+bottom caps and a white equatorial band as separate
 *  parts, each carrying its own GLB material so the stripe reads with zero
 *  route-side tinting. */
function buildStripeBall(color) {
  const caps = part();
  const band = part();
  // Colored caps: -90deg..-band and +band..+90deg.
  const lowerCap = capRings(-Math.PI / 2, -BAND_LIMIT);
  for (let i = 0; i < lowerCap.length - 1; i += 1) addSphereBand(caps, lowerCap[i], lowerCap[i + 1]);
  addSphereCap(caps, lowerCap[0], -BALL_RADIUS, false);
  const upperCap = capRings(BAND_LIMIT, Math.PI / 2);
  for (let i = 0; i < upperCap.length - 1; i += 1) addSphereBand(caps, upperCap[i], upperCap[i + 1]);
  addSphereCap(caps, upperCap[upperCap.length - 1], BALL_RADIUS, true);
  // White band: three rings at -band, 0, +band.
  const bandRings = [
    ring(LONGITUDE_SEGMENTS, Math.cos(-BAND_LIMIT) * BALL_RADIUS, Math.sin(-BAND_LIMIT) * BALL_RADIUS),
    ring(LONGITUDE_SEGMENTS, BALL_RADIUS, 0),
    ring(LONGITUDE_SEGMENTS, Math.cos(BAND_LIMIT) * BALL_RADIUS, Math.sin(BAND_LIMIT) * BALL_RADIUS)
  ];
  for (let i = 0; i < bandRings.length - 1; i += 1) addSphereBand(band, bandRings[i], bandRings[i + 1]);
  return [
    { name: "caps", part: caps, color: [...color, 1], ...BALL_SHININESS },
    { name: "band", part: band, color: BALL_WHITE, ...BALL_SHININESS }
  ];
}

const DIGIT_SEGMENTS = {
  0: ["a", "b", "c", "d", "e", "f"],
  1: ["b", "c"],
  2: ["a", "b", "g", "e", "d"],
  3: ["a", "b", "c", "d", "g"],
  4: ["f", "g", "b", "c"],
  5: ["a", "f", "g", "c", "d"],
  6: ["a", "f", "g", "e", "c", "d"],
  7: ["a", "b", "c"],
  8: ["a", "b", "c", "d", "e", "f", "g"],
  9: ["a", "b", "c", "d", "f", "g"]
};

function addDigit(mark, digit, cx, y, scale = 1) {
  const halfW = 0.0032 * BALL_GEOMETRY_SCALE * scale;
  const halfH = 0.0052 * BALL_GEOMETRY_SCALE * scale;
  const thickness = 0.00105 * BALL_GEOMETRY_SCALE * scale;
  const horizontal = (z) => addTopQuad(mark, cx - halfW, z - thickness / 2, cx + halfW, z + thickness / 2, y);
  const vertical = (x, z) => addTopQuad(mark, x - thickness / 2, z - 0.00235 * BALL_GEOMETRY_SCALE * scale, x + thickness / 2, z + 0.00235 * BALL_GEOMETRY_SCALE * scale, y);
  for (const segment of DIGIT_SEGMENTS[digit]) {
    if (segment === "a") horizontal(-halfH);
    else if (segment === "g") horizontal(0);
    else if (segment === "d") horizontal(halfH);
    else if (segment === "f") vertical(cx - halfW, -halfH / 2);
    else if (segment === "b") vertical(cx + halfW, -halfH / 2);
    else if (segment === "e") vertical(cx - halfW, halfH / 2);
    else if (segment === "c") vertical(cx + halfW, halfH / 2);
  }
}

/** Add a high-contrast renderer-owned top patch and number, never DOM text. */
function addBallIdentity(parts, number) {
  if (number === 0) return parts;
  const patch = part();
  const mark = part();
  // Keep the number medallion subordinate to the painted ball body. The first
  // pass used a nearly half-radius white disc, which made the rack read as a
  // cluster of white beads from the review camera instead of individual
  // lacquered solids/stripes. A smaller 0.009-radius patch still carries the
  // seven-segment mark while preserving the hue and specular highlight around
  // it.
  addDisc(patch, 0, BALL_RADIUS + 0.00035 * BALL_GEOMETRY_SCALE, 0, 0.0105 * BALL_GEOMETRY_SCALE, 24);
  const digits = String(number).split("").map(Number);
  if (digits.length === 1) addDigit(mark, digits[0], 0, BALL_RADIUS + 0.0007 * BALL_GEOMETRY_SCALE, 1);
  else {
    addDigit(mark, digits[0], -0.0045 * BALL_GEOMETRY_SCALE, BALL_RADIUS + 0.0007 * BALL_GEOMETRY_SCALE, 0.72);
    addDigit(mark, digits[1], 0.0045 * BALL_GEOMETRY_SCALE, BALL_RADIUS + 0.0007 * BALL_GEOMETRY_SCALE, 0.72);
  }
  return [
    ...parts,
    { name: "identity-patch", part: patch, color: BALL_WHITE, ...BALL_SHININESS },
    { name: `number-${number}`, part: mark, color: BALL_BLACK, roughness: 0.45, metallic: 0 }
  ];
}

// ---- GLB writer -------------------------------------------------------------
function writeGlb(path, parts, orientation = { forwardAxis: "+X", upAxis: "+Y" }) {
  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const nodes = [];
  const materialExtensions = new Set();
  const materials = parts.map((entry) => {
    const extensions = {};
    if (entry.clearcoat !== undefined) {
      extensions.KHR_materials_clearcoat = {
        clearcoatFactor: entry.clearcoat,
        clearcoatRoughnessFactor: entry.clearcoatRoughness ?? 0.1
      };
      materialExtensions.add("KHR_materials_clearcoat");
    }
    if (entry.specular !== undefined) {
      extensions.KHR_materials_specular = { specularFactor: entry.specular };
      materialExtensions.add("KHR_materials_specular");
    }
    return {
      name: entry.name + "-material",
      pbrMetallicRoughness: {
        baseColorFactor: entry.color,
        metallicFactor: entry.metallic ?? 0.05,
        roughnessFactor: entry.roughness
      },
      ...(Object.keys(extensions).length > 0 ? { extensions } : {})
    };
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
      generator: "aura3d showcase-bank-shot build-models (original CC0)",
      extras: { aura3d: { orientation } }
    },
    scene: 0,
    scenes: [{ name: "root", nodes: nodes.map((_, index) => index) }],
    nodes,
    meshes,
    materials,
    ...(materialExtensions.size > 0 ? { extensionsUsed: [...materialExtensions].sort() } : {}),
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
const tableBytes = writeGlb(resolve(OUT_DIR, "bankShotTable.glb"), tableParts);
console.log("wrote", resolve(OUT_DIR, "bankShotTable.glb"), "(" + tableBytes + " bytes)");

const cueParts = buildCue();
const cueBytes = writeGlb(resolve(OUT_DIR, "bankShotCue.glb"), cueParts);
console.log("wrote", resolve(OUT_DIR, "bankShotCue.glb"), "(" + cueBytes + " bytes)");

for (let number = 0; number <= 15; number += 1) {
  const id = "bankShotBall" + String(number).padStart(2, "0");
  let parts;
  if (number === 0) parts = buildSolidBall(BALL_WHITE.slice(0, 3));
  else if (number === 8) parts = buildSolidBall(BALL_BLACK.slice(0, 3));
  else if (number <= 7) parts = buildSolidBall(BALL_HUES[number]);
  else parts = buildStripeBall(BALL_HUES[number - 8]);
  for (const entry of parts) smoothSphereNormals(entry.part);
  parts = addBallIdentity(parts, number);
  const bytes = writeGlb(resolve(OUT_DIR, id + ".glb"), parts, { forwardAxis: "+Z", upAxis: "+Y" });
  console.log("wrote", resolve(OUT_DIR, id + ".glb"), "(" + bytes + " bytes)");
}

// Verify every emitted file starts with the glTF magic before registration.
import { readFileSync } from "node:fs";
for (const file of ["bankShotTable.glb", "bankShotCue.glb",
  ...Array.from({ length: 16 }, (_, i) => "bankShotBall" + String(i).padStart(2, "0") + ".glb")]) {
  const magic = readFileSync(resolve(OUT_DIR, file)).subarray(0, 4).toString("ascii");
  if (magic !== "glTF") throw new Error(file + " is missing the glTF magic bytes.");
}
console.log("verified glTF magic bytes for all 18 models in", OUT_DIR);
