// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraColor, AuraEffectNode, AuraFountainParticleLayer, WebGLModel } from "../nodes/types.js";
import { primitives } from "../nodes/primitives.js";
import { colorToRgb, identity4, seededRange } from "../sceneMath.js";
import { getParticleLife, writeParticlePosition } from "./effects.js";
import { createBuffer } from "./webglRuntime.js";

export function createWebGLRainModel(gl: WebGL2RenderingContext): WebGLModel {
  const lineCount = 90;
  const positions = new Float32Array(lineCount * 2 * 3);
  const normals = new Float32Array(lineCount * 2 * 3);
  const indices = new Uint16Array(lineCount * 2);
  for (let index = 0; index < lineCount; index += 1) {
    const x = ((index * 37) % 100) / 18 - 2.8;
    const z = ((index * 53) % 100) / 20 - 2.5;
    const y = 0.65 + ((index * 29) % 100) / 45;
    const base = index * 6;
    positions.set([x, y, z, x - 0.08, y - 0.42, z + 0.04], base);
    normals.set([0, 1, 0, 0, 1, 0], base);
    indices[index * 2] = index * 2;
    indices[index * 2 + 1] = index * 2 + 1;
  }
  return {
    bounds: { min: [-3, 0, -3], max: [3, 3, 3] },
    color: [0.62, 0.82, 1],
    normalizeToUnit: false,
    modelMatrix: identity4(),
    primitives: [{
      position: createBuffer(gl, gl.ARRAY_BUFFER, positions),
      normal: createBuffer(gl, gl.ARRAY_BUFFER, normals),
      index: createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, indices),
      count: indices.length,
      mode: gl.LINES,
      indexType: gl.UNSIGNED_SHORT
    }]
  };
}

export function createWebGLParticleModel(gl: WebGL2RenderingContext, effect: AuraEffectNode): WebGLModel {
  const isFountain = effect.emitter === "fountain";
  const materialMode = effect.materialMode ?? "soft-alpha";
  const fountainLayer: AuraFountainParticleLayer = !isFountain
    ? "plume"
    : effect.materialMode === "soft-alpha" || effect.name?.includes("mist")
      ? "mist"
      : effect.name?.includes("splash") || effect.name?.includes("collision")
        ? "splash"
        : "plume";
  const requestedCount = effect.particleCount ?? 900;
  const minCount = isFountain
    ? fountainLayer === "splash"
      ? 64
      : fountainLayer === "mist"
        ? 90
        : 240
    : 120;
  // Fountain cap matches prefabs.particleFountain's 2400 maximum so rendered counts never undercut the scene JSON.
  const maxCount = isFountain ? 2400 : 1800;
  const count = Math.max(minCount, Math.min(maxCount, requestedCount));
  const radius = effect.radius ?? 1.15;
  const height = effect.height ?? 2.4;
  const turbulence = Math.max(0, Math.min(1, effect.turbulence ?? effect.noise ?? 0));
  const gravity = effect.gravity ?? 0;
  const groundCollision = effect.groundCollision ?? false;
  const positions = new Float32Array(count * 6 * 3);
  const normals = new Float32Array(count * 6 * 3);
  const colors = new Float32Array(count * 6 * 3);
  const indices = new Uint16Array(count * 8 * 3);
  const center = new Float32Array(3);
  const localVertices = [
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, 1],
    [-1, 0, 0],
    [0, 0, -1],
    [0, -1, 0]
  ] as const;
  const localTriangles = [
    [0, 1, 2],
    [0, 2, 3],
    [0, 3, 4],
    [0, 4, 1],
    [5, 2, 1],
    [5, 3, 2],
    [5, 4, 3],
    [5, 1, 4]
  ] as const;
  const lifetimeRamp = (effect.lifetimeColorRamp?.length
    ? effect.lifetimeColorRamp
    : isFountain
      ? ["#fff7ad", "#fef08a", "#fb923c", "#60a5fa", "#38bdf8", "#fb7185"]
      : [effect.color ?? "#7dfcff", "#ffd166", "#60a5fa"]) as readonly AuraColor[];
  const sizeCurve = effect.sizeOverLife ?? [0.35, 1, 0.58];
  const writeParticleVertices = (seconds: number): void => {
    const emitter = effect.emitter ?? "swirl";
    for (let index = 0; index < count; index += 1) {
      writeParticlePosition(center, 0, seconds, emitter, radius, height, index, turbulence, gravity, groundCollision, fountainLayer);
      const life = getParticleLife(index, seconds, emitter);
      const sizeLife = life < 0.5
        ? (sizeCurve[0] ?? 0.35) + ((sizeCurve[1] ?? 1) - (sizeCurve[0] ?? 0.35)) * (life / 0.5)
        : (sizeCurve[1] ?? 1) + ((sizeCurve[2] ?? 0.58) - (sizeCurve[1] ?? 1)) * ((life - 0.5) / 0.5);
      const baseSize = isFountain
        ? fountainLayer === "mist"
          ? 0.012
          : fountainLayer === "splash"
            ? 0.024
            : 0.032
        : materialMode === "dust" || materialMode === "smoke"
          ? 0.011
          : materialMode === "star" || materialMode === "spark"
            ? 0.016
            : 0.022;
      const size = baseSize * Math.max(0.38, sizeLife) * seededRange(index, 353, 0.72, 1.14);
      const particleColor = colorToRgb(lifetimeRamp[index % lifetimeRamp.length] ?? effect.color ?? "#7dfcff");
      const vertexBase = index * 6;
      const positionBase = vertexBase * 3;
      for (let vertex = 0; vertex < localVertices.length; vertex += 1) {
        const local = localVertices[vertex];
        const offset = positionBase + vertex * 3;
        positions[offset] = center[0] + local[0] * size;
        positions[offset + 1] = center[1] + local[1] * size;
        positions[offset + 2] = center[2] + local[2] * size;
        normals[offset] = 0.45;
        normals[offset + 1] = 0.82;
        normals[offset + 2] = 0.36;
        colors[offset] = particleColor[0];
        colors[offset + 1] = particleColor[1];
        colors[offset + 2] = particleColor[2];
      }
      const indexBase = index * 24;
      for (let tri = 0; tri < localTriangles.length; tri += 1) {
        const local = localTriangles[tri];
        indices[indexBase + tri * 3] = vertexBase + local[0];
        indices[indexBase + tri * 3 + 1] = vertexBase + local[1];
        indices[indexBase + tri * 3 + 2] = vertexBase + local[2];
      }
    }
  };
  writeParticleVertices(0);
  const position = createBuffer(gl, gl.ARRAY_BUFFER, positions);
  return {
    node: effect,
    bounds: { min: [-radius * 2, 0, -radius * 2], max: [radius * 2, height, radius * 2] },
    color: [1, 1, 1],
    normalizeToUnit: false,
    update(time) {
      const seconds = time * Math.max(0.05, effect.speed ?? 1);
      writeParticleVertices(seconds);
      gl.bindBuffer(gl.ARRAY_BUFFER, position);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions);
    },
    primitives: [{
      position,
      normal: createBuffer(gl, gl.ARRAY_BUFFER, normals),
      vertexColor: createBuffer(gl, gl.ARRAY_BUFFER, colors),
      index: createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, indices),
      count: indices.length,
      mode: gl.TRIANGLES,
      indexType: gl.UNSIGNED_SHORT
    }]
  };
}
