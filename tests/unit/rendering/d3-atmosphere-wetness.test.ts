import { describe, expect, it } from "vitest";
import {
  applyWetnessToColor,
  applyWetnessToRoughness,
  describeWetMaterial,
  sampleLightningFlash,
  samplePuddleMask
} from "../../../packages/rendering/src/AtmosphereWetness";
import { createWeatherState } from "../../../packages/rendering/src/Weather";

describe("D3 wetness + lightning descriptors", () => {
  it("darkens albedo monotonically and never below 55% of dry", () => {
    const dry = "#5b6b4f";
    const half = applyWetnessToColor(dry, 0.5);
    const full = applyWetnessToColor(dry, 1);
    expect(applyWetnessToColor(dry, 0)).toBe(dry.toLowerCase());
    expect(half).not.toBe(dry.toLowerCase());
    const channel = (hex: string, index: number): number => parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
    for (let index = 0; index < 3; index += 1) {
      expect(channel(half, index)).toBeLessThan(channel(dry, index));
      expect(channel(full, index)).toBeLessThan(channel(half, index));
      expect(channel(full, index)).toBeGreaterThanOrEqual(Math.floor(channel(dry, index) * 0.55) - 1);
    }
  });

  it("lowers roughness with wetness but never raises it", () => {
    expect(applyWetnessToRoughness(0.9, 0)).toBe(0.9);
    const wet = applyWetnessToRoughness(0.9, 1);
    expect(wet).toBeLessThan(0.9);
    expect(wet).toBeGreaterThan(0);
    expect(applyWetnessToRoughness(0.9, 0.5)).toBeGreaterThan(wet);
  });

  it("derives wetness from createWeatherState with puddle patches for rain", () => {
    const probe = describeWetMaterial({ type: "rain" });
    const weather = createWeatherState({ type: "rain", elapsedSeconds: 1, seed: 0xd3e7 });
    expect(probe.response.wetness).toBe(weather.wetness);
    expect(probe.response.wetness).toBeGreaterThan(0);
    expect(probe.weather.puddlePatches.length).toBeGreaterThan(0);
    expect(probe.response.albedoColor).not.toBe("#5b6b4f");
    const dryProbe = describeWetMaterial({ type: "clear" });
    expect(dryProbe.response.wetness).toBe(0);
    expect(dryProbe.response.albedoColor).toBe("#5b6b4f");
    expect(dryProbe.weather.puddlePatches.length).toBe(0);
  });

  it("samples a smooth puddle mask peaked at patch centers", () => {
    const weather = createWeatherState({ type: "rain", elapsedSeconds: 2, seed: 0xd3e7 });
    const patch = weather.puddlePatches[0]!;
    expect(samplePuddleMask(weather.puddlePatches, patch.x, patch.z)).toBeGreaterThan(0.9);
    expect(samplePuddleMask(weather.puddlePatches, patch.x + 99, patch.z + 99)).toBe(0);
    expect(samplePuddleMask([], 0, 0)).toBe(0);
  });

  it("fires lightning only for thunderstorms with bounded intensity", () => {
    expect(sampleLightningFlash({ type: "rain", elapsedSeconds: 3 }).intensity).toBe(0);
    expect(sampleLightningFlash({ type: "clear", elapsedSeconds: 3 }).intensity).toBe(0);
    const flashes = Array.from({ length: 40 }, (_, index) =>
      sampleLightningFlash({ type: "thunderstorm", elapsedSeconds: index * 0.25, seed: 5 }).intensity);
    for (const flash of flashes) {
      expect(flash).toBeGreaterThanOrEqual(0);
      expect(flash).toBeLessThanOrEqual(1);
    }
    expect(flashes.some((flash) => flash > 0)).toBe(true);
    const stormProbe = describeWetMaterial({ type: "thunderstorm", elapsedSeconds: 0.4 });
    expect(stormProbe.flash.intensity).toBeGreaterThanOrEqual(0);
  });
});
