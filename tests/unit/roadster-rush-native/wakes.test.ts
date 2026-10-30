import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APEX_PALETTE, hexToUnit } from "../../../apps/showcase-roadster-rush/src/art/look";
import {
  APEX_PLAYER_WAKE,
  APEX_RIVAL_WAKE,
  APEX_WAKE_CAPACITY,
  PLAYER_WAKE_COLOR,
  RIVAL_WAKE_COLOR,
  WakeTrail,
  playerWakeStrength,
  rivalWake,
  stripRotation,
  wakeIntensity,
  wakeLife,
  wakeSpec,
  type WakeSegment
} from "../../../apps/showcase-roadster-rush/src/render/wakes";

const options = { life: APEX_PLAYER_WAKE.life, headWidth: APEX_PLAYER_WAKE.headWidth, tailWidth: APEX_PLAYER_WAKE.tailWidth };

/** Drive a nozzle forward (-z) at `speed` m/s for `seconds`, sampling at 60 Hz; returns the last world z and time. */
function drive(trail: WakeTrail, speed: number, seconds: number, x = (t: number) => 0 * t): { z: number; t: number } {
  let z = 0;
  let t = 0;
  for (let i = 0; i <= Math.round(seconds * 60); i++) {
    t = i / 60;
    z = -speed * t;
    trail.sample(x(t), 0.5, z, t);
  }
  return { z, t };
}

describe("Apex Overdrive wakes (GU47 AO-V1)", () => {
  it("drops world-anchored points every life/segments seconds, keeps at most `segments`, and forgets points older than the life", () => {
    const trail = new WakeTrail(options.life, APEX_PLAYER_WAKE.segments);
    const { z, t } = drive(trail, 50, 2);
    expect(trail.length).toBeLessThanOrEqual(APEX_PLAYER_WAKE.segments);
    expect(trail.length).toBeGreaterThanOrEqual(APEX_PLAYER_WAKE.segments - 2);
    const out: WakeSegment[] = [];
    const n = trail.segmentsFrom([0, 0.5, z], t, options, 1, out);
    expect(n).toBeGreaterThan(6);
    expect(n).toBeLessThanOrEqual(APEX_PLAYER_WAKE.segments);
    // the wake lies behind the nozzle (+z, toward the camera) and is about speed * life long
    const far = Math.max(...out.map((s) => s.center[2] + Math.abs(s.axis[2]) / 2));
    expect(far - z).toBeGreaterThan(50 * options.life * 0.75);
    expect(far - z).toBeLessThanOrEqual(50 * options.life + 1e-6);
    // strength and width fall from the head to the tail
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!.strength).toBeLessThanOrEqual(out[i - 1]!.strength);
      expect(out[i]!.width).toBeLessThanOrEqual(out[i - 1]!.width);
    }
    expect(out[0]!.width).toBeCloseTo(options.headWidth, 6);
  });

  it("bends with a lane change, and clears on a new run (teleport) or a jump back in time", () => {
    const trail = new WakeTrail(options.life, APEX_PLAYER_WAKE.segments);
    const { z, t } = drive(trail, 40, 1, (time) => (time > 0.8 ? (time - 0.8) * 18 : 0));
    const out: WakeSegment[] = [];
    trail.segmentsFrom([3.6, 0.5, z], t, options, 1, out);
    expect(out.some((s) => Math.abs(s.axis[0]) > 0.05)).toBe(true);
    trail.sample(0, 0.5, z + 500, t + 0.1);
    expect(trail.length).toBe(1);
    trail.sample(0, 0.5, z + 500, t - 5);
    expect(trail.length).toBe(1);
  });

  it("shows only on a live run at speed", () => {
    expect(playerWakeStrength(60, false)).toBe(0);
    expect(playerWakeStrength(8, true)).toBe(0);
    expect(playerWakeStrength(30, true)).toBe(1);
    expect(playerWakeStrength(21, true)).toBeGreaterThan(0);
    expect(playerWakeStrength(Number.NaN, true)).toBe(0);
    const trail = new WakeTrail(options.life, APEX_PLAYER_WAKE.segments);
    drive(trail, 40, 1);
    expect(trail.segmentsFrom([0, 0.5, -40], 1, options, 0, [])).toBe(0);
  });

  it("streaks a rival behind its jet along its own travel, speed x life long, capped at 14 m", () => {
    const dt = 1 / 60;
    // oncoming (dir > 0) moves +z: the streak runs back toward -z from the jet at the car's -z end
    const oncoming = rivalWake({ x: 1, y: 12.45, z: -100, prevZ: -100 - 40 * dt, length: 4.7, dir: 1 }, dt, APEX_RIVAL_WAKE.life)!;
    expect(oncoming.jet[2]).toBeCloseTo(-100 - 2.35, 6);
    expect(oncoming.far[2]).toBeLessThan(oncoming.jet[2]);
    expect(oncoming.length).toBeCloseTo(40 * APEX_RIVAL_WAKE.life, 6);
    // same direction (dir < 0) moves -z: the streak runs back toward +z
    const ahead = rivalWake({ x: 0, y: 12, z: -60, prevZ: -60 + 12 * dt, length: 4.7, dir: -1 }, dt, APEX_RIVAL_WAKE.life)!;
    expect(ahead.far[2]).toBeGreaterThan(ahead.jet[2]);
    const fast = rivalWake({ x: 0, y: 12, z: 0, prevZ: -5, length: 4.7, dir: 1 }, dt, APEX_RIVAL_WAKE.life)!;
    expect(fast.length).toBe(APEX_RIVAL_WAKE.maxLength);
    expect(rivalWake({ x: 0, y: 12, z: 0, prevZ: 0, length: 4.7, dir: 1 }, dt, APEX_RIVAL_WAKE.life)).toBeNull();
  });

  it("reduced motion halves the wake life, so every streak is half as long (PRD §6.3)", () => {
    expect(wakeLife(APEX_PLAYER_WAKE.life, true)).toBeCloseTo(APEX_PLAYER_WAKE.life / 2, 9);
    expect(wakeLife(APEX_RIVAL_WAKE.life, false)).toBe(APEX_RIVAL_WAKE.life);
    const dt = 1 / 60;
    const rival = { x: 0, y: 12, z: -80, prevZ: -80 - 30 * dt, length: 4.7, dir: 1 };
    const full = rivalWake(rival, dt, wakeLife(APEX_RIVAL_WAKE.life, false))!;
    const calm = rivalWake(rival, dt, wakeLife(APEX_RIVAL_WAKE.life, true))!;
    expect(calm.length).toBeCloseTo(full.length / 2, 6);
  });

  it("turns the strip's +z onto its axis (yaw, then pitch)", () => {
    for (const axis of [[0, 0, 5], [0, 0, -5], [1, 0, 4], [-0.5, 0.3, -3], [0.2, -0.4, 2]] as [number, number, number][]) {
      const [pitch, yaw] = stripRotation(axis);
      // R = Ry(yaw) Rx(pitch): +z -> (cos p sin y, -sin p, cos p cos y)
      const z = [Math.cos(pitch) * Math.sin(yaw), -Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
      const len = Math.hypot(...axis);
      for (let i = 0; i < 3; i++) expect(z[i]!).toBeCloseTo(axis[i]! / len, 6);
    }
  });

  it("is an additive, depth-write-off strip: cyan only for the player, red only for rivals, brighter toward night", () => {
    expect(PLAYER_WAKE_COLOR).toBe(APEX_PALETTE.cyan);
    expect(RIVAL_WAKE_COLOR).toBe(APEX_PALETTE.rival);
    const spec = wakeSpec(RIVAL_WAKE_COLOR, 1, [140, 320]);
    expect(spec.blending).toBe("additive");
    expect(spec.transparent).toBe(true);
    expect(spec.depthWrite).toBe(false);
    expect((spec.uniforms?.wakeColor as { value: number[] }).value).toEqual(hexToUnit(APEX_PALETTE.rival));
    expect(spec.glsl.fragment).toContain("out vec4 outColor");
    expect(spec.glsl.vertex).toContain("instanceMatrix");
    expect(wakeIntensity(1.7)).toBeGreaterThan(wakeIntensity(1));
    expect(APEX_WAKE_CAPACITY).toBe(24);
  });

  it("main.ts draws both wakes as two instanced nodes and only reads the rivals' previous z", () => {
    const main = readFileSync(resolve(__dirname, "../../../apps/showcase-roadster-rush/src/main.ts"), "utf8");
    expect(main).toContain('name: "apex-player-wake"');
    expect(main).toContain('name: "apex-rival-wakes"');
    expect(main.match(/instances\s*\.plane\(\{ name: "apex-(player-wake|rival-wakes)"/g) ?? []).toHaveLength(2);
    expect(main).toContain("prevZ: Number(sc.prevZ");
    expect(main).not.toMatch(/sc\.prevZ\s*=/);
  });
});
