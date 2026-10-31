import { describe, expect, it } from "vitest";
import { BACKDROP_DIST, backdropFlat, dioramaPose, screenY } from "../../../apps/showcase-cross-hop/src/game/diorama";

// GU47 phase 2 (CH47-11): the painted backdrop flat puts a horizon band in the top 18-28 % of the high diorama frame.
describe("cross-hop backdrop flat", () => {
  const rest = dioramaPose({ x: 0, z: 0, sinceStart: Infinity, sinceTheme: Infinity, sinceDeath: Infinity, reducedMotion: true });
  const flat = backdropFlat(rest.position, rest.target, rest.fov, -0.16);

  it("stands BACKDROP_DIST ahead of the camera and its foot falls 18-28 % from the frame top", () => {
    expect(flat.z).toBeCloseTo(rest.position[2] - BACKDROP_DIST, 6);
    const foot = screenY([0, -0.16, flat.z], rest.position, rest.target, rest.fov)!;
    expect(foot).toBeGreaterThan(0.18);
    expect(foot).toBeLessThan(0.28);
  });

  it("stacks contiguous bands whose top band reaches past the frame top", () => {
    let lo = -0.16;
    for (const b of flat.bands) {
      expect(b.height).toBeGreaterThan(0);
      expect(b.y - b.height / 2).toBeCloseTo(lo, 6);
      lo = b.y + b.height / 2;
    }
    expect(screenY([0, lo, flat.z], rest.position, rest.target, rest.fov)).toBe(0);
  });

  it("keeps the top band past the frame top through the intro crane", () => {
    const crane = dioramaPose({ x: 0, z: 0, sinceStart: 0, sinceTheme: Infinity, sinceDeath: Infinity, reducedMotion: false });
    const f = backdropFlat(crane.position, crane.target, crane.fov, -0.16);
    const last = f.bands[f.bands.length - 1]!;
    expect(screenY([0, last.y + last.height / 2, f.z], crane.position, crane.target, crane.fov)).toBe(0);
  });
});
