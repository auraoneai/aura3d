/**
 * GU47 phase 2 (receipt `sky`: "sky.gradient stars" measured 0 star pixels
 * once the sky triangle drew): `sky.gradient` passes its zenith / horizon /
 * ground as hex strings, and gradientFrame indexed them as characters
 * (`["#", "0", "5"]`). The sky program's u_zenith / u_horizon read NaN, so
 * the gradient and the stars added to it never reached the frame, and the
 * CPU horizon radiance (sky IBL) was NaN as well.
 */
import { describe, expect, it } from "vitest";
import { sky } from "../../../../packages/engine/src/agent-api/nodes/sky";
import { skyFrame, evaluateSky } from "../../../../packages/rendering/src/atmosphere/SkyEval";
import { gradientFrame } from "../../../../packages/rendering/src/atmosphere/GradientSky";

const srgb = (v: number) => Math.pow(v / 255, 2.2);
const specOf = (builder: { toJSON(): unknown }) => (builder.toJSON() as { spec: never }).spec;

describe("GU47 phase 2 gradient sky hex colours", () => {
  it("the receipt's night gradient resolves to finite linear colours", () => {
    const frame = skyFrame(specOf(sky.gradient({ zenith: "#050913", horizon: "#16243a", stars: { count: 1500, brightness: 1.4 } })));
    expect(frame.gradient!.zenith).toEqual([srgb(0x05), srgb(0x09), srgb(0x13)]);
    expect(frame.gradient!.horizon).toEqual([srgb(0x16), srgb(0x24), srgb(0x3a)]);
    for (const dir of [[0, 1, 0], [0, 0.2, -1], [0, -0.5, -1]] as const) {
      expect(evaluateSky(frame, [...dir]).every(Number.isFinite)).toBe(true);
    }
  });

  it("short hex, arrays and the ground colour resolve; unparseable colours fall back", () => {
    const frame = gradientFrame({ model: "gradient", zenith: "#fff", horizon: [0.5, 0.25, 0.125], ground: "#000000" });
    expect(frame.zenith).toEqual([1, 1, 1]);
    expect(frame.horizon).toEqual([0.5, 0.25, 0.125]);
    expect(frame.ground).toEqual([0, 0, 0]);
    const fallback = gradientFrame({ model: "gradient", zenith: "teal", horizon: [Number.NaN, 0, 0] });
    expect(fallback.zenith).toEqual([0.08, 0.16, 0.38]);
    expect(fallback.horizon).toEqual([0.55, 0.65, 0.8]);
    expect(fallback.ground).toEqual([0.12, 0.12, 0.13]);
  });
});
