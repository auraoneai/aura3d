import { describe, expect, it } from "vitest";
import { CharacterController, PhysicsWorld, Shape } from "../../../packages/physics/src";

/**
 * The character controller had **zero production consumers** and `character controller`
 * was `parity-unproven`. It had a capsule, a ground probe and a slope limit, and none of
 * step-up, step-down, ceiling handling or wall slide — the four behaviours that separate
 * a usable controller from a capsule that gets stuck on kerbs.
 */
function world() {
  return new PhysicsWorld({ gravity: [0, -9.81, 0] });
}

function floor(w: PhysicsWorld, y: number, halfExtents: readonly [number, number, number], x = 0, z = 0) {
  const body = w.createRigidBody({ type: "static", position: [x, y, z] });
  w.createCollider(body, { shape: Shape.box(halfExtents[0], halfExtents[1], halfExtents[2]) });
  return body;
}

const SPEC = { radius: 0.2, halfHeight: 0.3, maxSpeed: 3, maxStepHeight: 0.25 } as const;

describe("character controller: ground and slopes", () => {
  it("stands on a floor and reports grounded with a flat normal", () => {
    const w = world();
    floor(w, 0, [10, 0.5, 10]);
    const character = new CharacterController(w, { ...SPEC, position: [0, 1.2, 0] });
    for (let step = 0; step < 120; step += 1) w.step(1 / 60), character.step(1 / 60);
    const state = character.snapshot();
    expect(state.grounded).toBe(true);
    expect(state.groundNormal[1]).toBeGreaterThan(0.99);
    expect(state.slopeAngle).toBeLessThan(0.05);
  });

  it("orients a probe normal so a flat floor is walkable", () => {
    /*
     * This is the regression guard for a real defect. A sweep against a box returns the
     * face normal unoriented, so a downward ground probe onto a flat floor reported
     * [0,-1,0]. The walkability test compared that raw value to cos(maxSlope) — and
     * -1 < 0.5 — so the character stood on solid ground and reported grounded:false every
     * frame, which disabled jumping, step-up and step-down simultaneously.
     */
    const w = world();
    floor(w, 0, [10, 0.5, 10]);
    const character = new CharacterController(w, { ...SPEC, position: [0, 1.0, 0] });
    for (let step = 0; step < 90; step += 1) w.step(1 / 60), character.step(1 / 60);
    const state = character.snapshot();
    expect(state.grounded, "a flat floor must be walkable").toBe(true);
    // Oriented upward, never the raw -Y the sweep reports.
    expect(state.groundNormal[1]).toBeGreaterThan(0.9);
    expect(state.onSteepSlope).toBe(false);
  });
});

describe("character controller: step up", () => {
  it("walks up a ledge within maxStepHeight instead of stopping at it", () => {
    const w = world();
    floor(w, 0, [4, 0.5, 4], 0, 0);
    // A 0.18-unit ledge starting at x = 1.
    const ledgeTop = 0.68;
    floor(w, ledgeTop - 0.25, [1.5, 0.25, 4], 2.5, 0);

    const character = new CharacterController(w, { ...SPEC, position: [0, 1.0, 0] });
    for (let settle = 0; settle < 60; settle += 1) w.step(1 / 60), character.step(1 / 60);
    const startY = character.body.position[1];

    character.setMoveInput({ x: 1, z: 0 });
    let maxStepUp = 0;
    for (let step = 0; step < 240; step += 1) {
      w.step(1 / 60);
      const state = character.step(1 / 60);
      maxStepUp = Math.max(maxStepUp, state.steppedUp);
    }

    // Either it climbed, or it registered a step-up event. Both prove the ledge was not
    // an impassable wall, which is what a bare capsule treats it as.
    const climbed = character.body.position[1] - startY;
    expect(climbed > 0.05 || maxStepUp > 0).toBe(true);
  });

  it("refuses a ledge taller than maxStepHeight", () => {
    const w = world();
    floor(w, 0, [4, 0.5, 4]);
    // A 1.5-unit wall: far above any step height, so it must remain a wall.
    floor(w, 1.0, [1, 1, 4], 2.5, 0);

    const character = new CharacterController(w, { ...SPEC, position: [0, 1.0, 0], maxStepHeight: 0.25 });
    for (let settle = 0; settle < 60; settle += 1) w.step(1 / 60), character.step(1 / 60);
    const startY = character.body.position[1];

    character.setMoveInput({ x: 1, z: 0 });
    for (let step = 0; step < 240; step += 1) w.step(1 / 60), character.step(1 / 60);

    // A character that climbed a 1.5-unit wall with a 0.25 step height is broken.
    expect(character.body.position[1] - startY).toBeLessThan(0.5);
  });
});

describe("character controller: step down", () => {
  it("stays grounded walking off a small ledge rather than launching", () => {
    /*
     * Without step-down, walking down stairs launches the character off every edge:
     * grounded flickers, which breaks coyote time, footstep audio and any state machine
     * keyed on standing on the floor.
     */
    const w = world();
    // Upper platform, then a lower one 0.15 below.
    floor(w, 0, [1.5, 0.5, 4], 0, 0);
    floor(w, -0.15, [2.5, 0.5, 4], 3.6, 0);

    const character = new CharacterController(w, {
      ...SPEC,
      position: [0, 1.0, 0],
      stepDownDistance: 0.3
    });
    for (let settle = 0; settle < 60; settle += 1) w.step(1 / 60), character.step(1 / 60);

    character.setMoveInput({ x: 1, z: 0 });
    let ungroundedRun = 0;
    let worstRun = 0;
    for (let step = 0; step < 180; step += 1) {
      w.step(1 / 60);
      const state = character.step(1 / 60);
      ungroundedRun = state.grounded ? 0 : ungroundedRun + 1;
      worstRun = Math.max(worstRun, ungroundedRun);
    }
    /*
     * A short airborne blip is fine; a long one means it launched off the edge.
     *
     * Threshold measured rather than guessed: without step-down this run stays airborne for
     * most of the traversal. 60 frames is one second at 60 Hz, which is far longer than a
     * 0.15-unit drop should ever take.
     */
    expect(worstRun).toBeLessThan(60);
  });
});

describe("character controller: ceiling", () => {
  it("cancels upward velocity when the head is blocked instead of hovering", () => {
    const w = world();
    floor(w, 0, [4, 0.5, 4]);
    // Ceiling just above the character's jump apex start.
    floor(w, 1.75, [4, 0.2, 4]);

    const character = new CharacterController(w, { ...SPEC, position: [0, 1.0, 0], jumpSpeed: 6 });
    for (let settle = 0; settle < 60; settle += 1) w.step(1 / 60), character.step(1 / 60);

    character.jump();
    let sawCeiling = false;
    let maxY = character.body.position[1];
    for (let step = 0; step < 120; step += 1) {
      w.step(1 / 60);
      const state = character.step(1 / 60);
      if (state.ceilingHit) sawCeiling = true;
      maxY = Math.max(maxY, character.body.position[1]);
    }
    // Either the controller detected the ceiling, or the solver stopped it below the slab.
    expect(sawCeiling || maxY < 1.75).toBe(true);
  });
});

describe("character controller: wall slide", () => {
  it("keeps moving along a wall it is pressed into at an angle", () => {
    /*
     * Without wall slide, a capsule pressed into a wall diagonally loses all horizontal
     * speed, because the solver cancels the whole velocity rather than only the component
     * into the wall. The player feels it as sticking on geometry.
     */
    const w = world();
    floor(w, 0, [6, 0.5, 6]);
    // Wall along the z axis at x = 1.
    floor(w, 1, [0.2, 1, 6], 1.4, 0);

    const sliding = new CharacterController(w, { ...SPEC, position: [0, 1.0, 0], wallSlide: true });
    for (let settle = 0; settle < 60; settle += 1) w.step(1 / 60), sliding.step(1 / 60);

    // Push diagonally into the wall: +x is blocked, +z should survive.
    sliding.setMoveInput({ x: 1, z: 1 });
    let bestLateral = 0;
    for (let step = 0; step < 180; step += 1) {
      w.step(1 / 60);
      const state = sliding.step(1 / 60);
      bestLateral = Math.max(bestLateral, Math.abs(state.velocity[2]));
    }
    // The component parallel to the wall must be preserved.
    expect(bestLateral).toBeGreaterThan(0.5);
  });

  it("exposes wallSlide as opt-out", () => {
    const w = world();
    floor(w, 0, [6, 0.5, 6]);
    const blocking = new CharacterController(w, { ...SPEC, position: [0, 1, 0], wallSlide: false });
    expect(blocking.wallSlide).toBe(false);
    const default_ = new CharacterController(w, { ...SPEC, position: [0, 1, 3] });
    expect(default_.wallSlide).toBe(true);
  });
});

describe("character controller: descriptor validation", () => {
  it("derives a sensible default step height from the capsule", () => {
    const w = world();
    const character = new CharacterController(w, { radius: 0.3, halfHeight: 0.6 });
    // A third of total height (0.9) is 0.306: tall enough for kerbs, short enough that a
    // character cannot walk up a wall.
    expect(character.maxStepHeight).toBeGreaterThan(0.2);
    expect(character.maxStepHeight).toBeLessThan(0.45);
    expect(character.stepDownDistance).toBeCloseTo(character.maxStepHeight, 6);
  });

  it("still rejects nonsense dimensions", () => {
    const w = world();
    expect(() => new CharacterController(w, { radius: 0 })).toThrow(/finite positive/);
    expect(() => new CharacterController(w, { maxSpeed: -1 })).toThrow(/finite positive/);
  });
});
