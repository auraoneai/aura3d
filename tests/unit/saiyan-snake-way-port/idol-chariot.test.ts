/**
 * Moving parts: the spirit chariot is a wheel-less Idol body on four separate Idol wheels, each on its own pivot at the
 * body's axle stubs, and world.ts rolls them every frame by the road distance the chariot covers (spin = distance/radius).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHARIOT_WHEELS, CHARIOT_WHEEL_RADIUS, buildIdolEntityNode, chariotWheelAngle } from "../../../examples/saiyan-snake-way-port/art/idolModels";

interface N { kind?: string; name?: string; position?: number[]; rotation?: number[]; runtime?: { id?: string }; children?: N[] }
const find = (n: N, id: string): N | undefined => (n.runtime?.id === id ? n : (n.children ?? []).map((c) => find(c, id)).find(Boolean));

describe("Serpentine Sky Run Idol chariot wheels", () => {
  const root = buildIdolEntityNode("sweeper", "ent-sweeper-0-0")!.toJSON() as unknown as N;
  const json = JSON.stringify(root);

  it("mounts the wheel-less body and four wheel pivots that sit on the road at the axle stubs", () => {
    expect(json).toContain("ssrSweeperBody");
    expect(json).toContain("ssrCartWheel");
    expect(json).not.toMatch(/"ssrSweeper"/);
    expect(CHARIOT_WHEELS).toHaveLength(4);
    CHARIOT_WHEELS.forEach(([x, z], k) => {
      const pivot = find(root, `ent-sweeper-0-0-wheel-${k}`);
      expect(pivot?.kind).toBe("group");
      // hub at the wheel radius: the rim touches the road (y = 0)
      expect(pivot!.position).toEqual([x, CHARIOT_WHEEL_RADIUS, z]);
      // the wheel model hangs from its hub, disc turned onto the X axle
      expect(pivot!.children![0]!.position![1]).toBeCloseTo(-CHARIOT_WHEEL_RADIUS, 6);
    });
    // left and right wheels on each axle
    expect(new Set(CHARIOT_WHEELS.map(([x]) => Math.sign(x)))).toEqual(new Set([-1, 1]));
  });

  it("rolls without slipping: the rim travels exactly the distance covered", () => {
    for (const d of [0.4, 3, 17.5]) {
      const turned = Math.abs(chariotWheelAngle(d) - chariotWheelAngle(0));
      expect(turned * CHARIOT_WHEEL_RADIUS).toBeCloseTo(d, 9);
    }
    // travelling towards -Z (forward along the road) the top of the wheel moves forward: negative turn about +X
    expect(chariotWheelAngle(1)).toBeLessThan(0);
  });

  it("world.ts spins every wheel pivot from the chariot's road distance each frame", () => {
    const src = readFileSync("examples/saiyan-snake-way-port/world.ts", "utf8");
    expect(src).toContain("const spin = chariotWheelAngle(s);");
    expect(src).toContain("node(`ent-sweeper-${idx}-0-wheel-${k}`).setRotation(spin, 0, 0)");
    // per-frame: two frames of a chariot at 14 m/s give different wheel angles
    const a = chariotWheelAngle(1000), b = chariotWheelAngle(1000 + 14 / 60);
    expect(Math.abs(b - a)).toBeGreaterThan(0.3);
  });
});
