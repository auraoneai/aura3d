/**
 * prd02 PMREM harness page (02-S7, PRD-02 §16.1 S7 / Phase 3 GPUPMREMGenerator
 * row). Built into the lane bundle (vite.lane.config.ts input `pmrem`) and
 * driven by tests/qr/prd02/browser/pmrem.spec.ts on macos-14.
 *
 * Subject: the C-09 real factory (`environmentProbeFactorySlot` with
 * A3D_QR_LIGHTING on, i.e. `Prd02EnvironmentProbeFactory`) through the
 * production `defaultProbeLoader` HDRI path on studio_small_08_1k.hdr. Its
 * specular cube is uploaded to a real WebGL2 RGBA16F cube texture exactly as
 * the device uploads it (row 0 first, GL face order, every mip) and sampled
 * on the GPU with textureLod.
 *
 * Note: `GPUPMREMGenerator.fromEquirect` prefilters on the CPU
 * (`workers/cpuPrefilter.ts`, the documented default seam); the GPU is used
 * here to sample what a shader sees, not to run the prefilter.
 *
 * Publishes `window.__A3D_PRD02_PMREM__`:
 *  - real / legacy: per-mip GPU-sampled solid-angle mean luma, texel-exact max
 *    luma, top/bottom hemisphere means; mip-0 orientation correlation vs the
 *    source equirect; mirror-sphere windows (ChunkHarness program over the
 *    `a3d_prd02_lighting_ibl` chunk) at roughness {0, .25, .5, .75, 1};
 *  - three: the same mirror-sphere windows from three r185
 *    `PMREMGenerator.fromEquirectangular` sampled with `textureCubeUV`;
 *  - stub: the C-09 slot stub (flag off) fed the same HDRI.
 * `legacy` is the pre-C-09 PMREM path the PRD names as the broken control
 * (`production-runtime/environment/PMREMGenerator.ts`, 0.82 wide-lobe blend).
 */
import "../../../../packages/rendering/src/lanes/prd02";
import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { environmentProbeFactorySlot, type EnvironmentProbe } from "../../../../packages/rendering/src/contracts/environment";
import type { QrFlags } from "../../../../packages/rendering/src/contracts/core";
import { shaderChunk } from "../../../../packages/rendering/src/contracts/program";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { defaultProbeLoader } from "../../../../packages/rendering/src/environment/EnvironmentCache";
import { decodeHdrEquirect, sampleEquirect, type HdrImage } from "../../../../packages/rendering/src/environment/HdrEquirect";
import { generateCubemapPMREMResources } from "../../../../packages/rendering/src/production-runtime/environment/PMREMGenerator";
import { hdriAssets } from "../../shared/assets";
import {
  fetchBytes, halfToFloat, linkQuadProgram, luma, renderFloat, requireFloatTargets, uploadHalfCube, type CubeLevels
} from "./gl-harness";

declare global {
  interface Window {
    __A3D_PRD02_PMREM__?: unknown;
  }
}

const PARITY_ROUGHNESS = [0, 0.25, 0.5, 0.75, 1] as const;
const GRID_W = 512;
const GRID_H = 256;
const ORIENT_W = 64;
const ORIENT_H = 32;
const SPHERE = 256;

const LIGHTING_ON: QrFlags = { values: { A3D_QR_LIGHTING: true }, on: (name) => name === "A3D_QR_LIGHTING" };
const LIGHTING_OFF: QrFlags = { values: {}, on: () => false };

interface MipStats {
  readonly mip: number;
  readonly faceSize: number;
  readonly meanLuma: number;
  readonly maxLuma: number;
  readonly topLuma: number;
  readonly bottomLuma: number;
}

interface SphereWindow {
  readonly roughness: number;
  readonly meanLuma: number;
  readonly hf: number;
  readonly pixels: number;
}

const GRID_FS = `#version 300 es
precision highp float;
uniform samplerCube u_cube;
uniform float u_lod;
uniform vec2 u_size;
layout(location = 0) out vec4 fragColor;
void main() {
  float theta = gl_FragCoord.y / u_size.y * 3.14159265358979;
  float phi = gl_FragCoord.x / u_size.x * 6.28318530717959 - 3.14159265358979;
  vec3 d = vec3(-cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta));
  fragColor = vec4(textureLod(u_cube, d, u_lod).rgb, 1.0);
}
`;

function gridDirection(col: number, row: number, width: number, height: number): [number, number, number] {
  const theta = ((row + 0.5) / height) * Math.PI;
  const phi = ((col + 0.5) / width) * 2 * Math.PI - Math.PI;
  return [-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)];
}

function sampleGrid(gl: WebGL2RenderingContext, program: WebGLProgram, cube: WebGLTexture, lod: number, width: number, height: number): Float32Array {
  return renderFloat(gl, program, width, height, (p) => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cube);
    gl.uniform1i(gl.getUniformLocation(p, "u_cube"), 0);
    gl.uniform1f(gl.getUniformLocation(p, "u_lod"), lod);
    gl.uniform2f(gl.getUniformLocation(p, "u_size"), width, height);
  });
}

/** Solid-angle-weighted mean/top/bottom luma of a lat-long grid readback. */
function gridLuma(data: Float32Array, width: number, height: number): { mean: number; top: number; bottom: number } {
  let sum = 0, weight = 0, top = 0, topW = 0, bottom = 0, bottomW = 0;
  for (let row = 0; row < height; row += 1) {
    const theta = ((row + 0.5) / height) * Math.PI;
    const w = Math.sin(theta);
    const up = Math.cos(theta);
    for (let col = 0; col < width; col += 1) {
      const i = (row * width + col) * 4;
      const l = luma(data[i]!, data[i + 1]!, data[i + 2]!);
      sum += l * w; weight += w;
      if (up > 0) { top += l * w; topW += w; } else { bottom += l * w; bottomW += w; }
    }
  }
  return { mean: sum / weight, top: top / topW, bottom: bottom / bottomW };
}

function texelMaxLuma(faces: readonly Uint16Array[]): number {
  let max = 0;
  for (const face of faces) {
    for (let i = 0; i < face.length; i += 4) {
      max = Math.max(max, luma(halfToFloat(face[i]!), halfToFloat(face[i + 1]!), halfToFloat(face[i + 2]!)));
    }
  }
  return max;
}

function mipStats(gl: WebGL2RenderingContext, grid: WebGLProgram, texture: WebGLTexture, cube: CubeLevels): MipStats[] {
  return cube.levels.map((faces, mip) => {
    const { mean, top, bottom } = gridLuma(sampleGrid(gl, grid, texture, mip, GRID_W, GRID_H), GRID_W, GRID_H);
    return { mip, faceSize: Math.max(1, cube.faceSize >> mip), meanLuma: mean, maxLuma: texelMaxLuma(faces), topLuma: top, bottomLuma: bottom };
  });
}

/** Pearson correlation of log-luma: GPU mip-0 cube sample vs CPU source equirect, same directions. */
function orientation(gl: WebGL2RenderingContext, grid: WebGLProgram, texture: WebGLTexture, image: HdrImage): number {
  const gpu = sampleGrid(gl, grid, texture, 0, ORIENT_W, ORIENT_H);
  const a: number[] = [];
  const b: number[] = [];
  for (let row = 0; row < ORIENT_H; row += 1) {
    for (let col = 0; col < ORIENT_W; col += 1) {
      const i = (row * ORIENT_W + col) * 4;
      const [r, g, bl] = sampleEquirect(image, gridDirection(col, row, ORIENT_W, ORIENT_H));
      a.push(Math.log(luma(gpu[i]!, gpu[i + 1]!, gpu[i + 2]!) + 1e-4));
      b.push(Math.log(luma(r, g, bl) + 1e-4));
    }
  }
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const ma = mean(a), mb = mean(b);
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < a.length; i += 1) {
    cov += (a[i]! - ma) * (b[i]! - mb);
    va += (a[i]! - ma) ** 2;
    vb += (b[i]! - mb) ** 2;
  }
  return cov / Math.sqrt(va * vb);
}

/** Mean linear luma and Laplacian HF energy over the sphere disc (alpha marks inside). */
function sphereWindow(data: Float32Array, size: number, roughness: number): SphereWindow {
  const l = new Float32Array(size * size);
  const inside = new Uint8Array(size * size);
  let sum = 0, count = 0;
  for (let i = 0; i < size * size; i += 1) {
    if (data[i * 4 + 3]! > 0.5) {
      inside[i] = 1;
      l[i] = luma(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!);
      sum += l[i]!; count += 1;
    }
  }
  let hf = 0, hfCount = 0;
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const i = y * size + x;
      if (!inside[i] || !inside[i - 1] || !inside[i + 1] || !inside[i - size] || !inside[i + size]) continue;
      hf += Math.abs(4 * l[i]! - l[i - 1]! - l[i + 1]! - l[i - size]! - l[i + size]!);
      hfCount += 1;
    }
  }
  return { roughness, meanLuma: sum / Math.max(1, count), hf: hf / Math.max(1, hfCount), pixels: count };
}

function auraMirrorProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const ibl = shaderChunk("a3d_prd02_lighting_ibl");
  if (!ibl) throw new Error("a3d_prd02_lighting_ibl chunk not registered");
  const linked = linkQuadProgram(gl, `#version 300 es
precision highp float;
precision highp int;
${ibl.glsl}
uniform float u_roughness;
uniform float u_sphereSize;
layout(location = 0) out vec4 fragColor;
void main() {
  vec2 p = gl_FragCoord.xy / u_sphereSize * 2.0 - 1.0;
  float rr = dot(p, p);
  if (rr > 1.0) { fragColor = vec4(0.0); return; }
  vec3 n = vec3(p, sqrt(1.0 - rr));
  vec3 v = vec3(0.0, 0.0, 1.0);
  fragColor = vec4(a3dEnvSpecularRadiance(n, v, u_roughness), 1.0);
}
`);
  if (!linked.ok || !linked.program) throw new Error(`mirror-sphere program: ${linked.log}`);
  return linked.program;
}

function auraMirrorWindows(gl: WebGL2RenderingContext, program: WebGLProgram, texture: WebGLTexture, mipCount: number): SphereWindow[] {
  return PARITY_ROUGHNESS.map((roughness) => sphereWindow(renderFloat(gl, program, SPHERE, SPHERE, (p) => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
    gl.uniform1i(gl.getUniformLocation(p, "u_envSpecular"), 0);
    gl.uniform1f(gl.getUniformLocation(p, "u_envMipCount"), mipCount);
    gl.uniform1f(gl.getUniformLocation(p, "u_envRotation"), 0);
    gl.uniform1f(gl.getUniformLocation(p, "u_envSpecularIntensity"), 1);
    gl.uniform1f(gl.getUniformLocation(p, "u_roughness"), roughness);
    gl.uniform1f(gl.getUniformLocation(p, "u_sphereSize"), SPHERE);
  }), SPHERE, roughness));
}

/** Read a probe's specular cube as half-float levels (face order = CUBE_FACE_ORDER = GL order). */
function probeCube(probe: EnvironmentProbe): CubeLevels {
  const faces = probe.specularCube.cubeFaces;
  const order = ["px", "nx", "py", "ny", "pz", "nz"] as const;
  const levels: Uint16Array[][] = [];
  for (let mip = 0; mip < probe.mipCount; mip += 1) {
    levels.push(order.map((name) => {
      const data = faces.find((face) => face.face === name)?.mipLevels[mip]?.data;
      if (!(data instanceof Uint16Array)) throw new Error(`probe cube ${name} mip ${mip} is not half-float`);
      return data;
    }));
  }
  return { levels, faceSize: probe.faceSize };
}

/** Pre-C-09 PMREM path (0.82 wide-lobe blend toward the unweighted average). */
function legacyCube(image: HdrImage, faceSize: number): CubeLevels {
  const rgba = new Float32Array(image.width * image.height * 4);
  for (let i = 0; i < image.width * image.height; i += 1) {
    rgba[i * 4] = image.data[i * 3]!;
    rgba[i * 4 + 1] = image.data[i * 3 + 1]!;
    rgba[i * 4 + 2] = image.data[i * 3 + 2]!;
    rgba[i * 4 + 3] = 1;
  }
  const resources = generateCubemapPMREMResources({ width: image.width, height: image.height, data: rgba }, { faceSize });
  return { levels: resources.levels.map((level) => level.faces.map((face) => face.data)), faceSize };
}

/**
 * three r185 reference: HDRLoader + PMREMGenerator.fromEquirectangular (same
 * calls as three/common.ts), mirror sphere sampled through three's own
 * `textureCubeUV` with the same r⁴ reflection bend as `a3dEnvSpecularRadiance`
 * (three getIBLRadiance). No tone mapping / output colour space chunk: linear.
 */
async function threeMirrorWindows(bytes: Uint8Array): Promise<{ windows: SphereWindow[]; cubeUvHeight: number }> {
  const canvas = document.createElement("canvas");
  canvas.width = SPHERE;
  canvas.height = SPHERE;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  try {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const equirect = new HDRLoader().createDataTexture(buffer);
    equirect.mapping = THREE.EquirectangularReflectionMapping;
    const generator = new THREE.PMREMGenerator(renderer);
    const pmrem = generator.fromEquirectangular(equirect).texture;
    generator.dispose();
    const imageHeight = (pmrem.image as { height: number }).height;
    const maxMip = Math.log2(imageHeight) - 2;
    const literal = (value: number) => (Number.isInteger(value) ? `${value}.0` : `${value}`);
    const material = new THREE.ShaderMaterial({
      defines: {
        ENVMAP_TYPE_CUBE_UV: "",
        CUBEUV_TEXEL_WIDTH: literal(1 / (3 * Math.max(2 ** maxMip, 7 * 16))),
        CUBEUV_TEXEL_HEIGHT: literal(1 / imageHeight),
        CUBEUV_MAX_MIP: literal(maxMip)
      },
      uniforms: { envMap: { value: pmrem }, roughness: { value: 0 } },
      vertexShader: "varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: `#include <common>
#include <cube_uv_reflection_fragment>
uniform sampler2D envMap;
uniform float roughness;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float rr = dot(p, p);
  if (rr > 1.0) { gl_FragColor = vec4(0.0); return; }
  vec3 n = vec3(p, sqrt(1.0 - rr));
  vec3 v = vec3(0.0, 0.0, 1.0);
  vec3 R = normalize(mix(reflect(-v, n), n, pow4(roughness)));
  gl_FragColor = vec4(textureCubeUV(envMap, R, roughness).rgb, 1.0);
}`,
      depthTest: false,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    mesh.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(mesh);
    const camera = new THREE.Camera();
    const target = new THREE.WebGLRenderTarget(SPHERE, SPHERE, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false });
    const windows: SphereWindow[] = [];
    for (const roughness of PARITY_ROUGHNESS) {
      material.uniforms.roughness!.value = roughness;
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);
      const out = new Float32Array(SPHERE * SPHERE * 4);
      renderer.readRenderTargetPixels(target, 0, 0, SPHERE, SPHERE, out);
      windows.push(sphereWindow(out, SPHERE, roughness));
    }
    renderer.setRenderTarget(null);
    target.dispose();
    return { windows, cubeUvHeight: imageHeight };
  } finally {
    renderer.dispose();
  }
}

function measure(gl: WebGL2RenderingContext, grid: WebGLProgram, mirror: WebGLProgram, cube: CubeLevels, image: HdrImage) {
  const texture = uploadHalfCube(gl, cube);
  const result = {
    mipCount: cube.levels.length,
    faceSize: cube.faceSize,
    stats: mipStats(gl, grid, texture, cube),
    orientation: orientation(gl, grid, texture, image),
    mirror: auraMirrorWindows(gl, mirror, texture, cube.levels.length)
  };
  gl.deleteTexture(texture);
  return result;
}

async function run(): Promise<void> {
  const canvas = document.getElementById("harness") as HTMLCanvasElement | null;
  const gl = canvas?.getContext("webgl2");
  if (!gl) throw new Error("WebGL2 unavailable");
  requireFloatTargets(gl);
  const url = hdriAssets.studioSmall08.url;
  const bytes = await fetchBytes(url);
  const image = decodeHdrEquirect(bytes);
  const device = new MockRenderDevice();
  const key = { url, tier: "high" as const };

  const realFactory = environmentProbeFactorySlot.get(LIGHTING_ON)(device);
  const probe = await defaultProbeLoader(realFactory)(key);

  let stub: { threw: boolean; message: string };
  try {
    await defaultProbeLoader(environmentProbeFactorySlot.get(LIGHTING_OFF)(device))(key);
    stub = { threw: false, message: "" };
  } catch (error) {
    stub = { threw: true, message: String(error instanceof Error ? error.message : error) };
  }

  const gridLinked = linkQuadProgram(gl, GRID_FS);
  if (!gridLinked.ok || !gridLinked.program) throw new Error(`grid program: ${gridLinked.log}`);
  const mirror = auraMirrorProgram(gl);
  const real = { source: probe.source, ...measure(gl, gridLinked.program, mirror, probeCube(probe), image) };
  const legacy = measure(gl, gridLinked.program, mirror, legacyCube(image, probe.faceSize), image);
  const three = await threeMirrorWindows(bytes);
  probe.dispose();
  window.__A3D_PRD02_PMREM__ = { status: "ready", hdri: url, real, legacy, three, stub };
}

run().catch((error: unknown) => {
  window.__A3D_PRD02_PMREM__ = { status: "error", error: String(error instanceof Error ? error.stack ?? error : error) };
});
