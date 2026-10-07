import { test, expect } from "@playwright/test";
import { splatBakeShaderSources, encodeSplatBakeRules } from "../../packages/rendering/src/world/terrain/SplatBake";
import {
  defaultSplatRules,
  evalSplatRules,
  proceduralHeightfield,
  type AuraTerrainLayerSpec
} from "../../packages/engine/src/agent-api/world/terrain";
import { terrainHeightBilinear, terrainMacroNormal } from "../../packages/rendering/src/world/terrain/TerrainHeightTexture";

/**
 * PRD-10 T2.5 §15.2 — the GPU SplatBake fragment (BAKE_FRAG via
 * splatBakeShaderSources) writes splat weights identical to the CPU
 * `evalSplatRules` within ±1/255 at 64 sample points. The default rule set is
 * `resolveTerrainSlopeBlend`'s formula expressed as rules.
 */

const LAYERS: readonly AuraTerrainLayerSpec[] = [
  { name: "grass", preset: "grass-meadow" },
  { name: "rock", preset: "rock-cliff" },
  { name: "snow", preset: "snow" },
  { name: "sand", preset: "sand-beach" }
];

test("GPU splat bake == CPU evalSplatRules within ±1/255 at 64 points", async ({ page }) => {
  await page.goto("about:blank");
  const columns = 33;
  const rows = 33;
  const heights = proceduralHeightfield(5, columns, rows, { octaves: 4, baseFrequency: 3 });
  const grid = { columns, rows, heights };
  const heightScale = 60;
  const texelWorld = 8;
  const rules = defaultSplatRules(LAYERS);
  const layerNames = LAYERS.map((l) => l.name);
  const encoded = encodeSplatBakeRules(
    rules.map((r) => ({
      layer: layerNames.indexOf(r.layer),
      weight: r.weight ?? 1,
      slopeDeg: r.slopeDeg,
      height: r.height,
      falloff: r.falloff,
      noise: r.noise
    }))
  );
  const res = 64;
  const sources = splatBakeShaderSources();

  const gpu = await page.evaluate(async ({ frag, res, heights, columns, rows, heightScale, texelWorld, encoded }) => {
    const canvas = document.createElement("canvas");
    canvas.width = res;
    canvas.height = res;
    const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
    if (!gl) return { error: "no-webgl2" } as const;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`shader: ${gl.getShaderInfoLog(s)}\n${src.slice(0, 600)}`);
      return s;
    };
    const vsSrc = `#version 300 es
      in vec2 a_pos;
      out vec2 v_uv;
      void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
    gl.useProgram(prog);

    const ht = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, ht);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const packed = new Float32Array(heights.length * 4);
    heights.forEach((h, i) => { packed[i * 4] = h; });
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, columns, rows, 0, gl.RGBA, gl.FLOAT, packed);

    const quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const u = (n: string) => gl.getUniformLocation(prog, n);
    gl.uniform1i(u("u_height"), 0);
    gl.uniform2f(u("u_heightTexSize"), columns, rows);
    gl.uniform1f(u("u_heightScale"), heightScale);
    gl.uniform1f(u("u_texelWorld"), texelWorld);
    gl.uniform1i(u("u_layerOffset"), 0);
    gl.uniform1i(u("u_layerCount"), 4);
    gl.uniform1i(u("u_ruleCount"), encoded.ruleCount);
    gl.uniform1iv(u("u_ruleLayer"), new Int32Array(encoded.ruleLayer));
    gl.uniform1fv(u("u_ruleWeight"), new Float32Array(encoded.ruleWeight));
    gl.uniform4fv(u("u_ruleSlope"), new Float32Array(encoded.ruleSlope));
    gl.uniform4fv(u("u_ruleHeight"), new Float32Array(encoded.ruleHeight));
    gl.uniform4fv(u("u_ruleNoise"), new Float32Array(encoded.ruleNoise));
    gl.viewport(0, 0, res, res);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Uint8Array(res * res * 4);
    gl.readPixels(0, 0, res, res, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { pixels: Array.from(px) } as const;
  }, {
    frag: sources.fragment!,
    res,
    heights: Array.from(heights),
    columns,
    rows,
    heightScale,
    texelWorld,
    encoded: {
      ruleCount: encoded.ruleCount,
      ruleLayer: Array.from(encoded.ruleLayer),
      ruleWeight: Array.from(encoded.ruleWeight),
      ruleSlope: Array.from(encoded.ruleSlope),
      ruleHeight: Array.from(encoded.ruleHeight),
      ruleNoise: Array.from(encoded.ruleNoise)
    }
  });
  if ("error" in gpu) {
    test.skip(true, `webgl2 unavailable in this runner: ${gpu.error}`);
    return;
  }

  // CPU reference at 64 samples spread across the map (GL rows are bottom-up).
  let maxDiff = 0;
  let checked = 0;
  for (let k = 0; k < 64; k += 1) {
    const u = (k % 8 + 0.5) / 8;
    const v = (Math.floor(k / 8) + 0.5) / 8;
    const c = Math.min(res - 1, Math.round(u * (res - 1)));
    const rTop = Math.min(res - 1, Math.round(v * (res - 1)));
    const gy = res - 1 - rTop;
    const pxIdx = (gy * res + c) * 4;
    const hNorm = terrainHeightBilinear(grid, [u, v], 1);
    const [, ny] = terrainMacroNormal(grid, [u, v], texelWorld, heightScale);
    const slopeDeg = (Math.acos(Math.min(1, Math.max(-1, ny))) * 180) / Math.PI;
    const w = evalSplatRules(rules, LAYERS, { slopeDeg, heightNorm: hNorm, u, v });
    for (let i = 0; i < 4; i += 1) {
      const expected = Math.round(255 * (w[layerNames[i]!] ?? 0));
      maxDiff = Math.max(maxDiff, Math.abs(gpu.pixels[pxIdx + i]! - expected));
      checked += 1;
    }
  }
  expect(checked).toBe(64 * 4);
  expect(maxDiff, `GPU-vs-CPU splat weight diff (bytes)`).toBeLessThanOrEqual(1);
});
