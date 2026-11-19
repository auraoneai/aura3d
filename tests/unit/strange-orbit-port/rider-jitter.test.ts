import { describe, expect, it } from "vitest";
import { RIDER_BUZZ_FROM, RIDER_BUZZ_MAX, RIDER_BUZZ_RATE, riderBuzz } from "../../../examples/strange-orbit-port/art/idolRider";

/** Owner QA (Nov 18): "when the game starts it starts shaking on top of the head, up and down, jittery". */
describe("Craterline rider motion stays smooth", () => {
  const frames = (speed: (i: number) => number) => Array.from({ length: 240 }, (_, i) => riderBuzz(speed(i), i / 60));

  it("is still at the start and at low speed (no buzz below the fade-in speed)", () => {
    for (const v of [0, 4, 8, RIDER_BUZZ_FROM]) for (const b of frames(() => v)) expect(Math.abs(b)).toBeLessThan(1e-12);
    // launch from the grid: 0 -> 20 m/s over 4 s, the per-frame pitch change stays tiny
    const launch = frames((i) => (i / 240) * 20);
    for (let i = 1; i < launch.length; i++) expect(Math.abs(launch[i]! - launch[i - 1]!)).toBeLessThan(0.001);
  });

  it("at top speed it is a gentle <= 3 Hz sway of <= 0.012 rad (about 0.6 cm at the head), not a per-frame flicker", () => {
    const top = frames(() => 40);
    expect(Math.max(...top.map(Math.abs))).toBeLessThanOrEqual(RIDER_BUZZ_MAX + 1e-12);
    expect(RIDER_BUZZ_RATE / (2 * Math.PI)).toBeLessThanOrEqual(3);
    // the sign flips at most ~2.4 x 2 times a second, never frame to frame
    let flips = 0;
    for (let i = 1; i < top.length; i++) if (Math.sign(top[i]!) !== Math.sign(top[i - 1]!)) flips++;
    expect(flips).toBeLessThanOrEqual(Math.ceil((240 / 60) * 2 * (RIDER_BUZZ_RATE / (2 * Math.PI))) + 1);
    // head lever about 0.55 m above the chest pivot: per-frame head height change <= 1 cm
    for (let i = 1; i < top.length; i++) expect(Math.abs(top[i]! - top[i - 1]!) * 0.55).toBeLessThan(0.01);
  });
});

describe("Craterline bike stays planted under autoplay (owner QA Nov 18: 'top head to bottom tire, too bouncy')", () => {
  it("over 40 s of autopilot the drawn roll changes <= 1.5 deg per frame without oscillating, and the drawn ride height <= 1 cm per frame on flat road", async () => {
    const { autopilot, createRace, startCountdown, stepRace, STEP } = await import("../../../examples/strange-orbit-port/race");
    const { drawnSurfaceNoise, DRAWN_RIPPLE } = await import("../../../examples/strange-orbit-port/track");
    const { slewLean, DRAWN_LEAN_MAX, LEAN_GAIN } = await import("../../../examples/strange-orbit-port/world");
    const { trackLane } = await import("../../../examples/strange-orbit-port/course");
    expect(DRAWN_RIPPLE).toBeLessThanOrEqual(0.25); // 0 since the coordinator's Nov 18 follow-up
    const r = createRace({});
    startCountdown(r);
    const roll: number[] = [];
    const y: number[] = [];
    const flat: boolean[] = [];
    let shown = 0;
    for (let i = 0; i < 60 * 44; i++) {
      stepRace(r, r.phase === "racing" ? autopilot(r) : { pedal: true, steer: 0 }, STEP);
      if (r.phase !== "racing") continue;
      roll.push((shown = slewLean(shown, r.lean * LEAN_GAIN, STEP)));
      y.push(drawnSurfaceNoise(r.s, trackLane(r.s, r.lane, r.route)));
      flat.push(!r.air && !r.flight && !r.loop);
    }
    expect(roll.length).toBeGreaterThan(2000);
    let flips = 0;
    for (let i = 1; i < roll.length; i++) {
      expect(Math.abs(roll[i]! - roll[i - 1]!)).toBeLessThan((1.5 * Math.PI) / 180);
      expect(Math.abs(roll[i]!)).toBeLessThanOrEqual(DRAWN_LEAN_MAX + 1e-12);
      if (flat[i] && flat[i - 1]) expect(Math.abs(y[i]! - y[i - 1]!)).toBeLessThan(0.01);
      if (i > 1) {
        const a = roll[i - 1]! - roll[i - 2]!, b = roll[i]! - roll[i - 1]!;
        if (a * b < 0 && Math.abs(a) > 1e-4 && Math.abs(b) > 1e-4) flips++;
      }
    }
    // a lean reversal per real lane change, never a frame-to-frame wobble
    expect(flips).toBeLessThan(roll.length / 60);
  }, 60_000);
});

describe("Craterline wheels spin about their hub (owner QA Nov 18: 'the tire is literally shaking' / 'disappearing')", () => {
  it("the wheel model is hub-centred in its spin node, so a full revolution moves its bounds centre <= 2 mm", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const { CG_WHEEL_HUB, WHEEL_SPIN_SHOWN_MAX, WHEEL_BLUR_RATE } = await import("../../../examples/strange-orbit-port/art/idolModels");
    const glb = readFileSync(resolve(__dirname, "../../../apps/showcase-strange-orbit-port/assets/idol/cgBikeWheel.glb"));
    const jsonLength = glb.readUInt32LE(12);
    const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString("utf8")) as { accessors: { min?: number[]; max?: number[] }[]; meshes: { primitives: { attributes: { POSITION: number } }[] }[] };
    const acc = gltf.accessors[gltf.meshes[0]!.primitives[0]!.attributes.POSITION]!;
    const centre = [0, 1, 2].map((k) => (acc.min![k]! + acc.max![k]!) / 2);
    centre.forEach((c, k) => expect(Math.abs(c - CG_WHEEL_HUB[k]!)).toBeLessThan(0.002));
    // the node shifts the model by -hub, so the bounds centre sits on the spin origin; rotate it about the axle (local X)
    const local = centre.map((c, k) => c - CG_WHEEL_HUB[k]!);
    let worst = 0;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 36) {
      const y = local[1]! * Math.cos(a) - local[2]! * Math.sin(a), z = local[1]! * Math.sin(a) + local[2]! * Math.cos(a);
      worst = Math.max(worst, Math.hypot(local[0]!, y - local[1]!, z - local[2]!));
    }
    expect(worst).toBeLessThanOrEqual(0.002);
    // the drawn tread never steps more than 0.31 rad per 60 Hz frame (no strobing); the blur disc carries the rest
    expect(WHEEL_SPIN_SHOWN_MAX / 60).toBeLessThan(0.31);
    expect(WHEEL_SPIN_SHOWN_MAX).toBeLessThan(WHEEL_BLUR_RATE);
  }, 60_000);
});
