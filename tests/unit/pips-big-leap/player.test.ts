// Pip's Big Leap controller regressions (audit 2026-10-29 rows C1, C2, C3, C17).
import { describe, expect, it } from "vitest";
import { game } from "@aura3d/engine";
import { buildWorld, type BuiltWorld } from "../../../apps/showcase-pips-big-leap/src/game/world";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";
import { createPlayer, stepPlayer, type PlayerEvent, type PlayerInput, type PlayerState } from "../../../apps/showcase-pips-big-leap/src/game/player";
import type { HazardSpec, PlatSpec, SolidBox, WorldSpec } from "../../../apps/showcase-pips-big-leap/src/game/types";

const DT = 1 / 60;
const IDLE: PlayerInput = { moveX: 0, moveZ: 0, jumpPressed: false, jumpHeld: false, divePressed: false, poundPressed: false };

function flatWorld(overrides: Partial<WorldSpec> = {}): BuiltWorld {
  const base = worldSpec("w1");
  const spec: WorldSpec = {
    ...base,
    spawn: [0, 0.62, 0],
    spawnYaw: Math.PI,
    platforms: [{ id: "floor", x: 0, y: 0.62, z: -20, w: 60, d: 60, kind: "grass" }],
    hazards: [],
    springs: [],
    waters: [],
    seeds: [],
    acorns: [],
    hearts: [],
    checkpoints: [],
    decor: [],
    npcs: [],
    boss: false,
    gate: { id: "far-gate", x: 0, y: 0.62, z: -200 },
    ...overrides
  };
  return buildWorld(spec);
}

function stepper(world: BuiltWorld, player: PlayerState) {
  const assist = game.jumpAssist({ coyoteMs: world.motion.tuning.coyoteMs, bufferMs: world.motion.tuning.jumpBufferMs });
  return (input: PlayerInput): PlayerEvent[] => stepPlayer(player, world, input, DT, { doubleJump: false, assist });
}

describe("pips-big-leap player: hurt recovery (C1)", () => {
  it("moves and jumps again within 0.6 s of a hazard hit", () => {
    const hazard: HazardSpec = { id: "thorns", x: 0, y: 0.86, z: -1.2, w: 1.4, d: 1.0, type: "thorns" };
    const world = flatWorld({ hazards: [hazard] });
    const p = createPlayer(world);
    const step = stepper(world, p);
    let hurtAt = -1;
    for (let f = 0; f < 120 && hurtAt < 0; f += 1) {
      if (step({ ...IDLE, moveZ: 1 }).some((e) => e.kind === "hurt")) hurtAt = f;
    }
    expect(hurtAt).toBeGreaterThanOrEqual(0);
    expect(p.state).toBe("hurt");
    for (let f = 0; f < Math.ceil(0.6 / DT); f += 1) step({ ...IDLE, moveZ: 1 });
    expect(p.state).not.toBe("hurt");
    const z0 = p.z;
    for (let f = 0; f < 30; f += 1) step({ ...IDLE, moveZ: 1 });
    expect(Math.abs(p.z - z0)).toBeGreaterThan(1);
    // Jump works again too.
    let jumped = false;
    for (let f = 0; f < 10 && !jumped; f += 1) jumped = step({ ...IDLE, moveZ: 1, jumpPressed: f === 0, jumpHeld: true }).some((e) => e.kind === "jump");
    expect(jumped).toBe(true);
  });

  it("boss contact no longer soft-locks Pip", () => {
    const world = flatWorld();
    const p = createPlayer(world);
    const assist = game.jumpAssist({ coyoteMs: 120, bufferMs: 140 });
    const bossAt = [0, 1.2, -1.2] as const;
    let hit = false;
    for (let f = 0; f < 60 && !hit; f += 1) {
      hit = stepPlayer(p, world, { ...IDLE, moveZ: 1 }, DT, { doubleJump: false, assist, bossAt: [...bossAt] as [number, number, number] })
        .some((e) => e.kind === "boss-contact");
    }
    expect(hit).toBe(true);
    for (let f = 0; f < 40; f += 1) stepPlayer(p, world, IDLE, DT, { doubleJump: false, assist });
    expect(p.state === "grounded" || p.state === "air").toBe(true);
  });

  it("uses the world's derived knockback (C17)", () => {
    for (const id of ["w1", "w6"] as const) {
      const base = worldSpec(id);
      const world = flatWorld({ id, gravityScale: base.gravityScale, moveSpeed: base.moveSpeed, hazards: [{ id: "h", x: 0, y: 0.86, z: -0.6, w: 1.2, d: 0.6, type: "thorns" }] });
      const p = createPlayer(world);
      const step = stepper(world, p);
      let vy = 0;
      for (let f = 0; f < 60; f += 1) {
        if (step({ ...IDLE, moveZ: 1 }).some((e) => e.kind === "hurt")) { vy = p.vy; break; }
      }
      // damage() runs after integration, so the hit frame ends with the knockback velocity.
      expect(vy).toBeCloseTo(world.motion.tuning.knockback.v, 5);
    }
    // Starfall's hop scales with its gentle gravity instead of floating for half a second.
    const w1 = buildWorld(worldSpec("w1")).motion.tuning;
    const w6 = buildWorld(worldSpec("w6")).motion.tuning;
    const hop = (t: typeof w1) => (2 * t.knockback.v) / Math.abs(t.gravity);
    expect(hop(w6)).toBeCloseTo(hop(w1), 5);
    expect(w1.knockback.v).toBeCloseTo(4.4, 1);
  });
});

describe("pips-big-leap player: strafe (C2)", () => {
  it("holding D for 2 s moves Pip more than 5 m camera-right", () => {
    const world = flatWorld();
    const p = createPlayer(world);
    const step = stepper(world, p);
    const camYaw0 = p.camYaw;
    const right = { x: -Math.cos(camYaw0), z: Math.sin(camYaw0) };
    const x0 = p.x, z0 = p.z;
    for (let f = 0; f < 120; f += 1) step({ ...IDLE, moveX: 1 });
    const along = (p.x - x0) * right.x + (p.z - z0) * right.z;
    expect(along).toBeGreaterThan(5);
    expect(p.camYaw).toBeCloseTo(camYaw0, 6);
  });

  it("running forward still turns the follow camera behind Pip", () => {
    const world = flatWorld();
    const p = createPlayer(world);
    const step = stepper(world, p);
    const camYaw0 = p.camYaw;
    for (let f = 0; f < 90; f += 1) step({ ...IDLE, moveX: 0.8, moveZ: 0.8 });
    expect(Math.abs(p.camYaw - camYaw0)).toBeGreaterThan(0.2);
  });

  it("orbit input turns the camera directly", () => {
    const world = flatWorld();
    const p = createPlayer(world);
    const step = stepper(world, p);
    const camYaw0 = p.camYaw;
    step({ ...IDLE, orbit: 0.25 });
    expect(p.camYaw - camYaw0).toBeCloseTo(0.25, 6);
  });
});

describe("pips-big-leap player: descending lifts (C3)", () => {
  it("stays grounded on a sine lift (w4 geyser values) with no repeated land events", () => {
    const lift: PlatSpec = { id: "lift", x: 0, y: 3, z: 0, w: 2.6, d: 2.6, kind: "metal", mover: { axis: "y", amplitude: 2.1, period: 3.4 } };
    const world = flatWorld({ platforms: [lift], spawn: [0, 3, 0], lowerBound: -20 });
    const solid = world.solids[0] as SolidBox;
    const p = createPlayer(world);
    const step = stepper(world, p);
    const h = 0.55;
    const tick = (t: number) => {
      const m = lift.mover!;
      const phase = (t / m.period) * Math.PI * 2;
      solid.y = lift.y - h / 2 + Math.sin(phase) * m.amplitude;
      solid.vy = Math.cos(phase) * m.amplitude * (Math.PI * 2 / m.period);
    };
    tick(0);
    // Settle onto the lift, then count over 408 frames like the audit probe.
    for (let f = 0; f < 10; f += 1) { step(IDLE); tick((f + 1) * DT); }
    let airborne = 0;
    let lands = 0;
    for (let f = 10; f < 418; f += 1) {
      const ev = step(IDLE);
      tick((f + 1) * DT);
      if (!p.grounded) airborne += 1;
      lands += ev.filter((e) => e.kind === "land").length;
    }
    expect(lands).toBe(0);
    expect(airborne).toBe(0);
  });
});
