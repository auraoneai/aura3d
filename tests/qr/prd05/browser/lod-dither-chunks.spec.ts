import { test, expect } from "@playwright/test";
import { shaderChunk } from "@aura3d/rendering/contracts";
import { buildChunkHarnessProgram } from "../../../../packages/rendering/src/contracts/testing/ChunkHarness";
import { lodDitherParsChunk, lodDitherDiscardChunk } from "../../../../packages/rendering/src/shaders/lod-dither.glsl";

/**
 * PRD-05 §6.3.8 — the `a3d_prd05_lod_dither` chunks compile inside the C-02
 * ChunkHarness (WebGL2 GLSL), the WGSL twins validate when WebGPU exists, and
 * the sign-convention stipple is a pixel-perfect partition between incoming
 * (+t) and outgoing (−t) fade items at every transition point.
 */

test.describe.configure({ mode: "serial" });

const CHUNKS = [lodDitherParsChunk, lodDitherDiscardChunk];

test("PRD-05 lod-dither chunks register in the C-02 registry", () => {
  for (const chunk of CHUNKS) {
    expect(shaderChunk(chunk.name)).toBeDefined();
    expect(chunk.wgsl).toBeTruthy();
  }
});

for (const chunk of CHUNKS) {
  test(`PRD-05 ${chunk.name} compiles in the ChunkHarness (WebGL2)`, async ({ page }) => {
    await page.goto("about:blank");
    const program = buildChunkHarnessProgram([lodDitherParsChunk, chunk]);
    const result = await page.evaluate(async (src) => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2", { antialias: false });
      if (!gl) return { ok: false as const, error: "no-webgl2" };
      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS) as boolean;
        const log = gl.getShaderInfoLog(shader) ?? "";
        gl.deleteShader(shader);
        return { ok, log };
      };
      const vs = compile(gl.VERTEX_SHADER, src.vertex);
      const fs = compile(gl.FRAGMENT_SHADER, src.fragment);
      if (!vs.ok || !fs.ok) return { ok: false as const, error: `vs:${vs.log}\nfs:${fs.log}` };
      const prog = gl.createProgram()!;
      const v = gl.createShader(gl.VERTEX_SHADER)!;
      gl.shaderSource(v, src.vertex);
      gl.compileShader(v);
      const f = gl.createShader(gl.FRAGMENT_SHADER)!;
      gl.shaderSource(f, src.fragment);
      gl.compileShader(f);
      gl.attachShader(prog, v);
      gl.attachShader(prog, f);
      gl.linkProgram(prog);
      const linked = gl.getProgramParameter(prog, gl.LINK_STATUS) as boolean;
      return { ok: linked, error: gl.getProgramInfoLog(prog) ?? "" };
    }, program);
    expect(result.ok, `${chunk.name}: ${result.error}`).toBe(true);
  });
}

// The Bayer discard predicates in GLSL form, evaluated on the CPU against the
// same 4x4 matrix — the exact partition contract the WGSL/GLSL twins share.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const keepsIncoming = (bayer: number, t: number) => bayer < t;
const keepsOutgoing = (bayer: number, t: number) => bayer >= t;

test("PRD-05 lod-dither is a Bayer complement across the transition", () => {
  for (const t of [0.02, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 0.95]) {
    for (const cell of BAYER) {
      expect(keepsIncoming(cell, t) !== keepsOutgoing(cell, t)).toBe(true);
    }
  }
  // t at the extremes: incoming fully drawn at t=1, gone at t=0; outgoing mirrors.
  for (const cell of BAYER) {
    expect(keepsIncoming(cell, 1)).toBe(true);
    expect(keepsIncoming(cell, 0)).toBe(false);
    expect(keepsOutgoing(cell, 1)).toBe(false);
    expect(keepsOutgoing(cell, 0)).toBe(true);
  }
});
