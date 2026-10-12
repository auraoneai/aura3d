/**
 * C-05 OutputPass device conformance (#1249 GPU run 38190015020):
 *  1. First present read 0: sampling a render-target colour texture the first
 *     time re-specified it with `texImage2D(null)` (no upload revision was
 *     recorded at registration), wiping what the fill pass rendered.
 *  2. `{ colorAttachments: [{ format: "rgba16f" }] }` (single attachment — and
 *     createHdrTarget's `format: "rgba8"` + that) allocated RGBA8, clamping HDR.
 *  3. Dither runs of 27 px (≤ 16): white sin-hash TPDF; now the inverse
 *     triangular CDF of interleaved gradient noise (still ±1 LSB TPDF).
 */

import { describe, expect, it } from "vitest";
import { Texture } from "../../../../packages/rendering/src/Texture";
import { WebGL2TextureRegistry } from "../../../../packages/rendering/src/webgl2/TextureUpload";
import type { WebGL2DeviceHost } from "../../../../packages/rendering/src/webgl2/DeviceHost";
import { renderTargetColorFormat } from "../../../../packages/rendering/src/WebGL2Device";
import { outputFragmentGlsl } from "../../../../packages/rendering/src/output/ToneMappingOperators.glsl";

function registry(): { registry: WebGL2TextureRegistry; calls: Map<string, number> } {
  const calls = new Map<string, number>();
  const record = (name: string) => () => { calls.set(name, (calls.get(name) ?? 0) + 1); };
  const gl = {
    TEXTURE_2D: 0x0de1, RGBA8: 0x8058, RGBA: 0x1908, UNSIGNED_BYTE: 0x1401, RGBA16F: 0x881a, HALF_FLOAT: 0x140b,
    createTexture: () => ({}), bindTexture: record("bindTexture"), texImage2D: record("texImage2D"),
    texSubImage2D: record("texSubImage2D"), texStorage2D: record("texStorage2D"), texParameteri: record("texParameteri"),
    pixelStorei: record("pixelStorei"), generateMipmap: record("generateMipmap"), getExtension: () => null, getParameter: () => 4096,
    TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800, TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803, LINEAR: 0x2601, NEAREST: 0x2600,
    UNPACK_FLIP_Y_WEBGL: 0x9240, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241, UNPACK_COLORSPACE_CONVERSION_WEBGL: 0x9243, BROWSER_DEFAULT_WEBGL: 0x9244, NONE: 0,
    SRGB8_ALPHA8: 0x8c43, SRGB: 0x8c42
  } as unknown as WebGL2RenderingContext;
  const host = {
    gl,
    stateCache: { invalidate: () => undefined },
    counters: { releasedTextureHandles: 0 },
    textureBudgetPolicy: undefined,
    lifecycle: { readError: () => null }
  } as unknown as WebGL2DeviceHost;
  return { registry: new WebGL2TextureRegistry(host), calls };
}

describe("#1249 1: sampling a render-target colour texture never re-specifies it", () => {
  it.each(["rgba8", "rgba16f"] as const)("%s attachment registered like WebGL2Device.createRenderTarget", (format) => {
    const { registry: reg, calls } = registry();
    const colour = new Texture({ width: 4, height: 4, format, label: "rt-color" });
    const handle = {} as WebGLTexture;
    // WebGL2Device registers attachments exactly like this (no upload revision).
    reg.textures.set(colour, handle);
    reg.textureUploadModes.set(colour, format);
    expect(reg.getTextureHandle(colour)).toBe(handle);
    expect(reg.getTextureHandle(colour)).toBe(handle);
    expect(calls.get("texImage2D") ?? 0).toBe(0);
    expect(calls.get("texSubImage2D") ?? 0).toBe(0);
  });

  it("a CPU texture whose revision changed is still re-uploaded", () => {
    const { registry: reg, calls } = registry();
    const tex = new Texture({ width: 1, height: 1, format: "rgba8", data: new Uint8Array([1, 2, 3, 4]), label: "cpu" });
    reg.getTextureHandle(tex);
    const before = calls.get("texImage2D") ?? 0;
    (tex as unknown as { revision: number }).revision += 1;
    reg.getTextureHandle(tex);
    expect((calls.get("texImage2D") ?? 0) + (calls.get("texSubImage2D") ?? 0)).toBeGreaterThan(before);
  });
});

describe("#1249 2: single-attachment render targets honour colorAttachments[0].format", () => {
  it("colorAttachments wins over format; format and the rgba8 default still apply alone", () => {
    expect(renderTargetColorFormat({ colorAttachments: [{ format: "rgba16f" }] })).toBe("rgba16f");
    expect(renderTargetColorFormat({ format: "rgba8", colorAttachments: [{ format: "rgba16f" }] })).toBe("rgba16f"); // createHdrTarget
    expect(renderTargetColorFormat({ format: "rgba32f" })).toBe("rgba32f");
    expect(renderTargetColorFormat({})).toBe("rgba8");
  });
});

/** CPU port of the GLSL a3dTriangularNoise (float32 like the GPU). */
function noise(x: number, y: number): number {
  const f = Math.fround;
  const fract = (v: number) => f(v - Math.floor(v));
  const u = fract(f(52.9829189) * fract(f(f(x * f(0.06711056)) + f(y * f(0.00583715)))));
  return u < 0.5 ? Math.sqrt(2 * u) - 1 : 1 - Math.sqrt(2 - 2 * u);
}
function encode(c: number): number {
  return (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255;
}

describe("#1249 3: triangular dither breaks banding (tool geometry 1280x4, ramp 0.20 → 0.22)", () => {
  it("the shader uses the ported low-discrepancy TPDF, after the OETF, with no sin hash", () => {
    const src = outputFragmentGlsl({ toneMapping: "none", backgroundCoverage: false, overlay: false });
    expect(src).toContain("fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))))");
    expect(src).toContain("u < 0.5 ? sqrt(2.0 * u) - 1.0 : 1.0 - sqrt(2.0 - 2.0 * u)");
    expect(src).not.toMatch(/a3dTriangularNoise[^}]*sin\(/);
    expect(src.indexOf("a3dLinearToSRGB(clamp(display")).toBeLessThan(src.indexOf("a3dTriangularNoise(gl_FragCoord.xy)"));
  });

  it("is ±1 LSB, zero-mean, and every row's longest equal-code run is ≤ 16 px with block-mean error ≤ 0.5", () => {
    const W = 1280;
    let longest = 0;
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let n = 0;
    let worstBlock = 0;
    const rows: number[][] = [];
    for (let row = 0; row < 4; row += 1) {
      const codes: number[] = [];
      for (let x = 0; x < W; x += 1) {
        const d = noise(x + 0.5, row + 0.5);
        min = Math.min(min, d); max = Math.max(max, d); sum += d; n += 1;
        codes.push(Math.min(255, Math.max(0, Math.round(encode(0.2 + 0.02 * (x / (W - 1))) + d))));
      }
      let run = 1;
      for (let x = 1; x < W; x += 1) { run = codes[x] === codes[x - 1] ? run + 1 : 1; longest = Math.max(longest, run); }
      rows.push(codes);
    }
    for (let b = 0; b < W / 64; b += 1) {
      let got = 0;
      let ideal = 0;
      for (let x = b * 64; x < b * 64 + 64; x += 1) {
        for (const codes of rows) { got += codes[x]!; ideal += encode(0.2 + 0.02 * (x / (W - 1))); }
      }
      worstBlock = Math.max(worstBlock, Math.abs(got - ideal) / (64 * rows.length));
    }
    expect(min).toBeGreaterThanOrEqual(-1);
    expect(max).toBeLessThanOrEqual(1);
    expect(Math.abs(sum / n)).toBeLessThan(0.01);
    expect(longest).toBeLessThanOrEqual(16);
    expect(worstBlock).toBeLessThanOrEqual(0.5);
  });
});
