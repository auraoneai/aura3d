import { texture } from "@aura3d/engine";

export interface GpuSplatMapOptions {
  readonly width?: number;
  readonly height?: number;
  readonly baseRgba?: readonly [number, number, number, number];
}

export interface GpuSplatStamp {
  /** Normalized UV coordinates in [0, 1]. */
  readonly u: number;
  readonly v: number;
  /** Normalized brush radius in UV space (e.g. 0.035). */
  readonly radius: number;
  /** RGBA8 ink color [0..255]. Alpha controls wet-ink coverage / clearcoat mask. */
  readonly rgba: readonly [number, number, number, number];
  /** Edge irregularity seed for organic paint droplets (default 0). */
  readonly seed?: number;
}

/**
 * Zero-DOM-canvas RGBA8 splat buffer backed by `texture.data(...)` so ink/paint games
 * stamp wet glossy turf without CPU `CanvasRenderingContext2D` stalls or full-mesh vertex rewrites.
 */
export function createGpuSplatMap(options: GpuSplatMapOptions = {}) {
  const width = options.width ?? 256;
  const height = options.height ?? 256;
  const base = options.baseRgba ?? [28, 34, 44, 0];
  const pixels = new Uint8Array(width * height * 4);

  const clear = (rgba: readonly [number, number, number, number] = base): void => {
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = rgba[0];
      pixels[i + 1] = rgba[1];
      pixels[i + 2] = rgba[2];
      pixels[i + 3] = rgba[3];
    }
  };
  clear(base);

  const stamp = ({ u, v, radius, rgba, seed = 0 }: GpuSplatStamp): void => {
    const cx = u * width;
    const cy = v * height;
    const rx = Math.max(1.5, radius * width);
    const ry = Math.max(1.5, radius * height);
    const x0 = Math.max(0, Math.floor(cx - rx * 1.35));
    const x1 = Math.min(width - 1, Math.ceil(cx + rx * 1.35));
    const y0 = Math.max(0, Math.floor(cy - ry * 1.35));
    const y1 = Math.min(height - 1, Math.ceil(cy + ry * 1.35));
    for (let y = y0; y <= y1; y += 1) {
      const dy = (y + 0.5 - cy) / ry;
      for (let x = x0; x <= x1; x += 1) {
        const dx = (x + 0.5 - cx) / rx;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const lobe = 1 + 0.18 * Math.sin(angle * 5 + seed * 3.1) + 0.1 * Math.cos(angle * 9 - seed * 1.7);
        if (dist > lobe) continue;
        const edge = Math.min(1, Math.max(0, (lobe - dist) * 5.5));
        const idx = (y * width + x) * 4;
        const blend = edge * (rgba[3] / 255);
        pixels[idx] = Math.round(pixels[idx]! * (1 - blend) + rgba[0] * blend);
        pixels[idx + 1] = Math.round(pixels[idx + 1]! * (1 - blend) + rgba[1] * blend);
        pixels[idx + 2] = Math.round(pixels[idx + 2]! * (1 - blend) + rgba[2] * blend);
        pixels[idx + 3] = Math.min(255, Math.max(pixels[idx + 3]!, Math.round(edge * rgba[3])));
      }
    }
  };

  const toTexture = () =>
    texture.data({
      data: pixels.slice(),
      width,
      height,
      format: "rgba8",
      colorSpace: "srgb"
    });

  return { width, height, pixels, clear, stamp, toTexture };
}
