import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BANDS, BAND_IDS, HDRI_URL, LAMPLIGHT_PALETTE, TOWN_BANDS, bandFor, envRotationRad, hueDeg, hueDistance, keyDirection, lightningFlash,
  parseBand, parseLook, postPlan, shouldSwapBand, skySunDirection, townSky
} from "../../../examples/last-train-port/bands";
import { HEADLAMP_ID, PLATFORM_LIGHT_IDS, PRACTICAL_COUNT, headlampPose, platformLightPositions, poolTown } from "../../../examples/last-train-port/lights";
import { LAMPLIGHT_VFX_KINDS, lamplightVfxPresets, registerLamplightVfx, vfxEvents } from "../../../examples/last-train-port/vfx";
import type { RouteData, SimData, Tables } from "../../../examples/last-train-port/sim";

const data: SimData = {
  route: JSON.parse(readFileSync("examples/last-train-port/data/route.json", "utf8")) as RouteData,
  tables: JSON.parse(readFileSync("examples/last-train-port/data/tables.json", "utf8")) as Tables
};

describe("Lamplight Line bands (GU47 WP-31 LT-01, LT-04, LT-05)", () => {
  it("has five bands A-E with the WP's key elevations and HDRIs", () => {
    expect(BAND_IDS).toEqual(["A", "B", "C", "D", "E"]);
    expect(BANDS.A.key.elevationDeg).toBe(28);
    expect(BANDS.B.key.elevationDeg).toBe(12);
    expect(BANDS.C.key.elevationDeg).toBe(6);
    expect(BANDS.D.key.intensity).toBe(0.55);
    expect(BANDS.D.skySunElevationDeg).toBeLessThan(0);
    expect(BANDS.E.key.name).toBe("moon");
    expect([BANDS.A.hdri, BANDS.B.hdri, BANDS.C.hdri, BANDS.D.hdri, BANDS.E.hdri]).toEqual(["belfast_sunset_puresky", "belfast_sunset_puresky", "industrial_sunset_puresky", "rooftop_night", "rooftop_night"]);
    for (const id of BAND_IDS) expect(HDRI_URL(BANDS[id].hdri)).not.toMatch(/night-2k/);
    // the key sinks and dims leg by leg through the day bands
    expect(BANDS.A.key.intensity).toBeGreaterThan(BANDS.B.key.intensity);
    expect(BANDS.B.key.intensity).toBeGreaterThan(BANDS.C.key.intensity);
    expect(BANDS.C.key.intensity).toBeGreaterThan(BANDS.D.key.intensity);
  });

  it("maps the service from Mango Tide (A) to Saltlight Terminus (D); night is E; ?band= pins", () => {
    expect(TOWN_BANDS).toHaveLength(data.tables.towns.length);
    expect(bandFor(0, "day")).toBe("A");
    expect(bandFor(5, "day")).toBe("D");
    expect(bandFor(3, "night")).toBe("E");
    expect(bandFor(0, "day", "C")).toBe("C");
    expect(bandFor(6, "day")).toBe("A");
    expect(parseBand("b")).toBe("B");
    expect(parseBand("Z")).toBeNull();
    expect(parseBand(null)).toBeNull();
    expect(parseLook("original")).toBe("original");
    expect(parseLook(null)).toBe("bands");
  });

  it("swaps scenes only while docked unless forced (LT-01 never setScene en route)", () => {
    expect(shouldSwapBand("A", "B", "enroute")).toBe(false);
    expect(shouldSwapBand("A", "B", "docked")).toBe(true);
    expect(shouldSwapBand("A", "B", "enroute", true)).toBe(true);
    expect(shouldSwapBand("B", "B", "docked")).toBe(false);
  });

  it("rotates the sunset HDRIs so their sun sits on the key azimuth", () => {
    for (const id of ["A", "B", "C"] as const) {
      const row = BANDS[id];
      const r = envRotationRad(row);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(2 * Math.PI);
      // u of the key direction under that rotation equals the HDRI's measured sun u (0.6011)
      const d = keyDirection(row.key.elevationDeg, row.key.azimuthDeg);
      const u = (((Math.atan2(d[2], d[0]) / (2 * Math.PI) + 0.5 + r / (2 * Math.PI)) % 1) + 1) % 1;
      expect(u).toBeCloseTo(0.6011, 4);
    }
    expect(envRotationRad(BANDS.D)).toBe(0);
    expect(Math.hypot(...skySunDirection(BANDS.D))).toBeCloseTo(1, 9);
  });

  it("sky top hue moves >= 40 deg from A to D and adjacent towns differ by >= 15 deg (LT-05)", () => {
    expect(hueDistance(hueDeg(townSky("A", 0).top), hueDeg(townSky("D", 5).top))).toBeGreaterThanOrEqual(40);
    // along the service each town is seen in its own band: adjacent towns' top hues differ by >= 15 deg
    for (let t = 0; t < 6; t++) {
      const u = (t + 1) % 6;
      const d = hueDistance(hueDeg(townSky(TOWN_BANDS[t]!, t).top), hueDeg(townSky(TOWN_BANDS[u]!, u).top));
      expect(d, `${t}->${u}`).toBeGreaterThanOrEqual(15);
    }
  });

  it("Low tier keeps the identity and drops the expensive post; reduced flash caps lightning (PRD §6.3, §6.4)", () => {
    expect(postPlan("B", "high").godRays).toBe(true);
    expect(postPlan("B", "medium").godRays).toBe(false);
    expect(postPlan("A", "low")).toEqual({ godRays: false, tiltShift: false, grain: 0, flare: false, ao: false });
    expect(postPlan("D", "high").flare).toBe(false);
    expect(lightningFlash(true).peak).toBeLessThanOrEqual(0.3);
    expect(lightningFlash(true).seconds).toBeLessThanOrEqual(0.2);
    expect(lightningFlash(false).seconds).toBeLessThanOrEqual(0.2);
  });

  it("keeps lamplight amber as the only accent and cherry red reserved", () => {
    expect(LAMPLIGHT_PALETTE.lamplight).toBe("#ffc77a");
    expect(LAMPLIGHT_PALETTE.cherry).not.toBe(LAMPLIGHT_PALETTE.terracotta);
  });
});

describe("Lamplight Line practical pool (LT-02)", () => {
  it("declares six practicals: bounce, four platform points and the headlamp", () => {
    expect(PRACTICAL_COUNT).toBe(6);
    expect(PLATFORM_LIGHT_IDS).toEqual(["platform-light-0", "platform-light-1", "platform-light-2", "platform-light-3"]);
    expect(HEADLAMP_ID).toBe("headlamp");
  });

  it("lights the docked town, then the nearer end of the leg", () => {
    expect(poolTown(data, 2, 0, "docked")).toBe(2);
    const len = data.route.legs[2]!.length;
    expect(poolTown(data, 2, len * 0.3, "enroute")).toBe(2);
    expect(poolTown(data, 2, len * 0.7, "enroute")).toBe(3);
    expect(poolTown(data, 5, len, "enroute")).toBe(0);
    const p = platformLightPositions(data, 0);
    expect(p).toHaveLength(4);
    for (const q of p) for (const v of q) expect(Number.isFinite(v)).toBe(true);
  });

  it("aims the headlamp down the track", () => {
    const pose = headlampPose({ x: 0, y: 10, z: 0 }, [0, 0, 1]);
    expect(pose.position[2]).toBeCloseTo(5.2, 6);
    expect(pose.direction[2]).toBeGreaterThan(0.99);
    expect(Math.hypot(...pose.direction)).toBeCloseTo(1, 9);
  });
});

describe("Lamplight Line effect pack (LT-14)", () => {
  it("registers five presets; reduced motion halves every emission", () => {
    const registered: string[] = [];
    expect(registerLamplightVfx({ registerPreset: (k) => registered.push(k) })).toEqual(LAMPLIGHT_VFX_KINDS);
    expect(registered.length).toBeGreaterThanOrEqual(4);
    expect(registerLamplightVfx(undefined)).toEqual([]);
    const full = lamplightVfxPresets(false), reduced = lamplightVfxPresets(true);
    for (const kind of LAMPLIGHT_VFX_KINDS) {
      expect(full[kind].name).toBe(kind);
      full[kind].layers.forEach((layer, i) => {
        if (layer.type !== "emitter") return;
        expect(Number(reduced[kind].layers[i]!.count)).toBeLessThanOrEqual(Math.max(1, Math.ceil(Number(layer.count) / 2)));
        expect(Number(layer.maxScreen)).toBeLessThanOrEqual(0.05);
        expect(String(layer.color).toLowerCase()).not.toBe(LAMPLIGHT_PALETTE.cherry);
      });
    }
  });

  it("detects events from read-only sim snapshots", () => {
    const base = { phase: "enroute", fares: 0, catches: 0, speed: 0, roll: 0, leg: 0 };
    expect(vfxEvents({ ...base, phase: "closing" }, base, "clear")).toEqual(["lamplight-dust"]);
    expect(vfxEvents(base, { ...base, fares: 100 }, "clear")).toContain("lamplight-fare");
    expect(vfxEvents(base, { ...base, catches: 1 }, "clear")).toContain("lamplight-gutter");
    expect(vfxEvents(base, { ...base, phase: "docked" }, "rain")).toEqual(["lamplight-splash"]);
    expect(vfxEvents(base, { ...base, speed: 10, roll: 0.25 }, "clear")).toEqual(["lamplight-pantograph"]);
  });
});
