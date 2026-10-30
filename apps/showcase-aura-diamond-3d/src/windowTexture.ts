/**
 * GU47 DIA-W1: Midtown's lit office-window grid as a `texture.canvas` handle (one canvas per page), the emissive map of
 * the far block band (art/horizon.ts). Seeded, so every load lights the same windows. Returns null without a DOM (unit
 * tests); the band then glows flat in its window colour at a third of the intensity.
 */
import { texture } from "@aura3d/engine";

export const WINDOW_CANVAS = { width: 128, height: 256, columns: 8, rows: 24 } as const;

/** Lit (1) or dark (0) per window, row-major from the top; about 45% lit, never a fully dark row. */
export function windowPattern(seed = 0x5eed): readonly number[] {
  let s = seed >>> 0;
  const next = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
  const out: number[] = [];
  for (let r = 0; r < WINDOW_CANVAS.rows; r++) {
    const row = Array.from({ length: WINDOW_CANVAS.columns }, () => (next() < 0.45 ? 1 : 0));
    if (!row.some(Boolean)) row[r % WINDOW_CANVAS.columns] = 1;
    out.push(...row);
  }
  return out;
}

let cached: unknown | null | undefined;

export function windowTexture(): unknown | null {
  if (cached !== undefined) return cached;
  if (typeof document === "undefined") return (cached = null);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = WINDOW_CANVAS.width;
    canvas.height = WINDOW_CANVAS.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return (cached = null);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const cw = canvas.width / WINDOW_CANVAS.columns;
    const ch = canvas.height / WINDOW_CANVAS.rows;
    const lit = windowPattern();
    lit.forEach((on, i) => {
      if (!on) return;
      const c = i % WINDOW_CANVAS.columns;
      const r = Math.floor(i / WINDOW_CANVAS.columns);
      // Warm and cool office light; the material's emissive colour tints it.
      ctx.fillStyle = (c + r) % 5 === 0 ? "#b8d4ff" : "#ffffff";
      ctx.fillRect(c * cw + cw * 0.18, r * ch + ch * 0.22, cw * 0.64, ch * 0.56);
    });
    const handle = texture.canvas({ canvas, colorSpace: "srgb" });
    cached = handle;
  } catch {
    cached = null;
  }
  return cached;
}
