import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../../../examples/neon-corridor-strike/src/game/state";
import { fireHitscan } from "../../../examples/neon-corridor-strike/src/game/weapons";

function body() {
  return { id: 7, nodeName: "player", position: () => [0, 0.9, 9] as const };
}

function runtime(hit: unknown) {
  return {
    queries: { raycast: vi.fn(() => hit) },
    bodies: { get: vi.fn((id: string) => id === "enemy-e1" ? { id: 42 } : undefined) }
  };
}

function effects() {
  return { hitSpark: vi.fn(), impactDecal: vi.fn() };
}

describe("Neon Corridor Strike query-owned hit truth", () => {
  it("records enemy truth before presentation callbacks and uses the query endpoint", () => {
    const state = createInitialState();
    const physics = runtime({
      point: [0, 1.45, 2] as const,
      nodeName: "enemy-e1",
      body: { id: 42, nodeName: "enemy-e1" }
    });
    const fx = effects();
    const observed = vi.fn(() => {
      expect(state.hits).toBe(1);
      expect(state.lastHitName).toBe("enemy-e1");
    });

    const shot = fireHitscan(state, physics as never, body() as never, fx as never, observed);

    expect(shot?.end).toEqual([0, 1.45, 2]);
    expect(state.ammo).toBe(11);
    expect(state.shotsFired).toBe(1);
    expect(observed).toHaveBeenCalledWith("enemy-e1", [0, 1.45, 2]);
    expect(fx.hitSpark).toHaveBeenCalledOnce();
    expect(fx.impactDecal).not.toHaveBeenCalled();
  });

  it("keeps wall and miss results out of enemy truth regardless of presentation", () => {
    const wallState = createInitialState();
    const wallFx = effects();
    const onHit = vi.fn();
    fireHitscan(wallState, runtime({
      point: [1, 1.45, 4] as const,
      nodeName: "wall-north",
      body: { id: 9, nodeName: "wall-north" }
    }) as never, body() as never, wallFx as never, onHit);
    expect(wallState.hits).toBe(0);
    expect(wallState.lastHitName).toBe("wall-north");
    expect(onHit).not.toHaveBeenCalled();
    expect(wallFx.impactDecal).toHaveBeenCalledOnce();

    const missState = createInitialState();
    const missFx = effects();
    const miss = fireHitscan(missState, runtime(null) as never, body() as never, missFx as never, onHit);
    expect(missState.hits).toBe(0);
    expect(missState.lastHitName).toBe("");
    expect(miss?.end[2]).toBeLessThan(-18);
    expect(missFx.hitSpark).not.toHaveBeenCalled();
    expect(missFx.impactDecal).not.toHaveBeenCalled();
  });
});
