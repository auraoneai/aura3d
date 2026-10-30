import { describe, expect, it } from "vitest";
import { fcQaCrops, projectPoint } from "../../../apps/showcase-aura-fc-3d/src/game/qaCrops";

/** GU47 E-I crop contract (lane g09): crops are named, normalised 0..1 and follow the camera. */
const BROADCAST = { eye: [0, 11.5, 23.5] as const, target: [0, 0.9, -1] as const, fovDeg: 40, aspect: 16 / 9 };

describe("aura-fc-3d QA crops", () => {
  it("projects the camera target to the screen centre", () => {
    const c = projectPoint(BROADCAST, BROADCAST.target)!;
    expect(c[0]).toBeCloseTo(0.5, 5);
    expect(c[1]).toBeCloseTo(0.5, 5);
    expect(projectPoint(BROADCAST, [0, 11.5, 40])).toBeNull();
  });

  it("publishes valid named crops from the broadcast view; the crowd sits above the pitch", () => {
    const crops = fcQaCrops(BROADCAST, { x: 2, z: 1 }, [0, 0.21, 0]);
    const names = crops.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["player", "ball", "pitch", "crowd"]));
    for (const c of crops) {
      expect(c.name).toMatch(/^[a-z0-9][a-z0-9_-]{0,31}$/);
      for (const v of [c.x, c.y, c.w, c.h]) expect(v).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(1);
      expect(c.y + c.h).toBeLessThanOrEqual(1);
    }
    const by = Object.fromEntries(crops.map((c) => [c.name, c]));
    expect(by.crowd.y).toBeLessThan(by.pitch.y);
    expect(crops.length).toBeLessThanOrEqual(16);
  });

  it("the player crop moves with the player", () => {
    const a = fcQaCrops(BROADCAST, { x: -8, z: 0 }, [0, 0.2, 0]).find((c) => c.name === "player")!;
    const b = fcQaCrops(BROADCAST, { x: 8, z: 0 }, [0, 0.2, 0]).find((c) => c.name === "player")!;
    expect(b.x).toBeGreaterThan(a.x);
  });
});
