import { describe, expect, it } from "vitest";
import {
  applyIorToRoughness,
  clearcoatFccCompose,
  evalIridescence,
  iorToF0,
  specIorSpecularColor,
  specIorSpecularF90,
  volumeAttenuation,
  volumeTransmissionRay
} from "../../qr/prd04/oracles/native-reference-optics";
import type { OpticalVec3 } from "../../qr/prd04/oracles/native-reference-optics";

const expectVector = (actual: OpticalVec3, expected: OpticalVec3, digits = 12): void => {
  expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, digits));
};

describe("independent CPU-double optics references", () => {
  describe("spectral thin-film reflectance", () => {
    it("collapses a zero film to the independently derived Fresnel interface", () => {
      const rS = ((Math.SQRT2 - Math.sqrt(7)) / (Math.SQRT2 + Math.sqrt(7))) ** 2;
      const rP = ((4 * Math.sqrt(7) - 9 * Math.SQRT2) / (4 * Math.sqrt(7) + 9 * Math.SQRT2)) ** 2;
      const values = evalIridescence({
        cosThetaIncident: Math.SQRT1_2,
        filmThicknessNm: 0,
        samples: [
          { wavelengthNm: 450, incidentIor: 1, filmIor: 1.2, substrateIor: 1.5 },
          { wavelengthNm: 650, incidentIor: 1, filmIor: 2, substrateIor: 1.5 }
        ]
      });
      values.forEach((value) => expect(value).toBeCloseTo((rS + rP) / 2, 13));
    });

    it("produces destructive quarter-wave and direct-interface half-wave limits", () => {
      const wavelength = 600;
      const antiReflectionIor = Math.sqrt(1.5);
      const antiReflection = evalIridescence({
        cosThetaIncident: 1,
        filmThicknessNm: wavelength / (4 * antiReflectionIor),
        samples: [{ wavelengthNm: wavelength, incidentIor: 1, filmIor: antiReflectionIor, substrateIor: 1.5 }]
      });
      expect(antiReflection[0]).toBeCloseTo(0, 14);
      const halfWave = evalIridescence({
        cosThetaIncident: 1,
        filmThicknessNm: wavelength / (2 * 1.25),
        samples: [{ wavelengthNm: wavelength, incidentIor: 1, filmIor: 1.25, substrateIor: 1.5 }]
      });
      expect(halfWave[0]).toBeCloseTo(0.04, 13);
    });

    it("matches a symmetric quarter-wave film's rational reflection", () => {
      // Each normal-incidence interface has amplitude magnitude 1/5.
      // A quarter-wave round trip reverses phase: amplitude 2r/(1+r²)=5/13.
      const values = evalIridescence({
        cosThetaIncident: 1,
        filmThicknessNm: 100,
        samples: [{ wavelengthNm: 600, incidentIor: 1, filmIor: 1.5, substrateIor: 1 }]
      });
      expect(values[0]).toBeCloseTo(25 / 169, 13);
    });

    it("takes dispersion per sample and removes matching interfaces", () => {
      const values = evalIridescence({
        cosThetaIncident: 1,
        filmThicknessNm: 175,
        samples: [
          { wavelengthNm: 450, incidentIor: 1, filmIor: 1, substrateIor: 1.4 },
          { wavelengthNm: 650, incidentIor: 1, filmIor: 1, substrateIor: 1.6 },
          { wavelengthNm: 550, incidentIor: 1.3, filmIor: 1.3, substrateIor: 1.3 }
        ]
      });
      expect(values[0]).toBeCloseTo(1 / 36, 13);
      expect(values[1]).toBeCloseTo(9 / 169, 13);
      expect(values[2]).toBe(0);
    });

    it("distinguishes total reflection from frustrated total reflection", () => {
      const wavelength = 500;
      const n0 = Math.SQRT2;
      const filmThicknessNm = Math.LN2 * wavelength / (4 * Math.PI * Math.SQRT1_2);
      const cosine = 0.5;
      const [frustrated, total] = evalIridescence({
        cosThetaIncident: cosine,
        filmThicknessNm,
        samples: [
          { wavelengthNm: wavelength, incidentIor: n0, filmIor: 1, substrateIor: n0 },
          { wavelengthNm: wavelength, incidentIor: n0, filmIor: 1, substrateIor: 1 }
        ]
      });
      // The round-trip evanescent amplitude is 1/2. The independently
      // evaluated s and p powers are 1/9 and 25/153, respectively.
      expect(frustrated).toBeCloseTo(7 / 51, 12);
      expect(total).toBeCloseTo(1, 13);
    });

    it("has a finite analytic value at the film's critical angle", () => {
      const input = {
        cosThetaIncident: 3 / 5,
        filmThicknessNm: 500 / (2 * Math.PI),
        samples: [{ wavelengthNm: 500, incidentIor: 5 / 4, filmIor: 1, substrateIor: 5 / 4 }]
      };
      const exact = evalIridescence(input)[0];
      // With phaseScale=1, s and p limits are 9/73 and 36/661.
      expect(exact).toBeCloseTo((9 / 73 + 36 / 661) / 2, 12);
      expect(evalIridescence({ ...input, cosThetaIncident: input.cosThetaIncident - 1e-7 })[0]).toBeCloseTo(exact, 5);
      expect(evalIridescence({ ...input, cosThetaIncident: input.cosThetaIncident + 1e-7 })[0]).toBeCloseTo(exact, 5);
      expect(evalIridescence({ ...input, cosThetaIncident: input.cosThetaIncident - Number.EPSILON })[0]).toBeCloseTo(exact, 13);
      expect(evalIridescence({ ...input, cosThetaIncident: input.cosThetaIncident + Number.EPSILON })[0]).toBeCloseTo(exact, 13);
    });

    it("states normal and grazing behavior, including an absent interface", () => {
      const samples = [{ wavelengthNm: 550, incidentIor: 1, filmIor: 1.3, substrateIor: 1.5 }];
      expect(evalIridescence({ cosThetaIncident: 0, filmThicknessNm: 100, samples })[0]).toBe(1);
      expect(evalIridescence({ cosThetaIncident: 0, filmThicknessNm: 0, samples })[0]).toBe(1);
      expect(evalIridescence({ cosThetaIncident: 0, filmThicknessNm: 0,
        samples: [{ wavelengthNm: 550, incidentIor: 1, filmIor: 2, substrateIor: 1 }] })[0]).toBe(0);
    });

    it("rejects invalid angle, spectral inputs and unrepresentable phase", () => {
      const valid = { cosThetaIncident: 1, filmThicknessNm: 10,
        samples: [{ wavelengthNm: 550, incidentIor: 1, filmIor: 1.3, substrateIor: 1.5 }] };
      expect(() => evalIridescence({ ...valid, cosThetaIncident: NaN })).toThrow(RangeError);
      expect(() => evalIridescence({ ...valid, cosThetaIncident: -0.1 })).toThrow(RangeError);
      expect(() => evalIridescence({ ...valid, filmThicknessNm: -1 })).toThrow(RangeError);
      expect(() => evalIridescence({ ...valid, samples: [] })).toThrow(RangeError);
      expect(() => evalIridescence({ ...valid, samples: [{ ...valid.samples[0], wavelengthNm: 0 }] })).toThrow(RangeError);
      expect(() => evalIridescence({ ...valid, samples: [{ ...valid.samples[0], filmIor: Infinity }] })).toThrow(RangeError);
      expect(() => evalIridescence({ ...valid, filmThicknessNm: Number.MAX_VALUE,
        samples: [{ ...valid.samples[0], wavelengthNm: Number.MIN_VALUE }] })).toThrow(RangeError);
    });
  });

  describe("dielectric and renderer material controls", () => {
    it("computes F0 for matched and swapped indices", () => {
      expect(iorToF0(1.5)).toBeCloseTo(0.04, 14);
      expect(iorToF0(3)).toBeCloseTo(0.25, 14);
      expect(iorToF0(1.5, 1.5)).toBe(0);
      expect(iorToF0(1, 1.5)).toBeCloseTo(iorToF0(1.5, 1), 14);
      expect(iorToF0(Number.MAX_VALUE, Number.MAX_VALUE)).toBe(0);
    });

    it("makes the roughness calibration and specular heuristics explicit", () => {
      expect(applyIorToRoughness(0.8, 1, 1.5)).toBe(0);
      expect(applyIorToRoughness(0.8, 1.5, 1.5)).toBeCloseTo(0.8, 14);
      expect(applyIorToRoughness(0.8, 3, 1.5)).toBeCloseTo(0.8, 14);
      // Target IOR 11/9 has amplitude 1/10 versus 1/5 for reference 3/2.
      expect(applyIorToRoughness(0.8, 11 / 9, 1.5)).toBeCloseTo(0.4, 14);
      expectVector(specIorSpecularColor(1.5, [1, 0.5, 0], 0.5), [0.02, 0.01, 0]);
      expect(specIorSpecularF90(0)).toBe(0);
      expect(specIorSpecularF90(0.4)).toBe(0.4);
      expect(specIorSpecularF90(1)).toBe(1);
    });

    it("rejects invalid material controls", () => {
      expect(() => iorToF0(0)).toThrow(RangeError);
      expect(() => iorToF0(NaN)).toThrow(RangeError);
      expect(() => applyIorToRoughness(0.5, 1.5, 1)).toThrow(RangeError);
      expect(() => applyIorToRoughness(1.1, 1.5, 1.5)).toThrow(RangeError);
      expect(() => specIorSpecularColor(1.5, [1, -0.1, 1], 1)).toThrow(RangeError);
      expect(() => specIorSpecularF90(Infinity)).toThrow(RangeError);
    });
  });

  describe("volume attenuation and layer composition", () => {
    it("follows Beer–Lambert at zero, one, and two attenuation distances", () => {
      expectVector(volumeAttenuation(0, [0, 0.5, 1], 2), [1, 1, 1]);
      expectVector(volumeAttenuation(2, [0, 0.5, 1], 2), [0, 0.5, 1]);
      expectVector(volumeAttenuation(4, [0, 0.5, 1], 2), [0, 0.25, 1]);
      expectVector(volumeAttenuation(999, [0, 0.5, 1], Infinity), [1, 1, 1]);
      expectVector(volumeAttenuation(Number.MAX_VALUE, [0, 0.5, 1], Number.MIN_VALUE), [0, 0, 1]);
    });

    it("composes linear radiance with the declared single-pass coverage rule", () => {
      const base = [0.4, 0.2, 0.1] as const;
      const coat = [0.1, 0.2, 0.3] as const;
      expectVector(clearcoatFccCompose(base, coat, 0, 0.25), base);
      expectVector(clearcoatFccCompose(base, coat, 1, 0.25), [0.4, 0.35, 0.375]);
      expectVector(clearcoatFccCompose(base, coat, 0.5, 0.25), [0.4, 0.275, 0.2375]);
      expectVector(clearcoatFccCompose(base, [0, 0, 0], 1, 1), [0, 0, 0]);
    });

    it("rejects invalid absorption and layer inputs", () => {
      expect(() => volumeAttenuation(-1, [1, 1, 1], 2)).toThrow(RangeError);
      expect(() => volumeAttenuation(1, [1, 1, 1.1], 2)).toThrow(RangeError);
      expect(() => volumeAttenuation(1, [1, 1, 1], 0)).toThrow(RangeError);
      expect(() => volumeAttenuation(Infinity, [1, 1, 1], 2)).toThrow(RangeError);
      expect(() => clearcoatFccCompose([1, 1, 1], [1, 1, 1], 1, NaN)).toThrow(RangeError);
      expect(() => clearcoatFccCompose([-1, 1, 1], [1, 1, 1], 1, 1)).toThrow(RangeError);
      expect(() => clearcoatFccCompose([Number.MAX_VALUE, 1, 1], [Number.MAX_VALUE, 1, 1], 1, 0)).toThrow(RangeError);
    });
  });

  describe("Snell slab transmission", () => {
    it("computes a normal ray and an independently calculated oblique ray", () => {
      const normal = volumeTransmissionRay([0, 0, -2], [0, 0, 3], 1, 1.5, 2);
      expect(normal.kind).toBe("transmitted");
      if (normal.kind !== "transmitted") throw new Error("expected transmission");
      expectVector(normal.direction, [0, 0, -1]);
      expectVector(normal.ray, [0, 0, -2]);
      expect(normal.pathLength).toBe(2);

      const oblique = volumeTransmissionRay([0.5, 0, -Math.sqrt(3) / 2], [0, 0, 1], 1, 1.5, 2);
      expect(oblique.kind).toBe("transmitted");
      if (oblique.kind !== "transmitted") throw new Error("expected transmission");
      expectVector(oblique.direction, [1 / 3, 0, -2 * Math.SQRT2 / 3]);
      expect(oblique.pathLength).toBeCloseTo(3 / Math.SQRT2, 13);
      expectVector(oblique.ray, [1 / Math.SQRT2, 0, -2]);
    });

    it("preserves direction across matched indices and distinguishes critical and TIR", () => {
      const matched = volumeTransmissionRay([0.6, 0, -0.8], [0, 0, 1], 1.4, 1.4, 4);
      expect(matched.kind).toBe("transmitted");
      if (matched.kind !== "transmitted") throw new Error("expected transmission");
      expectVector(matched.direction, [0.6, 0, -0.8]);
      expectVector(matched.ray, [3, 0, -4]);
      expect(volumeTransmissionRay([0.8, 0, -0.6], [0, 0, 1], 1.25, 1, 1).kind).toBe("parallel-to-boundary");
      expect(volumeTransmissionRay([Math.sqrt(3) / 2, 0, -0.5], [0, 0, 1], 1.5, 1, 1).kind).toBe("total-internal-reflection");
      const zeroThickness = volumeTransmissionRay([0.8, 0, -0.6], [0, 0, 1], 1.25, 1, 0);
      expect(zeroThickness.kind).toBe("transmitted");
      if (zeroThickness.kind === "transmitted") expect(zeroThickness.pathLength).toBe(0);
    });

    it("rejects invalid geometry and keeps extreme finite normal incidence finite", () => {
      expect(() => volumeTransmissionRay([0, 0, 0], [0, 0, 1], 1, 1.5, 1)).toThrow(RangeError);
      expect(() => volumeTransmissionRay([0, 0, 1], [0, 0, 1], 1, 1.5, 1)).toThrow(RangeError);
      expect(() => volumeTransmissionRay([0, 0, -1], [0, NaN, 1], 1, 1.5, 1)).toThrow(RangeError);
      expect(() => volumeTransmissionRay([0, 0, -1], [0, 0, 1], -1, 1.5, 1)).toThrow(RangeError);
      expect(() => volumeTransmissionRay([0, 0, -1], [0, 0, 1], 1, 1.5, Infinity)).toThrow(RangeError);
      const extreme = volumeTransmissionRay([0, 0, -1], [0, 0, 1], Number.MAX_VALUE, Number.MIN_VALUE, 1);
      expect(extreme.kind).toBe("transmitted");
      if (extreme.kind === "transmitted") expectVector(extreme.ray, [0, 0, -1]);
      const slantedNormal = volumeTransmissionRay([-1, -2, -3], [1, 2, 3], Number.MAX_VALUE, Number.MIN_VALUE, 1);
      expect(slantedNormal.kind).toBe("transmitted");
      if (slantedNormal.kind === "transmitted") {
        expectVector(slantedNormal.direction, [-1 / Math.sqrt(14), -2 / Math.sqrt(14), -3 / Math.sqrt(14)]);
      }
      const nearNormal = volumeTransmissionRay([1e-9, 0, -1], [0, 0, 1], 1, 1, 1);
      expect(nearNormal.kind).toBe("transmitted");
      if (nearNormal.kind === "transmitted") expect(nearNormal.direction[0]).toBeCloseTo(1e-9, 18);
      const largeRatio = volumeTransmissionRay([Number.MIN_VALUE, 0, -1], [0, 0, 1], Number.MAX_VALUE, 1, 1);
      expect(largeRatio.kind).toBe("transmitted");
      if (largeRatio.kind === "transmitted") {
        expect(largeRatio.direction[0]).toBeCloseTo(Number.MIN_VALUE * Number.MAX_VALUE, 28);
      }
    });
  });
});
