import { describe, expect, it } from "vitest";
import { createRecastNavigation } from "@aura3d/navigation-recast";

const plane = {
  positions: [-5, 0, -5, 5, 0, -5, 5, 0, 5, -5, 0, 5],
  indices: [0, 2, 1, 0, 3, 2]
} as const;

describe("O1 crowd telemetry from the Detour handle", () => {
  it("reports per-agent position, velocity and speed from real crowd state", async () => {
    const navigation = await createRecastNavigation();
    const mesh = navigation.generateSolo(plane, {});
    const crowd = mesh.createCrowd(8, 0.5);
    expect(crowd.maxAgents).toBe(8);
    expect(crowd.count()).toBe(0);
    const agent = crowd.addAgent([-3, 0, -3], { radius: 0.25, height: 1, maxSpeed: 2, maxAcceleration: 8 });
    expect(crowd.count()).toBe(1);
    expect(crowd.setTarget(agent, [3, 0, 3])).toBe(true);
    for (let step = 0; step < 30; step += 1) crowd.update(1 / 60);
    const states = crowd.agentStates();
    expect(states).toHaveLength(1);
    expect(states[0]!.speed).toBeGreaterThan(0);
    expect(states[0]!.position[0]).toBeGreaterThan(-3);
    crowd.dispose();
    mesh.dispose();
  });

  it("refuses to add agents past the cap instead of silently dropping them", async () => {
    const navigation = await createRecastNavigation();
    const mesh = navigation.generateSolo(plane, {});
    const crowd = mesh.createCrowd(1, 0.5);
    crowd.addAgent([0, 0, 0], { radius: 0.25, height: 1, maxSpeed: 1, maxAcceleration: 4 });
    expect(() => crowd.addAgent([1, 0, 1], { radius: 0.25, height: 1, maxSpeed: 1, maxAcceleration: 4 })).toThrow(/capacity/);
    crowd.dispose();
    mesh.dispose();
  });

  it("fails closed with an actionable error when the optional peer is absent", async () => {
    await expect(
      createRecastNavigation({
        moduleLoader: async () => {
          throw new Error("Cannot find module 'recast-navigation'");
        }
      })
    ).rejects.toThrow(/peer unavailable.*recast-navigation/);
  });
});
