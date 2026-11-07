/**
 * Exact-dimension procedural meshes for Splat Turf. Plain arrays; `world.ts` turns them into
 * `geometry.dynamic` specs and kit batches. Dimensions are pinned by `tests/unit/splat-turf/meshes.test.ts`.
 * The runner kit ships batches but no primitive builders, so the primitives live here (lane-local).
 */
import type { MeshData } from "../../../examples/shared/runner-kit/index";

export type { MeshData } from "../../../examples/shared/runner-kit/index";

const empty = (): MeshData => ({ positions: [], normals: [], uvs: [], indices: [] });

/** UV sphere of `radius`, poles on +/-Y, centred at (cx, cy, cz). */
export function sphereMesh(radius: number, widthSegments: number, heightSegments: number, cx = 0, cy = 0, cz = 0): MeshData {
  const m = empty();
  for (let iy = 0; iy <= heightSegments; iy++) {
    const v = iy / heightSegments;
    for (let ix = 0; ix <= widthSegments; ix++) {
      const u = ix / widthSegments;
      const px = -Math.cos(u * Math.PI * 2) * Math.sin(v * Math.PI);
      const py = Math.cos(v * Math.PI);
      const pz = Math.sin(u * Math.PI * 2) * Math.sin(v * Math.PI);
      m.positions.push(cx + radius * px, cy + radius * py, cz + radius * pz);
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

/** Axis-aligned box centred at the origin, 24 verts (4 per face), 36 indices. */
export function boxMesh(w: number, h: number, d: number): MeshData {
  const m = empty();
  const x = w / 2, y = h / 2, z = d / 2;
  const faces: { n: [number, number, number]; p: [number, number, number][] }[] = [
    { n: [0, 1, 0], p: [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]] },
    { n: [0, -1, 0], p: [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]] },
    { n: [0, 0, 1], p: [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]] },
    { n: [0, 0, -1], p: [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]] },
    { n: [1, 0, 0], p: [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]] },
    { n: [-1, 0, 0], p: [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]] }
  ];
  for (const f of faces) {
    const base = m.positions.length / 3;
    for (const p of f.p) { m.positions.push(...p); m.normals.push(...f.n); }
    m.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return m;
}

/** Closed cylinder along Y, `radial` segments, centred at the origin. */
export function cylinderMesh(radius: number, height: number, radial: number): MeshData {
  const m = empty();
  for (let k = 0; k <= radial; k++) {
    const t = (k / radial) * Math.PI * 2, s = Math.sin(t), c = Math.cos(t);
    m.positions.push(radius * s, height / 2, radius * c);
    m.normals.push(s, 0, c);
    m.uvs.push(k / radial, 1);
    m.positions.push(radius * s, -height / 2, radius * c);
    m.normals.push(s, 0, c);
    m.uvs.push(k / radial, 0);
  }
  for (let k = 0; k < radial; k++) {
    const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
    m.indices.push(a, b, c, b, d, c);
  }
  for (const [y, ny] of [[height / 2, 1], [-height / 2, -1]] as const) {
    const centre = m.positions.length / 3;
    m.positions.push(0, y, 0);
    m.normals.push(0, ny, 0);
    m.uvs.push(0.5, 0.5);
    for (let k = 0; k <= radial; k++) {
      const t = (k / radial) * Math.PI * 2;
      m.positions.push(radius * Math.sin(t), y, radius * Math.cos(t));
      m.normals.push(0, ny, 0);
      m.uvs.push(0.5 + 0.5 * Math.sin(t), 0.5 + 0.5 * Math.cos(t));
    }
    for (let k = 0; k < radial; k++) {
      if (ny > 0) m.indices.push(centre + k + 1, centre + k + 2, centre);
      else m.indices.push(centre + k + 2, centre + k + 1, centre);
    }
  }
  return m;
}

/** Flat quad on the XZ plane at y = 0, normal +Y, uv spanning the quad (one paint cell / shadow). */
export function quadMesh(w: number, d: number): MeshData {
  const x = w / 2, z = d / 2;
  return {
    positions: [-x, 0, z, x, 0, z, x, 0, -z, -x, 0, -z],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3]
  };
}

export function translateMesh(m: MeshData, tx: number, ty: number, tz: number): MeshData {
  const out: MeshData = { positions: m.positions.slice(), normals: m.normals.slice(), uvs: m.uvs.slice(), indices: m.indices.slice() };
  for (let i = 0; i < out.positions.length; i += 3) {
    out.positions[i] = (out.positions[i] as number) + tx;
    out.positions[i + 1] = (out.positions[i + 1] as number) + ty;
    out.positions[i + 2] = (out.positions[i + 2] as number) + tz;
  }
  return out;
}

export function merge(parts: readonly MeshData[]): MeshData {
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

/** Paint can: body r 0.28 h 0.5 plus a lid rim r 0.3 h 0.06 on top; base sits at y = 0. */
export function canMesh(): MeshData {
  return merge([
    translateMesh(cylinderMesh(0.28, 0.5, 16), 0, 0.25, 0),
    translateMesh(cylinderMesh(0.3, 0.06, 16), 0, 0.53, 0)
  ]);
}

/** Eraser bot: felt pad 1.0 x 0.12 x 1.0, body 0.8 x 0.45 x 0.8, dome r 0.28; base at y = 0. */
export function botMesh(): MeshData {
  return merge([
    translateMesh(boxMesh(1.0, 0.12, 1.0), 0, 0.06, 0),
    translateMesh(boxMesh(0.8, 0.45, 0.8), 0, 0.345, 0),
    sphereMesh(0.28, 12, 8, 0, 0.57, 0)
  ]);
}

/** Finish gate: two posts (r 0.12, h 3) at x +/-3.1 and a 6.4 x 0.4 x 0.24 bar at y 2.9. */
export function finishMesh(): MeshData {
  return merge([
    translateMesh(cylinderMesh(0.12, 3, 10), -3.1, 1.5, 0),
    translateMesh(cylinderMesh(0.12, 3, 10), 3.1, 1.5, 0),
    translateMesh(boxMesh(6.4, 0.4, 0.24), 0, 2.9, 0)
  ]);
}

/** The player ball radius (§3.4 world). */
export const BALL_RADIUS = 0.45;
export const ballMesh = (): MeshData => sphereMesh(BALL_RADIUS, 24, 16);
/** One paint cell overlay quad, inset so the white road shows a grid seam. */
export const cellMesh = (): MeshData => quadMesh(0.96, 0.96);
/** Solvent strip: one lane wide, 10 m long, a thin wash above the road. */
export const stripMesh = (): MeshData => boxMesh(0.98, 0.04, 10);
/** Road segment: 6.4 m wide (6 lanes + shoulders), 1 m row, 0.3 thick. */
export const roadMesh = (): MeshData => boxMesh(6.4, 0.3, 1.02);
/** Plum road edge rail segment. */
export const edgeMesh = (): MeshData => boxMesh(0.3, 0.36, 1.02);