/**
 * prd02 SH9 sky-tint harness page (02-T1936, PRD-02 Phase 3 "SH binding for
 * chunk programs" row). Built into the lane bundle (vite.lane.config.ts input
 * `sh9`) and driven by tests/qr/prd02/browser/sh9.spec.ts on macos-14.
 *
 * prd02-13's HDRI (kloppenheim06Puresky) goes through the production HDRI
 * path (C-09 real factory via `defaultProbeLoader`), whose `probe.sh9` is the
 * lane's corrected cube→SH9 projection. A white Lambert sphere (albedo 1,
 * orthographic front view, y up) is then shaded by E(n)/π through BOTH SH
 * chunk entry points, each bound the way the engine binds it:
 *  - `a3d_prd02_sh9` → `a3d_sh9Irradiance(n)`, u_sh9Texture = `sh9ToTexture`;
 *  - `a3d_prd02_lighting_ibl` → `a3dSH9Irradiance(n)`, u_envSH[7] = `packEnvSH`.
 *
 * Controls (same programs): the neutral floor SH (`NEUTRAL_FLOOR_SH9`, grey)
 * and the HDRI SH flipped upside down (y-odd coefficients negated).
 *
 * Publishes `window.__A3D_PRD02_SH9__` with top (n.y > 0.7) and bottom
 * (n.y < -0.7) region mean linear RGB per path and per SH input.
 */
import "../../../../packages/rendering/src/lanes/prd02";
import type { QrFlags } from "../../../../packages/rendering/src/contracts/core";
import { environmentProbeFactorySlot } from "../../../../packages/rendering/src/contracts/environment";
import { shaderChunk } from "../../../../packages/rendering/src/contracts/program";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { defaultProbeLoader } from "../../../../packages/rendering/src/environment/EnvironmentCache";
import { packEnvSH } from "../../../../packages/rendering/src/environment/EnvUniforms";
import { NEUTRAL_FLOOR_SH9, sh9ToTexture } from "../../../../packages/rendering/src/environment/probeBuild";
import { hdriAssets } from "../../shared/assets";
import { linkQuadProgram, luma, renderFloat, requireFloatTargets } from "./gl-harness";

declare global {
  interface Window {
    __A3D_PRD02_SH9__?: unknown;
  }
}

const SIZE = 128;
const LIGHTING_ON: QrFlags = { values: { A3D_QR_LIGHTING: true }, on: (name) => name === "A3D_QR_LIGHTING" };

type Rgb = readonly [number, number, number];

interface SphereRegions {
  readonly top: Rgb;
  readonly bottom: Rgb;
  readonly topLuma: number;
  readonly bottomLuma: number;
  readonly topBlueOverRed: number;
}

function sphereFragment(chunkGlsl: string, irradianceCall: string): string {
  return `#version 300 es
precision highp float;
precision highp int;
${chunkGlsl}
uniform float u_size;
layout(location = 0) out vec4 fragColor;
void main() {
  vec2 p = gl_FragCoord.xy / u_size * 2.0 - 1.0;
  float rr = dot(p, p);
  if (rr > 1.0) { fragColor = vec4(0.0); return; }
  vec3 n = vec3(p, sqrt(1.0 - rr));
  // White Lambert: albedo 1, f = 1/π.
  fragColor = vec4(${irradianceCall}(n) / 3.14159265358979, 1.0);
}
`;
}

/** Region means over the sphere disc: top n.y > 0.7, bottom n.y < -0.7 (n.y = p.y). */
function regions(data: Float32Array): SphereRegions {
  const top = [0, 0, 0];
  const bottom = [0, 0, 0];
  let topCount = 0, bottomCount = 0;
  for (let y = 0; y < SIZE; y += 1) {
    const ny = ((y + 0.5) / SIZE) * 2 - 1;
    for (let x = 0; x < SIZE; x += 1) {
      const i = (y * SIZE + x) * 4;
      if (data[i + 3]! < 0.5) continue;
      const target = ny > 0.7 ? top : ny < -0.7 ? bottom : null;
      if (!target) continue;
      target[0] += data[i]!; target[1] += data[i + 1]!; target[2] += data[i + 2]!;
      if (target === top) topCount += 1; else bottomCount += 1;
    }
  }
  const t: Rgb = [top[0]! / topCount, top[1]! / topCount, top[2]! / topCount];
  const b: Rgb = [bottom[0]! / bottomCount, bottom[1]! / bottomCount, bottom[2]! / bottomCount];
  return { top: t, bottom: b, topLuma: luma(...t), bottomLuma: luma(...b), topBlueOverRed: t[2] / t[0] };
}

/** a3d_prd02_sh9 path: radiance SH in a 9×1 RGBA32F strip (texelFetch). */
function shadeViaShTexture(gl: WebGL2RenderingContext, program: WebGLProgram, sh9: Float32Array): SphereRegions {
  const strip = sh9ToTexture(sh9).data as Float32Array;
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, 9, 1);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 9, 1, gl.RGBA, gl.FLOAT, strip);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const out = renderFloat(gl, program, SIZE, SIZE, (p) => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(gl.getUniformLocation(p, "u_sh9Texture"), 0);
    gl.uniform1i(gl.getUniformLocation(p, "u_sh9Bound"), 1);
    gl.uniform1f(gl.getUniformLocation(p, "u_size"), SIZE);
  });
  gl.deleteTexture(texture);
  return regions(out);
}

/** a3d_prd02_lighting_ibl path: u_envSH[7] exactly as packA3DEnvironmentUniforms uploads it. */
function shadeViaEnvSH(gl: WebGL2RenderingContext, program: WebGLProgram, sh9: Float32Array): SphereRegions {
  return regions(renderFloat(gl, program, SIZE, SIZE, (p) => {
    gl.uniform4fv(gl.getUniformLocation(p, "u_envSH"), packEnvSH(sh9));
    gl.uniform1f(gl.getUniformLocation(p, "u_size"), SIZE);
  }));
}

/** Rotate the SH 180° about x (y → −y, z → −z): negate coefficients odd in y·z parity. */
function upsideDown(sh9: Float32Array): Float32Array {
  // Contract order: c0, −c1·y, c1·z, −c1·x, c2·xy, c2·yz, c3·(3z²−1), c2·xz, c4·(x²−y²).
  // Under (x, y, z) → (x, −y, −z): y, z, xy, xz flip sign; yz, 3z²−1, x²−y² keep it.
  const flip = [1, -1, -1, 1, -1, 1, 1, -1, 1];
  const out = new Float32Array(27);
  for (let k = 0; k < 9; k += 1) {
    for (let c = 0; c < 3; c += 1) out[k * 3 + c] = sh9[k * 3 + c]! * flip[k]!;
  }
  return out;
}

async function run(): Promise<void> {
  const canvas = document.getElementById("harness") as HTMLCanvasElement | null;
  const gl = canvas?.getContext("webgl2");
  if (!gl) throw new Error("WebGL2 unavailable");
  requireFloatTargets(gl);
  const sh9Chunk = shaderChunk("a3d_prd02_sh9");
  const iblChunk = shaderChunk("a3d_prd02_lighting_ibl");
  if (!sh9Chunk || !iblChunk) throw new Error("a3d_prd02_sh9 / a3d_prd02_lighting_ibl chunk not registered");
  const viaTexture = linkQuadProgram(gl, sphereFragment(sh9Chunk.glsl, "a3d_sh9Irradiance"));
  const viaEnvSH = linkQuadProgram(gl, sphereFragment(iblChunk.glsl, "a3dSH9Irradiance"));
  if (!viaTexture.program || !viaEnvSH.program) throw new Error(`sphere programs: ${viaTexture.log}${viaEnvSH.log}`);

  const url = hdriAssets.kloppenheim06Puresky.url;
  const factory = environmentProbeFactorySlot.get(LIGHTING_ON)(new MockRenderDevice());
  const probe = await defaultProbeLoader(factory)({ url, tier: "high" });
  const inputs: Record<string, Float32Array> = {
    hdri: probe.sh9,
    neutral: new Float32Array(NEUTRAL_FLOOR_SH9),
    upsideDown: upsideDown(probe.sh9)
  };
  const shaded: Record<string, { sh9Texture: SphereRegions; envSH: SphereRegions }> = {};
  for (const [name, sh9] of Object.entries(inputs)) {
    shaded[name] = { sh9Texture: shadeViaShTexture(gl, viaTexture.program, sh9), envSH: shadeViaEnvSH(gl, viaEnvSH.program, sh9) };
  }
  window.__A3D_PRD02_SH9__ = { status: "ready", hdri: url, probeSource: probe.source, sh9: Array.from(probe.sh9), shaded };
  probe.dispose();
}

run().catch((error: unknown) => {
  window.__A3D_PRD02_SH9__ = { status: "error", error: String(error instanceof Error ? error.stack ?? error : error) };
});
