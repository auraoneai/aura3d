/**
 * GU47 E-I crop contract for the steady-state capture (`window.__AURA_SERPENTINE_SKY_RUN__.crops`): named rects normalised
 * to the canvas, origin top-left. The chase rig keeps the runner at a near-fixed screen position (camera 7-8.6 m behind and
 * 3.4 m above, aimed 12 m ahead), so the rects follow the aspect only: landscape (fov 62) and portrait (fov 74).
 * Used by SSR-02 (runner vs verge), SSR-04 (top third), SSR-05 (road cell), SSR-08 (middle third, far road).
 */
export interface SerpentCrop { readonly name: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number }

export function serpentCrops(aspect: number): readonly SerpentCrop[] {
  const portrait = aspect < 0.85;
  const runner: SerpentCrop = portrait ? { name: "runner", x: 0.38, y: 0.5, w: 0.24, h: 0.2 } : { name: "runner", x: 0.44, y: 0.46, w: 0.12, h: 0.3 };
  return [
    runner,
    { name: "verge-left", x: portrait ? 0.04 : 0.2, y: runner.y + runner.h * 0.5, w: 0.12, h: 0.12 },
    { name: "verge-right", x: portrait ? 0.84 : 0.68, y: runner.y + runner.h * 0.5, w: 0.12, h: 0.12 },
    { name: "feet", x: runner.x + runner.w * 0.25, y: runner.y + runner.h * 0.85, w: runner.w * 0.5, h: runner.h * 0.15 },
    { name: "top-third", x: 0, y: 0, w: 1, h: 1 / 3 },
    { name: "middle-third", x: 0, y: 1 / 3, w: 1, h: 1 / 3 },
    { name: "far-road", x: 0.42, y: portrait ? 0.4 : 0.36, w: 0.16, h: 0.06 },
    { name: "road-cell", x: 0.4, y: portrait ? 0.78 : 0.82, w: 0.2, h: 0.1 },
    { name: "sun-side", x: 0.3, y: 0.1, w: 0.4, h: 0.25 }
  ];
}
