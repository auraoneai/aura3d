import { test, expect } from "@playwright/test";
import { shaderChunk } from "../../../../packages/rendering/src/contracts/program";
import "../../../../packages/rendering/src/lanes/prd05";
import { buildChunkHarnessProgram } from "../../../../packages/rendering/src/contracts/testing/ChunkHarness";
import { debugViewParsChunk, debugViewEndChunk, PRD05_DEBUG_VIEW_CHANNELS } from "../../../../packages/rendering/src/shaders/debug-view.glsl";

/**
 * PRD-05 §6.7 — the `a3d_prd05_debug_view` chunks (texel density, mip level,
 * facet normals, LOD level) compile inside the C-02 ChunkHarness (WebGL2
 * GLSL) and carry a WGSL twin.
 */

test.describe.configure({ mode: "serial" });

const CHUNKS = [debugViewParsChunk, debugViewEndChunk];

test("PRD-05 debug-view chunks register in the C-02 registry", () => {
  for (const chunk of CHUNKS) {
    expect(shaderChunk(chunk.name)).toBeDefined();
    expect(chunk.wgsl).toBeTruthy();
  }
  expect(PRD05_DEBUG_VIEW_CHANNELS.length).toBeGreaterThanOrEqual(4);
});

for (const chunk of CHUNKS) {
  test(`PRD-05 ${chunk.name} compiles in the ChunkHarness (WebGL2)`, async ({ page }) => {
    await page.goto("about:blank");
    const program = buildChunkHarnessProgram([debugViewParsChunk, chunk]);
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
