/**
 * PRD-10 S5 fixture — the `prd10-forest-wind` scatter rules (scene seed 103,
 * the 80 m × 80 m forest floor). Shared by the Node checksum pin
 * (`tests/unit/contracts/impl/prd10-scatter.test.ts`) and the browser parity
 * spec (`tests/browser/qr-prd10-scatter-checksum.spec.ts`) so both evaluate
 * byte-identical options. Plain data: no engine import, so the browser bundle
 * and vitest load the same object.
 */
export const PRD10_FOREST_WIND_SEED = 103;

export const PRD10_FOREST_WIND_SCATTER = {
  id: "prd10-forest-wind-scatter",
  seed: PRD10_FOREST_WIND_SEED,
  surface: {
    kind: "area" as const,
    shape: { kind: "polygon" as const, points: [[-40, -40], [40, -40], [40, 40], [-40, 40]] as [number, number][] },
    y: 0
  },
  layers: [
    {
      density: 6, // instances per 100 m²
      minDistance: 3,
      assets: [
        { asset: { id: "propPineTree" } as never, scale: [0.8, 1.25] as [number, number] },
        { asset: { id: "propPineTreeSmall" } as never, weight: 0.5 }
      ]
    },
    {
      density: 3,
      minDistance: 1.5,
      exclude: [{ kind: "circle" as const, center: [0, 0] as [number, number], radius: 6 }],
      assets: [{ asset: { id: "propFern" } as never }]
    }
  ]
};

/**
 * Node-computed pins (vitest, `worldScatter(...).checksum`). A planner change
 * that moves these bytes must update the pin in the same PR, with the reason.
 */
export const PRD10_FOREST_WIND_INSTANCES = 748;
export const PRD10_FOREST_WIND_CHECKSUM = "5b25bdf39b8bffeae6f2ed4fcd95130a81ad6269f951cbb33051d03812eccf0d";
export const PRD10_MEADOW_CHECKSUM = "113c8e0def91327c8aa1b003e4ebc02c7e666d2e4ea05ea0e6f6cd509d79e788";

/** A second, unrelated rule set used to permute evaluation order (S5). */
export const PRD10_MEADOW_SCATTER = {
  id: "prd10-meadow-scatter",
  seed: 104,
  surface: {
    kind: "area" as const,
    shape: { kind: "polygon" as const, points: [[0, 0], [64, 0], [64, 64], [0, 64]] as [number, number][] },
    y: 0.5
  },
  layers: [{ density: 9, minDistance: 2, assets: [{ asset: { id: "propRockA" } as never }] }]
};
