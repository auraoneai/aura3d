/**
 * PRD-10 T3.3 §8.2 — the `A3DWind` UBO host side (C-26), the 64² RG8 gust
 * noise texture, and the C-02 `prd10.wind` feature registrations that splice
 * `a3d_prd10_wind` into `vertex:deform` for scatter/foliage draws and into the
 * depth variant (so shadows bend with the surface).
 *
 * The gust texture is generated procedurally here (deterministic value noise,
 * RG8). The PRD names `engine/assets/world/noise/` — that asset directory is
 * not yet admitted, so a generated twin keeps the contract honest; when the
 * asset lands it can replace `gustNoiseData` without touching the pack layout.
 */
import { Texture } from "../../Texture.js";
import { registerShaderFeature, type ShaderFeature } from "../../contracts/program.js";
import { registerDepthVariantFeature } from "../../contracts/shadows.js";

/** Structural twin of the frozen C-26 `AuraWindSpec` (engine contract). */
export interface WindFieldSpec {
  readonly direction: readonly [number, number, number];
  readonly strength: number;
  readonly gust: number;
  readonly gustFrequency: number;
  readonly turbulence: number;
}

export const WIND_GUST_SIZE = 64;

/** Deterministic 64² RG8 gust field — value noise, 3 octaves, repeatable. */
export function gustNoiseData(size = WIND_GUST_SIZE): Uint8Array {
  const hash = (x: number, y: number): number => {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  };
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  const noise = (x: number, y: number): number => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smooth(x - ix);
    const fy = smooth(y - iy);
    const a = hash(ix & (size - 1), iy & (size - 1));
    const b = hash((ix + 1) & (size - 1), iy & (size - 1));
    const c = hash(ix & (size - 1), (iy + 1) & (size - 1));
    const d = hash((ix + 1) & (size - 1), (iy + 1) & (size - 1));
    return a + (b - a) * fx + (c + (d - c) * fx - a - (b - a) * fx) * fy;
  };
  const out = new Uint8Array(size * size * 2);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let n = 0;
      let amp = 0.55;
      let freq = 4;
      for (let o = 0; o < 3; o += 1) {
        n += amp * noise((x / size) * freq, (y / size) * freq);
        amp *= 0.5;
        freq *= 2;
      }
      const i = (y * size + x) * 2;
      out[i] = Math.round(Math.min(1, Math.max(0, n)) * 255);      // R: gust
      out[i + 1] = Math.round(Math.min(1, Math.max(0, noise(x / size * 16 + 7.3, y / size * 16 + 2.1))) * 255); // G: fine flutter
    }
  }
  return out;
}

/**
 * Pack the frozen C-26 `AuraWindSpec` into the A3DWind UBO layout
 * (std140: two vec4s): [dir.x, dir.z, strength, time] + [gust, 1/gustScale,
 * -, -]. `gustFrequency` in the spec is already 1/scale.
 */
export function packWindUbo(spec: WindFieldSpec, timeSeconds: number): Float32Array {
  return Float32Array.from([
    spec.direction[0], spec.direction[2], spec.strength, timeSeconds,
    spec.gust, spec.gustFrequency, 0, 0
  ]);
}

export interface WindFieldBinding {
  readonly ubo: Float32Array;             // upload each frame (time advances)
  readonly gustTexture: Texture;
  readonly dispose: () => void;
}

/** Create the gust texture (rgba8: R=gust, G=flutter); UBO packed per frame. */
export function createWindField(spec: WindFieldSpec): WindFieldBinding {
  const data = gustNoiseData();
  const rgba = new Uint8Array(WIND_GUST_SIZE * WIND_GUST_SIZE * 4);
  for (let i = 0; i < WIND_GUST_SIZE * WIND_GUST_SIZE; i += 1) {
    rgba[i * 4] = data[i * 2]!;
    rgba[i * 4 + 1] = data[i * 2 + 1]!;
    rgba[i * 4 + 3] = 255;
  }
  const texture = new Texture({
    width: WIND_GUST_SIZE,
    height: WIND_GUST_SIZE,
    format: "rgba8",
    colorSpace: "linear",
    label: "prd10-wind-gust",
    data: rgba
  });
  let disposed = false;
  return {
    ubo: packWindUbo(spec, 0),
    gustTexture: texture,
    dispose() {
      if (disposed) return;
      disposed = true;
      texture.dispose();
    }
  };
}

/** Refresh the UBO floats for a new frame time. */
export function updateWindField(field: WindFieldBinding, spec: WindFieldSpec, timeSeconds: number): Float32Array {
  const packed = packWindUbo(spec, timeSeconds);
  field.ubo.set(packed);
  return field.ubo;
}

/**
 * T3.3 registration — `prd10.wind` splices `a3d_prd10_wind` at `vertex:deform`
 * for world draws flagged `wind:true` and in the depth/distance variants so
 * the C-11 shadow pass bends identically.
 */
export function registerPrd10WindFeatures(): () => void {
  const feature: ShaderFeature = {
    id: "prd10.wind",
    owner: "prd10",
    flag: "A3D_QR_WORLD",
    // Path G contract: the lane labels wind-enabled draws "prd10.wind:<id>"
    // (RenderItem has no feature map today; the label prefix is the signal).
    select: (input) => (input.item.label?.startsWith("prd10.wind:") ? 1 : undefined),
    defines: (v): Readonly<Record<string, string | number | true>> => (v ? { A3D_PRD10_WIND: 1 } : {}),
    chunks: ["a3d_prd10_wind"],
    hooks: ["vertex:deform"]
  };
  const unregShader = registerShaderFeature(feature);
  const unregDepth = registerDepthVariantFeature({ ...feature, passes: ["depth", "distance"] });
  return () => {
    unregShader();
    unregDepth();
  };
}
