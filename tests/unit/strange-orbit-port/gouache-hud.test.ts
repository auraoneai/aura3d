import { describe, expect, it } from "vitest";
import { arcDash, gapLabel, ringPoint } from "../../../examples/strange-orbit-port/art/hud";
import { COURSE_LENGTH } from "../../../examples/strange-orbit-port/course";

/** GU47 SO47-H1 (lane g15): pure parts of the gouache HUD (arc fill, orbit minimap, gap text). */
describe("strange-orbit-port gouache HUD", () => {
  it("fills the arc proportionally and clamps", () => {
    const len = (d: string) => Number(d.split(" ")[0]);
    expect(len(arcDash(0))).toBe(0);
    expect(len(arcDash(0.5)) * 2).toBeCloseTo(len(arcDash(1)), 0);
    expect(arcDash(2)).toBe(arcDash(1));
  });

  it("places riders on the orbit ring by course distance, wrapping laps", () => {
    expect(ringPoint(0)).toEqual({ x: 0.5, y: expect.closeTo(0.1, 5) });
    expect(ringPoint(COURSE_LENGTH / 4).x).toBeCloseTo(0.9, 5);
    expect(ringPoint(COURSE_LENGTH + 10).x).toBeCloseTo(ringPoint(10).x, 9);
  });

  it("labels the gap to the rider ahead", () => {
    expect(gapLabel(null)).toBe("Leading");
    expect(gapLabel(12.4)).toBe("+12 m to next");
  });
});
