import { describe, expect, it } from "vitest";
import { DAYLIGHT_EASE_SECONDS, DAYLIGHT_KEYS, ORIGINAL_KEY, createDaylightDriver, daylightKeyFor, frameOfKey, linearToHex, parseFoundParam, resolveLook, srgbToLinear, sunDirection } from "../../../examples/where-the-wind-wanders-port/daylight";

const deg = (rad: number): number => (rad * 180) / Math.PI;

describe("where-the-wind-wanders-port daylight (WW47-L1)", () => {
  it("has one key per story beat: four letters counts, the bell and the epilogue", () => {
    expect(DAYLIGHT_KEYS.map((k) => k.id)).toEqual(["found0", "found1", "found2", "found3", "bell", "epilogue"]);
    expect(DAYLIGHT_KEYS.map((k) => k.elevationDeg).slice(0, 5)).toEqual([34, 28, 22, 16, 6]);
  });

  it("every key's sun is a unit vector above the horizon at its elevation", () => {
    for (const key of [...DAYLIGHT_KEYS, ORIGINAL_KEY]) {
      const f = frameOfKey(key);
      expect(Math.hypot(...f.sunDir)).toBeCloseTo(1, key.id === "original" ? 2 : 6); // the 4.6 constant is unit to 0.1%
      expect(f.sunDir[1]).toBeGreaterThan(0);
      if (key.id !== "original") expect(deg(Math.asin(f.sunDir[1]))).toBeCloseTo(key.elevationDeg, 6);
    }
  });

  it("the sun falls with every letter and stays in the west-southwest until the moon", () => {
    const day = DAYLIGHT_KEYS.slice(0, 5).map(frameOfKey);
    for (let i = 1; i < day.length; i++) expect(day[i]!.sunDir[1]).toBeLessThan(day[i - 1]!.sunDir[1]);
    for (const f of day) {
      expect(f.sunDir[0]).toBeLessThan(0); // west
      expect(f.sunDir[2]).toBeGreaterThan(0); // south of the camera axis
      expect(Math.abs(f.sunDir[0])).toBeGreaterThan(Math.abs(f.sunDir[2])); // more west than south
    }
  });

  it("the light warms through the afternoon: grass-lit red over blue rises by at least 0.12 from found 0 to found 3", () => {
    const grass = srgbToLinear("#8fae6a");
    const rb = (k: number): number => {
      const f = frameOfKey(DAYLIGHT_KEYS[k]!);
      const r = grass[0] * (f.sunColor[0] * f.sunIntensity + f.hemiSky[0]);
      const b = grass[2] * (f.sunColor[2] * f.sunIntensity + f.hemiSky[2]);
      return r / b;
    };
    expect(rb(3) - rb(0)).toBeGreaterThan(0.12);
  });

  it("the original key reproduces the 4.6 shader constants", () => {
    const f = frameOfKey(ORIGINAL_KEY);
    expect(f.sunDir).toEqual([-0.468, 0.802, 0.374]);
    expect(f.sunColor).toEqual([1, 0.831, 0.429]);
    expect(f.fogDensity).toBe(0.003);
    expect(f.sunIntensity).toBe(1.3);
    expect(f.cloudShadow).toBe(0);
    expect(f.fogHeight).toBe(0);
  });

  it("maps story state and the ?found= param to keys", () => {
    expect(daylightKeyFor({ found: 0, complete: false, epilogue: false })).toBe(0);
    expect(daylightKeyFor({ found: 3, complete: false, epilogue: false })).toBe(3);
    expect(daylightKeyFor({ found: 3, complete: true, epilogue: false })).toBe(4);
    expect(daylightKeyFor({ found: 3, complete: true, epilogue: true })).toBe(5);
    expect(parseFoundParam("2")).toBe(2);
    expect(parseFoundParam("epilogue")).toBe(5);
    expect(parseFoundParam("7")).toBeNull();
    expect(parseFoundParam(null)).toBeNull();
  });

  it("eases between keys over 6 s without a jump and settles exactly on the key", () => {
    const d = createDaylightDriver();
    d.snap(0);
    let prev = d.frame.sunDir[1];
    let maxStep = 0;
    for (let t = 0; t < DAYLIGHT_EASE_SECONDS + 0.5; t += 1 / 60) {
      const f = d.update(1, 1 / 60);
      maxStep = Math.max(maxStep, Math.abs(f.sunDir[1] - prev));
      prev = f.sunDir[1];
      expect(Math.hypot(...f.sunDir)).toBeCloseTo(1, 6);
    }
    expect(d.frame).toEqual(frameOfKey(DAYLIGHT_KEYS[1]!));
    expect(maxStep).toBeLessThan(0.002);
  });

  it("a new target mid-ease starts from what is on screen", () => {
    const d = createDaylightDriver();
    d.snap(0);
    for (let i = 0; i < 180; i++) d.update(1, 1 / 60);
    const mid = d.frame.sunDir[1];
    const next = d.update(2, 1 / 60).sunDir[1];
    expect(Math.abs(next - mid)).toBeLessThan(0.002);
  });

  it("?look=original pins the 4.6 row whatever the story does", () => {
    const d = createDaylightDriver({ original: true });
    d.snap(3);
    expect(d.update(5, 10).sunDir).toEqual([-0.468, 0.802, 0.374]);
  });

  it("hex conversion round-trips", () => {
    for (const k of DAYLIGHT_KEYS) expect(linearToHex(srgbToLinear(k.sun))).toBe(k.sun);
    expect(sunDirection(90, 0)[1]).toBeCloseTo(1, 12);
  });
});

describe("resolveLook (GU47 blind-panel fallback)", () => {
  it("boots the 4.6 look for the daylight beats and keeps GU47 for bell and epilogue pins", () => {
    expect(resolveLook(null, null)).toBe("original");
    for (const k of [0, 1, 2, 3]) expect(resolveLook(null, k)).toBe("original");
    expect(resolveLook(null, 4)).toBe("gu47");
    expect(resolveLook(null, 5)).toBe("gu47");
    expect(resolveLook("gu47", null)).toBe("gu47");
    expect(resolveLook("original", 5)).toBe("original");
  });
});
