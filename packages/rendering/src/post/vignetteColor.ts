/**
 * Vignette colour as a finite RGB triple. The engine post bridge emits
 * `{ r, g, b }` (rgbField) while older callers pass `[r, g, b]`; indexing the
 * object form gave `undefined` → NaN uniforms, and `mix(1, NaN, t)` turned the
 * whole frame black whenever a scene authored `effects.vignette()`.
 */
export function vignetteColorRgb(color: unknown): [number, number, number] {
  let rgb: [unknown, unknown, unknown] = [0, 0, 0];
  if (Array.isArray(color)) rgb = [color[0], color[1], color[2]];
  else if (color && typeof color === "object" && "r" in color) {
    const c = color as { r?: unknown; g?: unknown; b?: unknown };
    rgb = [c.r, c.g, c.b];
  }
  const finite = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return [finite(rgb[0]), finite(rgb[1]), finite(rgb[2])];
}
