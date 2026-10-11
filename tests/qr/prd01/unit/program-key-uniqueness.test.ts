/**
 * 01-S7 / PRD-01 §16.1: program key uniqueness over 5,000 distinct feature
 * records (mixed-radix walk over the C-02 axes plus registered feature bits),
 * and determinism: the same record built with a different property order,
 * or sparse vs fully normalized, keys identically.
 */

import { describe, expect, it } from "vitest";

import type { ProgramFeatures } from "../../../../packages/rendering/src/contracts/program";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures";
import { programKey } from "../../../../packages/rendering/src/program/ProgramKey";

const AXES = {
  pass: ["forward", "depth", "distance", "velocity"],
  lighting: ["lit", "unlit"],
  alphaMode: ["opaque", "mask", "blend"],
  doubleSided: [false, true],
  vertexColors: [false, true],
  flatShading: [false, true],
  dir: [0, 1, 2, 4, 8],
  point: [0, 1, 2, 4, 8],
  fog: ["none", "linear", "exp2", "height", "volumetric"],
  environment: ["none", "pmrem-cube", "equirect"],
  diffuseModel: ["lambert", "burley"],
  instancing: [undefined, false, true],
  feature: [undefined, 1, 2, "a", true]
} as const;

type AxisName = keyof typeof AXES;
const NAMES = Object.keys(AXES) as AxisName[];

function recordAt(index: number): Partial<ProgramFeatures> {
  const pick = {} as Record<AxisName, unknown>;
  let rest = index;
  for (const name of NAMES) {
    const values = AXES[name] as readonly unknown[];
    pick[name] = values[rest % values.length];
    rest = Math.floor(rest / values.length);
  }
  return {
    pass: pick.pass as ProgramFeatures["pass"],
    lighting: pick.lighting as ProgramFeatures["lighting"],
    alphaMode: pick.alphaMode as ProgramFeatures["alphaMode"],
    doubleSided: pick.doubleSided as boolean,
    vertexColors: pick.vertexColors as boolean,
    flatShading: pick.flatShading as boolean,
    lights: { dir: pick.dir, point: pick.point, spot: 0, rect: 0, clustered: false, hemisphere: false } as ProgramFeatures["lights"],
    fog: pick.fog as ProgramFeatures["fog"],
    environment: pick.environment as ProgramFeatures["environment"],
    diffuseModel: pick.diffuseModel as ProgramFeatures["diffuseModel"],
    ...(pick.instancing === undefined ? {} : { instancing: { color: pick.instancing as boolean } }),
    features: pick.feature === undefined ? {} : { "prd01.test": pick.feature as string | number | boolean }
  };
}

function shuffledCopy(record: Partial<ProgramFeatures>): Partial<ProgramFeatures> {
  const entries = Object.entries(record).reverse();
  const out: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    out[key] = value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse())
      : value;
  }
  return out as Partial<ProgramFeatures>;
}

describe("01-S7 program key uniqueness (5,000 records)", () => {
  const records = Array.from({ length: 5_000 }, (_, i) => recordAt(i));

  it("the 5,000 records are pairwise distinct after normalization", () => {
    const normalized = new Set(records.map((r) => JSON.stringify(normalizeProgramFeatures(r))));
    expect(normalized.size).toBe(5_000);
  });

  it("5,000 distinct records produce 5,000 distinct keys", () => {
    const keys = new Map<string, number>();
    for (let i = 0; i < records.length; i += 1) {
      const key = programKey(records[i]!);
      const previous = keys.get(key);
      expect(previous, `records ${previous} and ${i} collide on ${key}`).toBeUndefined();
      keys.set(key, i);
    }
    expect(keys.size).toBe(5_000);
  });

  it("keys are deterministic: property order and normalization do not change them", () => {
    for (let i = 0; i < records.length; i += 97) {
      const record = records[i]!;
      const key = programKey(record);
      expect(programKey(shuffledCopy(record))).toBe(key);
      expect(programKey(normalizeProgramFeatures(record))).toBe(key);
      expect(programKey(recordAt(i))).toBe(key);
    }
  });
});
