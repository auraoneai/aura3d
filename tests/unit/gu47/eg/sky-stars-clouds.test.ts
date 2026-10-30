/**
 * GU47 E-G (WP-7 item 5): typed `stars?: { count; brightness? }` and
 * `clouds?: { coverage; speed?; color? }` on `sky.preetham` / `sky.gradient`,
 * bound to StarField / CloudLayer and the sky program uniforms.
 */
import { describe, expect, it } from "vitest";
import { sky } from "../../../../packages/engine/src/agent-api/nodes/sky";
import type { AuraSkySpec } from "../../../../packages/engine/src/contracts/atmosphere";
import { skyFrame, skyProgramDefines, skyProgramKey } from "../../../../packages/rendering/src/atmosphere/SkyEval";
import { gradientSunfade, skyUniforms } from "../../../../packages/rendering/src/atmosphere/SkyBackgroundPass";
import { CLOUD_BASE_SPEED, cloudFrame, cloudTintLinear } from "../../../../packages/rendering/src/atmosphere/CloudLayer";
import {
  STAR_DENSITY_MAX,
  STARS_PER_DENSITY,
  starDensityForCount,
  starFrame,
  visibleStarCount
} from "../../../../packages/rendering/src/atmosphere/StarField";
import { skyFragmentSource } from "../../../../packages/rendering/src/atmosphere/sky.glsl";

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const specOf = (builder: { toJSON(): unknown }): AuraSkySpec => (builder.toJSON() as { spec: AuraSkySpec }).spec;
const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

describe("GU47 E-G StarField count/brightness", () => {
  it("count maps to the density that shows that many stars above the horizon", () => {
    for (const count of [12, 300, 2400]) {
      expect(visibleStarCount(starDensityForCount(count))).toBeCloseTo(count, 6);
    }
    expect(starDensityForCount(0)).toBe(0);
    expect(starDensityForCount(-5)).toBe(0);
    expect(starDensityForCount(Number.NaN)).toBe(0);
    expect(starDensityForCount(STARS_PER_DENSITY * STAR_DENSITY_MAX * 10)).toBe(STAR_DENSITY_MAX);
  });

  it("typed fields win over the raw form; the raw form and absence are unchanged", () => {
    expect(starFrame({ count: 600, brightness: 1.5 })).toEqual({ density: starDensityForCount(600), intensity: 1.5 });
    expect(starFrame({ count: 600, density: 3, intensity: 9 })).toEqual({ density: starDensityForCount(600), intensity: 9 });
    expect(starFrame({ density: 0.8, intensity: 2 })).toEqual({ density: 0.8, intensity: 2 });
    expect(starFrame(undefined)).toEqual({ density: 0, intensity: 1 });
    expect(starFrame({ enabled: true, auroraBand: true })).toEqual({ density: 0, intensity: 1 });
  });
});

describe("GU47 E-G CloudLayer coverage/speed/color", () => {
  it("defaults are the pre-GU47 values (speed 1 = the old 0.0001 uv/s drift)", () => {
    expect(cloudFrame(undefined)).toEqual({ scale: 0.0002, speed: CLOUD_BASE_SPEED, coverage: 0, density: 0.4, elevation: 0.5, color: [1, 1, 1] });
    expect(CLOUD_BASE_SPEED).toBe(0.0001);
  });

  it("speed multiplies the base drift, coverage clamps to 0..1, color is linear RGB", () => {
    const frame = cloudFrame({ coverage: 1.7, speed: 2.5, color: "#ffcc99" });
    expect(frame.coverage).toBe(1);
    expect(frame.speed).toBeCloseTo(2.5 * CLOUD_BASE_SPEED, 12);
    expect(frame.color[0]).toBeCloseTo(1, 6);
    expect(frame.color[1]).toBeCloseTo(srgbToLinear(0xcc / 255), 6);
    expect(frame.color[2]).toBeCloseTo(srgbToLinear(0x99 / 255), 6);
    expect(cloudFrame({ coverage: 0.4, speed: 0 }).speed).toBe(0);
    expect(cloudFrame({ coverage: -1 }).coverage).toBe(0);
    expect(cloudTintLinear("#fff")).toEqual([1, 1, 1]);
    expect(cloudTintLinear("not-a-colour")).toEqual([1, 1, 1]);
  });
});

describe("GU47 E-G typed sky.preetham", () => {
  const night = sky.preetham({
    sun: { elevationDeg: -20, azimuthDeg: 90 },
    stars: { count: 800, brightness: 1.4 },
    clouds: { coverage: 0.45, speed: 2, color: "#ffd8b0" }
  });

  it("carries the typed fields on the node spec and resolves them in skyFrame", () => {
    const spec = specOf(night);
    expect(spec).toMatchObject({ model: "preetham", stars: { count: 800, brightness: 1.4 }, clouds: { coverage: 0.45, speed: 2, color: "#ffd8b0" } });
    const frame = skyFrame(spec as never);
    expect(frame.stars.density).toBeCloseTo(starDensityForCount(800), 9);
    // Sun 20° below the horizon: full star visibility.
    expect(frame.stars.intensity).toBeCloseTo(1.4, 6);
    expect(frame.clouds.coverage).toBe(0.45);
    expect(frame.clouds.speed).toBeCloseTo(2 * CLOUD_BASE_SPEED, 12);
    const defines = skyProgramDefines(frame);
    expect(defines.stars).toBe(true);
    expect(defines.clouds).toBe(true);
    expect(skyProgramKey(defines)).toContain(".clouds");
  });

  it("binds star density, cloud coverage/speed and the cloud tint uniforms", () => {
    const frame = skyFrame(specOf(night) as never);
    const uniforms = skyUniforms(frame, IDENTITY, 3);
    expect(uniforms.get("u_starDensity")).toBeCloseTo(starDensityForCount(800), 9);
    expect(uniforms.get("u_cloudCoverage")).toBe(0.45);
    expect((uniforms.get("u_cloudScaleSpeed") as number[])[1]).toBeCloseTo(2 * CLOUD_BASE_SPEED, 12);
    const tint = uniforms.get("u_cloudTint") as number[];
    expect(tint[0]).toBeCloseTo(1, 6);
    expect(tint[2]).toBeCloseTo(srgbToLinear(0xb0 / 255), 6);
  });

  it("a preetham sky without the typed fields keeps its program and a white tint", () => {
    const plain = skyFrame(specOf(sky.preetham({ sun: { elevationDeg: 40, azimuthDeg: 120 }, turbidity: 4 })) as never);
    expect(skyProgramDefines(plain).clouds).toBe(false);
    expect(skyUniforms(plain, IDENTITY, 0).get("u_cloudTint")).toEqual([1, 1, 1]);
    expect(skyUniforms(plain, IDENTITY, 0).get("u_starDensity")).toBe(0);
  });
});

describe("GU47 E-G typed sky.gradient", () => {
  it("gradient skies take clouds and stars; stars and the moon show at night", () => {
    const nightSpec = specOf(sky.gradient({ zenith: "#060a16", horizon: "#1b2a44", stars: { count: 400 }, clouds: { coverage: 0.3, color: "#8899aa" } }));
    expect(nightSpec).toMatchObject({ model: "gradient", clouds: { coverage: 0.3 } });
    const frame = skyFrame(nightSpec as never);
    const defines = skyProgramDefines(frame);
    expect(defines.model).toBe("GRADIENT");
    expect(defines.stars).toBe(true);
    expect(defines.clouds).toBe(true);
    // No sun: night. The star term (1 - u_sunfade) * 2 = 1, so stars are visible.
    const uniforms = skyUniforms(frame, IDENTITY, 0);
    expect(uniforms.get("u_sunfade")).toBeCloseTo(0.5, 6);
    expect(uniforms.get("u_starDensity")).toBeCloseTo(starDensityForCount(400), 9);
  });

  it("a day gradient keeps the pre-GU47 u_sunfade of 1 (stars hidden, no change)", () => {
    const day = skyFrame(specOf(sky.gradient({ zenith: "#3a7bd5", horizon: "#cfe8ff", sun: { elevationDeg: 50, azimuthDeg: 30 } })) as never);
    expect(skyUniforms(day, IDENTITY, 0).get("u_sunfade")).toBe(1);
    expect(skyProgramDefines(day).stars).toBe(false);
    expect(skyProgramDefines(day).clouds).toBe(false);
    expect(gradientSunfade({ sunDirection: [0, 1, 0] })).toBe(1);
    expect(gradientSunfade({ sunDirection: null })).toBeCloseTo(0.5, 6);
    expect(gradientSunfade({ sunDirection: [0, -0.5, 0.866] })).toBeCloseTo(0.5, 6);
  });

  it("the gradient cloud branch lights clouds from the gradient and applies the tint", () => {
    const frag = skyFragmentSource({ model: "GRADIENT", stars: false, clouds: true, sunDisc: false, moon: false, fog: false } as never);
    expect(frag).toContain("uniform vec3 u_cloudTint;");
    expect(frag).toContain("#define MODEL_GRADIENT 1");
    expect(frag).toMatch(/#if MODEL_GRADIENT\s+\/\/ GU47 E-G/);
    expect(frag).toContain("cloudColor *= u_cloudTint;");
  });
});
