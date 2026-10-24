import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { ldrFragmentSource, type LdrProgramVariant } from "../../packages/rendering/src/webgl2/LdrPostprocessShader";

/**
 * The legacy LDR present pass used to be one uber-shader; it is now compiled per feature variant. Same source texture, same
 * uniforms: both programs must write the same bytes. Remote only: SPECS="tests/browser/ldr-variant-equivalence.spec.ts" tools/remote-acr/run.sh
 */
const OLD = readFileSync(resolve("tests/browser/ldr-uber-fragment-4.1.2.glsl.txt"), "utf8");

interface Case { name: string; variant: LdrProgramVariant; exposure: number; grade?: { contrast: number; temperature: number; tint: number; saturation: number; vibrance: number; vignette: number; sharpening: number }; fxaa?: { edge: number; blend: number } }

const base = { sharpening: false, grade: false, fxaa: false } as const;
const CASES: Case[] = [
  { name: "aces srgb-out", variant: { ...base, toneMapping: true, operator: 2, inputSrgb: false, outputSrgb: true }, exposure: 1 },
  { name: "aces srgb-in srgb-out", variant: { ...base, toneMapping: true, operator: 2, inputSrgb: true, outputSrgb: true }, exposure: 1 },
  { name: "aces exposure 1.3", variant: { ...base, toneMapping: true, operator: 2, inputSrgb: false, outputSrgb: true }, exposure: 1.3 },
  { name: "neutral srgb-out", variant: { ...base, toneMapping: true, operator: 6, inputSrgb: false, outputSrgb: true }, exposure: 1 },
  { name: "filmic srgb-out", variant: { ...base, toneMapping: true, operator: 3, inputSrgb: false, outputSrgb: true }, exposure: 1 },
  { name: "reinhard linear-out", variant: { ...base, toneMapping: true, operator: 1, inputSrgb: false, outputSrgb: false }, exposure: 1 },
  { name: "none (grade only)", variant: { ...base, toneMapping: false, operator: 0, inputSrgb: false, outputSrgb: false, grade: true }, exposure: 1, grade: { contrast: 1.1, temperature: 0.1, tint: 0, saturation: 1.1, vibrance: 0.2, vignette: 0.3, sharpening: 0 } },
  { name: "aces + grade + sharpen", variant: { ...base, toneMapping: true, operator: 2, inputSrgb: false, outputSrgb: true, grade: true, sharpening: true }, exposure: 1, grade: { contrast: 1.05, temperature: 0, tint: 0, saturation: 1, vibrance: 0, vignette: 0.2, sharpening: 0.4 } },
  { name: "aces + fxaa", variant: { ...base, toneMapping: true, operator: 2, inputSrgb: false, outputSrgb: true, fxaa: true }, exposure: 1, fxaa: { edge: 0.05, blend: 0.75 } },
  { name: "fxaa only", variant: { ...base, toneMapping: false, operator: 0, inputSrgb: false, outputSrgb: false, fxaa: true }, exposure: 1, fxaa: { edge: 0.05, blend: 0.75 } },
];

test.describe("legacy LDR present: per-variant program equals the uber-shader", () => {
  test("same input, same bytes", async ({ page }) => {
    await page.setContent("<canvas id=c width=320 height=180></canvas>");
    const payload = CASES.map((c) => ({ ...c, source: ldrFragmentSource(c.variant) }));
    const results = await page.evaluate(async ([oldSrc, cases]: [string, typeof payload]) => {
      const canvas = document.getElementById("c") as HTMLCanvasElement;
      const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true })!;
      const W = 320, H = 180;
      const vs = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() { vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); v_uv = position; gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0); }
`;
      const mk = (fs: string): WebGLProgram => {
        const p = gl.createProgram()!;
        for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
          const sh = gl.createShader(t)!; gl.shaderSource(sh, s); gl.compileShader(sh);
          if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "compile");
          gl.attachShader(p, sh);
        }
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
        return p;
      };
      // deterministic source: smooth gradients plus xorshift noise, HDR-ish values via RGBA16F
      const data = new Float32Array(W * H * 4); let s = 0x9e3779b9;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; const n = (s / 4294967296) * 0.08;
        const i = (y * W + x) * 4;
        data[i] = Math.min(4, (x / W) * 2.2 + n); data[i + 1] = Math.min(4, (y / H) * 1.6 + n); data[i + 2] = Math.min(4, 0.15 + ((x + y) / (W + H)) * 1.4 + n); data[i + 3] = 1;
      }
      gl.getExtension("EXT_color_buffer_float");
      const tex = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, W, H, 0, gl.RGBA, gl.FLOAT, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const vao = gl.createVertexArray()!; gl.bindVertexArray(vao);
      const out: Array<{ name: string; maxDiff: number; diffPct: number; meanDiff: number }> = [];
      const run = (prog: WebGLProgram, c: (typeof cases)[number]): Uint8Array => {
        gl.useProgram(prog); gl.viewport(0, 0, W, H); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
        const u1 = (n: string, v: number) => gl.uniform1f(gl.getUniformLocation(prog, n), v);
        const u1i = (n: string, v: number) => gl.uniform1i(gl.getUniformLocation(prog, n), v);
        u1i("u_source", 0); gl.uniform2f(gl.getUniformLocation(prog, "u_texelSize"), 1 / W, 1 / H);
        u1i("u_hasToneMapping", c.variant.toneMapping ? 1 : 0); u1i("u_toneOperator", c.variant.operator); u1i("u_inputColorSpace", c.variant.inputSrgb ? 1 : 0); u1i("u_outputColorSpace", c.variant.outputSrgb ? 1 : 0);
        u1("u_exposure", c.exposure); u1("u_whitePoint", 1); u1("u_gamma", 2.2);
        const g = c.grade; u1i("u_hasColorGrade", g ? 1 : 0);
        u1("u_contrast", g?.contrast ?? 1); u1("u_temperature", g?.temperature ?? 0); u1("u_tint", g?.tint ?? 0); u1("u_saturation", g?.saturation ?? 1); u1("u_vibrance", g?.vibrance ?? 0); u1("u_vignette", g?.vignette ?? 0); u1("u_sharpening", g?.sharpening ?? 0);
        u1i("u_hasFxaa", c.fxaa ? 1 : 0); u1("u_edgeThreshold", c.fxaa?.edge ?? 0.05); u1("u_subpixelBlend", c.fxaa?.blend ?? 0.75);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return px;
      };
      const oldProg = mk(oldSrc);
      for (const c of cases) {
        const a = run(oldProg, c); const b = run(mk(c.source), c);
        let maxDiff = 0, nz = 0, sum = 0;
        for (let i = 0; i < a.length; i += 4) { let d = 0; for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(a[i + k] - b[i + k])); if (d > 0) nz++; if (d > maxDiff) maxDiff = d; sum += d; }
        out.push({ name: c.name, maxDiff, diffPct: (100 * nz) / (W * H), meanDiff: sum / (W * H) });
      }
      return out;
    }, [OLD, payload] as [string, typeof payload]);
    for (const r of results) console.log(`LDREQ ${JSON.stringify(r)}`);
    for (const r of results) expect(r.maxDiff, `${r.name}: max byte difference`).toBe(0);
  });
});
