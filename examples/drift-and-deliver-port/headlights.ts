/**
 * Drift & Deliver port: the headlight beam, the original's only ShaderMaterial.
 *
 * The original builds it lazily at night: two open cones (three `CylinderGeometry(3.2, 0.55, 27, 20, 1, true)`,
 * moved so the narrow end sits at the lamp, laid flat along the car, squashed 0.55 vertically) merged into one
 * additive mesh whose fragment shader fades the beam with distance from the lamp, with view angle, near the road
 * and near the camera. The geometry reproduces three's cylinder vertex for vertex; the shaders are the original's,
 * moved from GLSL1 `varying`/`gl_FragColor` to GLSL 300 es.
 */
import type { material } from "@aura3d/engine";

export type CustomSpec = Parameters<typeof material.custom>[0];

export interface RawGeometry {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

/** three's `CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, heightSegments, openEnded)` side wall. */
export function cylinderSide(radiusTop: number, radiusBottom: number, height: number, radialSegments: number, heightSegments: number): RawGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const grid: number[][] = [];
  const slope = (radiusBottom - radiusTop) / height;
  let index = 0;
  for (let y = 0; y <= heightSegments; y++) {
    const row: number[] = [];
    const v = y / heightSegments;
    const radius = v * (radiusBottom - radiusTop) + radiusTop;
    for (let x = 0; x <= radialSegments; x++) {
      const u = x / radialSegments;
      const theta = u * Math.PI * 2;
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      positions.push(radius * sin, -v * height + height / 2, radius * cos);
      const n = Math.hypot(sin, slope, cos);
      normals.push(sin / n, slope / n, cos / n);
      uvs.push(u, 1 - v);
      row.push(index++);
    }
    grid.push(row);
  }
  const indices: number[] = [];
  for (let x = 0; x < radialSegments; x++) {
    for (let y = 0; y < heightSegments; y++) {
      const a = grid[y]![x]!;
      const b = grid[y + 1]![x]!;
      const c = grid[y + 1]![x + 1]!;
      const d = grid[y]![x + 1]!;
      if (radiusTop > 0 || y !== 0) indices.push(a, b, d);
      if (radiusBottom > 0 || y !== heightSegments - 1) indices.push(b, c, d);
    }
  }
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), uvs: Float32Array.from(uvs), indices: Uint32Array.from(indices) };
}

/** rotation about x, then scale (1, sy, 1), in the order the original applies them to positions. */
function transformBeam(g: RawGeometry, tilt: number, lampX: number, lampY: number, lampZ: number): RawGeometry {
  const angle = Math.PI / 2 + tilt;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const positions = new Float32Array(g.positions.length);
  const normals = new Float32Array(g.normals.length);
  for (let i = 0; i < g.positions.length; i += 3) {
    // translate(0, 13.5, 0), then makeRotationX(angle), then makeScale(1, 0.55, 1), then translate(lamp)
    const px = g.positions[i]!;
    const py = g.positions[i + 1]! + 13.5;
    const pz = g.positions[i + 2]!;
    const ry = py * c - pz * s;
    const rz = py * s + pz * c;
    positions[i] = px + lampX;
    positions[i + 1] = ry * 0.55 + lampY;
    positions[i + 2] = rz + lampZ;
    // normals follow the inverse-transpose: rotation, then 1/0.55 on y, renormalised
    const nx = g.normals[i]!;
    const ny = g.normals[i + 1]!;
    const nz = g.normals[i + 2]!;
    const rny = ny * c - nz * s;
    const rnz = ny * s + nz * c;
    const sy = rny / 0.55;
    const len = Math.hypot(nx, sy, rnz) || 1;
    normals[i] = nx / len;
    normals[i + 1] = sy / len;
    normals[i + 2] = rnz / len;
  }
  return { positions, normals, uvs: g.uvs, indices: g.indices };
}

export interface LampPlacement {
  /** Lateral offset of each lamp from the car centre line (`0.72 x halfW`). */
  halfSpread: number;
  y: number;
  z: number;
  /** Beam pitch: atan2(drop, run) of the lamp target (the original's default 0.037). */
  tilt: number;
}

export const DEFAULT_LAMPS: LampPlacement = { halfSpread: 0.72 * 0.9954000015020373, y: 0.66, z: 2.05, tilt: Math.atan2(0.46, 12.5) };

/** Both beams merged into one non-indexed mesh, as the original's `j2([B2(-x, ...), B2(x, ...)])`. */
export function beamGeometry(lamps: LampPlacement = DEFAULT_LAMPS): RawGeometry {
  const base = cylinderSide(3.2, 0.55, 27, 20, 1);
  const parts = [transformBeam(base, lamps.tilt, -lamps.halfSpread, lamps.y, lamps.z), transformBeam(base, lamps.tilt, lamps.halfSpread, lamps.y, lamps.z)];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (const part of parts) {
    for (const idx of part.indices) {
      positions.push(part.positions[idx * 3]!, part.positions[idx * 3 + 1]!, part.positions[idx * 3 + 2]!);
      normals.push(part.normals[idx * 3]!, part.normals[idx * 3 + 1]!, part.normals[idx * 3 + 2]!);
      uvs.push(part.uvs[idx * 2]!, part.uvs[idx * 2 + 1]!);
    }
  }
  const count = positions.length / 3;
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), uvs: Float32Array.from(uvs), indices: Uint32Array.from({ length: count }, (_, i) => i) };
}

export const BEAM_VERTEX = /* glsl */ `
out vec3 vW;
out vec3 vN;
out float vT;
void main() {
  vT = uv.y;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const BEAM_FRAGMENT = /* glsl */ `
in vec3 vW;
in vec3 vN;
in float vT;
out vec4 outColor;
void main() {
  vec3 v = cameraPosition - vW;
  float d = length(v);
  float facing = abs(dot(vN, v / max(d, 0.001)));
  float a = beamAmount;
  a *= 0.72 + 0.28 * pow(1.0 - facing, 1.6);
  a *= pow(1.0 - vT, 1.25) * smoothstep(0.0, 0.07, vT);
  a *= smoothstep(beamRoadY - 0.15, beamRoadY + 1.5, vW.y);
  a *= smoothstep(beamNear, beamNear * 2.3, d);
  outColor = vec4(beamColor, a);
}`;

/** Uniform names avoid the engine's lowered built-ins (`color`, `near`... are fine, `time` would become `u_time`). */
export const beamSpec = (amount = 0): CustomSpec => ({
  glsl: { vertex: BEAM_VERTEX, fragment: BEAM_FRAGMENT },
  uniforms: {
    beamColor: { type: "color3", value: [1, 0.82, 0.63] },
    beamAmount: { type: "f32", value: amount },
    beamRoadY: { type: "f32", value: 0.02 },
    beamNear: { type: "f32", value: 1.9 }
  },
  transparent: true,
  depthWrite: false,
  depthTest: true,
  blending: "additive",
  side: "double"
});
