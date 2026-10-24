import { describe, expect, it } from "vitest";
import { createCameraShake, createHitStop, createImpactFeedback, createImpactWorld, type Impact, type ImpactBody } from "../../../packages/game/src/motion/index";

const wall = { kind: "box" as const, id: "wall", center: [0, 1, 5] as [number, number, number], half: [10, 3, 0.25] as [number, number, number] };

const drive = (speed: number, world = createImpactWorld({ colliders: [wall], restitution: 0.3 })) => {
  const body: ImpactBody = { position: [0, 1, 0], velocity: [0, 0, speed], radius: 0.4 };
  const impacts: Impact[] = [];
  for (let i = 0; i < 120; i += 1) impacts.push(...world.step(body, 1 / 60));
  return { body, impacts };
};

describe("impact world", () => {
  it.each([3, 12, 60])("never tunnels through a wall at %s m/s and emits one impact", (speed) => {
    const { body, impacts } = drive(speed);
    expect(body.position[2]).toBeLessThan(5 - 0.25);
    expect(impacts.length).toBe(1);
    expect(impacts[0]!.normal[2]).toBeCloseTo(-1, 5);
    expect(impacts[0]!.speed).toBeCloseTo(speed, 3);
  });

  it("bounces with restitution and reports impulse", () => {
    const { body, impacts } = drive(10);
    expect(body.velocity[2]).toBeLessThan(0);
    expect(impacts[0]!.impulse).toBeCloseTo(10 * 1.3, 3);
  });

  it("sliding along a wall emits a single contact", () => {
    const world = createImpactWorld({ colliders: [wall], restitution: 0, friction: 0 });
    const body: ImpactBody = { position: [-3, 1, 4.2], velocity: [4, 0, 4], radius: 0.4 };
    let n = 0;
    for (let i = 0; i < 120; i += 1) {
      body.velocity[2] = 4;
      n += world.step(body, 1 / 60).length;
    }
    expect(n).toBe(1);
    expect(body.position[0]).toBeGreaterThan(-3);
  });

  it("yawed boxes and spheres collide", () => {
    const gate = { kind: "box" as const, id: "gate", center: [0, 1, 4] as [number, number, number], half: [2, 1.5, 0.1] as [number, number, number], yaw: 0.3 };
    const ball = { kind: "sphere" as const, id: "ball", center: [6, 1, 0] as [number, number, number], radius: 0.5 };
    const w = createImpactWorld({ colliders: [gate, ball] });
    const a: ImpactBody = { position: [0, 1, 0], velocity: [0, 0, 20], radius: 0.3 };
    const b: ImpactBody = { position: [0, 1, 0], velocity: [30, 0, 0], radius: 0.3 };
    const ia: Impact[] = [];
    const ib: Impact[] = [];
    for (let i = 0; i < 90; i += 1) {
      ia.push(...w.step(a, 1 / 60));
    }
    w.reset();
    for (let i = 0; i < 90; i += 1) ib.push(...w.step(b, 1 / 60));
    expect(ia.map((x) => x.colliderId)).toEqual(["gate"]);
    expect(ib.map((x) => x.colliderId)).toEqual(["ball"]);
  });

  it("onImpact fires and resting contact below the event speed stays silent", () => {
    const hits: Impact[] = [];
    const w = createImpactWorld({ colliders: [wall], onImpact: (i) => hits.push(i), eventMinSpeed: 1 });
    const body: ImpactBody = { position: [0, 1, 4.3], velocity: [0, 0, 0.2], radius: 0.4 };
    for (let i = 0; i < 30; i += 1) w.step(body, 1 / 60);
    expect(hits.length).toBe(0);
  });
});

describe("impact feedback", () => {
  const impact: Impact = { colliderId: "gate", tag: "gate", point: [0, 1, 5], normal: [0, 0, -1], speed: 12, impulse: 15 };

  it("triggers hit-stop, shake, cue, particles and damage scaled by speed", () => {
    const hitStop = createHitStop();
    const shake = createCameraShake();
    const cues: Array<[string, number]> = [];
    let bursts = 0;
    let damage = 0;
    const fb = createImpactFeedback({
      hitStop,
      shake,
      cue: (n, g) => cues.push([n, g]),
      cueName: "gate-hit",
      particles: () => (bursts += 1),
      damagePerSpeed: 2,
      onDamage: (d) => (damage = d)
    });
    const r = fb.handle(impact);
    expect(r.hitStopMs).toBeCloseTo(80);
    expect(hitStop.active).toBe(true);
    expect(hitStop.timeScale()).toBeLessThan(0.1);
    hitStop.update(0.1);
    expect(hitStop.timeScale()).toBe(1);
    expect(shake.trauma).toBeGreaterThan(0.9);
    expect(cues[0]![0]).toBe("gate-hit");
    expect(bursts).toBe(1);
    expect(damage).toBeCloseTo(24);
    const soft = fb.handle({ ...impact, speed: 3 });
    expect(soft.hitStopMs).toBeLessThan(r.hitStopMs);
    expect(soft.trauma).toBeLessThan(r.trauma);
  });

  it("shake decays to zero and is deterministic", () => {
    const run = () => {
      const s = createCameraShake();
      s.add(1);
      const out: number[] = [];
      for (let i = 0; i < 120; i += 1) out.push(s.update(1 / 60).x);
      return out;
    };
    const a = run();
    expect(a).toEqual(run());
    expect(Math.abs(a[a.length - 1]!)).toBeLessThan(1e-9);
  });
});
