/**
 * Renderer-owned DFG LUT texture for generated programs.
 *
 * One `Texture` for the whole process, uploaded once per device by that
 * device's texture cache. Every generated program that declares
 * `u_dfgLut` (the lane-01 `brdf` chunk) gets it from
 * `MaterialBinding.bindGenerated`. The legacy flag-off path keeps
 * `createExternalParityBrdfLut` and its own `u_environmentBrdfLutTexture`.
 *
 * DFGLutData independently integrates Aura3D's split-sum GGX coefficients.
 * The device has no RG16F upload format, so the half-float pairs are widened
 * to RGBA16F with B = 0 and A = 1. `a3dDFG` reads `.rg` only; sampling is
 * linear, without mipmaps, and clamps at the edges.
 */

import { Sampler } from "../Sampler";
import { Texture } from "../Texture";
import { TextureBinding } from "../TextureBinding";
import { DFG_LUT_RG16F, DFG_LUT_SIZE } from "./DFGLutData";

/** Half-float bit patterns. */
const HALF_ZERO = 0x0000;
const HALF_ONE = 0x3c00;

/** RG16F → RGBA16F (B = 0, A = 1), retaining the generated R/G bits. */
export function dfgLutRgba16f(): Uint16Array {
  const texels = DFG_LUT_SIZE * DFG_LUT_SIZE;
  const out = new Uint16Array(texels * 4);
  for (let i = 0; i < texels; i++) {
    out[i * 4] = DFG_LUT_RG16F[i * 2]!;
    out[i * 4 + 1] = DFG_LUT_RG16F[i * 2 + 1]!;
    out[i * 4 + 2] = HALF_ZERO;
    out[i * 4 + 3] = HALF_ONE;
  }
  return out;
}

let texture: Texture | undefined;
let binding: TextureBinding | undefined;

/** The shared DFG LUT texture (created on first use). */
export function dfgLutTexture(): Texture {
  texture ??= new Texture({
    width: DFG_LUT_SIZE,
    height: DFG_LUT_SIZE,
    format: "rgba16f",
    colorSpace: "linear",
    data: dfgLutRgba16f(),
    label: "a3d-dfg-lut"
  });
  return texture;
}

/** `u_dfgLut` binding for generated programs. */
export function dfgLutBinding(): TextureBinding {
  binding ??= new TextureBinding({
    name: "u_dfgLut",
    texture: dfgLutTexture(),
    sampler: new Sampler({ minFilter: "linear", magFilter: "linear", addressU: "clamp-to-edge", addressV: "clamp-to-edge" }),
    expectedColorSpace: "linear"
  });
  return binding;
}
