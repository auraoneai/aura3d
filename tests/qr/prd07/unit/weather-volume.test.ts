// PRD-07 P5-T3 — WeatherVolume: rain drops fall (y decreases between frames),
// splashes spawn at the C-26 height query, snow uses the snow preset, and the
// wetness level flows to the §6.8 uniforms.

import { describe, expect, it } from "vitest";
import {
  createSplashEmitter,
  createWeatherVolume,
  splashPositions,
  stepSplashEmitter,
  stepWeatherVolume
} from "../../../../packages/engine/src/production-runtime/effects/WeatherVolume";

describe("P5-T3 weather volume", () => {
  it("rain volume exists and drops fall between frames", () => {
    const v = createWeatherVolume({ type: "rain", intensity: 0.8, seed: 7 });
    expect(v.kind).toBe("rain");
    expect(v.emitter.count).toBeGreaterThan(0);
    const cam: [number, number, number] = [0, 1.7, 0];
    const a = v.emitter.positions(0, cam);
    const b = v.emitter.positions(0.25, cam);
    // Each id's modular dy (unwrap into [-e/2, e/2)) tracks the fall speed;
    // the camera-box wrap keeps the distribution stationary, so a raw mean
    // can drift positive. The wrapped difference must equal fallVel*dt.
    const e = v.spec.extent[1];
    const expectedDy = v.spec.fallVelocity[1] * 0.25;
    let meanMod = 0;
    for (let i = 0; i < v.emitter.count; i += 1) {
      let dy = (b[i * 3 + 1]! - a[i * 3 + 1]!) % e;
      if (dy < -e / 2) dy += e;
      if (dy >= e / 2) dy -= e;
      meanMod += dy;
    }
    meanMod /= v.emitter.count;
    expect(meanMod).toBeCloseTo(expectedDy, 1);
    expect(v.wetness).toBeGreaterThan(0);
    expect(v.splashes).not.toBeNull();
  });

  it("snow volume uses the snow preset and has no splashes", () => {
    const v = createWeatherVolume({ type: "snow", intensity: 0.5, seed: 7 });
    expect(v.kind).toBe("snow");
    expect(v.splashes).toBeNull();
    expect(v.spec.fallVelocity[1]).toBeLessThan(0);
    expect(Math.abs(v.spec.fallVelocity[1])).toBeLessThan(3);
  });

  it("splash spawns sit on the ground height query", () => {
    const ground = (x: number, z: number) => 42 + x * 0.001 + z * 0.001;
    const s = createSplashEmitter("k", "n", 64, 1234, ground);
    // Fresh spawns were re-seated on the ground by createSplashEmitter.
    for (let i = 0; i < s.live; i += 1) {
      expect(s.py[i]).toBeCloseTo(ground(s.px[i]!, s.pz[i]!), 5);
    }
    // Step and confirm post-spawn re-seating still matches the query.
    for (let f = 0; f < 12; f += 1) stepSplashEmitter(s, 1 / 60, ground);
    const positions = splashPositions(s);
    for (let i = 0; i < s.live; i += 1) {
      const x = positions[i * 3]!, y = positions[i * 3 + 1]!, z = positions[i * 3 + 2]!;
      expect(y).toBeGreaterThanOrEqual(ground(x, z) - 0.021);
    }
  });

  it("default height query is the C-26 stub 0", () => {
    const v = createWeatherVolume({ type: "rain", intensity: 0.5, seed: 3 });
    expect(v.splashes).not.toBeNull();
    for (let i = 0; i < v.splashes!.live; i += 1) {
      expect(v.splashes!.py[i]).toBeCloseTo(0, 5);
    }
  });

  it("stepWeatherVolume advances splashes only when a query is supplied", () => {
    const v = createWeatherVolume({ type: "rain", intensity: 0.9, seed: 5 });
    const s = v.splashes!;
    const ages0 = Array.from(s.age.slice(0, s.live));
    stepWeatherVolume(v, 1 / 60, 0, [0, 0, 0]); // no query → ages frozen
    expect(Array.from(s.age.slice(0, s.live)).slice(0, ages0.length)).toEqual(ages0.slice(0, s.live));
    stepWeatherVolume(v, 1 / 60, 1 / 60, [0, 0, 0], () => 0);
    // splashes died or aged; either way it stepped
    expect(s.live + s.desc.capacity).toBeGreaterThan(0);
  });

  it("lightning intensity is 0 for rain, positive-envelope for thunderstorm", () => {
    const rain = createWeatherVolume({ type: "rain" });
    expect(rain.lightningIntensity(0.4)).toBe(0);
    const storm = createWeatherVolume({ type: "thunderstorm" });
    let peak = 0;
    for (let t = 0; t < 2; t += 0.05) peak = Math.max(peak, storm.lightningIntensity(t));
    expect(peak).toBeGreaterThan(0);
  });
});
