/**
 * GU47 phase 2 (uniform haze, aura-hoops-3d athens and every look override that authors a fog range): `looks.nodes`
 * writes `effects.fog({ color, density: 24 / far, near, far })` and documents near/far as the linear range. Authored
 * near/far counted as "semantic" C-21 authoring, so no mode meant the height default and the 24/far density became a
 * per-metre exponential fog at maxOpacity 1 (athens 0.075/m: 78% fog colour on the court 20 m away).
 */
import { describe, expect, it } from "vitest";
import { fogAmount, packLegacy, resolvePrd07FogSpec } from "../../../../packages/rendering/src/atmosphere/HeightFog";
import { looks } from "../../../../packages/engine/src/agent-api/looks/looks";

const CAMERA: [number, number, number] = [0, 6, 16];
const COURT: [number, number, number] = [0, 0, 0];

describe("a fog that authors near/far and no mode is the linear range fog", () => {
  it("the athens court fog (0.075 density, 60-320 m) leaves the court 17 m away clear and reaches full fog at 320 m", () => {
    const spec = { color: "#cbd8e2", density: 24 / 320, near: 60, far: 320 };
    expect(resolvePrd07FogSpec(spec).mode).toBe("linear");
    expect(fogAmount(CAMERA, COURT, spec)).toBe(0);
    expect(fogAmount([0, 0, 0], [0, 0, 190], spec)).toBeCloseTo(0.5, 6);
    expect(fogAmount([0, 0, 0], [0, 0, 400], spec)).toBe(1);
    const packed = packLegacy(spec, CAMERA[1]);
    expect(packed.mode).toBe("linear");
    expect([packed.near, packed.far]).toEqual([60, 320]);
  });

  it("the look node itself resolves linear (looks.nodes outdoor-day with a fog override)", () => {
    const fog = looks.nodes("outdoor-day", { fog: { color: "#cbd8e2", near: 60, far: 320 } })
      .map((node) => node.toJSON() as { effect?: string; mode?: string; near?: number; far?: number; density?: number })
      .find((node) => node.effect === "fog")!;
    expect(fog).toBeDefined();
    expect(resolvePrd07FogSpec(fog as never).mode).toBe("linear");
  });

  it("unchanged: density-only stays exp2, an explicit mode wins, height fields keep height, no fields keep the C-21 height default", () => {
    expect(resolvePrd07FogSpec({ density: 0.03 }).mode).toBe("exp2");
    expect(resolvePrd07FogSpec({ mode: "exp", density: 0.03, near: 10, far: 90 }).mode).toBe("exp");
    expect(resolvePrd07FogSpec({ density: 0.03, near: 10, far: 90, heightFalloff: 0.2 }).mode).toBe("height");
    expect(resolvePrd07FogSpec({ density: 0.03, near: 10, far: 90, heightDensity: 0.01 }).mode).toBe("height");
    expect(resolvePrd07FogSpec({ heightFalloff: 0.2 }).mode).toBe("height");
    expect(resolvePrd07FogSpec({}).mode).toBe("height");
  });
});
