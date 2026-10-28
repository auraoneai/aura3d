import { describe, expect, it } from "vitest";
import { floatToHalf, halfToFloat } from "../../../packages/rendering/src/environment/probeBuild";

/** The pre-optimisation encoder, kept verbatim as the reference. */
function referenceFloatToHalf(value: number): number {
  const v = Math.max(0, value);
  if (Number.isNaN(v)) return 0x7e00;
  if (!Number.isFinite(v) || v >= 65504) return 0x7bff;
  if (v === 0) return 0;
  if (v < 2 ** -14) return Math.round(v / 2 ** -24);
  const exponent = Math.floor(Math.log2(v));
  const mantissa = Math.round((v / 2 ** exponent - 1) * 1024);
  return ((exponent + 15) << 10) | (mantissa & 0x03ff);
}

function referenceHalfToFloat(h: number): number {
  const sign = h & 0x8000 ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const mantissa = h & 0x03ff;
  if (exp === 0) return sign * mantissa * 2 ** -24;
  if (exp === 0x1f) return mantissa !== 0 ? Number.NaN : sign * Number.POSITIVE_INFINITY;
  return sign * (1 + mantissa / 1024) * 2 ** (exp - 15);
}

describe("probe half-float conversion (first-frame cost)", () => {
  it("encodes exactly like the previous implementation on special values", () => {
    for (const v of [0, -0, -1, 1, 0.5, 1.9995, 1.99999, 2, 65503, 65504, 70000, Infinity, -Infinity, NaN, 2 ** -14, 2 ** -14 - 1e-9, 2 ** -24, 1e-9]) {
      const f = Math.fround(v);
      expect(floatToHalf(f), String(v)).toBe(referenceFloatToHalf(f));
    }
  });

  it("encodes exactly like the previous implementation on random float32 inputs across the range", () => {
    let seed = 0x1234567;
    const next = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
    for (let i = 0; i < 200_000; i += 1) {
      const exponent = Math.floor(next() * 40) - 20;
      const f = Math.fround(next() * 2 ** exponent);
      expect(floatToHalf(f)).toBe(referenceFloatToHalf(f));
    }
  });

  it("decodes every half-float bit pattern exactly like the previous implementation", () => {
    for (let bits = 0; bits < 65536; bits += 1) {
      const expected = referenceHalfToFloat(bits);
      const actual = halfToFloat(bits);
      if (Number.isNaN(expected)) expect(Number.isNaN(actual)).toBe(true);
      else expect(Object.is(actual, expected)).toBe(true);
    }
  });
});
