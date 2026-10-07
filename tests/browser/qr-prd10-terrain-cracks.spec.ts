import { test, expect } from "@playwright/test";
import { TERRAIN_VERT_GLSL } from "../../packages/rendering/src/world/terrain/shaders/terrain.vert.glsl";
import {
  buildCdlodTree,
  cdlodRanges,
  selectCdlodNodes
} from "../../packages/rendering/src/world/terrain/TerrainCdlod";
import { createTerrainPatchGeometry } from "../../packages/rendering/src/world/terrain/TerrainPatchGeometry";
import { proceduralHeightfield } from "../../packages/engine/src/agent-api/world/terrain";

/**
 * PRD-10 §15.2 `terrain-cracks` — 120-frame dolly across adjacent CDLOD nodes
 * at different LODs; background-coloured pixels inside the terrain footprint
 * must be 0 (a hole in coverage = a crack). Runs the REAL Path S vertex
 * program (TERRAIN_VERT_GLSL → a3dTerrainCdlod with morph) against a raw
 * WebGL2 context — the same shader the frame pass links.
 *
 * Scope note: this exercises the geometric seam guarantee directly (real
 * chunk, real node selection, real morph ranges). The full-scene silhouette
 * pass over `prd10-terrain-flyover` lands when the scene harness's capture
 * path is wired on the macos-14 lane job.
 */

// Column-major mat4 helpers (node side; no dependency).
function perspective(fovY: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}
function lookAt(eye: [number, number, number], center: [number, number, number], up: [number, number, number]): Float32Array {
  const z = normalize3([eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]]);
  const x = normalize3(cross3(up, z));
  const y = cross3(z, x);
  const m = new Float32Array(16);
  m.set([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1]);
  return m;
}
function mul4(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c += 1)
    for (let r = 0; r < 4; r += 1)
      for (let k = 0; k < 4; k += 1) o[c * 4 + r] = o[c * 4 + r]! + a[k * 4 + r]! * b[c * 4 + k]!;
  return o;
}
function normalize3(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross3(a: readonly [number, number, number], b: readonly [number, number, number]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot3(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function projectPoint(m: Float32Array, p: [number, number, number]): [number, number] | null {
  const x = m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!;
  const y = m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!;
  const w = m[3]! * p[0] + m[7]! * p[1] + m[11]! * p[2] + m[15]!;
  if (w <= 1e-4) return null;
  return [x / w, y / w];
}

const FRAMES = 120;

test("terrain CDLOD: 0 crack pixels over 120 dolly frames across LOD seams", async ({ page }) => {
  await page.goto("about:blank");
  const columns = 65;
  const rows = 65;
  const size: [number, number] = [512, 512];
  const heights = proceduralHeightfield(11, columns, rows, { octaves: 4, baseFrequency: 3, ridged: 0.2 });
  const heightScale = 40;
  const grid = { columns, rows, heights };
  const patchN = 16;
  const patch = createTerrainPatchGeometry(patchN);
  const levels = 4;
  const tree = buildCdlodTree(grid, size, [0, 0], levels);
  const ranges = cdlodRanges(levels, tree.leafSize, 1, 0.33);
  const morph = new Float32Array(16);
  for (const r of ranges) {
    morph[r.lod * 2] = r.morphStart;
    morph[r.lod * 2 + 1] = r.morphEnd;
  }

  // Dolly: 120 camera positions sweeping diagonally so nodes flip LOD mid-run.
  const frameData: { nodes: Float32Array; vp: Float32Array; camera: number[] }[] = [];
  let worstMask: { x0: number; y0: number; x1: number; y1: number } | null = null;
  const W = 320;
  const H = 240;
  for (let f = 0; f < FRAMES; f += 1) {
    const t = f / (FRAMES - 1);
    const camera: [number, number, number] = [64 + t * 384, 120, 64 + t * 384];
    const proj = perspective(Math.PI / 3.2, W / H, 1, 4000);
    const view = lookAt(camera, [camera[0] + 60, 0, camera[2] + 80], [0, 1, 0]);
    const vp = mul4(proj, view);
    const nodes = selectCdlodNodes(tree, camera, ranges);
    const inst = new Float32Array(nodes.length * 4);
    nodes.forEach((n, i) => {
      inst[i * 4] = n.origin[0];
      inst[i * 4 + 1] = n.origin[1];
      inst[i * 4 + 2] = n.size;
      inst[i * 4 + 3] = n.level;
    });
    frameData.push({ nodes: inst, vp, camera: [...camera] });
    // Tight projected footprint of the terrain plane (min/max over corners).
    const corners: [number, number][] = [];
    for (const c of [[0, 0], [size[0], 0], [0, size[1]], [size[0], size[1]]] as [number, number][]) {
      const ndc = projectPoint(vp, [c[0], 0, c[1]]);
      if (ndc) corners.push([(ndc[0] * 0.5 + 0.5) * W, (ndc[1] * 0.5 + 0.5) * H]);
    }
    if (corners.length === 4) {
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      const mask = {
        x0: Math.ceil(Math.min(...xs)) + 8,
        y0: Math.ceil(Math.min(...ys)) + 8,
        x1: Math.floor(Math.max(...xs)) - 8,
        y1: Math.floor(Math.max(...ys)) - 8
      };
      if (!worstMask || (mask.x1 - mask.x0) * (mask.y1 - mask.y0) > (worstMask.x1 - worstMask.x0) * (worstMask.y1 - worstMask.y0)) worstMask = mask;
    }
  }
  expect(frameData.length).toBe(FRAMES);

  const result = await page.evaluate(async ({ vert, frames, heights, columns, rows, size, heightScale, patchVerts, patchIndices, patchN, morph, mask }) => {
    const W = 320;
    const H = 240;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
    if (!gl) return { error: "no-webgl2" } as const;
    const fsSrc = `#version 300 es
      precision highp float;
      in vec3 v_worldPosition;
      in vec2 v_terrainUv;
      out vec4 o;
      void main() { o = vec4(0.2, 0.5, 0.2, 1.0); }`;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`shader: ${gl.getShaderInfoLog(s)}\n${src.slice(0, 400)}`);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
    gl.useProgram(prog);

    // Height texture (RGBA32F packed — .r reads the height).
    const ht = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, ht);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const packed = new Float32Array(heights.length * 4);
    heights.forEach((h, i) => { packed[i * 4] = h; });
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, columns, rows, 0, gl.RGBA, gl.FLOAT, packed);

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const gridLoc = gl.getAttribLocation(prog, "a_grid");
    const nodeLoc = gl.getAttribLocation(prog, "a_node");
    const gridBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(patchVerts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(gridLoc);
    gl.vertexAttribPointer(gridLoc, 2, gl.FLOAT, false, 0, 0);
    const nodeBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, nodeBuf);
    gl.enableVertexAttribArray(nodeLoc);
    gl.vertexAttribPointer(nodeLoc, 4, gl.FLOAT, false, 16, 0);
    gl.vertexAttribDivisor(nodeLoc, 1);
    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    const idx = patchIndices.length > 65535 ? new Uint32Array(patchIndices) : new Uint32Array(patchIndices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

    const u = (n: string) => gl.getUniformLocation(prog, n);
    gl.uniform4f(u("u_terrain"), 0, 0, size[0], size[1]);
    gl.uniform1f(u("u_heightScale"), heightScale);
    gl.uniform2f(u("u_heightTexSize"), columns, rows);
    gl.uniform2fv(u("u_morph"), new Float32Array(morph));
    gl.uniform1f(u("u_gridDim"), patchN);
    gl.uniform1i(u("u_height"), 0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    const px = new Uint8Array(W * H * 4);
    let crackFrames = 0;
    let maxCrackPixels = 0;
    for (const frame of frames) {
      gl.clearColor(1, 0, 1, 1); // magenta = background sentinel
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(u("u_viewProjection"), false, new Float32Array(frame.vp));
      gl.uniform3f(u("u_cameraPosition"), frame.camera[0], frame.camera[1], frame.camera[2]);
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(frame.nodes), gl.DYNAMIC_DRAW);
      gl.drawElementsInstanced(gl.TRIANGLES, idx.length, idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0, frame.nodes.length / 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      // Flip Y (GL origin bottom-left vs mask computed in NDC y-up top-left).
      let cracks = 0;
      for (let y = Math.max(0, mask.y0); y <= Math.min(H - 1, mask.y1); y += 1) {
        const gy = H - 1 - y;
        for (let x = Math.max(0, mask.x0); x <= Math.min(W - 1, mask.x1); x += 1) {
          const o = (gy * W + x) * 4;
          if (px[o] === 255 && px[o + 1] === 0 && px[o + 2] === 255) cracks += 1;
        }
      }
      if (cracks > 0) {
        crackFrames += 1;
        maxCrackPixels = Math.max(maxCrackPixels, cracks);
      }
    }
    return { crackFrames, maxCrackPixels } as const;
  }, {
    vert: TERRAIN_VERT_GLSL,
    frames: frameData.map((f) => ({ nodes: Array.from(f.nodes), vp: Array.from(f.vp), camera: f.camera })),
    heights: Array.from(heights),
    columns,
    rows,
    size,
    heightScale,
    patchVerts: Array.from(patch.vertices),
    patchIndices: Array.from(patch.indices),
    patchN,
    morph: Array.from(morph),
    // Fallback: whole canvas when no frame kept all 4 terrain corners in frustum.
    mask: worstMask ?? { x0: 8, y0: 8, x1: W - 9, y1: H - 9 }
  });
  if ("error" in result) {
    test.skip(true, `webgl2 unavailable in this runner: ${result.error}`);
    return;
  }
  expect(result.crackFrames, `frames with background-coloured pixels inside terrain (max ${result.maxCrackPixels}/frame)`).toBe(0);
});
