/**
 * Thermal Drift look table (GU47 WP-13): one row per circuit with the WP's numbers, and the `?circuit=` variant param.
 */
import { describe, expect, it } from "vitest";
import { lookHdriIds } from "@aura3d/engine";
import { CIRCUIT_ORDER } from "../../../apps/showcase-heatsink/src/data";
import { CIRCUIT_LOOKS, PALETTE, circuitFromParam, rimPosition, sunDirection, sunPosition } from "../../../apps/showcase-heatsink/src/look";

describe("heatsink look table", () => {
  it("has exactly one row per circuit, each with a catalogue HDRI and a distinct time of day", () => {
    expect(Object.keys(CIRCUIT_LOOKS).sort()).toEqual([...CIRCUIT_ORDER].sort());
    const hdris = CIRCUIT_ORDER.map((id) => CIRCUIT_LOOKS[id].hdri);
    expect(hdris).toEqual(["kloppenheim_02", "industrial_sunset_puresky", "spruit_sunrise"]);
    for (const id of hdris) expect(lookHdriIds).toContain(id);
    expect(new Set(CIRCUIT_ORDER.map((id) => CIRCUIT_LOOKS[id].timeOfDay)).size).toBe(3);
  });

  it("carries the HS-01 key rows, the cyan counter-rim and the VESPER-only up-fill", () => {
    expect(CIRCUIT_LOOKS.grand.key).toEqual({ color: "#ffb070", elevationDeg: 28, azimuthDeg: 120, intensity: 1.6 });
    expect(CIRCUIT_LOOKS.dustfall.key).toEqual({ color: "#ff9a4a", elevationDeg: 9, azimuthDeg: 35, intensity: 2.2 });
    expect(CIRCUIT_LOOKS.vesper.key).toEqual({ color: "#b9a4ff", elevationDeg: 18, azimuthDeg: 300, intensity: 1 });
    for (const id of CIRCUIT_ORDER) expect(CIRCUIT_LOOKS[id].rim).toEqual({ color: PALETTE.coolantCyan, intensity: 0.35 });
    expect(CIRCUIT_ORDER.filter((id) => CIRCUIT_LOOKS[id].upFill)).toEqual(["vesper"]);
  });

  it("carries the HS-03 environment intensities and the HS-05 fog rows; volumetric fog on DUSTFALL only", () => {
    expect(CIRCUIT_ORDER.map((id) => CIRCUIT_LOOKS[id].environmentIntensity)).toEqual([0.8, 1.1, 0.7]);
    expect(CIRCUIT_LOOKS.grand.fog).toEqual({ color: "#4a3a30", density: 0.016 });
    expect(CIRCUIT_LOOKS.dustfall.fog).toEqual({ color: "#8a5a2e", density: 0.02 });
    expect(CIRCUIT_LOOKS.vesper.fog).toEqual({ color: "#4a4670", density: 0.014 });
    expect(CIRCUIT_ORDER.filter((id) => CIRCUIT_LOOKS[id].volumetricFog)).toEqual(["dustfall"]);
  });

  it("carries the HS-12 post rows: warm bloom 0.55/0.8, vignette 0.28, grain on every circuit (GU47 phase 3), strongest on MEGACITY", () => {
    for (const id of CIRCUIT_ORDER) {
      const look = CIRCUIT_LOOKS[id];
      expect(look.bloom.intensity).toBe(0.55);
      expect(look.bloom.threshold).toBe(0.8);
      expect(look.vignette).toBe(0.28);
    }
    expect(CIRCUIT_ORDER.filter((id) => CIRCUIT_LOOKS[id].grain > 0)).toEqual(["grand", "dustfall", "vesper"]);
  });

  it("gives each circuit one weather system and the HS-07 road roughness", () => {
    expect(CIRCUIT_ORDER.map((id) => CIRCUIT_LOOKS[id].weather)).toEqual(["rain", "dust", "embers"]);
    for (const id of ["grand", "vesper"] as const) {
      expect(CIRCUIT_LOOKS[id].road.roughness).toBeGreaterThanOrEqual(0.15);
      expect(CIRCUIT_LOOKS[id].road.roughness).toBeLessThanOrEqual(0.25);
    }
    expect(CIRCUIT_LOOKS.dustfall.road.roughness).toBe(0.7);
  });

  it("keeps coolant cyan off the warm accents (pickups, shields and the cooling HUD only)", () => {
    for (const id of CIRCUIT_ORDER) {
      const { primary, secondary, lanes } = CIRCUIT_LOOKS[id].accents;
      expect([primary, secondary, lanes].map((c) => c.toLowerCase())).not.toContain(PALETTE.coolantCyan);
    }
  });

  it("places the key from elevation/azimuth and the rim opposite it", () => {
    const [x, y, z] = sunPosition(28, 120, 1);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6);
    expect(Math.asin(y) * 180 / Math.PI).toBeCloseTo(28, 6);
    const d = sunDirection(28, 120);
    expect(d[1]).toBeLessThan(0);
    const rim = rimPosition(CIRCUIT_LOOKS.grand);
    const key = sunPosition(28, 120);
    expect(rim[0] * key[0] + rim[2] * key[2]).toBeLessThan(0);
  });

  it("parses the ?circuit= variant param and ignores unknown values", () => {
    expect(circuitFromParam("dustfall")).toBe("dustfall");
    expect(circuitFromParam("vesper")).toBe("vesper");
    expect(circuitFromParam("grand")).toBe("grand");
    expect(circuitFromParam("megacity")).toBeUndefined();
    expect(circuitFromParam(null)).toBeUndefined();
  });
});
