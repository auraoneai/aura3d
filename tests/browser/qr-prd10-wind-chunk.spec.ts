import { test, expect } from "@playwright/test";
import { a3d_prd10_wind } from "../../packages/rendering/src/world/vegetation/shaders/wind";
import { windOffsetCpu } from "../../packages/rendering/src/world/vegetation/WindCpu";
import { packWindUbo } from "../../packages/rendering/src/world/vegetation/WindField";

/**
 * PRD-10 S7 — `a3dWindOffset` (the registered `a3d_prd10_wind` GLSL) evaluated
 * on the GPU through transform feedback vs the CPU twin `windOffsetCpu`:
 * component error ≤ 1e-4 and |bent| − |local| ≤ 1e-4 (length preservation).
 * No skip path: a runner without WebGL2 fails this spec (P-22).
 */

const GUST_R = 153; // 1×1 RG8 gust texel → texture().r = 153/255 everywhere

interface Sample {
  readonly local: [number, number, number];
  readonly origin: [number, number, number];
  readonly weights: [number, number, number, number];
  readonly height: number;
}

function samples(): Sample[] {
  const out: Sample[] = [];
  let s = 0x2545f491;
  const rnd = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
  for (let i = 0; i < 256; i += 1) {
    const height = 0.5 + rnd() * 6;
    out.push({
      local: [(rnd() - 0.5) * 2, 0.05 + rnd() * height, (rnd() - 0.5) * 2],
      origin: [(rnd() - 0.5) * 200, 0, (rnd() - 0.5) * 200],
      weights: [rnd(), rnd(), rnd(), 1],
      height
    });
  }
  return out;
}

const VERTEX = `#version 300 es
precision highp float;
${a3d_prd10_wind.glsl}
in vec3 a_local;
in vec3 a_origin;
in vec4 a_weights;
in float a_height;
out vec3 v_offset;
void main() {
  v_offset = a3dWindOffset(a_local, a_origin, a_weights, a_height);
  gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
}
`;

const FRAGMENT = `#version 300 es
precision highp float;
out vec4 fragColor;
void main() { fragColor = vec4(1.0); }
`;

for (const [label, strength, gust, time] of [
  ["calm", 0.4, 0.2, 1.25],
  ["storm", 2.5, 1.5, 17.5]
] as const) {
  test(`a3dWindOffset GPU matches windOffsetCpu ≤ 1e-4 (${label})`, async ({ page }) => {
    await page.goto("about:blank");
    const data = samples();
    const ubo = Array.from(packWindUbo({ direction: [0.8, 0, 0.6], strength, gust, gustFrequency: 0.05, turbulence: 0 }, time));
    const result = await page.evaluate(
      ({ vs, fs, ubo, data, gustR }) => {
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
        gl.transformFeedbackVaryings(prog, ["v_offset"], gl.SEPARATE_ATTRIBS);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return { error: gl.getProgramInfoLog(prog) ?? "link" };
        gl.useProgram(prog);

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const attrib = (name: string, size: number, pick: (d: (typeof data)[number]) => number[]): void => {
          const loc = gl.getAttribLocation(prog, name);
          if (loc < 0) throw new Error(`attribute ${name} not active`);
          const buf = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.flatMap(pick)), gl.STATIC_DRAW);
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
        };
        attrib("a_local", 3, (d) => d.local);
        attrib("a_origin", 3, (d) => d.origin);
        attrib("a_weights", 4, (d) => d.weights);
        attrib("a_height", 1, (d) => [d.height]);

        const block = gl.getUniformBlockIndex(prog, "A3DWind");
        gl.uniformBlockBinding(prog, block, 0);
        const ub = gl.createBuffer();
        gl.bindBuffer(gl.UNIFORM_BUFFER, ub);
        gl.bufferData(gl.UNIFORM_BUFFER, new Float32Array(ubo), gl.STATIC_DRAW);
        gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ub);

        const tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, 1, 1, 0, gl.RG, gl.UNSIGNED_BYTE, new Uint8Array([gustR, 0]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.uniform1i(gl.getUniformLocation(prog, "u_windNoise"), 0);

        const out = gl.createBuffer();
        gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, out);
        gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, data.length * 12, gl.STATIC_READ);
        const tf = gl.createTransformFeedback();
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, out);
        gl.enable(gl.RASTERIZER_DISCARD);
        gl.beginTransformFeedback(gl.POINTS);
        gl.drawArrays(gl.POINTS, 0, data.length);
        gl.endTransformFeedback();
        gl.disable(gl.RASTERIZER_DISCARD);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
        const result = new Float32Array(data.length * 3);
        gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, out);
        gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, result);
        const err = gl.getError();
        return { offsets: Array.from(result), glError: err };
      },
      { vs: VERTEX, fs: FRAGMENT, ubo, data, gustR: GUST_R }
    );

    expect("error" in result ? result.error : null, "CI runner must expose WebGL2 and compile the chunk").toBeNull();
    const { offsets, glError } = result as { offsets: number[]; glError: number };
    expect(glError).toBe(0);
    let maxErr = 0;
    let maxLen = 0;
    let moved = 0;
    data.forEach((d, i) => {
      const cpu = windOffsetCpu(ubo, d.local, d.origin, d.weights, d.height, GUST_R / 255);
      const gpu = [offsets[i * 3]!, offsets[i * 3 + 1]!, offsets[i * 3 + 2]!];
      for (let c = 0; c < 3; c += 1) maxErr = Math.max(maxErr, Math.abs(gpu[c]! - cpu[c]!));
      const lenLocal = Math.hypot(...d.local);
      const lenBent = Math.hypot(d.local[0] + gpu[0]!, d.local[1] + gpu[1]!, d.local[2] + gpu[2]!);
      maxLen = Math.max(maxLen, Math.abs(lenBent - lenLocal));
      if (Math.hypot(...gpu) > 1e-3) moved += 1;
    });
    console.log(`[S7 ${label}] maxComponentErr=${maxErr.toExponential(3)} maxLengthErr=${maxLen.toExponential(3)} moved=${moved}/${data.length}`);
    expect(maxErr).toBeLessThanOrEqual(1e-4);
    expect(maxLen).toBeLessThanOrEqual(1e-4);
    expect(moved, "wind must move most vertices (not a trivially-zero pass)").toBeGreaterThan(data.length / 2);
  });
}
