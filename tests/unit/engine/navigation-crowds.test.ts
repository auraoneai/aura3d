import { describe, expect, it } from "vitest";
import { crowds, navigation } from "../../../packages/engine/src/agent-api/NavigationCrowds";

// Hermetic O1 bridge test: the peer is fully injected, so this suite never
// touches the optional @aura3d/navigation-recast package or a browser.
function fakePeer() {
  const agents: { position: [number, number, number]; target: [number, number, number] | null }[] = [];
  const crowd = {
    maxAgents: 2,
    count: () => agents.length,
    addAgent: (position: readonly [number, number, number]) => {
      if (agents.length >= 2) throw new Error("at capacity");
      const agent = { position: [position[0], position[1], position[2]] as [number, number, number], target: null as [number, number, number] | null };
      agents.push(agent);
      return agent;
    },
    setTarget: (agent: { target: [number, number, number] | null }, target: readonly [number, number, number]) => {
      agent.target = [target[0], target[1], target[2]];
      return true;
    },
    update: (dt: number) => {
      for (const agent of agents) {
        if (!agent.target) continue;
        for (let axis = 0; axis < 3; axis += 1) {
          const delta = agent.target[axis]! - agent.position[axis]!;
          agent.position[axis] = agent.position[axis]! + Math.sign(delta) * Math.min(Math.abs(delta), dt);
        }
      }
    },
    agentStates: () =>
      agents.map((agent) => ({ position: agent.position, velocity: [0, 0, 0] as const, speed: 0 }))
  };
  const mesh = {
    computePath: (from: readonly [number, number, number], to: readonly [number, number, number]) => ({
      success: true,
      points: [from, to] as const
    }),
    createCrowd: () => crowd
  };
  return {
    createRecastNavigation: async () => ({ generateSolo: () => mesh }),
    __crowd: crowd
  };
}

describe("navigation root builders (O1)", () => {
  it("bakes a mesh and retains path waypoints through the injected peer", async () => {
    const peer = fakePeer();
    const mesh = await navigation.bake(
      { positions: [0, 0, 0, 1, 0, 0, 0, 0, 1], indices: [0, 1, 2] },
      { peer }
    );
    const result = navigation.path(mesh as never, [0, 0, 0], [1, 0, 0]);
    expect(result.success).toBe(true);
    expect(result.points).toHaveLength(2);
  });

  it("reports availability from the injected peer without throwing", async () => {
    await expect(navigation.isAvailable({ peer: fakePeer() })).resolves.toBe(true);
    await expect(navigation.isAvailable({ peer: { createRecastNavigation: async () => { throw new Error("no peer"); } } })).resolves.toBe(false);
  });
});

describe("crowds root builders (O1)", () => {
  it("renders agents from live crowd state with cap telemetry", async () => {
    const peer = fakePeer();
    const mesh = await navigation.bake(
      { positions: [0, 0, 0, 1, 0, 0, 0, 0, 1], indices: [0, 1, 2] },
      { peer }
    );
    const crowd = crowds.create(mesh as never, { maxAgents: 2, maxAgentRadius: 0.5 });
    expect(crowds.maxAgents(crowd as never)).toBe(2);
    const agent = crowds.addAgent(crowd as never, [0, 0, 0]);
    expect(crowds.count(crowd as never)).toBe(1);
    expect(crowds.setTarget(crowd as never, agent as never, [1, 0, 0])).toBe(true);
    expect(crowds.agents(crowd as never)).toHaveLength(1);
    const belowCap = crowds.diagnostics(crowd as never, { camera: [0, 0, 0] });
    expect(belowCap.atCap).toBe(false);
    expect(belowCap.capWarning).toBeUndefined();
    crowds.addAgent(crowd as never, [1, 0, 0]);
    expect(() => crowds.addAgent(crowd as never, [2, 0, 0])).toThrow("at capacity");
  });

  it("advances agents toward targets through the root update loop", async () => {
    const peer = fakePeer();
    const mesh = await navigation.bake(
      { positions: [0, 0, 0, 1, 0, 0, 0, 0, 1], indices: [0, 1, 2] },
      { peer }
    );
    const crowd = crowds.create(mesh as never, { maxAgents: 2, maxAgentRadius: 0.5 });
    const agent = crowds.addAgent(crowd as never, [0, 0, 0]);
    crowds.setTarget(crowd as never, agent as never, [1, 0, 0]);
    crowds.update(crowd as never, 0.25);
    crowds.update(crowd as never, 0.25);
    const states = crowds.agents(crowd as never);
    expect(states[0]!.position[0]).toBeCloseTo(0.5, 9);
    expect(() => crowds.update(crowd as never, 0)).toThrow(RangeError);
    expect(() => crowds.update(crowd as never, Number.NaN)).toThrow(RangeError);
  });

  it("reports LOD tiers from live positions with cap warnings at capacity", async () => {
    const peer = fakePeer();
    const mesh = await navigation.bake(
      { positions: [0, 0, 0, 1, 0, 0, 0, 0, 1], indices: [0, 1, 2] },
      { peer }
    );
    const crowd = crowds.create(mesh as never, { maxAgents: 2, maxAgentRadius: 0.5 });
    crowds.addAgent(crowd as never, [1, 0, 0]);
    crowds.addAgent(crowd as never, [100, 0, 0]);
    const diagnostics = crowds.diagnostics(crowd as never, { camera: [0, 0, 0], nearDistance: 6, farDistance: 14 });
    expect(diagnostics.count).toBe(2);
    expect(diagnostics.maxAgents).toBe(2);
    expect(diagnostics.atCap).toBe(true);
    expect(diagnostics.capWarning).toMatch(/at capacity \(2\/2 agents\)/);
    expect(diagnostics.tiers).toEqual({ near: 1, mid: 0, impostor: 1, unknown: 0 });
    expect(diagnostics.agents.map((entry) => entry.tier)).toEqual(["near", "impostor"]);

    const noCamera = crowds.diagnostics(crowd as never);
    expect(noCamera.tiers.unknown).toBe(2);
    expect(noCamera.agents.every((entry) => entry.distance === null)).toBe(true);

    expect(() => crowds.diagnostics(crowd as never, { camera: [0, 0, 0], nearDistance: 14, farDistance: 6 })).toThrow(RangeError);
    expect(() => crowds.diagnostics(crowd as never, { camera: [0, Number.NaN, 0] })).toThrow(TypeError);
  });
});
