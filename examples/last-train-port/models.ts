/**
 * Legacy procedural constants retained for reference; all 3D geometry in Lamplight Line is authored
 * procedurally on `@aura3d/engine` in `art/proceduralModels.ts` and `world.ts` with zero `.glb` files.
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
