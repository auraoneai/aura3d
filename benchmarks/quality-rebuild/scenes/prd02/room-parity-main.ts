/**
 * prd02 RoomEnvironment parity harness page (E3 stage-2b step 6;
 * E3-STAGE2B-TRACE.md §5). Built into the lane bundle (vite.lane.config.ts
 * input `roomParity`) and driven by
 * tests/qr/prd02/browser/room-environment-parity.spec.ts.
 *
 * The float-readback twin of the tonemapped benchmark scene
 * `19-room-environment-parity`: same neutral r185 room, same roughness axis,
 * but measured as linear luma before any tone mapping (the trace's warning
 * that tonemapped LPIPS alone can hide a large ambient error). Mirror-sphere
 * machinery is pmrem-main.ts's (02-S7), retargeted from an HDRI to the room:
 *
 *  - `production`: `buildNeutralRoomLegacyProbe()` — the exact probe the
 *    production renderer binds for a marked-fallback (no authored
 *    environment) scene (renderer/Background.ts `prd02NeutralFloor`):
 *    analytic room faces, box mips, SH9-irradiance last level, no GGX
 *    prefilter. This is the subject the benchmark Aura frame renders.
 *  - `prefiltered`: the C-09 factory's `neutral("high")` — same analytic
 *    room faces through the CPU GGX prefilter. Reported alongside so a
 *    failure of `production` can be attributed (probe construction vs
 *    analytic radiance) without a second run.
 *  - `three`: three r185 `PMREMGenerator.fromScene(new RoomEnvironment(),
 *    0.04)` — the identical call the benchmark three arm makes in
 *    three/lib/showcase.ts — sampled through three's own `textureCubeUV`.
 *  - `analyticMeanLuma`: solid-angle-weighted mean luma of
 *    `sampleRoomEnvironment` over a 256x128 lat-long grid, computed here in
 *    JS. Derivation of the spec's roughness-1 oracle: at roughness 1 the
 *    reflection bend (r^4 = 1 in both `a3dEnvSpecularRadiance` and three's
 *    getIBLRadiance) makes R = N and both samplers read their roughest mip,
 *    whose texels are (to prefilter accuracy) the solid-angle average
 *    radiance; the sphere-disc mean of a near-constant roughest mip is that
 *    average. So each engine's roughness-1 window must sit within the
 *    spec's ±10% band of this number — no fitted constants anywhere.
 *
 * Publishes `window.__A3D_PRD02_ROOM_PARITY__`.
 */
import "../../../../packages/rendering/src/lanes/prd02";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { environmentProbeFactorySlot, type EnvironmentProbe } from "../../../../packages/rendering/src/contracts/environment";
import type { QrFlags } from "../../../../packages/rendering/src/contracts/core";
import { shaderChunk } from "../../../../packages/rendering/src/contracts/program";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { buildNeutralRoomLegacyProbe } from "../../../../packages/rendering/src/environment/probeBuild";
import { sampleRoomEnvironment } from "../../../../packages/rendering/src/environment/RoomEnvironmentScene";
import { linkQuadProgram, luma, renderFloat, requireFloatTargets, uploadHalfCube, type CubeLevels } from "./gl-harness";

declare global {
  interface Window {
    __A3D_PRD02_ROOM_PARITY__?: unknown;
  }
}

const PARITY_ROUGHNESS = [0, 0.25, 0.5, 0.75, 1] as const;
const SPHERE = 256;

const LIGHTING_ON: QrFlags = { values: { A3D_QR_LIGHTING: true }, on: (name) => name === "A3D_QR_LIGHTING" };

interface SphereWindow {
  readonly roughness: number;
  readonly meanLuma: number;
  readonly hf: number;
  readonly pixels: number;
}

/** Mean linear luma and Laplacian HF energy over the sphere disc (alpha marks inside). Verbatim from pmrem-main.ts. */
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

/** Read a probe's specular cube as half-float levels (face order = GL order). Verbatim from pmrem-main.ts. */
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

function measureProbe(gl: WebGL2RenderingContext, mirror: WebGLProgram, probe: EnvironmentProbe) {
  const cube = probeCube(probe);
  const texture = uploadHalfCube(gl, cube);
  const windows = auraMirrorWindows(gl, mirror, texture, cube.levels.length);
  gl.deleteTexture(texture);
  return { source: probe.source, mipCount: cube.levels.length, faceSize: cube.faceSize, windows };
}

/**
 * three r185 reference: PMREMGenerator.fromScene(new RoomEnvironment(), 0.04)
 * (three/lib/showcase.ts verbatim), mirror sphere through three's own
 * `textureCubeUV` with the same r^4 bend. No tone mapping: linear readback.
 */
function threeMirrorWindows(): { windows: SphereWindow[]; cubeUvHeight: number } {
  const canvas = document.createElement("canvas");
  canvas.width = SPHERE;
  canvas.height = SPHERE;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  try {
    const generator = new THREE.PMREMGenerator(renderer);
    const pmrem = generator.fromScene(new RoomEnvironment(), 0.04).texture;
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

/** Solid-angle-weighted mean luma of the analytic room (see header derivation). */
function analyticMeanLuma(): number {
  const width = 256, height = 128;
  let sum = 0, weight = 0;
  for (let row = 0; row < height; row += 1) {
    const theta = ((row + 0.5) / height) * Math.PI;
    const w = Math.sin(theta);
    for (let col = 0; col < width; col += 1) {
      const phi = ((col + 0.5) / width) * 2 * Math.PI - Math.PI;
      const dir: [number, number, number] = [-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)];
      const [r, g, b] = sampleRoomEnvironment(dir);
      sum += luma(r, g, b) * w;
      weight += w;
    }
  }
  return sum / weight;
}

async function run(): Promise<void> {
  const canvas = document.getElementById("harness") as HTMLCanvasElement | null;
  const gl = canvas?.getContext("webgl2");
  if (!gl) throw new Error("WebGL2 unavailable");
  requireFloatTargets(gl);
  const mirror = auraMirrorProgram(gl);

  const productionProbe = buildNeutralRoomLegacyProbe();
  const production = measureProbe(gl, mirror, productionProbe);
  productionProbe.dispose();

  const factory = environmentProbeFactorySlot.get(LIGHTING_ON)(new MockRenderDevice());
  const prefilteredProbe = factory.neutral("high");
  const prefiltered = measureProbe(gl, mirror, prefilteredProbe);
  prefilteredProbe.dispose();

  const three = threeMirrorWindows();
  window.__A3D_PRD02_ROOM_PARITY__ = {
    status: "ready",
    analyticMeanLuma: analyticMeanLuma(),
    production,
    prefiltered,
    three
  };
}

run().catch((error: unknown) => {
  window.__A3D_PRD02_ROOM_PARITY__ = { status: "error", error: String(error instanceof Error ? error.stack ?? error : error) };
});
