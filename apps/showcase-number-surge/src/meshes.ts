/**
 * Number Surge procedural meshes: plain-array builders with exact dimensions
 * (pinned by tests/unit/number-surge/meshes.test.ts). `world.ts` turns these into
 * `geometry.dynamic` specs and kit `Batch` instances. No engine imports here.
 */
import type { MeshData } from "../../../examples/shared/runner-kit/index";

const empty = (): MeshData => ({ positions: [], normals: [], uvs: [], indices: [] });

/** Axis-aligned box centred at (cx, cy, cz): 24 vertices, 36 indices. */
export function boxMesh(w: number, h: number, d: number, cx = 0, cy = 0, cz = 0): MeshData {
  const m = empty();
  const x = w / 2, y = h / 2, z = d / 2;
  const faces: { n: [number, number, number]; corners: [number, number, number][] }[] = [
    { n: [0, 0, 1], corners: [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]] },
    { n: [0, 0, -1], corners: [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]] },
    { n: [1, 0, 0], corners: [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]] },
    { n: [-1, 0, 0], corners: [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]] },
    { n: [0, 1, 0], corners: [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]] },
    { n: [0, -1, 0], corners: [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]] }
  ];
  for (const face of faces) {
    const base = m.positions.length / 3;
    for (const [i, c] of face.corners.entries()) {
      m.positions.push(cx + c[0], cy + c[1], cz + c[2]);
      m.normals.push(...face.n);
      m.uvs.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0);
    }
    m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return m;
}

/** Vertical quad in the XY plane facing +z (op labels, number decal): 4 vertices. */
export function quadMesh(w: number, h: number, cx = 0, cy = 0, cz = 0): MeshData {
  const m = empty();
  const x = w / 2, y = h / 2;
  m.positions.push(cx - x, cy - y, cz, cx + x, cy - y, cz, cx + x, cy + y, cz, cx - x, cy + y, cz);
  for (let i = 0; i < 4; i++) m.normals.push(0, 0, 1);
  m.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
  m.indices.push(0, 1, 2, 0, 2, 3);
  return m;
}

/** Horizontal quad in the XZ plane facing +y (road, shadows): 4 vertices. */
export function groundQuad(w: number, d: number, cx = 0, cy = 0, cz = 0): MeshData {
  const m = empty();
  const x = w / 2, z = d / 2;
  m.positions.push(cx - x, cy, cz + z, cx + x, cy, cz + z, cx + x, cy, cz - z, cx - x, cy, cz - z);
  for (let i = 0; i < 4; i++) m.normals.push(0, 1, 0);
  m.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
  m.indices.push(0, 1, 2, 0, 2, 3);
  return m;
}

/** UV sphere with poles on ±Y: (widthSegments + 1) * (heightSegments + 1) vertices. */
export function sphereMesh(radius: number, widthSegments: number, heightSegments: number): MeshData {
  const m = empty();
  for (let iy = 0; iy <= heightSegments; iy++) {
    const v = iy / heightSegments;
    for (let ix = 0; ix <= widthSegments; ix++) {
      const u = ix / widthSegments;
      const px = -Math.cos(u * Math.PI * 2) * Math.sin(v * Math.PI);
      const py = Math.cos(v * Math.PI);
      const pz = Math.sin(u * Math.PI * 2) * Math.sin(v * Math.PI);
      m.positions.push(radius * px, radius * py, radius * pz);
      m.normals.push(px, py, pz);
      m.uvs.push(u, 1 - v);
    }
  }
  const row = widthSegments + 1;
  for (let iy = 0; iy < heightSegments; iy++) {
    for (let ix = 0; ix < widthSegments; ix++) {
      const a = iy * row + ix + 1, b = iy * row + ix, c = (iy + 1) * row + ix, d = (iy + 1) * row + ix + 1;
      if (iy !== 0) m.indices.push(a, b, d);
      if (iy !== heightSegments - 1) m.indices.push(b, c, d);
    }
  }
  return m;
}

function merge(parts: readonly MeshData[]): MeshData {
  const out = empty();
  for (const p of parts) {
    const base = out.positions.length / 3;
    out.positions.push(...p.positions);
    out.normals.push(...p.normals);
    out.uvs.push(...p.uvs);
    for (const i of p.indices) out.indices.push(base + i);
  }
  return out;
}

// ---- pinned game dimensions ----

export const DIMS = {
  BALL_RADIUS: 0.55,
  BALL_WIDTH_SEGMENTS: 24,
  BALL_HEIGHT_SEGMENTS: 16,
  BALL_LABEL: 0.85,
  ROAD_WIDTH: 7.4,
  SEGMENT_LENGTH: 2,
  EDGE_WIDTH: 0.18,
  EDGE_X: 3.6,
  DASH_WIDTH: 0.14,
  DASH_LENGTH: 0.9,
  GATE_PANEL_W: 2.9,
  GATE_PANEL_H: 3.0,
  GATE_PANEL_D: 0.12,
  GATE_POST_W: 0.16,
  GATE_TOP_H: 0.16,
  OP_LABEL_W: 2.4,
  OP_LABEL_H: 1.5,
  WALL_W: 7.2,
  WALL_H: 3.6,
  WALL_D: 0.6,
  WALL_LABEL_W: 3,
  WALL_LABEL_H: 1.6,
  POWERUP_RADIUS: 0.35,
  POWERUP_WIDTH_SEGMENTS: 16,
  POWERUP_HEIGHT_SEGMENTS: 12,
  SHARD_SIZE: 0.22,
  PARTICLE_SIZE: 0.12,
  SHADOW_SIZE: 1.6
} as const;

/** Player ball: radius 0.55, 24×16 segments → 425 vertices. */
export const ballMesh = (): MeshData => sphereMesh(DIMS.BALL_RADIUS, DIMS.BALL_WIDTH_SEGMENTS, DIMS.BALL_HEIGHT_SEGMENTS);

/** Number decal quad drawn in front of the ball (canvas texture, repainted on change). */
export const ballLabelMesh = (): MeshData => quadMesh(DIMS.BALL_LABEL, DIMS.BALL_LABEL);

/** One road deck segment: 7.4 × 2 m ground quad. */
export const roadSegmentMesh = (): MeshData => groundQuad(DIMS.ROAD_WIDTH, DIMS.SEGMENT_LENGTH);

/** Neon edge trim: two 0.18 × 2 m strips at x ±3.6. */
export const roadEdgeMesh = (): MeshData =>
  merge([
    groundQuad(DIMS.EDGE_WIDTH, DIMS.SEGMENT_LENGTH, -DIMS.EDGE_X),
    groundQuad(DIMS.EDGE_WIDTH, DIMS.SEGMENT_LENGTH, DIMS.EDGE_X)
  ]);

/** Centre dash: 0.14 × 0.9 m. */
export const roadDashMesh = (): MeshData => groundQuad(DIMS.DASH_WIDTH, DIMS.DASH_LENGTH);

/** Gate operation panel: 2.9 × 3.0 × 0.12 m box, base at y 0. */
export const gatePanelMesh = (): MeshData => boxMesh(DIMS.GATE_PANEL_W, DIMS.GATE_PANEL_H, DIMS.GATE_PANEL_D, 0, DIMS.GATE_PANEL_H / 2);

/** Gate frame: two posts + top bar (3 boxes → 72 vertices). */
export const gateFrameMesh = (): MeshData => {
  const half = DIMS.GATE_PANEL_W / 2;
  const postH = DIMS.GATE_PANEL_H + DIMS.GATE_TOP_H;
  return merge([
    boxMesh(DIMS.GATE_POST_W, postH, DIMS.GATE_PANEL_D + 0.04, -half, postH / 2),
    boxMesh(DIMS.GATE_POST_W, postH, DIMS.GATE_PANEL_D + 0.04, half, postH / 2),
    boxMesh(DIMS.GATE_PANEL_W + DIMS.GATE_POST_W, DIMS.GATE_TOP_H, DIMS.GATE_PANEL_D + 0.04, 0, DIMS.GATE_PANEL_H + DIMS.GATE_TOP_H / 2)
  ]);
};

/** Op label quad (canvas text) centred on the panel at y 1.7. */
export const opLabelMesh = (): MeshData => quadMesh(DIMS.OP_LABEL_W, DIMS.OP_LABEL_H, 0, 1.7, DIMS.GATE_PANEL_D / 2 + 0.02);

/** Boss wall: 7.2 × 3.6 × 0.6 m box, base at y 0. */
export const wallMesh = (): MeshData => boxMesh(DIMS.WALL_W, DIMS.WALL_H, DIMS.WALL_D, 0, DIMS.WALL_H / 2);

/** Wall HP label quad at y 2.1 in front of the wall. */
export const wallLabelMesh = (): MeshData => quadMesh(DIMS.WALL_LABEL_W, DIMS.WALL_LABEL_H, 0, 2.1, DIMS.WALL_D / 2 + 0.02);

/** Power-up orb: radius 0.35, 16×12 segments → 221 vertices. */
export const powerupMesh = (): MeshData => sphereMesh(DIMS.POWERUP_RADIUS, DIMS.POWERUP_WIDTH_SEGMENTS, DIMS.POWERUP_HEIGHT_SEGMENTS);

/** Wall shard cube: 0.22 m. */
export const shardMesh = (): MeshData => boxMesh(DIMS.SHARD_SIZE, DIMS.SHARD_SIZE, DIMS.SHARD_SIZE);

/** Score-geyser particle cube: 0.12 m. */
export const particleMesh = (): MeshData => boxMesh(DIMS.PARTICLE_SIZE, DIMS.PARTICLE_SIZE, DIMS.PARTICLE_SIZE);

/** Contact shadow quad: 1.6 m, uses the kit shadow fragment. */
export const shadowMesh = (): MeshData => groundQuad(DIMS.SHADOW_SIZE, DIMS.SHADOW_SIZE);

/**
 * Curved spherical front cap facing +z so the live player number hugs the clearcoat ball
 * curvature like an embedded holographic inlay instead of a flat floating sticker quad.
 */
export function sphereCapMesh(radius = DIMS.BALL_RADIUS + 0.018, halfAngleRad = 0.72, segs = 18): MeshData {
  const m = empty();
  for (let iy = 0; iy <= segs; iy++) {
    const v = iy / segs;
    const ay = (v * 2 - 1) * halfAngleRad;
    const cy = Math.cos(ay);
    const sy = Math.sin(ay);
    for (let ix = 0; ix <= segs; ix++) {
      const u = ix / segs;
      const ax = (u * 2 - 1) * halfAngleRad;
      const nx = Math.sin(ax) * cy;
      const ny = sy;
      const nz = Math.cos(ax) * cy;
      m.positions.push(radius * nx, radius * ny, radius * nz);
      m.normals.push(nx, ny, nz);
      m.uvs.push(u, v);
    }
  }
  const row = segs + 1;
  for (let iy = 0; iy < segs; iy++) {
    for (let ix = 0; ix < segs; ix++) {
      const a = iy * row + ix;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      m.indices.push(a, b, d, a, d, c);
    }
  }
  return m;
}

/**
 * Beveled arcade portal stanchions: grounded flared plinths, multi-tier chamfered columns,
 * corner gussets, and a crowned top lintel within the exact gate footprint.
 */
export const chamferedGateFrameMesh = (): MeshData => {
  const half = DIMS.GATE_PANEL_W / 2;
  const postH = DIMS.GATE_PANEL_H + DIMS.GATE_TOP_H;
  const depth = DIMS.GATE_PANEL_D + 0.08;
  return merge([
    // Flared grounded stanchion plinths
    boxMesh(DIMS.GATE_POST_W + 0.14, 0.18, depth + 0.12, -half, 0.09),
    boxMesh(DIMS.GATE_POST_W + 0.14, 0.18, depth + 0.12, half, 0.09),
    // Outer metallic column cores + inner chamfered energy rails
    boxMesh(DIMS.GATE_POST_W + 0.04, postH, depth, -half, postH / 2),
    boxMesh(DIMS.GATE_POST_W + 0.04, postH, depth, half, postH / 2),
    boxMesh(0.07, DIMS.GATE_PANEL_H - 0.16, depth + 0.05, -half + 0.08, DIMS.GATE_PANEL_H / 2),
    boxMesh(0.07, DIMS.GATE_PANEL_H - 0.16, depth + 0.05, half - 0.08, DIMS.GATE_PANEL_H / 2),
    // Crowned top crossbar + stepped arch cap
    boxMesh(DIMS.GATE_PANEL_W + DIMS.GATE_POST_W + 0.12, DIMS.GATE_TOP_H + 0.04, depth + 0.04, 0, DIMS.GATE_PANEL_H + DIMS.GATE_TOP_H / 2),
    boxMesh(DIMS.GATE_PANEL_W * 0.64, 0.1, depth + 0.08, 0, DIMS.GATE_PANEL_H + DIMS.GATE_TOP_H + 0.06)
  ]);
};

/**
 * Segmented 3-course running-bond crystal-masonry boss wall (7.2 × 3.6 × 0.6 m envelope):
 * recessed mortar core + bevelled crystal blocks so fissure veins glow between courses.
 */
export const segmentedWallMesh = (): MeshData => {
  const parts: MeshData[] = [
    // Recessed glowing mortar core slab
    boxMesh(DIMS.WALL_W - 0.14, DIMS.WALL_H - 0.08, DIMS.WALL_D - 0.12, 0, DIMS.WALL_H / 2, 0)
  ];
  const rows = 3;
  const rowH = DIMS.WALL_H / rows;
  const gap = 0.07;
  for (let r = 0; r < rows; r++) {
    const cy = (r + 0.5) * rowH;
    const bh = rowH - gap;
    const cols = r % 2 === 0 ? 4 : 3;
    const spanW = DIMS.WALL_W / cols;
    for (let c = 0; c < cols; c++) {
      const cx = -DIMS.WALL_W / 2 + (c + 0.5) * spanW;
      const bw = spanW - gap;
      parts.push(boxMesh(bw, bh, DIMS.WALL_D, cx, cy, 0));
    }
  }
  return merge(parts);
};
