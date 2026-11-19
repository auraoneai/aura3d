/**
 * Legacy procedural constants retained for reference. Since the Nov 2026 Idol pass the tram, riders, motorman, townsfolk and
 * town set pieces are Idol GLBs (`idolModels.ts`); terrain, track, flora and the procedural fallbacks live in
 * `art/proceduralModels.ts` and `world.ts`.
 */
export const MESHY_ENABLED = false;

export const MODEL_HALF = { tram: [0.951, 0.58, 0.335], pax: 0.951, house: 0.951 } as const;

export const TRAM = {
  yaw: -Math.PI / 2,
  scale: [5.47, 3.8, 5.1] as const,
  centerY: 2.15,
  floorY: 0.8
};

export const TRAM_ENAMEL_SCALE = TRAM.scale.map((v) => v * 0.951) as unknown as readonly [number, number, number];

export const PAX_SCALE = 0.85;
