import { test, expect } from "@playwright/test";
import { shaderChunk } from "@aura3d/rendering/contracts";
import { buildChunkHarnessProgram } from "@aura3d/rendering/contracts/testing/ChunkHarness";
import { prd10ShaderChunks } from "../../packages/rendering/src/lanes/prd10";

/**
 * PRD-10 T1.9 — every `a3d_prd10_*` chunk compiles inside the C-02
 * ChunkHarness (WebGL2 GLSL) and its WGSL twin validates (or is recorded
 * "unvalidated" when WebGPU is unavailable in the runner).
 */

test.describe.configure({ mode: "serial" });

test("prd10 registers all 12 chunks in the C-02 registry", async () => {
  expect(prd10ShaderChunks).toHaveLength(12);
  for (const chunk of prd10ShaderChunks) {
    expect(shaderChunk(chunk.name)).toBeDefined();
    expect(chunk.wgsl).toBeTruthy();
  }
});

for (const chunk of prd10ShaderChunks) {
  test(`${chunk.name} compiles in the ChunkHarness (WebGL2)`, async ({ page }) => {
    await page.goto("about:blank");
    const program = buildChunkHarnessProgram(chunk);
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
      const linkLog = gl.getProgramInfoLog(prog) ?? "";
      return { ok: linked, error: linkLog };
    }, program);
    expect(result.ok, `${chunk.name}: ${result.error}`).toBe(true);
  });

  test(`${chunk.name} WGSL validates (or is unvalidated without WebGPU)`, async ({ page }) => {
    await page.goto("about:blank");
    const wgsl = chunk.wgsl!;
    const result = await page.evaluate(async (code) => {
      const nav = navigator as Navigator & { gpu?: { requestAdapter(): Promise<GPUAdapter | null> } };
      if (!nav.gpu) return "unvalidated" as const;
      const adapter = await nav.gpu.requestAdapter();
      if (!adapter) return "unvalidated" as const;
      const device = await adapter.requestDevice();
      const module = device.createShaderModule({ code });
      const info = await module.getCompilationInfo();
      const errors = info.messages.filter((m) => m.type === "error").map((m) => `${m.lineNum}:${m.linePos} ${m.message}`);
      return { errors } as const;
    }, wgsl);
    if (result !== "unvalidated") {
      expect(result.errors).toEqual([]);
    }
  });
}
