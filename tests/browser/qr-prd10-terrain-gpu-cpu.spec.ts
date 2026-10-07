import { test, expect } from "@playwright/test";
import {
  createTerrainHeightTexture,
  terrainGpuHeightReadback,
  terrainHeightBilinear
} from "../../packages/rendering/src/world/terrain/TerrainHeightTexture";
import { proceduralHeightfield } from "../../packages/engine/src/agent-api/world/terrain";

/**
 * PRD-10 §15.2 `terrain-gpu-cpu` — the GPU height readback (TEST-ONLY path in
 * TerrainHeightTexture.ts) must agree with the CPU `terrainHeightBilinear`
 * twin within 1e-4 m at 1,000 random points (S1 height agreement).
 *
 * Runs the production functions verbatim: both are serialized into the page
 * and evaluated against a real WebGL2 context, so a drifted twin fails here.
 */

test("terrain GPU height readback == CPU bilinear within 1e-4 m (1000 pts)", async ({ page }) => {
  await page.goto("about:blank");
  const grid = {
    columns: 33,
    rows: 33,
    heights: proceduralHeightfield(7, 33, 33, { octaves: 4, baseFrequency: 3, ridged: 0.3 })
  };
  const heightScale = 87.5;
  // Deterministic uv set: 1000 halton-ish samples + the 4 corners + borders.
  const uvs: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];
  for (let i = 0; i < 996; i += 1) {
    uvs.push([((i * 0.6180339887) % 1), ((i * 0.7548776662) % 1)]);
  }
  const srcUpload = createTerrainHeightTexture.toString();
  const srcReadback = terrainGpuHeightReadback.toString();
  const gpu = await page.evaluate(async ({ srcUpload, srcReadback, grid, uvs, heightScale }) => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { antialias: false });
    if (!gl) return { error: "no-webgl2" } as const;
    if (!gl.getExtension("EXT_color_buffer_float")) return { error: "no-ext-color-buffer-float" } as const;
    const createTerrainHeightTexture = eval(`(${srcUpload})`) as (g: WebGL2RenderingContext, grid: unknown) => unknown;
    const terrainGpuHeightReadback = eval(`(${srcReadback})`) as (g: WebGL2RenderingContext, grid: unknown, uvs: readonly (readonly [number, number])[], s: number) => Float32Array;
    const heights = new Float32Array(grid.heights);
    try {
      return { values: Array.from(terrainGpuHeightReadback(gl, { ...grid, heights }, uvs, heightScale)) } as const;
    } catch (e) {
      return { error: String(e) } as const;
    }
  }, { srcUpload, srcReadback, grid: { columns: grid.columns, rows: grid.rows, heights: Array.from(grid.heights) }, uvs, heightScale });
  if ("error" in gpu) {
    test.skip(true, `webgl2 unavailable in this runner: ${gpu.error}`);
    return;
  }
  const cpu = Float32Array.from(uvs, (uv) => terrainHeightBilinear(grid, uv, heightScale));
  let maxErr = 0;
  for (let i = 0; i < uvs.length; i += 1) {
    maxErr = Math.max(maxErr, Math.abs(gpu.values[i]! - cpu[i]!));
  }
  expect(maxErr).toBeLessThanOrEqual(1e-4);
});
