// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { GltfBounds } from "./gltfRuntime.js";
import type { ProductionPrimitiveMesh } from "./primitives.js";
import { camera } from "../nodes/camera.js";
import { material } from "../nodes/material.js";
import { shadows } from "../nodes/shadows.js";
import { tilingSecondUnwrap } from "./primitives.js";

export function createPlaneGeometry(): ProductionPrimitiveMesh {
  const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const tangents = new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]);
  return {
    positions: new Float32Array([
      -0.5, 0, -0.5,
      0.5, 0, -0.5,
      0.5, 0, 0.5,
      -0.5, 0, 0.5
    ]),
    normals: new Float32Array([
      0, 1, 0,
      0, 1, 0,
      0, 1, 0,
      0, 1, 0
    ]),
    // Counter-clockwise when viewed from +Y, so the triangle winding agrees with
    // the [0, 1, 0] vertex normals. The previous [0, 1, 2, 0, 2, 3] order wound
    // the opposite way: its geometric normal was [0, -1, 0], so `gl_FrontFacing`
    // was false for a camera above the plane and the two-sided shader flipped the
    // up-normal downward. The plane then faced away from every overhead light and
    // received no direct lighting or visible cast shadows.
    indices: new Uint16Array([0, 2, 1, 0, 3, 2]),
    bounds: { min: [-0.5, 0, -0.5], max: [0.5, 0, 0.5] },
    uvs,
    uv1s: tilingSecondUnwrap(uvs),
    tangents
  };
}

export function createBoxGeometry(): ProductionPrimitiveMesh {
  // One full 0-1 unwrap per face, matching the 4-vertex face order below.
  const faceUvs = [0, 0, 1, 0, 1, 1, 0, 1];
  const uvs = new Float32Array([...faceUvs, ...faceUvs, ...faceUvs, ...faceUvs, ...faceUvs, ...faceUvs]);
  // Analytic tangents along each face's +u direction (face order +z,-z,+y,-y,+x,-x).
  const faceTangents = [
    [1, 0, 0, 1], [-1, 0, 0, 1], [1, 0, 0, 1], [1, 0, 0, 1], [0, 0, -1, 1], [0, 0, 1, 1]
  ];
  const tangents = new Float32Array(faceTangents.flatMap((tangent) => [...tangent, ...tangent, ...tangent, ...tangent]));
  const positions = new Float32Array([
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5,
    -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
    0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5,
    -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5
  ]);
  const normals = new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0
  ]);
  return {
    positions,
    normals,
    indices: new Uint16Array([
      0, 1, 2, 0, 2, 3,
      4, 5, 6, 4, 6, 7,
      8, 9, 10, 8, 10, 11,
      12, 13, 14, 12, 14, 15,
      16, 17, 18, 16, 18, 19,
      20, 21, 22, 20, 22, 23
    ]),
    bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
    uvs,
    uv1s: tilingSecondUnwrap(uvs),
    tangents
  };
}

export function createSphereGeometry(): ProductionPrimitiveMesh {
  const rows = 12;
  const columns = 16;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const tangents: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    const theta = v * Math.PI;
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const phi = u * Math.PI * 2;
      const x = Math.sin(theta) * Math.cos(phi);
      const y = Math.cos(theta);
      const z = Math.sin(theta) * Math.sin(phi);
      positions.push(x * 0.5, y * 0.5, z * 0.5);
      normals.push(x, y, z);
      uvs.push(u, 1 - v);
      tangents.push(-Math.sin(phi), 0, Math.cos(phi), 1);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      // Counter-clockwise from outside the sphere. The previous order wound
      // inward while the vertex normals pointed outward, so gl_FrontFacing
      // flipped correct normals inward and every NdotV material term collapsed.
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const sphereUvs = new Float32Array(uvs);
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
    bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
    uvs: sphereUvs,
    uv1s: tilingSecondUnwrap(sphereUvs),
    tangents: new Float32Array(tangents)
  };
}

export function createCylinderGeometry(): { readonly positions: Float32Array; readonly normals: Float32Array; readonly indices: Uint16Array; readonly bounds: GltfBounds } {
  const segments = 24;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let segment = 0; segment <= segments; segment += 1) {
    const angle = (segment / segments) * Math.PI * 2;
    const x = Math.cos(angle) * 0.5;
    const z = Math.sin(angle) * 0.5;
    positions.push(x, -0.5, z, x, 0.5, z);
    normals.push(Math.cos(angle), 0, Math.sin(angle), Math.cos(angle), 0, Math.sin(angle));
  }
  for (let segment = 0; segment < segments; segment += 1) {
    const base = segment * 2;
    indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
  }
  const topCenter = positions.length / 3;
  positions.push(0, 0.5, 0);
  normals.push(0, 1, 0);
  const bottomCenter = positions.length / 3;
  positions.push(0, -0.5, 0);
  normals.push(0, -1, 0);
  for (let segment = 0; segment < segments; segment += 1) {
    const base = segment * 2;
    indices.push(topCenter, base + 1, base + 3);
    indices.push(bottomCenter, base + 2, base);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
    bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }
  };
}

export function createTorusGeometry(): { readonly positions: Float32Array; readonly normals: Float32Array; readonly indices: Uint16Array; readonly bounds: GltfBounds } {
  const radialSegments = 48;
  const tubeSegments = 10;
  const majorRadius = 0.43;
  const tubeRadius = 0.045;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let radial = 0; radial <= radialSegments; radial += 1) {
    const u = (radial / radialSegments) * Math.PI * 2;
    const centerX = Math.cos(u) * majorRadius;
    const centerY = Math.sin(u) * majorRadius;
    for (let tube = 0; tube <= tubeSegments; tube += 1) {
      const v = (tube / tubeSegments) * Math.PI * 2;
      const nx = Math.cos(u) * Math.cos(v);
      const ny = Math.sin(u) * Math.cos(v);
      const nz = Math.sin(v);
      positions.push(centerX + nx * tubeRadius, centerY + ny * tubeRadius, nz * tubeRadius);
      normals.push(nx, ny, nz);
    }
  }
  const row = tubeSegments + 1;
  for (let radial = 0; radial < radialSegments; radial += 1) {
    for (let tube = 0; tube < tubeSegments; tube += 1) {
      const a = radial * row + tube;
      const b = (radial + 1) * row + tube;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
    bounds: { min: [-0.5, -0.5, -0.06], max: [0.5, 0.5, 0.06] }
  };
}

export function createCapsuleApproxGeometry(): { readonly positions: Float32Array; readonly normals: Float32Array; readonly indices: Uint16Array; readonly bounds: GltfBounds } {
  return createSphereGeometry();
}
