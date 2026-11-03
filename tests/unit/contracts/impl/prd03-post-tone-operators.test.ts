import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { applyToneOperator, POST_TONE_OPERATORS } from "@aura3d/rendering";

/**
 * Reference vectors from independent published equations. The generator does
 * not import the renderer; its input and output coverage includes 64 colours
 * and a separate ACES exposure sweep (see evidence/prd03/goldens).
 */

const here = dirname(fileURLToPath(import.meta.url));
const goldens = JSON.parse(readFileSync(join(here, "../../../../evidence/prd03/goldens/tone-operators.json"), "utf8")) as {
  source: string;
  exposure: number;
  cases: { label: string; rgb: readonly [number, number, number] }[];
  operators: Record<string, readonly (readonly [number, number, number])[]>;
  exposureSweep: { operator: string; exposures: readonly number[]; cases: { rgb: readonly [number, number, number]; out: readonly (readonly [number, number, number])[] }[] };
};

const TOL = 1e-6;

describe("post/ToneOperators independent equation references", () => {
  it("records independent source provenance", () => {
    expect(goldens.source).toContain("Independent published-equation reference");
    expect(goldens.source).not.toMatch(/three|port/i);
  });
  it("operator list is the v2 OutputPass set", () => {
    expect([...POST_TONE_OPERATORS].sort()).toEqual(["aces", "agx", "linear", "neutral", "reinhard"]);
  });

  for (const operator of POST_TONE_OPERATORS) {
    it(`${operator}: 64 golden triples`, () => {
      const rows = goldens.operators[operator];
      expect(rows).toHaveLength(64);
      goldens.cases.forEach(({ rgb }, i) => {
        const got = applyToneOperator(operator, rgb, goldens.exposure);
        const want = rows[i]!;
        for (let c = 0; c < 3; c += 1) {
          expect(Math.abs(got[c] - want[c]), `${operator} ${goldens.cases[i]!.label} c${c}`).toBeLessThanOrEqual(TOL);
        }
      });
    });
  }

  it("aces exposure sweep matches goldens", () => {
    for (const { rgb, out } of goldens.exposureSweep.cases) {
      goldens.exposureSweep.exposures.forEach((exposure, e) => {
        const got = applyToneOperator("aces", rgb, exposure);
        for (let c = 0; c < 3; c += 1) {
          expect(Math.abs(got[c] - out[e]![c]!), `aces@${exposure} ${rgb}`).toBeLessThanOrEqual(TOL);
        }
      });
    }
  });

  it("aces midpoint sanity: 0.18 gray maps near the ACES ~0.213 pivot", () => {
    const [r, g, b] = applyToneOperator("aces", [0.18, 0.18, 0.18], 1);
    // ACES shifts achromatic channels only through the AP0/AP1 gamut matrices;
    // a neutral input must stay near-neutral.
    expect(Math.abs(r - g)).toBeLessThan(1e-3);
    expect(Math.abs(g - b)).toBeLessThan(1e-3);
    expect(r).toBeGreaterThan(0.19);
    expect(r).toBeLessThan(0.24);
  });

  it("unknown operator throws POST_TONE_OPERATOR_UNKNOWN", () => {
    expect(() => applyToneOperator("filmic" as never, [0.5, 0.5, 0.5], 1)).toThrowError(/POST_TONE_OPERATOR_UNKNOWN/);
  });

  it("operators saturate: HDR inputs stay in [0,1]", () => {
    for (const operator of POST_TONE_OPERATORS) {
      const out = applyToneOperator(operator, [64, 32, 16], 1);
      out.forEach((v) => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      });
    }
  });
});
