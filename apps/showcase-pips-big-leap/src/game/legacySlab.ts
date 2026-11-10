// Pip's Big Leap — the 4.7.18 slab shading for the worlds that were judged under it.
//
// Through 4.7.18 the engine's WebGL2 program generator moved normals to world space with the
// instance matrix itself (`mat3(model) * mat3(instance) * normal`), not its inverse transpose.
// The diorama slabs are unit rounded boxes stretched per instance (a 9 x 0.12 x 8 felt top), so
// every rounded-edge normal was pushed toward the horizontal: the outer bands of each top shaded
// like steep walls, which drew the shaded lawn edges in Whispering Forest and the dark mirrored
// rim around the Starfall Garden crystal slabs. 5.0 uses the inverse transpose (correct), so those
// bands now light like the flat top they are, and the two worlds read flatter and brighter.
//
// The engine stays correct. For the worlds that keep the 4.7.18 look, the slabs of one kind are
// lowered into one world-space custom mesh instead of an instanced draw: the same rounded box
// (the 4.7.18 unit rounded-box generator below, UVs included), placed by
// each instance transform, with the normal written exactly as 4.7.18 computed it. Still one draw
// per kind.

import type { AuraCustomGeometrySpec } from "@aura3d/engine";

type Axis = "x" | "y" | "z";
type Vec3 = readonly [number, number, number];

interface Mesh {
  positions: number[];
  normals: number[];
  uvs: number[];
}

/** Subdivided unit box mesh, expanded to non-indexed triangles in index order. */
function boxMesh(segments: number): Mesh {
  const indices: number[] = [];
  const vertices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  let numberOfVertices = 0;
  const plane = (u: Axis, v: Axis, w: Axis, udir: number, vdir: number, d2: number): void => {
    const g1 = segments + 1;
    for (let iy = 0; iy < g1; iy += 1) {
      const y = iy / segments - 0.5;
      for (let ix = 0; ix < g1; ix += 1) {
        const x = ix / segments - 0.5;
        const p: Record<Axis, number> = { x: 0, y: 0, z: 0 };
        p[u] = x * udir;
        p[v] = y * vdir;
        p[w] = d2 / 2;
        vertices.push(p.x, p.y, p.z);
        const n: Record<Axis, number> = { x: 0, y: 0, z: 0 };
        n[w] = d2 > 0 ? 1 : -1;
        normals.push(n.x, n.y, n.z);
        uvs.push(ix / segments, 1 - iy / segments);
      }
    }
    for (let iy = 0; iy < segments; iy += 1) {
      for (let ix = 0; ix < segments; ix += 1) {
        const a = numberOfVertices + ix + g1 * iy;
        const b = numberOfVertices + ix + g1 * (iy + 1);
        const c = numberOfVertices + ix + 1 + g1 * (iy + 1);
        const d = numberOfVertices + ix + 1 + g1 * iy;
        indices.push(a, b, d, b, c, d);
      }
    }
    numberOfVertices += g1 * g1;
  };
  plane("z", "y", "x", -1, -1, 1);
  plane("z", "y", "x", 1, -1, -1);
  plane("x", "z", "y", 1, 1, 1);
  plane("x", "z", "y", 1, -1, -1);
  plane("x", "y", "z", 1, -1, 1);
  plane("x", "y", "z", -1, -1, -1);
  const out: Mesh = { positions: [], normals: [], uvs: [] };
  for (const i of indices) {
    out.positions.push(vertices[i * 3]!, vertices[i * 3 + 1]!, vertices[i * 3 + 2]!);
    out.normals.push(normals[i * 3]!, normals[i * 3 + 1]!, normals[i * 3 + 2]!);
    out.uvs.push(uvs[i * 2]!, uvs[i * 2 + 1]!);
  }
  return out;
}

const AXIS: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

function arcUv(faceDir: Vec3, normal: Vec3, uvAxis: Axis, projectionAxis: Axis, radius: number, side: number): number {
  const totArc = (2 * Math.PI * radius) / 4;
  const center = Math.max(side - 2 * radius, 0);
  const t: [number, number, number] = [normal[0], normal[1], normal[2]];
  t[AXIS[projectionAxis]] = 0;
  const tl = Math.hypot(t[0], t[1], t[2]);
  const n = tl === 0 ? [0, 0, 0] : [t[0] / tl, t[1] / tl, t[2] / tl];
  const arcRatio = (0.5 * totArc) / (totArc + center);
  const angle = Math.acos(Math.min(1, Math.max(-1, n[0]! * faceDir[0] + n[1]! * faceDir[1] + n[2]! * faceDir[2])));
  const arcAngle = 1 - angle / (Math.PI / 4);
  if (Math.sign(n[AXIS[uvAxis]]!) === 1) return arcAngle * arcRatio;
  return center / (totArc + center) + arcRatio + arcRatio * (1 - arcAngle);
}

const FACE_DIRS: readonly Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/** The 4.7.18 unit rounded box (`segments` = 2), non-indexed. */
export function legacyRoundedBoxMesh(radiusIn: number, segments = 2): Mesh {
  const total = segments * 2 + 1;
  const radius = Math.min(0.5, radiusIn);
  const mesh = boxMesh(total);
  const { positions, normals, uvs } = mesh;
  const inner = 0.5 - radius;
  const faceTris = positions.length / 6;
  const halfSegment = 0.5 / total;
  for (let i = 0, j = 0; i < positions.length; i += 3, j += 2) {
    const px = Math.fround(positions[i]!), py = Math.fround(positions[i + 1]!), pz = Math.fround(positions[i + 2]!);
    let nx = px - Math.sign(px) * halfSegment, ny = py - Math.sign(py) * halfSegment, nz = pz - Math.sign(pz) * halfSegment;
    const nl = Math.hypot(nx, ny, nz);
    nx /= nl; ny /= nl; nz /= nl;
    positions[i] = inner * Math.sign(px) + nx * radius;
    positions[i + 1] = inner * Math.sign(py) + ny * radius;
    positions[i + 2] = inner * Math.sign(pz) + nz * radius;
    normals[i] = nx; normals[i + 1] = ny; normals[i + 2] = nz;
    const n: Vec3 = [nx, ny, nz];
    const side = Math.floor(i / faceTris);
    const dir = FACE_DIRS[side]!;
    switch (side) {
      case 0: uvs[j] = arcUv(dir, n, "z", "y", radius, 1); uvs[j + 1] = 1 - arcUv(dir, n, "y", "z", radius, 1); break;
      case 1: uvs[j] = 1 - arcUv(dir, n, "z", "y", radius, 1); uvs[j + 1] = 1 - arcUv(dir, n, "y", "z", radius, 1); break;
      case 2: uvs[j] = 1 - arcUv(dir, n, "x", "z", radius, 1); uvs[j + 1] = arcUv(dir, n, "z", "x", radius, 1); break;
      case 3: uvs[j] = 1 - arcUv(dir, n, "x", "z", radius, 1); uvs[j + 1] = 1 - arcUv(dir, n, "z", "x", radius, 1); break;
      case 4: uvs[j] = 1 - arcUv(dir, n, "x", "y", radius, 1); uvs[j + 1] = 1 - arcUv(dir, n, "y", "x", radius, 1); break;
      default: uvs[j] = arcUv(dir, n, "x", "y", radius, 1); uvs[j + 1] = 1 - arcUv(dir, n, "y", "x", radius, 1); break;
    }
  }
  return mesh;
}

export interface SlabTransform {
  readonly position: Vec3;
  readonly scale: Vec3;
}

/**
 * The slabs of one kind as one world-space mesh: each instance's unit rounded box scaled and
 * placed by its transform, with the 4.7.18 world normal `normalize(scale * normal)`.
 */
export function legacySlabGeometry(transforms: readonly SlabTransform[], radius: number): Omit<AuraCustomGeometrySpec, "kind"> {
  const unit = legacyRoundedBoxMesh(radius);
  const count = unit.positions.length / 3;
  const positions = new Float32Array(count * 3 * transforms.length);
  const normals = new Float32Array(count * 3 * transforms.length);
  const uvs = new Float32Array(count * 2 * transforms.length);
  transforms.forEach((t, k) => {
    const [sx, sy, sz] = t.scale;
    const [tx, ty, tz] = t.position;
    for (let v = 0; v < count; v += 1) {
      const o = (k * count + v) * 3;
      positions[o] = tx + sx * unit.positions[v * 3]!;
      positions[o + 1] = ty + sy * unit.positions[v * 3 + 1]!;
      positions[o + 2] = tz + sz * unit.positions[v * 3 + 2]!;
      const nx = sx * unit.normals[v * 3]!, ny = sy * unit.normals[v * 3 + 1]!, nz = sz * unit.normals[v * 3 + 2]!;
      const l = Math.hypot(nx, ny, nz) || 1;
      normals[o] = nx / l;
      normals[o + 1] = ny / l;
      normals[o + 2] = nz / l;
      uvs[(k * count + v) * 2] = unit.uvs[v * 2]!;
      uvs[(k * count + v) * 2 + 1] = unit.uvs[v * 2 + 1]!;
    }
  });
  const vertices = count * transforms.length;
  const indices = vertices > 65535 ? new Uint32Array(vertices) : new Uint16Array(vertices);
  for (let i = 0; i < vertices; i += 1) indices[i] = i;
  return { positions, normals, uvs, indices };
}
