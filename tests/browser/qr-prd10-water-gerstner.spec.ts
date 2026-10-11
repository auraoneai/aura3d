import { test, expect } from "@playwright/test";
import { a3d_prd10_gerstner } from "../../packages/rendering/src/world/water/shaders/gerstner";
import { gerstnerEvaluate, packGerstnerWaves, GERSTNER_PRESETS } from "../../packages/rendering/src/world/water/GerstnerWaves";

/**
 * PRD-10 S9 (vertex half) — `a3dGerstner` (the registered `a3d_prd10_gerstner`
 * GLSL) evaluated on the GPU through transform feedback vs the CPU twin
 * `gerstnerEvaluate` that backs `AuraWaterHandle.heightAt`: displaced height
 * ≤ 1e-3 m, displaced xz ≤ 1e-3 m, normal ≤ 1e-3, crest ≤ 1e-3, for the three
 * presets. No skip path: a runner without WebGL2 fails this spec (P-22).
 */

const VERTEX = `#version 300 es
precision highp float;
${a3d_prd10_gerstner.glsl}
in vec2 a_xz;
out vec3 v_position;
out vec3 v_normal;
out float v_crest;
void main() {
  vec3 n;
  v_position = a3dGerstner(a_xz, n);
  v_normal = n;
  v_crest = a3dGerstnerCrest(a_xz);
  gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
}
`;

const FRAGMENT = `#version 300 es
precision highp float;
out vec4 fragColor;
void main() { fragColor = vec4(1.0); }
`;

function grid(): number[] {
  const out: number[] = [];
  for (let z = -40; z <= 40; z += 5) for (let x = -40; x <= 40; x += 5) out.push(x + 0.37, z - 0.61);
  return out;
}

for (const preset of ["calm", "moderate", "rough"] as const) {
  test(`a3dGerstner GPU matches gerstnerEvaluate ≤ 1e-3 (${preset})`, async ({ page }) => {
    await page.goto("about:blank");
    const packed = packGerstnerWaves(GERSTNER_PRESETS[preset]);
    const time = 3.75;
    const xz = grid();
    const result = await page.evaluate(
      ({ vs, fs, waves, speed, count, time, xz }) => {
        const gl = document.createElement("canvas").getContext("webgl2");
        if (!gl) return { error: "no-webgl2" as const };
        const shader = (type: number, src: string): WebGLShader => {
          const sh = gl.createShader(type)!;
          gl.shaderSource(sh, src);
          gl.compileShader(sh);
          if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "compile");
          return sh;
        };
        const prog = gl.createProgram()!;
        gl.attachShader(prog, shader(gl.VERTEX_SHADER, vs));
        gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, fs));
        gl.transformFeedbackVaryings(prog, ["v_position", "v_normal", "v_crest"], gl.INTERLEAVED_ATTRIBS);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return { error: gl.getProgramInfoLog(prog) ?? "link" };
        gl.useProgram(prog);
        gl.uniform4fv(gl.getUniformLocation(prog, "u_waves"), new Float32Array(waves));
        gl.uniform1fv(gl.getUniformLocation(prog, "u_waveSpeed"), new Float32Array(speed));
        gl.uniform1i(gl.getUniformLocation(prog, "u_waveCount"), count);
        gl.uniform1f(gl.getUniformLocation(prog, "u_time"), time);

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const loc = gl.getAttribLocation(prog, "a_xz");
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(xz), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

        const n = xz.length / 2;
        const out = gl.createBuffer();
        gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, out);
        gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, n * 7 * 4, gl.STATIC_READ);
        const tf = gl.createTransformFeedback();
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, out);
        gl.enable(gl.RASTERIZER_DISCARD);
        gl.beginTransformFeedback(gl.POINTS);
        gl.drawArrays(gl.POINTS, 0, n);
        gl.endTransformFeedback();
        gl.disable(gl.RASTERIZER_DISCARD);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
        const data = new Float32Array(n * 7);
        gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, out);
        gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, data);
        return { values: Array.from(data), glError: gl.getError() };
      },
      { vs: VERTEX, fs: FRAGMENT, waves: Array.from(packed.waves), speed: Array.from(packed.waveSpeed), count: packed.waveCount, time, xz }
    );

    expect("error" in result ? result.error : null, "CI runner must expose WebGL2 and compile the chunk").toBeNull();
    const { values, glError } = result as { values: number[]; glError: number };
    expect(glError).toBe(0);
    let maxH = 0;
    let maxXz = 0;
    let maxN = 0;
    let maxCrest = 0;
    let amplitude = 0;
    for (let i = 0; i < xz.length / 2; i += 1) {
      const cpu = gerstnerEvaluate(packed, xz[i * 2]!, xz[i * 2 + 1]!, time);
      const g = values.slice(i * 7, i * 7 + 7);
      maxH = Math.max(maxH, Math.abs(g[1]! - cpu.position[1]));
      maxXz = Math.max(maxXz, Math.abs(g[0]! - cpu.position[0]), Math.abs(g[2]! - cpu.position[2]));
      for (let c = 0; c < 3; c += 1) maxN = Math.max(maxN, Math.abs(g[3 + c]! - cpu.normal[c]!));
      maxCrest = Math.max(maxCrest, Math.abs(g[6]! - cpu.crest));
      amplitude = Math.max(amplitude, Math.abs(cpu.position[1]));
    }
    console.log(`[S9 ${preset}] height=${maxH.toExponential(3)} xz=${maxXz.toExponential(3)} normal=${maxN.toExponential(3)} crest=${maxCrest.toExponential(3)} amp=${amplitude.toFixed(3)}`);
    expect(amplitude, "waves must displace the surface (not a trivially-flat pass)").toBeGreaterThan(0.05);
    expect(maxH).toBeLessThanOrEqual(1e-3);
    expect(maxXz).toBeLessThanOrEqual(1e-3);
    expect(maxN).toBeLessThanOrEqual(1e-3);
    expect(maxCrest).toBeLessThanOrEqual(1e-3);
  });
}
