/**
 * threejs-parity (§5.2, lane L2-01) — `RoundedBoxGeometry` verbatim port
 * (three addons at `examples/jsm/geometries/RoundedBoxGeometry.js`):
 * `totalSegments = segments*2 + 1`, radius clamped to half the shortest side,
 * unit `BoxGeometry(totalSegments³)` expanded to non-indexed in index order,
 * per-vertex corner normal = normalize(position − sign·halfSegment), position
 * = box·sign + normal·radius, UVs by per-face `getUv` arc/plane blend.
 */

import type { ParityMesh } from "./Support";

export interface RoundedBoxParityParams {
  readonly width?: number;
  readonly height?: number;
  readonly depth?: number;
  readonly segments?: number;
  readonly radius?: number;
}

type Axis = "x" | "y" | "z";

/** three's `BoxGeometry(width,height,depth,ws,hs,ds)` — exact vertex/index/uv order. */
export function boxParityMesh(width = 1, height = 1, depth = 1, widthSegments = 1, heightSegments = 1, depthSegments = 1): ParityMesh {
  const ws = Math.floor(widthSegments);
  const hs = Math.floor(heightSegments);
  const ds = Math.floor(depthSegments);

  const indices: number[] = [];
  const vertices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const groups: { start: number; count: number; materialIndex?: number }[] = [];

  let numberOfVertices = 0;
  let groupStart = 0;

  const buildPlane = (
    u: Axis,
    v: Axis,
    w: Axis,
    udir: number,
    vdir: number,
    w2: number,
    h2: number,
    d2: number,
    gridX: number,
    gridY: number,
    materialIndex: number
  ): void => {
    const segmentWidth = w2 / gridX;
    const segmentHeight = h2 / gridY;
    const widthHalf = w2 / 2;
    const heightHalf = h2 / 2;
    const depthHalf = d2 / 2;
    const gridX1 = gridX + 1;
    const gridY1 = gridY + 1;
    let groupCount = 0;

    for (let iy = 0; iy < gridY1; iy += 1) {
      const y = iy * segmentHeight - heightHalf;
      for (let ix = 0; ix < gridX1; ix += 1) {
        const x = ix * segmentWidth - widthHalf;
        const vec: Record<Axis, number> = { x: 0, y: 0, z: 0 };
        vec[u] = x * udir;
        vec[v] = y * vdir;
        vec[w] = depthHalf;
        vertices.push(vec.x, vec.y, vec.z);
        vec[u] = 0;
        vec[v] = 0;
        vec[w] = d2 > 0 ? 1 : -1;
        normals.push(vec.x, vec.y, vec.z);
        uvs.push(ix / gridX, 1 - iy / gridY);
      }
    }

    for (let iy = 0; iy < gridY; iy += 1) {
      for (let ix = 0; ix < gridX; ix += 1) {
        const a = numberOfVertices + ix + gridX1 * iy;
        const b = numberOfVertices + ix + gridX1 * (iy + 1);
        const c = numberOfVertices + (ix + 1) + gridX1 * (iy + 1);
        const d = numberOfVertices + (ix + 1) + gridX1 * iy;
        indices.push(a, b, d);
        indices.push(b, c, d);
        groupCount += 6;
      }
    }

    groups.push({ start: groupStart, count: groupCount, materialIndex });
    groupStart += groupCount;
    numberOfVertices += gridX1 * gridY1;
  };

  buildPlane("z", "y", "x", -1, -1, depth, height, width, ds, hs, 0); // px
  buildPlane("z", "y", "x", 1, -1, depth, height, -width, ds, hs, 1); // nx
  buildPlane("x", "z", "y", 1, 1, width, depth, height, ws, ds, 2); // py
  buildPlane("x", "z", "y", 1, -1, width, depth, -height, ws, ds, 3); // ny
  buildPlane("x", "y", "z", 1, -1, width, height, depth, ws, hs, 4); // pz
  buildPlane("x", "y", "z", -1, -1, width, height, -depth, ws, hs, 5); // nz

  return { positions: vertices, normals, uvs, indices, groups };
}

/** three's `BufferGeometry.toNonIndexed` for position/normal/uv triplets. */
export function meshToNonIndexed(mesh: ParityMesh): ParityMesh {
  if (!mesh.indices) return mesh;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const hasNormals = mesh.normals !== undefined;
  const hasUvs = mesh.uvs !== undefined;
  for (const index of mesh.indices) {
    positions.push(mesh.positions[index * 3]!, mesh.positions[index * 3 + 1]!, mesh.positions[index * 3 + 2]!);
    if (hasNormals) normals.push(mesh.normals![index * 3]!, mesh.normals![index * 3 + 1]!, mesh.normals![index * 3 + 2]!);
    if (hasUvs) uvs.push(mesh.uvs![index * 2]!, mesh.uvs![index * 2 + 1]!);
  }
  return { positions, normals: hasNormals ? normals : undefined, uvs: hasUvs ? uvs : undefined };
}

const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

function getUv(faceDirVector: readonly [number, number, number], normal: readonly [number, number, number], uvAxis: Axis, projectionAxis: Axis, radius: number, sideLength: number): number {
  const totArcLength = (2 * Math.PI * radius) / 4;
  const centerLength = Math.max(sideLength - 2 * radius, 0);
  const halfArc = Math.PI / 4;

  // _tempNormal = normal with the projection-axis component zeroed, normalized.
  const tn: [number, number, number] = [normal[0], normal[1], normal[2]];
  tn[AXIS_INDEX[projectionAxis]] = 0;
  const tl = Math.hypot(tn[0], tn[1], tn[2]);
  const nx = tl === 0 ? 0 : tn[0] / tl;
  const ny = tl === 0 ? 0 : tn[1] / tl;
  const nz = tl === 0 ? 0 : tn[2] / tl;

  const arcUvRatio = (0.5 * totArcLength) / (totArcLength + centerLength);

  // angleTo(faceDirVector) = acos(clamp(dot), −1, 1) — both vectors unit.
  const dot = nx * faceDirVector[0] + ny * faceDirVector[1] + nz * faceDirVector[2];
  const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
  const arcAngleRatio = 1.0 - angle / halfArc;

  if (Math.sign(tl === 0 ? 0 : tn[AXIS_INDEX[uvAxis]] / tl) === 1) {
    return arcAngleRatio * arcUvRatio;
  }
  const lenUv = centerLength / (totArcLength + centerLength);
  return lenUv + arcUvRatio + arcUvRatio * (1.0 - arcAngleRatio);
}

export function roundedBoxParityMesh(params: RoundedBoxParityParams = {}): ParityMesh {
  const width = params.width ?? 1;
  const height = params.height ?? 1;
  const depth = params.depth ?? 1;
  const segments = params.segments ?? 2;
  let radius = params.radius ?? 0.1;

  const totalSegments = segments * 2 + 1;
  radius = Math.min(width / 2, height / 2, depth / 2, radius);

  const base = boxParityMesh(1, 1, 1, totalSegments, totalSegments, totalSegments);
  if (totalSegments === 1) {
    return base;
  }

  const nonIndexed = meshToNonIndexed(base);
  const positions = nonIndexed.positions;
  const normals = nonIndexed.normals!;
  const uvs = nonIndexed.uvs!;

  const box: readonly [number, number, number] = [width / 2 - radius, height / 2 - radius, depth / 2 - radius];
  const faceTris = positions.length / 6;
  const halfSegmentSize = 0.5 / totalSegments;

  const faceDirs: Record<number, readonly [number, number, number]> = {
    0: [1, 0, 0],
    1: [-1, 0, 0],
    2: [0, 1, 0],
    3: [0, -1, 0],
    4: [0, 0, 1],
    5: [0, 0, -1]
  };

  for (let i = 0, j = 0; i < positions.length; i += 3, j += 2) {
    // three reads positions back out of the Float32BufferAttribute — the
    // float32 rounding matters: sign(Math.fround(0.09999999999999998) − 0.1)
    // flips the getUv branch vs the float64 value. Replicate exactly.
    const px = Math.fround(positions[i]!);
    const py = Math.fround(positions[i + 1]!);
    const pz = Math.fround(positions[i + 2]!);
    let nx = px - Math.sign(px) * halfSegmentSize;
    let ny = py - Math.sign(py) * halfSegmentSize;
    let nz = pz - Math.sign(pz) * halfSegmentSize;
    const nl = Math.hypot(nx, ny, nz);
    nx /= nl;
    ny /= nl;
    nz /= nl;

    positions[i] = Math.fround(box[0] * Math.sign(px) + nx * radius);
    positions[i + 1] = Math.fround(box[1] * Math.sign(py) + ny * radius);
    positions[i + 2] = Math.fround(box[2] * Math.sign(pz) + nz * radius);

    normals[i] = Math.fround(nx);
    normals[i + 1] = Math.fround(ny);
    normals[i + 2] = Math.fround(nz);

    const normal: readonly [number, number, number] = [nx, ny, nz];
    const side = Math.floor(i / faceTris);
    const faceDirVector = faceDirs[side]!;
    switch (side) {
      case 0: // right — UVs along Z then Y
        uvs[j] = Math.fround(getUv(faceDirVector, normal, "z", "y", radius, depth));
        uvs[j + 1] = Math.fround(1.0 - getUv(faceDirVector, normal, "y", "z", radius, height));
        break;
      case 1: // left
        uvs[j] = Math.fround(1.0 - getUv(faceDirVector, normal, "z", "y", radius, depth));
        uvs[j + 1] = Math.fround(1.0 - getUv(faceDirVector, normal, "y", "z", radius, height));
        break;
      case 2: // top
        uvs[j] = Math.fround(1.0 - getUv(faceDirVector, normal, "x", "z", radius, width));
        uvs[j + 1] = Math.fround(getUv(faceDirVector, normal, "z", "x", radius, depth));
        break;
      case 3: // bottom
        uvs[j] = Math.fround(1.0 - getUv(faceDirVector, normal, "x", "z", radius, width));
        uvs[j + 1] = Math.fround(1.0 - getUv(faceDirVector, normal, "z", "x", radius, depth));
        break;
      case 4: // front
        uvs[j] = Math.fround(1.0 - getUv(faceDirVector, normal, "x", "y", radius, width));
        uvs[j + 1] = Math.fround(1.0 - getUv(faceDirVector, normal, "y", "x", radius, height));
        break;
      case 5: // back
        uvs[j] = Math.fround(getUv(faceDirVector, normal, "x", "y", radius, width));
        uvs[j + 1] = Math.fround(1.0 - getUv(faceDirVector, normal, "y", "x", radius, height));
        break;
      default:
        break;
    }
  }

  return { positions, normals, uvs };
}
