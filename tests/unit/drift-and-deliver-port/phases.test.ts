import { describe, expect, it } from "vitest";
import { HDRI_ID, HDRI_SUN_AZIMUTH_DEG, HDRI_URL, ORIGINAL, PHASES, environmentRotationFor, godRayStrength, hexToRgb, lightDir, mixHex, parseAt, parseLook, phaseAt, phaseIdAt, todSeconds } from "../../../examples/drift-and-deliver-port/phases";

const hue = (hex: string): { h: number; s: number } => {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const s = max === 0 ? 0 : d / max;
  if (d === 0) return { h: 0, s };
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return { h: h < 0 ? h + 360 : h, s };
};

describe("gridlock courier look table (GU47 WP-28)", () => {
  it("has one row per variant at the capture seconds of DRIFT_PHASES", () => {
    expect(PHASES.map((p) => [p.id, p.at])).toEqual([["golden", 10], ["sunset", 120], ["bluehour", 170]]);
    for (const p of PHASES) expect(phaseAt(p.at).id).toBe(p.id);
    expect(phaseIdAt(10)).toBe("golden");
    expect(phaseIdAt(120)).toBe("sunset");
    expect(phaseIdAt(170)).toBe("bluehour");
  });

  it("uses venice_sunset 1k as the environment and lines the HDRI sun up with the shift sun", () => {
    expect(HDRI_ID).toBe("venice_sunset");
    expect(HDRI_URL).toBe("/hdri/venice_sunset_1k.hdr");
    expect(environmentRotationFor(HDRI_SUN_AZIMUTH_DEG)).toBe(0);
    expect(PHASES[0]!.sun.azimuthDeg).toBe(HDRI_SUN_AZIMUTH_DEG);
  });

  it("rakes the avenues with a 12-15 deg golden sun and keeps the key shadowed at every phase", () => {
    expect(PHASES[0]!.key.elevationDeg).toBeGreaterThanOrEqual(12);
    expect(PHASES[0]!.key.elevationDeg).toBeLessThanOrEqual(15);
    for (let t = 0; t <= 180; t += 5) expect(phaseAt(t).key.intensity).toBeGreaterThan(0.2);
    expect(lightDir(PHASES[0]!.key)[1]).toBeGreaterThan(0);
  });

  it("turns the top of the sky from warm (20-40 deg) to blue (200-240 deg) with a saturated sunset", () => {
    expect(hue(PHASES[0]!.sky.top).h).toBeGreaterThanOrEqual(15);
    expect(hue(PHASES[0]!.sky.top).h).toBeLessThanOrEqual(40);
    expect(hue(PHASES[2]!.sky.top).h).toBeGreaterThanOrEqual(200);
    expect(hue(PHASES[2]!.sky.top).h).toBeLessThanOrEqual(240);
    expect(hue(PHASES[1]!.sky.top).s).toBeGreaterThanOrEqual(0.25);
    expect(PHASES[2]!.sky.stars).toBe(1);
    expect(PHASES[0]!.sky.stars).toBe(0);
  });

  it("ramps windows 0.15 to 1.4 and lamps on from sunset only", () => {
    expect(PHASES[0]!.windows).toBe(0.15);
    expect(PHASES[2]!.windows).toBe(1.4);
    expect(phaseAt(30).lamps).toBeLessThan(0.05);
    expect(phaseAt(120).lamps).toBeGreaterThan(0.5);
    expect(PHASES.map((p) => p.fog.color)).toEqual(["#efc896", "#d8967a", "#2a3550"]);
  });

  it("blends continuously (no jump larger than one 1 s step can show)", () => {
    let prev = phaseAt(0);
    for (let t = 0.5; t <= 180; t += 0.5) {
      const cur = phaseAt(t);
      expect(Math.abs(cur.environmentIntensity - prev.environmentIntensity)).toBeLessThan(0.03);
      expect(Math.abs(cur.windows - prev.windows)).toBeLessThan(0.05);
      prev = cur;
    }
  });

  it("maps the shift clock and the ?at= pin onto 0..180 without touching the shift", () => {
    expect(todSeconds(90, 180)).toBe(90);
    expect(todSeconds(30, 60)).toBe(90);
    expect(todSeconds(5, 180, 170)).toBe(170);
    expect(todSeconds(5, 180, 999)).toBe(180);
    expect(parseAt("120")).toBe(120);
    expect(parseAt("x")).toBeUndefined();
    expect(parseAt(null)).toBeUndefined();
    expect(parseLook("original")).toBe("original");
    expect(parseLook(null)).toBe("shift");
    // GU47 phase 2 (D11): the lights-only diagnostic defaults to the original look; ?look=shift forces the shift
    expect(parseLook(null, false)).toBe("original");
    expect(parseLook("shift", false)).toBe("shift");
    expect(parseLook("original", true)).toBe("original");
  });

  it("keeps today's look as the original row and blends colours in linear light", () => {
    expect(ORIGINAL.fog.color).toBe("#f0dcc0");
    expect(ORIGINAL.grade.saturation).toBe(1.38);
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#bcbcbc");
    expect(mixHex("#123456", "#abcdef", 0)).toBe("#123456");
  });
});

describe("gridlock courier sunset god rays (GU47 WP-28 GC-S5)", () => {
  it("shows only at sunset", () => {
    expect(godRayStrength(phaseAt(10).sun.elevationDeg)).toBe(0);
    expect(godRayStrength(phaseAt(120).sun.elevationDeg)).toBeGreaterThanOrEqual(0.8);
    expect(godRayStrength(phaseAt(170).sun.elevationDeg)).toBe(0);
  });
});
