import { describe, expect, it } from "vitest";
import { createPhysicsRuntime } from "@aura3d/engine";
import { PhysicsDebugDraw, PhysicsWorld } from "@aura3d/physics";

/**
 * H2 toggle + budget telemetry, reachable from the `@aura3d/engine` root.
 *
 * The debug overlay must be toggleable (a route hides it without tearing down
 * the world) and budgeted (debug geometry degrades instead of the frame), with
 * telemetry proving the budget held. Every force/contact here comes from the
 * real simulation — the overlay only draws what the solver reports.
 */
function worldWithStack(): PhysicsWorld {
  const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60 });
  const ground = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  world.createCollider(ground, { shape: { kind: "plane", normal: [0, 1, 0], constant: 0 } });
  for (let index = 0; index < 3; index += 1) {
    const body = world.createRigidBody({ position: [0, 1 + index * 1.1, 0] });
    world.createCollider(body, { shape: { kind: "box", halfExtents: [0.4, 0.4, 0.4] } });
  }
  for (let step = 0; step < 60; step += 1) world.step();
  return world;
}

describe("H2 debug-draw toggle + budget (package)", () => {
  it("emits zero lines with zero requested when toggled off", () => {
    const world = worldWithStack();
    const result = new PhysicsDebugDraw().buildLinesBudgeted(world, {
      enabled: false,
      contacts: true,
      joints: true
    });
    expect(result.lines).toHaveLength(0);
    expect(result.telemetry.emitted).toBe(0);
    expect(result.telemetry.dropped).toBe(0);
  });

  it("defaults to enabled with no budget (previous behavior preserved)", () => {
    const world = worldWithStack();
    const draw = new PhysicsDebugDraw();
    const plain = draw.buildLines(world, { contacts: true });
    const budgeted = draw.buildLinesBudgeted(world, { contacts: true });
    expect(budgeted.lines).toHaveLength(plain.length);
    expect(budgeted.telemetry.requested).toBe(plain.length);
    expect(budgeted.telemetry.budgeted).toBe(false);
    expect(budgeted.telemetry.dropped).toBe(0);
  });

  it("truncates to maxLines and accounts every drop in telemetry", () => {
    const world = worldWithStack();
    const draw = new PhysicsDebugDraw();
    const full = draw.buildLines(world, { contacts: true });
    expect(full.length).toBeGreaterThan(10);
    const result = draw.buildLinesBudgeted(world, { contacts: true, maxLines: 10 });
    expect(result.lines).toHaveLength(10);
    expect(result.telemetry.requested).toBe(full.length);
    expect(result.telemetry.emitted).toBe(10);
    expect(result.telemetry.dropped).toBe(full.length - 10);
    expect(result.telemetry.budgeted).toBe(true);
    const categorized = Object.values(result.telemetry.byCategory).reduce((sum, count) => sum + count, 0);
    expect(categorized).toBe(10);
  });

  it("rejects a negative or fractional budget instead of silently misdrawing", () => {
    const world = worldWithStack();
    const draw = new PhysicsDebugDraw();
    expect(() => draw.buildLinesBudgeted(world, { maxLines: -1 })).toThrow(/maxLines/);
    expect(() => draw.buildLinesBudgeted(world, { maxLines: 2.5 })).toThrow(/maxLines/);
  });
});

describe("H2 debug-draw toggle + budget (root)", () => {
  it("debugLines + debugBudget honor the root toggle and budget", () => {
    const physics = createPhysicsRuntime(worldWithStack());
    const on = physics.debugLines({ contacts: true });
    expect(on.length).toBeGreaterThan(0);
    const budget = physics.debugBudget({ contacts: true, maxLines: 5 });
    expect(budget.requested).toBe(on.length);
    expect(budget.emitted).toBe(5);
    expect(budget.dropped).toBe(on.length - 5);
    expect(physics.debugLines({ contacts: true, enabled: false })).toHaveLength(0);
    expect(physics.debugBudget({ enabled: false }).emitted).toBe(0);
  });
});
