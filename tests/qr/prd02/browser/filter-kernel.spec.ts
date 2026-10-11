/**
 * 02-T1945 — receiver filter kernels (PRD-02 §8.4, item 1945) on the
 * registered `a3d_prd02_shadow_lookup` chunk, in a real WebGL2 context.
 *
 * A 64² DEPTH_COMPONENT32F compare texture holds a vertical occluder edge at
 * u = 0.5 (left half depth 0 = occluded, right half depth 1 = lit; LINEAR +
 * COMPARE_REF_TO_TEXTURE / LEQUAL). Each program sweeps ±4 texels across the
 * edge (512 columns × 64 rows, averaged per column so three's per-pixel IGN
 * rotation integrates out) and reads the lit fraction back.
 *
 *  - filter `hard` (A3D_SHADOW_FILTER 1, single HW compare tap): a 2-texel
 *    bilinear transition — monotone, ≥ 8 distinct intermediate levels (not a
 *    1-texel step), total 2 %–98 % width between 0.75 and 2 texels.
 *  - Medium tier (pcf3 → A3D_SHADOW_FILTER 2, Castaño 5×5): 10–90 % penumbra
 *    ≥ three r185 `PCFShadowMap` `getShadow` (radius 1) on the same map.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const MAP = 64;
const COLUMNS = 512;
const ROWS = 64;
const SWEEP_TEXELS = 4;

async function loadAuraChunk(): Promise<string> {
  const { shaderChunk } = await import("../../../../packages/rendering/src/contracts/index.js");
  const { SHADOW_LOOKUP_CHUNK } = await import("../../../../packages/rendering/src/contracts/shadows.js");
  await import("../../../../packages/rendering/src/lanes/prd02.js");
  const glsl = shaderChunk(SHADOW_LOOKUP_CHUNK)?.glsl;
  if (!glsl) throw new Error(`${SHADOW_LOOKUP_CHUNK} is not registered by lanes/prd02`);
  return glsl;
}

/** three r185 PCF receive (sampler2DShadow `getShadow` + IGN + Vogel), verbatim from the pinned package. */
function loadThreePcf(): string {
  const source = readFileSync(resolve("node_modules/three/src/renderers/shaders/ShaderChunk/shadowmap_pars_fragment.glsl.js"), "utf8");
  const start = source.indexOf("float interleavedGradientNoise");
  const end = source.indexOf("#elif defined( SHADOWMAP_TYPE_VSM )");
  if (start < 0 || end < start) throw new Error("three r185 shadowmap_pars_fragment layout changed");
  // Drop the `#endif` / `#if defined( SHADOWMAP_TYPE_PCF )` guards between the helpers and getShadow.
  return source.slice(start, end).replace(/#endif|#if defined\( SHADOWMAP_TYPE_PCF \)/g, "");
}

const HEADER = "#version 300 es\nprecision highp float;\nprecision highp sampler2DShadow;\n";
const SWEEP = `
uniform float u_sweepTexels;
uniform float u_mapSize;
vec2 sweepUv() {
  float t = gl_FragCoord.x / ${COLUMNS}.0;
  return vec2(0.5 + (t * 2.0 - 1.0) * u_sweepTexels / u_mapSize, 0.5);
}
out vec4 fragColor;
`;

function auraProgram(chunk: string, filter: 1 | 2): string {
  return `${HEADER}#define A3D_SHADOW_FILTER ${filter}\n${chunk}\n${SWEEP}
void main() {
  float lit = a3d_shadowFiltered(u_prd02CascadeCompare0, vec3(sweepUv(), 0.5), 1.0 / u_mapSize);
  fragColor = vec4(lit, lit, lit, 1.0);
}`;
}

function threeProgram(pcf: string): string {
  return `${HEADER}#define PI2 6.283185307179586\nuniform highp sampler2DShadow u_prd02CascadeCompare0;\n${pcf}\n${SWEEP}
void main() {
  float lit = getShadow(u_prd02CascadeCompare0, vec2(u_mapSize), 1.0, 0.0, 1.0, vec4(sweepUv(), 0.5, 1.0));
  fragColor = vec4(lit, lit, lit, 1.0);
}`;
}

/** Render one sweep program; returns the per-column lit fraction (row-averaged). */
async function sweep(page: Page, fragment: string): Promise<number[]> {
  const result = await page.evaluate(runSweep, { fragment, map: MAP, columns: COLUMNS, rows: ROWS, sweepTexels: SWEEP_TEXELS });
  if (result.error || !result.columns) throw new Error(result.error ?? "no sweep result");
  return result.columns;
}

// Runs in the page (Playwright serializes it); keep it free of closures.
function runSweep(args: { fragment: string; map: number; columns: number; rows: number; sweepTexels: number }): { error?: string; columns?: number[] } {
  const canvas = document.createElement("canvas");
  canvas.width = args.columns;
  canvas.height = args.rows;
  const gl = canvas.getContext("webgl2", { antialias: false });
  if (!gl) return { error: "no webgl2" };
  const compile = (type: number, src: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "compile failed");
    return shader;
  };
  try {
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, "#version 300 es\nin vec2 a_p;\nvoid main(){gl_Position=vec4(a_p,0.0,1.0);}"));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, args.fragment));
    gl.bindAttribLocation(program, 0, "a_p");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return { error: gl.getProgramInfoLog(program) ?? "link failed" };
    const depth = new Float32Array(args.map * args.map);
    for (let y = 0; y < args.map; y += 1) for (let x = 0; x < args.map; x += 1) depth[y * args.map + x] = x < args.map / 2 ? 0 : 1;
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F, args.map, args.map, 0, gl.DEPTH_COMPONENT, gl.FLOAT, depth);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    const target = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, args.columns, args.rows);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, "u_prd02CascadeCompare0"), 0);
    gl.uniform1f(gl.getUniformLocation(program, "u_sweepTexels"), args.sweepTexels);
    gl.uniform1f(gl.getUniformLocation(program, "u_mapSize"), args.map);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, args.columns, args.rows);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const pixels = new Uint8Array(args.columns * args.rows * 4);
    gl.readPixels(0, 0, args.columns, args.rows, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const columns: number[] = [];
    for (let x = 0; x < args.columns; x += 1) {
      let sum = 0;
      for (let y = 0; y < args.rows; y += 1) sum += pixels[(y * args.columns + x) * 4]!;
      columns.push(sum / args.rows / 255);
    }
    return { columns };
  } catch (error) {
    return { error: String(error) };
  }
}

/** Width (texels) of the span where the profile is strictly between lo and hi. */
function spanTexels(profile: readonly number[], lo: number, hi: number): number {
  const first = profile.findIndex((v) => v > lo);
  let last = -1;
  for (let i = profile.length - 1; i >= 0; i -= 1) if (profile[i]! < hi) { last = i; break; }
  if (first < 0 || last < first) return 0;
  return ((last - first + 1) / profile.length) * 2 * SWEEP_TEXELS;
}

test.describe("02-T1945 shadow filter kernels", () => {
  test("hard filter gives a 2-texel bilinear edge; Medium penumbra >= three PCFShadowMap", async ({ page }, testInfo) => {
    await page.goto("about:blank");
    const chunk = await loadAuraChunk();
    const hard = await sweep(page, auraProgram(chunk, 1));
    const medium = await sweep(page, auraProgram(chunk, 2));
    const three = await sweep(page, threeProgram(loadThreePcf()));

    const intermediate = new Set(hard.filter((v) => v > 0.02 && v < 0.98).map((v) => v.toFixed(3)));
    let monotone = true;
    for (let i = 1; i < hard.length; i += 1) if (hard[i]! + 1e-3 < hard[i - 1]!) monotone = false;
    const report = {
      hardWidthTexels: spanTexels(hard, 0.02, 0.98),
      hardLevels: intermediate.size,
      hardMonotone: monotone,
      mediumPenumbraTexels: spanTexels(medium, 0.1, 0.9),
      threePcfPenumbraTexels: spanTexels(three, 0.1, 0.9),
      endpoints: { hard: [hard[0], hard[hard.length - 1]], medium: [medium[0], medium[medium.length - 1]], three: [three[0], three[three.length - 1]] }
    };
    await testInfo.attach("02-T1945-filter.json", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
    // The sweep must start fully occluded and end fully lit for every program.
    for (const profile of [hard, medium, three]) {
      expect(profile[0]!, JSON.stringify(report)).toBeLessThan(0.02);
      expect(profile[profile.length - 1]!, JSON.stringify(report)).toBeGreaterThan(0.98);
    }
    expect(report.hardMonotone, JSON.stringify(report)).toBe(true);
    expect(report.hardLevels, `hard edge is a bilinear ramp, not a step: ${JSON.stringify(report)}`).toBeGreaterThanOrEqual(8);
    expect(report.hardWidthTexels, JSON.stringify(report)).toBeGreaterThanOrEqual(0.75);
    expect(report.hardWidthTexels, JSON.stringify(report)).toBeLessThanOrEqual(2);
    expect(report.mediumPenumbraTexels, JSON.stringify(report)).toBeGreaterThanOrEqual(report.threePcfPenumbraTexels);
  });
});
