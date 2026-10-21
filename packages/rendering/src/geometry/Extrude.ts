/**
 * threejs-parity (§5.2, lane L2-02) — `ExtrudeGeometry` verbatim port.
 *
 * Vertex layout (three's `placeholder` layers, emitted in order):
 *   [front bevel rings b=0..bevelSegments-1 at z = −bevelThickness·cos(t·π/2)]
 *   [base ring + `steps` layers at z = depth·s/steps  (or extrudePath TNB)]
 *   [back bevel rings b=bevelSegments-1..0 at z = depth + bevelThickness·cos]
 *
 * Faces expand to a non-indexed mesh: bottom/top lids from
 * `triangulateShape` (on the bevelOffset-contracted rings when bevelled),
 * sidewall quads over all `steps + 2·bevelSegments` layer seams per
 * contour/hole edge — plus three's `WorldUVGenerator` UVs and flat
 * per-face normals (`computeVertexNormals` on the expanded buffer).
 */

import type { Curve, FrenetFrame } from "@aura3d/math";
import type { Vector3 } from "@aura3d/math";
import { computeVertexNormals, isClockWise, resolveCurve3, resolveShape2D, triangulateShape } from "./Support";
import type { ParityMesh } from "./Support";

export interface ExtrudeParityParams {
  readonly shape: unknown;
  readonly curveSegments?: number;
  readonly steps?: number;
  readonly depth?: number;
  readonly bevelEnabled?: boolean;
  readonly bevelThickness?: number;
  readonly bevelSize?: number;
  readonly bevelOffset?: number;
  readonly bevelSegments?: number;
  readonly extrudePath?: unknown;
}

interface Pt {
  x: number;
  y: number;
}

function mergeOverlappingPoints(points: Pt[]): void {
  const THRESHOLD = 1e-10;
  const THRESHOLD_SQ = THRESHOLD * THRESHOLD;
  let prevPos = points[0]!;
  for (let i = 1; i <= points.length; i += 1) {
    const currentIndex = i % points.length;
    const currentPos = points[currentIndex]!;
    const dx = currentPos.x - prevPos.x;
    const dy = currentPos.y - prevPos.y;
    const distSq = dx * dx + dy * dy;
    const scalingFactorSqrt = Math.max(
      Math.abs(currentPos.x),
      Math.abs(currentPos.y),
      Math.abs(prevPos.x),
      Math.abs(prevPos.y)
    );
    const thresholdSqScaled = THRESHOLD_SQ * scalingFactorSqrt * scalingFactorSqrt;
    if (distSq <= thresholdSqScaled) {
      points.splice(currentIndex, 1);
      i -= 1;
      continue;
    }
    prevPos = currentPos;
  }
}

function getBevelVec(inPt: Pt, inPrev: Pt, inNext: Pt): Pt {
  // Computes for inPt the corresponding point inPt' on a new contour shifted
  // by 1 unit to the left (the intersection of the two lines parallel to the
  // adjacent edges), verbatim from three.
  let shrinkBy: number;
  const vPrevX = inPt.x - inPrev.x;
  const vPrevY = inPt.y - inPrev.y;
  const vNextX = inNext.x - inPt.x;
  const vNextY = inNext.y - inPt.y;
  const vPrevLensq = vPrevX * vPrevX + vPrevY * vPrevY;
  const collinear0 = vPrevX * vNextY - vPrevY * vNextX;

  let vTransX: number;
  let vTransY: number;
  if (Math.abs(collinear0) > Number.EPSILON) {
    const vPrevLen = Math.sqrt(vPrevLensq);
    const vNextLen = Math.sqrt(vNextX * vNextX + vNextY * vNextY);
    const ptPrevShiftX = inPrev.x - vPrevY / vPrevLen;
    const ptPrevShiftY = inPrev.y + vPrevX / vPrevLen;
    const ptNextShiftX = inNext.x - vNextY / vNextLen;
    const ptNextShiftY = inNext.y + vNextX / vNextLen;
    const sf = ((ptNextShiftX - ptPrevShiftX) * vNextY
      - (ptNextShiftY - ptPrevShiftY) * vNextX)
      / (vPrevX * vNextY - vPrevY * vNextX);
    vTransX = ptPrevShiftX + vPrevX * sf - inPt.x;
    vTransY = ptPrevShiftY + vPrevY * sf - inPt.y;
    const vTransLensq = vTransX * vTransX + vTransY * vTransY;
    if (vTransLensq <= 2) {
      return { x: vTransX, y: vTransY };
    }
    shrinkBy = Math.sqrt(vTransLensq / 2);
  } else {
    let directionEq = false;
    if (vPrevX > Number.EPSILON) {
      if (vNextX > Number.EPSILON) {
        directionEq = true;
      }
    } else {
      if (vPrevX < -Number.EPSILON) {
        if (vNextX < -Number.EPSILON) {
          directionEq = true;
        }
      } else {
        if (Math.sign(vPrevY) === Math.sign(vNextY)) {
          directionEq = true;
        }
      }
    }
    if (directionEq) {
      vTransX = -vPrevY;
      vTransY = vPrevX;
      shrinkBy = Math.sqrt(vPrevLensq);
    } else {
      vTransX = vPrevX;
      vTransY = vPrevY;
      shrinkBy = Math.sqrt(vPrevLensq / 2);
    }
  }
  return { x: vTransX / shrinkBy, y: vTransY / shrinkBy };
}

function scalePt2(pt: Pt, vec: Pt, size: number): Pt {
  return { x: pt.x + vec.x * size, y: pt.y + vec.y * size };
}

const WorldUVGenerator = {
  generateTopUV(vertices: readonly number[], indexA: number, indexB: number, indexC: number): readonly [Pt, Pt, Pt] {
    const ax = vertices[indexA * 3]!;
    const ay = vertices[indexA * 3 + 1]!;
    const bx = vertices[indexB * 3]!;
    const by = vertices[indexB * 3 + 1]!;
    const cx = vertices[indexC * 3]!;
    const cy = vertices[indexC * 3 + 1]!;
    return [{ x: ax, y: ay }, { x: bx, y: by }, { x: cx, y: cy }];
  },
  generateSideWallUV(vertices: readonly number[], indexA: number, indexB: number, indexC: number, indexD: number): readonly [Pt, Pt, Pt, Pt] {
    const ax = vertices[indexA * 3]!;
    const ay = vertices[indexA * 3 + 1]!;
    const az = vertices[indexA * 3 + 2]!;
    const bx = vertices[indexB * 3]!;
    const by = vertices[indexB * 3 + 1]!;
    const bz = vertices[indexB * 3 + 2]!;
    const cx = vertices[indexC * 3]!;
    const cy = vertices[indexC * 3 + 1]!;
    const cz = vertices[indexC * 3 + 2]!;
    const dx = vertices[indexD * 3]!;
    const dy = vertices[indexD * 3 + 1]!;
    const dz = vertices[indexD * 3 + 2]!;
    if (Math.abs(ay - by) < Math.abs(ax - bx)) {
      return [
        { x: ax, y: 1 - az },
        { x: bx, y: 1 - bz },
        { x: cx, y: 1 - cz },
        { x: dx, y: 1 - dz }
      ];
    }
    return [
      { x: ay, y: 1 - az },
      { x: by, y: 1 - bz },
      { x: cy, y: 1 - cz },
      { x: dy, y: 1 - dz }
    ];
  }
};

export function extrudeParityMesh(params: ExtrudeParityParams): ParityMesh {
  const curveSegments = params.curveSegments ?? 12;
  const steps = params.steps ?? 1;
  const depth = params.depth ?? 1;

  let bevelEnabled = params.bevelEnabled ?? true;
  let bevelThickness = params.bevelThickness ?? 0.2;
  let bevelSize = params.bevelSize ?? bevelThickness - 0.1;
  let bevelOffset = params.bevelOffset ?? 0;
  let bevelSegments = params.bevelSegments ?? 3;

  const extrudePath = params.extrudePath;

  const verticesArray: number[] = [];
  const uvArray: number[] = [];
  const groups: { start: number; count: number; materialIndex?: number }[] = [];

  let extrudePts: readonly Vector3[] | undefined;
  let extrudeByPath = false;
  let splineTube: FrenetFrame | null | undefined;
  let pathCurve: Curve<Vector3> | undefined;

  if (extrudePath !== undefined && extrudePath !== null) {
    pathCurve = resolveCurve3(extrudePath);
    extrudePts = pathCurve.getSpacedPoints(steps);
    extrudeByPath = true;
    bevelEnabled = false; // bevels not supported for path extrusion
    const isClosed = (pathCurve as { isCatmullRomCurve3?: boolean; closed?: boolean }).isCatmullRomCurve3 === true
      ? (pathCurve as { closed?: boolean }).closed === true
      : false;
    splineTube = pathCurve.computeFrenetFrames(steps, isClosed);
  }

  if (!bevelEnabled) {
    bevelSegments = 0;
    bevelThickness = 0;
    bevelSize = 0;
    bevelOffset = 0;
  }

  const resolved = resolveShape2D(params.shape, curveSegments);
  let contour: Pt[] = resolved.shape.map((p) => ({ x: p.x, y: p.y }));
  const holes: Pt[][] = resolved.holes.map((hole) => hole.map((p) => ({ x: p.x, y: p.y })));

  const reverse = !isClockWise(contour);
  if (reverse) {
    contour.reverse();
    for (let h = 0, hl = holes.length; h < hl; h += 1) {
      if (isClockWise(holes[h]!)) {
        holes[h] = holes[h]!.reverse();
      }
    }
  }

  mergeOverlappingPoints(contour);
  holes.forEach(mergeOverlappingPoints);

  const numHoles = holes.length;
  let vertices: Pt[] = contour;
  for (let h = 0; h < numHoles; h += 1) {
    vertices = vertices.concat(holes[h]!);
  }

  const vlen = vertices.length;

  const contourMovements: Pt[] = [];
  for (let i = 0, il = contour.length, j = il - 1, k = i + 1; i < il; i += 1, j += 1, k += 1) {
    if (j === il) j = 0;
    if (k === il) k = 0;
    contourMovements[i] = getBevelVec(contour[i]!, contour[j]!, contour[k]!);
  }

  const holesMovements: Pt[][] = [];
  let verticesMovements: Pt[] = [...contourMovements];
  for (let h = 0, hl = numHoles; h < hl; h += 1) {
    const ahole = holes[h]!;
    const oneHoleMovements: Pt[] = [];
    for (let i = 0, il = ahole.length, j = il - 1, k = i + 1; i < il; i += 1, j += 1, k += 1) {
      if (j === il) j = 0;
      if (k === il) k = 0;
      oneHoleMovements[i] = getBevelVec(ahole[i]!, ahole[j]!, ahole[k]!);
    }
    holesMovements.push(oneHoleMovements);
    verticesMovements = verticesMovements.concat(oneHoleMovements);
  }

  const placeholder: number[] = [];
  const v = (x: number, y: number, z: number): void => {
    placeholder.push(x, y, z);
  };

  let faces: number[][];
  if (bevelSegments === 0) {
    faces = triangulateShape(contour, holes);
  } else {
    const contractedContourVertices: Pt[] = [];
    const expandedHoleVertices: Pt[][] = [];
    for (let b = 0; b < bevelSegments; b += 1) {
      const t = b / bevelSegments;
      const z = bevelThickness * Math.cos((t * Math.PI) / 2);
      const bs = bevelSize * Math.sin((t * Math.PI) / 2) + bevelOffset;
      for (let i = 0, il = contour.length; i < il; i += 1) {
        const vert = scalePt2(contour[i]!, contourMovements[i]!, bs);
        v(vert.x, vert.y, -z);
        if (t === 0) contractedContourVertices.push(vert);
      }
      for (let h = 0, hl = numHoles; h < hl; h += 1) {
        const ahole = holes[h]!;
        const oneHoleMovements = holesMovements[h]!;
        const oneHoleVertices: Pt[] = [];
        for (let i = 0, il = ahole.length; i < il; i += 1) {
          const vert = scalePt2(ahole[i]!, oneHoleMovements[i]!, bs);
          v(vert.x, vert.y, -z);
          if (t === 0) oneHoleVertices.push(vert);
        }
        if (t === 0) expandedHoleVertices.push(oneHoleVertices);
      }
    }
    faces = triangulateShape(contractedContourVertices, expandedHoleVertices);
  }

  const flen = faces.length;
  const bs = bevelSize + bevelOffset;

  // Back facing vertices (layer 0 of the body).
  for (let i = 0; i < vlen; i += 1) {
    const vert = bevelEnabled ? scalePt2(vertices[i]!, verticesMovements[i]!, bs) : vertices[i]!;
    if (!extrudeByPath) {
      v(vert.x, vert.y, 0);
    } else {
      const n = splineTube!.normals[0]!;
      const b = splineTube!.binormals[0]!;
      const p = extrudePts![0]!;
      v(p.x + n.x * vert.x + b.x * vert.y, p.y + n.y * vert.x + b.y * vert.y, p.z + n.z * vert.x + b.z * vert.y);
    }
  }

  // Stepped vertices (including the front-facing ring at s = steps).
  for (let s = 1; s <= steps; s += 1) {
    for (let i = 0; i < vlen; i += 1) {
      const vert = bevelEnabled ? scalePt2(vertices[i]!, verticesMovements[i]!, bs) : vertices[i]!;
      if (!extrudeByPath) {
        v(vert.x, vert.y, (depth / steps) * s);
      } else {
        const n = splineTube!.normals[s]!;
        const b = splineTube!.binormals[s]!;
        const p = extrudePts![s]!;
        v(p.x + n.x * vert.x + b.x * vert.y, p.y + n.y * vert.x + b.y * vert.y, p.z + n.z * vert.x + b.z * vert.y);
      }
    }
  }

  // Back bevel rings.
  for (let b = bevelSegments - 1; b >= 0; b -= 1) {
    const t = b / bevelSegments;
    const z = bevelThickness * Math.cos((t * Math.PI) / 2);
    const bs2 = bevelSize * Math.sin((t * Math.PI) / 2) + bevelOffset;
    for (let i = 0, il = contour.length; i < il; i += 1) {
      const vert = scalePt2(contour[i]!, contourMovements[i]!, bs2);
      v(vert.x, vert.y, depth + z);
    }
    for (let h = 0, hl = holes.length; h < hl; h += 1) {
      const ahole = holes[h]!;
      const oneHoleMovements = holesMovements[h]!;
      for (let i = 0, il = ahole.length; i < il; i += 1) {
        const vert = scalePt2(ahole[i]!, oneHoleMovements[i]!, bs2);
        if (!extrudeByPath) {
          v(vert.x, vert.y, depth + z);
        } else {
          v(vert.x, vert.y + extrudePts![steps - 1]!.y, extrudePts![steps - 1]!.x + z);
        }
      }
    }
  }

  const addVertex = (index: number): void => {
    verticesArray.push(placeholder[index * 3]!);
    verticesArray.push(placeholder[index * 3 + 1]!);
    verticesArray.push(placeholder[index * 3 + 2]!);
  };
  const addUV = (vector2: Pt): void => {
    uvArray.push(vector2.x, vector2.y);
  };
  const f3 = (a: number, b: number, c: number): void => {
    addVertex(a);
    addVertex(b);
    addVertex(c);
    const nextIndex = verticesArray.length / 3;
    const uvs = WorldUVGenerator.generateTopUV(verticesArray, nextIndex - 3, nextIndex - 2, nextIndex - 1);
    addUV(uvs[0]);
    addUV(uvs[1]);
    addUV(uvs[2]);
  };
  const f4 = (a: number, b: number, c: number, d: number): void => {
    addVertex(a);
    addVertex(b);
    addVertex(d);
    addVertex(b);
    addVertex(c);
    addVertex(d);
    const nextIndex = verticesArray.length / 3;
    const uvs = WorldUVGenerator.generateSideWallUV(verticesArray, nextIndex - 6, nextIndex - 3, nextIndex - 2, nextIndex - 1);
    addUV(uvs[0]);
    addUV(uvs[1]);
    addUV(uvs[3]);
    addUV(uvs[1]);
    addUV(uvs[2]);
    addUV(uvs[3]);
  };

  const buildLidFaces = (): void => {
    const start = verticesArray.length / 3;
    if (bevelEnabled) {
      let layer = 0;
      let offset = vlen * layer;
      for (let i = 0; i < flen; i += 1) {
        const face = faces[i]!;
        f3(face[2]! + offset, face[1]! + offset, face[0]! + offset);
      }
      layer = steps + bevelSegments * 2;
      offset = vlen * layer;
      for (let i = 0; i < flen; i += 1) {
        const face = faces[i]!;
        f3(face[0]! + offset, face[1]! + offset, face[2]! + offset);
      }
    } else {
      for (let i = 0; i < flen; i += 1) {
        const face = faces[i]!;
        f3(face[2]!, face[1]!, face[0]!);
      }
      for (let i = 0; i < flen; i += 1) {
        const face = faces[i]!;
        f3(face[0]! + vlen * steps, face[1]! + vlen * steps, face[2]! + vlen * steps);
      }
    }
    groups.push({ start, count: verticesArray.length / 3 - start, materialIndex: 0 });
  };

  const sidewalls = (contourPts: readonly Pt[], layeroffset: number): void => {
    let i = contourPts.length;
    while ((i -= 1) >= 0) {
      const j = i;
      let k = i - 1;
      if (k < 0) k = contourPts.length - 1;
      for (let s = 0, sl = steps + bevelSegments * 2; s < sl; s += 1) {
        const slen1 = vlen * s;
        const slen2 = vlen * (s + 1);
        const a = layeroffset + j + slen1;
        const b = layeroffset + k + slen1;
        const c = layeroffset + k + slen2;
        const d = layeroffset + j + slen2;
        f4(a, b, c, d);
      }
    }
  };

  const buildSideFaces = (): void => {
    const start = verticesArray.length / 3;
    let layeroffset = 0;
    sidewalls(contour, layeroffset);
    layeroffset += contour.length;
    for (let h = 0, hl = holes.length; h < hl; h += 1) {
      sidewalls(holes[h]!, layeroffset);
      layeroffset += holes[h]!.length;
    }
    groups.push({ start, count: verticesArray.length / 3 - start, materialIndex: 1 });
  };

  buildLidFaces();
  buildSideFaces();

  const normals = computeVertexNormals(verticesArray);
  return { positions: verticesArray, normals, uvs: uvArray, groups };
}
