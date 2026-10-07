// PRD-06 T0.14 harness: draws CesiumMan's clip-0 pose at t=0.5s through the
// registered `a3d_prd06_*` deform chunks (`A3D_SKINNING=4` + `A3D_DEPTH_ONLY`)
// into a 2048² float light-view target from a directional light at elevation
// 50°, azimuth 30°, and compares the silhouette against a CPU-skinned reference
// and the raw `a_position` (bind-pose) control. Reports IoU numbers plus the
// mask PNGs on `window.__PRD06_DEFORM_LIGHT_VIEW__`.
//
// This is the standalone proof that does not need the lighting lane's C-11
// DepthPass: the vertex stage here is exactly the `vertex:deform` splice the
// feature composes (§8.4 reference program).

import { GLTFLoader, LoadContext, createGLTFSceneAnimationRuntime } from "@aura3d/assets";
import type { GLTFAsset, GLTFMeshAsset } from "@aura3d/assets";
import { shaderChunk } from "@aura3d/rendering/contracts";
// Side-effect: registers the a3d_prd06_* chunks + provides the C-18 slot.
import "@aura3d/rendering/lanes/prd06";

declare global {
  interface Window {
    __PRD06_DEFORM_LIGHT_VIEW__?: {
      readonly status: "ready" | "error";
      readonly error?: string;
      readonly iou?: {
        readonly deformVsCpu: number;
        readonly bindPoseGpuVsCpu: number;
        readonly controlRawVsCpu: number;
        readonly animatedVsBindCpu: number;
      };
      readonly stats?: { readonly joints: number; readonly vertices: number; readonly pixels: number };
      readonly masks?: Record<"deform" | "cpu" | "bindGpu" | "bindCpu" | "control", string>;
    };
  }
}

const SIZE = 2048;

// --- minimal column-major mat4 helpers (harness-local; no repo math dep) ---
type Mat4 = Float32Array;
function mat4Multiply(a: ArrayLike<number>, b: ArrayLike<number>): Mat4 {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      out[c * 4 + r] = a[r]! * b[c * 4]! + a[4 + r]! * b[c * 4 + 1]! + a[8 + r]! * b[c * 4 + 2]! + a[12 + r]! * b[c * 4 + 3]!;
    }
  }
  return out;
}
function lookAt(eye: number[], center: number[], up: number[]): Mat4 {
  const z = normalize3([eye[0]! - center[0]!, eye[1]! - center[1]!, eye[2]! - center[2]!]);
  const x = normalize3(cross3(up, z));
  const y = cross3(z, x);
  // Column-major: columns are the camera basis vectors.
  return new Float32Array([
    x[0], x[1], x[2], 0,
    y[0], y[1], y[2], 0,
    z[0], z[1], z[2], 0,
    -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1
  ]);
}
function ortho(l: number, r: number, b: number, t: number, n: number, f: number): Mat4 {
  return new Float32Array([
    2 / (r - l), 0, 0, 0,
    0, 2 / (t - b), 0, 0,
    0, 0, -2 / (f - n), 0,
    -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1
  ]) as Mat4;
}
function normalize3(v: number[]): number[] {
  const len = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
  return [v[0]! / len, v[1]! / len, v[2]! / len];
}
function cross3(a: number[], b: number[]): number[] {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
}
function dot3(a: number[], b: number[]): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
}
function xformPoint(m: ArrayLike<number>, p: readonly number[]): number[] {
  return [
    m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!,
    m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!,
    m[2]! * p[0]! + m[6]! * p[1]! + m[10]! * p[2]! + m[14]!
  ];
}

/** CPU skinning reference: out = palette[j] * p, linear blend. */
function cpuSkin(positions: readonly (readonly [number, number, number])[], joints: readonly (readonly number[])[], weights: readonly (readonly number[])[], palette: Float32Array): Float32Array {
  const out = new Float32Array(positions.length * 3);
  for (let v = 0; v < positions.length; v += 1) {
    const p = positions[v]!;
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 4; k += 1) {
      const w = weights[v]![k] ?? 0;
      if (w === 0) continue;
      const j = joints[v]![k] ?? 0;
      const m = palette.subarray(j * 16, j * 16 + 16);
      const q = xformPoint(m, p);
      x += q[0]! * w; y += q[1]! * w; z += q[2]! * w;
    }
    out[v * 3] = x; out[v * 3 + 1] = y; out[v * 3 + 2] = z;
  }
  return out;
}

function boundsOf(positions: Float32Array | readonly (readonly number[])[]): { center: number[]; radius: number } {
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  const count = positions.length;
  const flat = typeof positions[0] === "number";
  for (let i = 0; i < count; i += 1) {
    const x = flat ? (positions as Float32Array)[i * 3]! : (positions as readonly number[][])[i]![0]!;
    const y = flat ? (positions as Float32Array)[i * 3 + 1]! : (positions as readonly number[][])[i]![1]!;
    const z = flat ? (positions as Float32Array)[i * 3 + 2]! : (positions as readonly number[][])[i]![2]!;
    if (x < mn[0]!) mn[0] = x; if (x > mx[0]!) mx[0] = x;
    if (y < mn[1]!) mn[1] = y; if (y > mx[1]!) mx[1] = y;
    if (z < mn[2]!) mn[2] = z; if (z > mx[2]!) mx[2] = z;
  }
  const center = [(mn[0]! + mx[0]!) / 2, (mn[1]! + mx[1]!) / 2, (mn[2]! + mx[2]!) / 2];
  const radius = Math.max(0.01, Math.hypot(mx[0]! - mn[0]!, mx[1]! - mn[1]!, mx[2]! - mn[2]!) / 2);
  return { center, radius };
}

/** Directional-light view at elevation 50°, azimuth 30°, ortho over the bounds. */
function lightViewProjection(center: number[], radius: number): Mat4 {
  const elev = (50 * Math.PI) / 180;
  const azim = (30 * Math.PI) / 180;
  const dir = [Math.cos(elev) * Math.cos(azim), Math.sin(elev), Math.cos(elev) * Math.sin(azim)];
  const dist = radius * 3;
  const eye = [center[0]! + dir[0]! * dist, center[1]! + dir[1]! * dist, center[2]! + dir[2]! * dist];
  const view = lookAt(eye, center, Math.abs(dir[1]!) > 0.99 ? [0, 0, 1] : [0, 1, 0]);
  const r = radius * 1.15;
  const proj = ortho(-r, r, -r, r, 0.1, dist * 2);
  return mat4Multiply(proj, view);
}

// --- GL plumbing ---
function compileProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const make = (type: number, src: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`shader compile failed: ${gl.getShaderInfoLog(shader)}\n--- source ---\n${src}`);
    }
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(program, make(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(program, 0, "a_position");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program link failed: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

const PREAMBLE = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 a_position;
uniform mat4 u_lightViewProjection;
uniform mat4 u_modelMatrix;
`;

const DEPTH_FS = `#version 300 es
precision highp float;
layout(location = 0) out vec4 fragColor;
void main() { fragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }
`;

interface DepthTarget {
  framebuffer: WebGLFramebuffer;
  readFormat: number;
  texture: WebGLTexture;
}

function createDepthTarget(gl: WebGL2RenderingContext): DepthTarget {
  if (!gl.getExtension("EXT_color_buffer_float")) {
    throw new Error("EXT_color_buffer_float unavailable — cannot render the R32F light-view target");
  }
  const framebuffer = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  const depth = gl.createRenderbuffer()!;
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, SIZE, SIZE);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const readFormat = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT) as number;
  if (readFormat === gl.RED) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, SIZE, SIZE, 0, gl.RED, gl.FLOAT, null);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, SIZE, SIZE, 0, gl.RGBA, gl.FLOAT, null);
  }
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("light-view framebuffer incomplete");
  }
  return { framebuffer, readFormat, texture };
}

function readMask(gl: WebGL2RenderingContext, target: DepthTarget): Uint8Array {
  const rgba = new Float32Array(SIZE * SIZE * 4);
  const r = new Float32Array(SIZE * SIZE);
  if (target.readFormat === gl.RED) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.readPixels(0, 0, SIZE, SIZE, gl.RED, gl.FLOAT, r);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.FLOAT, rgba);
    for (let i = 0; i < r.length; i += 1) r[i] = rgba[i * 4]!;
  }
  const mask = new Uint8Array(SIZE * SIZE);
  for (let i = 0; i < r.length; i += 1) {
    if (r[i]! < 0.9999) mask[i] = 1;
  }
  return mask;
}

function iou(a: Uint8Array, b: Uint8Array): number {
  let inter = 0, union = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i]! === 1, bv = b[i]! === 1;
    if (av && bv) inter += 1;
    if (av || bv) union += 1;
  }
  return union === 0 ? 1 : inter / union;
}

function maskToPng(mask: Uint8Array): string {
  const canvas = document.createElement("canvas");
  const scale = SIZE / 256;
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const src = mask[Math.floor(y * scale) * SIZE + Math.floor(x * scale)]!;
      const o = (y * 256 + x) * 4;
      const c = src ? 255 : 12;
      image.data[o] = c; image.data[o + 1] = c; image.data[o + 2] = c; image.data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

/** A mat4 that rotates about Z around the point (0, py, 0) — pivot at the joint's own height. */
function rotZAboutY(theta: number, py: number): Mat4 {
  const c = Math.cos(theta), s = Math.sin(theta);
  // T(0,py,0) · R_z(θ) · T(0,-py,0): rows of Rz, translation column carries the pivot.
  return new Float32Array([
    c, s, 0, 0,
    -s, c, 0, 0,
    0, 0, 1, 0,
    s * py, py - c * py, 0, 1
  ]);
}

interface SyntheticRig {
  jointCount: number;
  positions: [number, number, number][];
  joints: number[][];
  weights: number[][];
  indices: number[];
  bindPalette: Float32Array;
  posePalette: Float32Array;
}

/**
 * T1.12 — a 191-joint skinned rig, procedurally generated: a 6-column vertical
 * ribbon whose vertex rows weight 100% to the joint for that height. The posed
 * palette curls the ribbon upward (progressively larger Z-rotations pivoting at
 * each joint's height) so GPU-vs-CPU IoU exercises the bone-texture path well
 * above the ≤96 uniform-array cap.
 */
function syntheticRig(jointCount: number): SyntheticRig {
  const rows = 32;
  const cols = 6;
  const positions: [number, number, number][] = [];
  const joints: number[][] = [];
  const weights: number[][] = [];
  const indices: number[] = [];
  for (let r = 0; r <= rows; r += 1) {
    const y = -0.8 + (r / rows) * 1.6;
    const j = Math.min(jointCount - 1, Math.floor((r / rows) * jointCount));
    for (let c = 0; c < cols; c += 1) {
      const x = -0.24 + (c / (cols - 1)) * 0.48;
      positions.push([x, y, 0]);
      joints.push([j, 0, 0, 0]);
      weights.push([1, 0, 0, 0]);
    }
  }
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }
  const bindPalette = new Float32Array(jointCount * 16);
  const posePalette = new Float32Array(jointCount * 16);
  for (let j = 0; j < jointCount; j += 1) {
    bindPalette[j * 16 + 0] = 1; bindPalette[j * 16 + 5] = 1; bindPalette[j * 16 + 10] = 1; bindPalette[j * 16 + 15] = 1;
    const y = -0.8 + (j / (jointCount - 1)) * 1.6;
    // ~0.9 rad of curl at the top joint — a large, unambiguous silhouette change.
    const m = rotZAboutY((j / (jointCount - 1)) * 0.9, y);
    posePalette.set(m, j * 16);
  }
  return { jointCount, positions, joints, weights, indices, bindPalette, posePalette };
}

async function main(): Promise<void> {
  const chunks = ["a3d_prd06_skinning_common", "a3d_prd06_morph_texture", "a3d_prd06_deform"].map((name) => {
    const chunk = shaderChunk(name);
    if (!chunk) throw new Error(`chunk ${name} not registered`);
    return chunk.glsl;
  });

  const rig = new URLSearchParams(location.search).get("rig") ?? "cesium-man";
  let jointCount: number;
  let positions: readonly (readonly [number, number, number])[];
  let joints: readonly (readonly number[])[];
  let weights: readonly (readonly number[])[];
  let indices: readonly number[];
  let bindPalette: Float32Array;
  let posePalette: Float32Array;
  if (rig.startsWith("synthetic-")) {
    const synthetic = syntheticRig(Number(rig.slice("synthetic-".length)) || 191);
    ({ jointCount, positions, joints, weights, indices, bindPalette, posePalette } = synthetic);
  } else {
    const asset: GLTFAsset = await new GLTFLoader().load(
      { url: `${location.origin}/tests/assets/corpus/khronos/CesiumMan/CesiumMan.glb` },
      new LoadContext()
    );
    const clip = asset.animations[0];
    if (!clip) throw new Error("CesiumMan has no clip 0");
    const mesh: GLTFMeshAsset | undefined = asset.meshes.find((m) => m.skinIndex !== undefined);
    const skin = mesh?.skinIndex !== undefined ? asset.skins[mesh.skinIndex] : undefined;
    if (!mesh || !skin) throw new Error("CesiumMan skinned mesh missing");
    jointCount = skin.joints.length;

    const scene = asset.createScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: asset.animations, asset });

    // Bind pose: refresh before any clip sample so the palette is jointWorld_bind x IBM.
    scene.updateWorldTransforms();
    runtime.applyPose({ bones: {} });
    const renderableEntry = scene.collectRenderables().find(({ renderable }) => renderable.skinning && renderable.skinning.jointCount === jointCount);
    if (!renderableEntry) throw new Error("skinned renderable not bound");
    bindPalette = new Float32Array(renderableEntry.renderable.skinning!.matrices);

    // Posed: clip 0 at t = 0.5 s.
    runtime.applyClip(clip, 0.5);
    posePalette = new Float32Array(renderableEntry.renderable.skinning!.matrices);

    positions = mesh.positions as readonly (readonly [number, number, number])[];
    joints = mesh.joints;
    weights = mesh.weights;
    if (!mesh.indices) throw new Error("CesiumMan mesh has no index buffer");
    indices = mesh.indices;
  }

  const cpuAnimated = cpuSkin(positions, joints, weights, posePalette);
  const cpuBind = cpuSkin(positions, joints, weights, bindPalette);
  const rawPositions = new Float32Array(positions.length * 3);
  positions.forEach((p, i) => { rawPositions[i * 3] = p[0]; rawPositions[i * 3 + 1] = p[1]; rawPositions[i * 3 + 2] = p[2]; });

  const { center, radius } = boundsOf(cpuAnimated);
  const lightVP = lightViewProjection(center, radius);
  const model = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  const canvas = document.createElement("canvas");
  canvas.width = SIZE; canvas.height = SIZE;
  const gl = canvas.getContext("webgl2", { antialias: false, depth: false, stencil: false, alpha: false })!;
  const target = createDepthTarget(gl);
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.viewport(0, 0, SIZE, SIZE);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.disable(gl.CULL_FACE);

  const indexBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);

  const jointsBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, jointsBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(joints.flat()), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(5);
  gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 0, 0);
  const weightsBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, weightsBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(weights.flat()), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(6);
  gl.vertexAttribPointer(6, 4, gl.FLOAT, false, 0, 0);

  // Bone palette texture, identical texel layout to the §8.1 chunk contract.
  const paletteTex = gl.createTexture()!;
  const uploadPalette = (palette: Float32Array) => {
    const texels = jointCount * 4;
    const width = Math.min(1024, Math.ceil(Math.ceil(Math.sqrt(texels)) / 4) * 4);
    const height = Math.ceil(texels / width);
    const data = new Float32Array(width * height * 4);
    data.set(palette);
    gl.bindTexture(gl.TEXTURE_2D, paletteTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return width;
  };

  const deformVs = `${PREAMBLE}\n#define A3D_SKINNING 4\n#define A3D_DEPTH_ONLY\n${chunks.join("\n")}\n` +
    `void main() { vec4 p; vec3 n; vec4 t; a3dDeform(p, n, t); gl_Position = u_lightViewProjection * (u_modelMatrix * p); }`;
  const deformProgram = compileProgram(gl, deformVs, DEPTH_FS);
  const passVs = `${PREAMBLE}\nvoid main() { gl_Position = u_lightViewProjection * vec4(a_position, 1.0); }`;
  const passProgram = compileProgram(gl, passVs, DEPTH_FS);

  const draw = (program: WebGLProgram, positionData: Float32Array, palette?: Float32Array): Uint8Array => {
    gl.clearColor(1, 1, 1, 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "u_lightViewProjection"), false, lightVP as Float32Array);
    const modelLoc = gl.getUniformLocation(program, "u_modelMatrix");
    if (modelLoc) gl.uniformMatrix4fv(modelLoc, false, model);
    const positionBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positionData, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    if (palette) {
      const width = uploadPalette(palette);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(gl.getUniformLocation(program, "u_boneTexture"), 0);
      gl.uniform1i(gl.getUniformLocation(program, "u_boneTextureWidth"), width);
    }
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_INT, 0);
    return readMask(gl, target);
  };

  const maskDeform = draw(deformProgram, rawPositions, posePalette);
  const maskBindGpu = draw(deformProgram, rawPositions, bindPalette);
  const maskCpu = draw(passProgram, cpuAnimated);
  const maskBindCpu = draw(passProgram, cpuBind);
  const maskControl = draw(passProgram, rawPositions);

  const result = {
    status: "ready" as const,
    iou: {
      deformVsCpu: iou(maskDeform, maskCpu),
      bindPoseGpuVsCpu: iou(maskBindGpu, maskBindCpu),
      controlRawVsCpu: iou(maskControl, maskCpu),
      animatedVsBindCpu: iou(maskCpu, maskBindCpu)
    },
    stats: { joints: jointCount, vertices: positions.length, pixels: SIZE * SIZE },
    masks: {
      deform: maskToPng(maskDeform),
      cpu: maskToPng(maskCpu),
      bindGpu: maskToPng(maskBindGpu),
      bindCpu: maskToPng(maskBindCpu),
      control: maskToPng(maskControl)
    }
  };
  window.__PRD06_DEFORM_LIGHT_VIEW__ = result;
}

main().catch((error) => {
  window.__PRD06_DEFORM_LIGHT_VIEW__ = { status: "error", error: error instanceof Error ? error.message : String(error) };
});
