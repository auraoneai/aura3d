// PRD-07 P3-T2/T4 — sky node builders + §6.5 dayNight + star/cloud/moon law.

import { describe, expect, it } from "vitest";
import { sky } from "../../../../packages/engine/src/agent-api/nodes/sky.js";
import { skyFrame, skyProgramDefines, skyProgramKey } from "../../../../packages/rendering/src/atmosphere/SkyEval";
import {
  expectedStarCount,
  starCellOccupancy,
  starVisibilityAtSunElevation
} from "../../../../packages/rendering/src/atmosphere/StarField";
import {
  cloudElevationScale,
  cloudFrame,
  cloudHorizonFade,
  cloudMaskEdge
} from "../../../../packages/rendering/src/atmosphere/CloudLayer";
import { gradientEvaluate, gradientFrame } from "../../../../packages/rendering/src/atmosphere/GradientSky";

type SkyNodeLike = { kind: string; spec: { model: string; moon?: unknown; sun?: { elevationDeg: number } } };

describe("P3-T4 sky builders", () => {
  it("sky.preetham emits a sky node with model 'preetham'", () => {
    const node = sky.preetham({ sun: { elevationDeg: 45, azimuthDeg: 120 }, turbidity: 4 }).toJSON() as unknown as SkyNodeLike;
    expect(node.kind).toBe("sky");
    expect(node.spec.model).toBe("preetham");
    expect(node.spec.sun?.elevationDeg).toBe(45);
  });

  it("sky.gradient and sky.hdri emit their models", () => {
    const g = sky.gradient({ zenith: "#334477", horizon: "#aabbcc" }).toJSON() as unknown as SkyNodeLike;
    expect(g.spec.model).toBe("gradient");
    const h = sky.hdri({ url: "env/sky.hdr" } as never).toJSON() as unknown as SkyNodeLike;
    expect(h.spec.model).toBe("hdri");
  });

  it("dayNight emits legacy primitives tagged prd07.legacySky.* plus one sky node", () => {
    const out = sky.dayNight({ hour: 23, seed: 42 });
    expect(out.sky.model).toBe("preetham");
    const nodes = out.nodes as unknown as Array<{ kind: string; runtime?: { id?: string; tags?: readonly string[] } }>;
    const skyNodes = nodes.filter((n) => n.kind === "sky");
    expect(skyNodes).toHaveLength(1);
    const tagged = nodes.filter((n) => n.runtime?.id?.startsWith("prd07.legacySky."));
    // Night hour → stars + moon + clouds are all tagged.
    expect(tagged.length).toBeGreaterThanOrEqual(3);
    for (const n of tagged) {
      expect(n.runtime?.tags).toContain("prd07.legacySky");
    }
    // Directional key light is present and NOT tagged (it stays either way).
    expect(nodes.some((n) => n.kind === "light")).toBe(true);
    expect(out.dayFactor).toBeLessThan(0.5);
    expect(out.visibleStarCount).toBeGreaterThan(0);
  });

  it("dayNight preserves the legacy return shape plus the sky spec", () => {
    const out = sky.dayNight({ hour: 12 });
    expect(typeof out.background).toBe("string");
    expect(typeof out.dayFactor).toBe("number");
    expect(out.sky.model).toBe("preetham");
    const gradient = sky.dayNight({ hour: 12, model: "gradient" });
    expect(gradient.sky.model).toBe("gradient");
  });
});

describe("P3-T2 sky frame law", () => {
  it("gradient is monotonic between zenith and horizon", () => {
    const frame = gradientFrame({ model: "gradient", zenith: [0.1, 0.2, 0.5], horizon: [0.9, 0.85, 0.8], ground: [0.2, 0.2, 0.2] });
    let prev = -Infinity;
    for (const t of [0.05, 0.25, 0.5, 0.75, 1.0, 2.0]) {
      // direction [2, t, 0] — normalized y rises from ~0.02 to ~0.7 (horizon→zenith).
      const [r] = gradientEvaluate(frame, [2, t, 0]);
      // horizon red (0.9) → zenith red (0.1): monotone decreasing with y.
      expect(r).toBeLessThanOrEqual(prev === -Infinity ? Infinity : prev + 1e-6);
      prev = r;
    }
    const nearHorizon = gradientEvaluate(frame, [1, 0.001, 0])[0];
    const atZenith = gradientEvaluate(frame, [0, 1, 0])[0];
    expect(nearHorizon).toBeGreaterThan(atZenith);
  });

  it("star count is proportional to density", () => {
    expect(expectedStarCount(0)).toBe(0);
    expect(expectedStarCount(0.5)).toBeGreaterThan(expectedStarCount(0.25));
    expect(expectedStarCount(1)).toBe(Math.round(512 * 512 * starCellOccupancy(1)));
  });

  it("stars fade to 0 once the sun clears 6 degrees", () => {
    expect(starVisibilityAtSunElevation(0)).toBe(1);
    expect(starVisibilityAtSunElevation(-30)).toBe(1);
    expect(starVisibilityAtSunElevation(6.0001)).toBe(0);
    expect(starVisibilityAtSunElevation(20)).toBe(0);
    expect(starVisibilityAtSunElevation(3)).toBeGreaterThan(0);
    expect(starVisibilityAtSunElevation(3)).toBeLessThan(1);
  });

  it("skyFrame carries the moon into the program key", () => {
    const withMoon = skyFrame({ model: "gradient", zenith: [0, 0, 0.2], horizon: [0, 0, 0.4], moon: { elevationDeg: 30, azimuthDeg: 40, phase: 0.5 } });
    expect(withMoon.moon).not.toBeNull();
    const d = skyProgramDefines(withMoon);
    expect(d.moon).toBe(true);
    expect(skyProgramKey(d)).toContain(".moon");
    expect(skyProgramKey(skyProgramDefines(skyFrame({ model: "gradient", zenith: [0, 0, 0.2], horizon: [0, 0, 0.4] })))).not.toContain(".moon");
  });

  it("stars dim via sun elevation inside skyFrame", () => {
    const night = skyFrame({ model: "preetham", sun: { elevationDeg: -30, azimuthDeg: 0 }, stars: { density: 0.8 } });
    const day = skyFrame({ model: "preetham", sun: { elevationDeg: 40, azimuthDeg: 0 }, stars: { density: 0.8 } });
    expect(night.stars.intensity).toBeGreaterThan(day.stars.intensity);
  });

  it("cloud frame mirrors the shader constants", () => {
    const c = cloudFrame({ coverage: 0.5, elevation: 0.5 });
    expect(cloudMaskEdge(c.coverage)).toBeCloseTo(0.5, 6);
    expect(cloudElevationScale(c.elevation)).toBeCloseTo(0.55, 6);
    expect(cloudHorizonFade(0, c.elevation)).toBe(0);
    expect(cloudHorizonFade(0.2, c.elevation)).toBe(1);
  });
});
