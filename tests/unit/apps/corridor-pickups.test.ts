import { describe, expect, it, vi } from "vitest";
import { collectPickupByName } from "../../../examples/neon-corridor-strike/src/game/pickups";
import { createInitialState } from "../../../examples/neon-corridor-strike/src/game/state";

describe("Neon Corridor Strike pickup once-per-entry authority", () => {
  it("collects an ammo pickup once, mutates reserve, and removes both body and model", () => {
    const state = createInitialState();
    const removeBody = vi.fn();
    const hideNode = vi.fn();
    const onCollected = vi.fn();
    const hooks = { removeBody, hideNode, onCollected };

    expect(collectPickupByName(state, hooks, "pickup-ammo-1")).toBe(true);
    expect(state.reserve).toBe(32);
    expect(state.pickups).toBe(1);
    expect(state.collected).toEqual(["pickup-ammo-1"]);
    expect(removeBody).toHaveBeenCalledOnce();
    expect(hideNode).toHaveBeenCalledOnce();
    expect(onCollected).toHaveBeenCalledWith("pickup-ammo-1", "ammo");

    expect(collectPickupByName(state, hooks, "pickup-ammo-1")).toBe(false);
    expect(state.reserve).toBe(32);
    expect(state.pickups).toBe(1);
    expect(removeBody).toHaveBeenCalledOnce();
    expect(hideNode).toHaveBeenCalledOnce();
    expect(onCollected).toHaveBeenCalledOnce();
  });

  it("clamps health pickup truth and rejects non-pickup sensor names", () => {
    const state = createInitialState();
    state.hp = 82;
    const hooks = { removeBody: vi.fn(), hideNode: vi.fn() };

    expect(collectPickupByName(state, hooks, "exit-sensor")).toBe(false);
    expect(collectPickupByName(state, hooks, "pickup-medkit-1")).toBe(true);
    expect(state.hp).toBe(100);
    expect(state.objective).toBe("Field dressing applied");
  });
});
