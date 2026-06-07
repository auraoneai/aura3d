import { describe, expect, it } from "vitest";
import { KinematicBody, type KinematicBodyEvent } from "../../../packages/physics/src/KinematicBody";
import { createFightingCharacterController } from "../../../packages/physics/src/CharacterController";

function eventsOfType<T extends KinematicBodyEvent["type"]>(
  events: readonly KinematicBodyEvent[],
  type: T
): Extract<KinematicBodyEvent, { type: T }>[] {
  return events.filter((event): event is Extract<KinematicBodyEvent, { type: T }> => event.type === type);
}

describe("KinematicBody fighting movement feel", () => {
  it("exposes a fighting CharacterController preset for walk, dash, jump, fast-fall, crouch, and landing", () => {
    const controller = createFightingCharacterController({
      id: "preset-fighter",
      position: [0, 0.9, 0],
      halfExtents: [0.32, 0.9, 0.25],
      walkSpeed: 3,
      crouchSpeed: 1.2,
      dashSpeed: 7.5,
      dashDuration: 0.1,
      groundY: 0
    });

    controller.walk(1);
    controller.step(1 / 60);
    expect(controller.snapshot()).toMatchObject({
      state: "walk",
      facing: 1,
      walkSpeed: 3,
      crouchSpeed: 1.2
    });
    expect(controller.snapshot().velocity[0]).toBeGreaterThan(0);

    controller.dash(1);
    const dashEvents = controller.step(1 / 60);
    expect(eventsOfType(dashEvents, "dash")).toMatchObject([{ bodyId: "preset-fighter", direction: 1 }]);
    expect(controller.snapshot().state).toBe("dash");

    controller.crouch(true);
    const crouchEvents = controller.step(1 / 60);
    expect(eventsOfType(crouchEvents, "crouch")).toMatchObject([{ bodyId: "preset-fighter", active: true }]);
    expect(controller.snapshot()).toMatchObject({ state: "crouch", crouching: true });
    controller.crouch(false);
    expect(eventsOfType(controller.step(1 / 60), "crouch")).toMatchObject([{ bodyId: "preset-fighter", active: false }]);

    const jumper = createFightingCharacterController({
      id: "air-fighter",
      position: [0, 0.9, 0],
      halfExtents: [0.32, 0.9, 0.25],
      jumpSpeed: 11,
      fastFallSpeed: 26,
      maxFallSpeed: 30,
      gravity: 24,
      groundY: 0
    });

    jumper.jump();
    const jumpEvents = jumper.step(1 / 60);
    expect(eventsOfType(jumpEvents, "jump")).toMatchObject([{ bodyId: "air-fighter" }]);
    expect(jumper.snapshot().state).toBe("jump");

    for (let frame = 0; frame < 45 && jumper.snapshot().velocity[1] > 0; frame += 1) {
      jumper.step(1 / 60);
    }

    jumper.fastFall();
    const fastFallEvents = jumper.step(1 / 60);
    expect(eventsOfType(fastFallEvents, "fast-fall")).toMatchObject([{ bodyId: "air-fighter", speed: 26 }]);
    expect(jumper.snapshot().state).toBe("fast-fall");

    let landed = false;
    for (let frame = 0; frame < 90; frame += 1) {
      const events = jumper.step(1 / 60);
      if (events.some((event) => event.type === "land")) {
        landed = true;
        expect(jumper.snapshot().state).toBe("landing");
        break;
      }
    }

    expect(landed).toBe(true);
    jumper.step(1 / 60);
    expect(jumper.snapshot()).toMatchObject({ state: "idle", grounded: true });
  });

  it("supports tunable high jump, explicit fast-fall, and single landing event", () => {
    const body = new KinematicBody({
      id: "fighter",
      position: [0, 0.9, 0],
      halfExtents: [0.32, 0.9, 0.25],
      gravity: 24,
      jumpSpeed: 12,
      maxFallSpeed: 32,
      airFriction: 0,
      groundY: 0,
      groundSnapDistance: 0.04
    });

    body.queueJump();
    const jumpEvents = body.step(1 / 60);

    expect(eventsOfType(jumpEvents, "jump")).toMatchObject([{ bodyId: "fighter" }]);
    expect(body.grounded).toBe(false);

    let apexY = body.position[1];
    for (let frame = 0; frame < 40; frame += 1) {
      body.step(1 / 60);
      apexY = Math.max(apexY, body.position[1]);
      if (body.velocity[1] <= 0) {
        break;
      }
    }

    expect(apexY - 0.9).toBeGreaterThan(2.6);
    expect(body.velocity[1]).toBeLessThanOrEqual(0);

    body.fastFall(28);
    const velocityAfterFastFall = body.step(1 / 60);

    expect(eventsOfType(velocityAfterFastFall, "fast-fall")).toMatchObject([{ speed: 28 }]);
    expect(velocityAfterFastFall.some((event) => event.type === "land")).toBe(false);
    expect(body.velocity[1]).toBeLessThan(-20);

    let landEvents: readonly KinematicBodyEvent[] = [];
    for (let frame = 0; frame < 60; frame += 1) {
      const events = body.step(1 / 60);
      if (events.some((event) => event.type === "land")) {
        landEvents = events;
        break;
      }
    }

    expect(eventsOfType(landEvents, "land")).toHaveLength(1);
    expect(body.position[1]).toBeCloseTo(0.9);
    expect(body.grounded).toBe(true);
    expect(body.step(1 / 60).some((event) => event.type === "land")).toBe(false);

    body.crouch(true);
    const crouchEvents = body.step(1 / 60);
    expect(eventsOfType(crouchEvents, "crouch")).toMatchObject([{ active: true }]);
    expect(body.snapshot().crouching).toBe(true);
    body.crouch(false);
    expect(eventsOfType(body.step(1 / 60), "crouch")).toMatchObject([{ active: false }]);
    expect(body.snapshot().crouching).toBe(false);
  });

  it("keeps dash distance deterministic and clamps against arena bounds", () => {
    const body = new KinematicBody({
      id: "dasher",
      position: [0, 0.9, 0],
      halfExtents: [0.3, 0.9, 0.25],
      dashSpeed: 8,
      dashDuration: 0.12,
      dashCooldown: 0.25,
      maxSpeed: 3,
      acceleration: 48,
      groundFriction: 40,
      bounds: { minX: -1, maxX: 1 },
      groundY: 0
    });

    body.queueDash(1);
    const firstDashFrame = body.step(1 / 60);

    expect(eventsOfType(firstDashFrame, "dash")).toMatchObject([{ direction: 1, duration: 0.12 }]);

    const positions: number[] = [body.position[0]];
    const boundsEvents: KinematicBodyEvent[] = [];
    for (let frame = 0; frame < 20; frame += 1) {
      const events = body.step(1 / 60);
      positions.push(body.position[0]);
      boundsEvents.push(...events.filter((event) => event.type === "bounds"));
    }

    expect(Math.max(...positions)).toBeCloseTo(0.7);
    expect(body.position[0]).toBeCloseTo(0.7);
    expect(body.velocity[0]).toBe(0);
    expect(eventsOfType(boundsEvents, "bounds").some((event) => event.axes.includes("x"))).toBe(true);

    body.queueDash(1);
    expect(body.step(1 / 60).some((event) => event.type === "dash")).toBe(false);
  });

  it("applies knockback deterministically and can force airborne recovery", () => {
    const body = new KinematicBody({
      id: "target",
      position: [0, 0.9, 0],
      halfExtents: [0.3, 0.9, 0.25],
      gravity: 20,
      groundY: 0
    });

    body.applyKnockback([2.5, 4.5, 0], { mode: "set", forceAirborne: true });
    const events = body.step(1 / 60);

    expect(eventsOfType(events, "knockback")).toMatchObject([{ impulse: [2.5, 4.5, 0], velocity: [2.5, 4.5, 0] }]);
    expect(body.grounded).toBe(false);
    expect(body.position[0]).toBeGreaterThan(0.03);
    expect(body.position[1]).toBeGreaterThan(0.95);
    expect(body.velocity[1]).toBeLessThan(4.5);
  });
});
