/**
 * PR F wiring tests: V-2/V-5 vehicle model dispatch + chassis presentation,
 * F-6 feel events, A-5 engine voice, P-1 accel integration, P-2 feel
 * profile/apex hang, P-3 presentation state, I-5 consume/bufferMs.
 */
import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags.js";
import { createGameArcadeVehicle } from "../../../../packages/engine/src/agent-api/GameRuntime.js";
import {
  createGamePlatformerKit,
  createGameRacingKit
} from "../../../../packages/engine/src/agent-api/GameGenreKits.js";

const QR_ON = { flags: resolveQrFlags({ options: ["camera"] }) };
const QR_OFF = { flags: resolveQrFlags({ options: [] }) };

const route = {
  id: "test-loop",
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 }
  ],
  closed: true,
  width: 12
} as never;

describe("V-2 createGameArcadeVehicle bicycle dispatch", () => {
  it("model 'bicycle' returns extended state; unicycle does not", () => {
    const bike = createGameArcadeVehicle({ maxSpeed: 20, model: "bicycle" });
    const uni = createGameArcadeVehicle({ maxSpeed: 20 });
    const b = bike.step(1 / 60, { throttle: 1 });
    expect(b.rpm).toBeTypeOf("number");
    expect(b.lateralG).toBeTypeOf("number");
    expect(b.slipAngle).toBeTypeOf("number");
    expect(b.drifting).toBeTypeOf("boolean");
    const u = uni.step(1 / 60, { throttle: 1 });
    expect(u.rpm).toBeUndefined();
    expect(u.lateralG).toBeUndefined();
  });

  it("handbrake maps to drifting and rear-grip slide (drifting flag)", () => {
    const bike = createGameArcadeVehicle({ maxSpeed: 20, model: "bicycle" });
    let s = bike.snapshot();
    for (let i = 0; i < 120; i += 1) s = bike.step(1 / 60, { throttle: 1 });
    const free = s.drift;
    for (let i = 0; i < 60; i += 1) s = bike.step(1 / 60, { throttle: 0.5, steer: 1, handbrake: true });
    expect(s.drifting).toBe(true);
    expect(s.drift).toBeGreaterThan(free);
  });
});

describe("V-5 racing kit defaults + chassis + F-6", () => {
  it("flag-on defaults to bicycle: snapshot carries rpm/lateralG/vehiclePose", () => {
    const kit = createGameRacingKit({ route, ...QR_ON });
    let snap = kit.snapshot();
    for (let i = 0; i < 90; i += 1) snap = kit.step(1 / 60, { throttle: 1 });
    expect(snap.rpm).toBeTypeOf("number");
    expect(snap.vehiclePose).toBeDefined();
    expect(snap.vehiclePose?.position).toHaveLength(3);
  });

  it("flag-off keeps unicycle: no extended fields", () => {
    const kit = createGameRacingKit({ route, ...QR_OFF });
    const snap = kit.step(1 / 60, { throttle: 1 });
    expect(snap.rpm).toBeUndefined();
    expect(snap.vehiclePose).toBeUndefined();
  });

  it("emits boost/drift feel edges once per transition", () => {
    const emitted: string[] = [];
    const feelBus = { emit: (name: string) => { emitted.push(name); } };
    const kit = createGameRacingKit({ route, feelBus, ...QR_ON });
    for (let i = 0; i < 30; i += 1) kit.step(1 / 60, { throttle: 1 });
    kit.step(1 / 60, { throttle: 1, boost: true });
    kit.step(1 / 60, { throttle: 1, boost: true }); // held → no second emit
    kit.step(1 / 60, { throttle: 1, boost: false });
    kit.step(1 / 60, { throttle: 1, boost: true }); // re-edge
    expect(emitted.filter((e) => e === "boost")).toHaveLength(2);
    for (let i = 0; i < 40; i += 1) kit.step(1 / 60, { throttle: 0.6, steer: 1, drift: true });
    expect(emitted).toContain("drift");
    expect(emitted.filter((e) => e === "drift")).toHaveLength(1);
  });

  it("A-5: engine voice receives rpm/load each step", () => {
    const rpms: number[] = [];
    const loads: number[] = [];
    const kit = createGameRacingKit({
      route,
      ...QR_ON,
      sound: { engine: () => ({ setRpm: (r: number) => rpms.push(r), setLoad: (l: number) => loads.push(l) }) }
    });
    for (let i = 0; i < 10; i += 1) kit.step(1 / 60, { throttle: 1 });
    expect(rpms).toHaveLength(10);
    expect(loads.every((l) => l === 1)).toBe(true);
    expect(rpms[9]).toBeGreaterThanOrEqual(rpms[0]);
  });
});

describe("P-1 kinematic body accel integration", () => {
  const kitWith = (extra: Record<string, unknown>) =>
    createGamePlatformerKit({
      ...extra,
      platforms: [{ id: "ground", x: 0, y: 0, width: 200, height: 0.35 }],
      start: { x: 0, y: 0.35 },
      hazards: [], collectibles: [], checkpoints: [], movingPlatforms: []
    } as never);

  it("S13: reaches max speed in 0.08–0.12 s on the ground (flag on)", () => {
    const kit = kitWith(QR_ON);
    kit.step(1 / 60, {}); // settle onto ground
    const start = performance.now();
    void start;
    let t = 0;
    let vx = 0;
    for (let i = 0; i < 30; i += 1) {
      const s = kit.step(1 / 60, { moveX: 1 });
      vx = s.player.vx;
      t = (i + 1) / 60;
      if (Math.abs(vx) >= 5.25 * 0.99) break;
    }
    expect(t).toBeGreaterThanOrEqual(0.06);
    expect(t).toBeLessThanOrEqual(0.14);
    expect(Math.abs(vx)).toBeGreaterThan(5.25 * 0.98);
  });

  it("S13: stops from max speed in ~0.06–0.10 s (groundDecel)", () => {
    const kit = kitWith(QR_ON);
    for (let i = 0; i < 30; i += 1) kit.step(1 / 60, { moveX: 1 });
    let t = 0;
    for (let i = 0; i < 30; i += 1) {
      const s = kit.step(1 / 60, { moveX: 0 });
      t = (i + 1) / 60;
      if (Math.abs(s.player.vx) <= 0.05) break;
    }
    expect(t).toBeGreaterThanOrEqual(0.04);
    expect(t).toBeLessThanOrEqual(0.16);
  });

  it("flag-off keeps instant velocity (1 step to max)", () => {
    const kit = kitWith(QR_OFF);
    kit.step(1 / 60, {});
    const s = kit.step(1 / 60, { moveX: 1 });
    expect(Math.abs(s.player.vx)).toBeCloseTo(5.25, 5);
  });
});

describe("P-2 feel profile + apex hang", () => {
  const jumpKit = (level: Record<string, unknown>) =>
    createGamePlatformerKit({
      platforms: [{ id: "ground", x: 0, y: 0, width: 200, height: 0.35 }],
      start: { x: 0, y: 0.35 },
      hazards: [], collectibles: [], checkpoints: [], movingPlatforms: [],
      ...level
    } as never);

  const jumpArc = (kit: ReturnType<typeof createGamePlatformerKit>) => {
    kit.step(1 / 60, {});
    const apexBandDwell: number[] = [];
    const fallTimes: number[] = [];
    let apexY = 0;
    let exitT = 0;
    let landT = 0;
    let band = 0;
    const v0 = 8.25;
    kit.step(1 / 60, { jumpPressed: true });
    for (let i = 1; i < 120; i += 1) {
      const s = kit.step(1 / 60, { jumpHeld: true });
      const inBand = Math.abs(s.player.vy) < 0.14 * v0 && !s.player.grounded;
      if (inBand) band += 1;
      if (s.player.y > apexY) apexY = s.player.y;
      if (exitT === 0 && s.player.vy < -0.14 * v0) exitT = s.time;
      if (s.player.grounded) { landT = s.time; break; }
    }
    apexBandDwell.push(band);
    if (exitT > 0 && landT > exitT) fallTimes.push(landT - exitT);
    return { dwell: band / 60, fall: fallTimes[0] ?? 0, apexY };
  };

  it("responsive feel: longer apex dwell, faster fall to landing", () => {
    const feel = jumpArc(jumpKit({ flags: QR_ON.flags }));
    const flat = jumpArc(jumpKit({ flags: QR_ON.flags, feel: false }));
    expect(feel.dwell).toBeGreaterThan(flat.dwell * 1.4);
    expect(feel.fall).toBeLessThan(flat.fall * 0.9);
  });

  it("explicit fallGravityMultiplier overrides the profile", () => {
    const kit = jumpKit({ flags: QR_ON.flags, fallGravityMultiplier: 1 });
    kit.step(1 / 60, {});
    kit.step(1 / 60, { jumpPressed: true });
    const s = kit.step(1 / 60, { jumpHeld: false });
    expect(s.player.vy).toBeGreaterThan(0);
  });
});

describe("P-3/P-4 presentation + feel events", () => {
  it("player.presentation present on flag-on, absent on presentation:false", () => {
    const on = createGamePlatformerKit({ flags: QR_ON.flags });
    const off = createGamePlatformerKit({ flags: QR_ON.flags, presentation: false });
    expect(on.step(1 / 60, {}).player.presentation).toBeDefined();
    expect(off.step(1 / 60, {}).player.presentation).toBeUndefined();
    // lean tracks -vx
    let snap = on.step(1 / 60, { moveX: 1 });
    for (let i = 0; i < 20; i += 1) snap = on.step(1 / 60, { moveX: 1 });
    expect(snap.player.presentation!.lean).toBeLessThan(-0.5);
  });

  it("land/jump emit on feelBus with landImpact strength", () => {
    const emitted: { name: string; strength?: number }[] = [];
    const kit = createGamePlatformerKit({
      flags: QR_ON.flags,
      feelBus: { emit: (name: string, o?: { strength?: number }) => emitted.push({ name, strength: o?.strength }) },
      platforms: [{ id: "ground", x: 0, y: 0, width: 200, height: 0.35 }],
      start: { x: 0, y: 0.35 },
      hazards: [], collectibles: [], checkpoints: [], movingPlatforms: []
    } as never);
    kit.step(1 / 60, {});
    emitted.length = 0; // drop the initial settle land
    kit.step(1 / 60, { jumpPressed: true });
    expect(emitted.map((e) => e.name)).toContain("jump");
    for (let i = 0; i < 90; i += 1) kit.step(1 / 60, { jumpHeld: true });
    const land = emitted.filter((e) => e.name === "land").at(-1);
    expect(land).toBeDefined();
    expect(land!.strength).toBeGreaterThan(0);
  });
});

describe("F-6 combat → feel mapping (emitCombatFeel)", () => {
  it("maps move strength/block/ko/whiff onto fighting preset names", async () => {
    const { combatFeelEvent, emitCombatFeel } = await import(
      "../../../../packages/engine/src/agent-api/feel/combatFeel.js"
    );
    expect(combatFeelEvent({ strength: 0.2 })).toBe("hit-light");
    expect(combatFeelEvent({ strength: 0.9 })).toBe("hit-heavy");
    expect(combatFeelEvent({ strength: 0.9, ko: true })).toBe("ko");
    expect(combatFeelEvent({ strength: 0.9, blocked: true })).toBe("block");
    expect(combatFeelEvent({ strength: 0.9, whiff: true })).toBe("whiff");
    const emitted: string[] = [];
    emitCombatFeel({ emit: (n: string) => emitted.push(n) } as never, { strength: 0.8 });
    expect(emitted).toEqual(["hit-heavy"]);
  });
});
