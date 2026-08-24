import { describe, expect, it } from "vitest";
import {
  createTurboGhostPlayer,
  createTurboGhostRecorder,
  parseTurboGhostRecording,
  serializeTurboGhostRecording,
  turboGhostPathHash,
  turboGhostPoseAt,
  type TurboGhostRecording,
  type TurboGhostSample
} from "../../../apps/showcase-turbo-drift-circuit/src/ghost";

/**
 * PRD TDC-A1: the ghost must export and import without changing the lap it describes.
 * The path hash is the contract: serialize -> parse -> hash must equal the original's
 * hash, and any change to the recorded path must change the hash.
 */

function syntheticRecording(lapSeconds: number, seed = 7): TurboGhostRecording {
  const samples: TurboGhostSample[] = [];
  let state = seed >>> 0;
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  const frameCount = Math.floor(lapSeconds * 60);
  // Mirror the record-time canonical form: fixed decimals with -0 folded to 0
  // (the recorder's quantizer does the same, so JSON round trips are exact).
  const q = (value: number) => {
    const fixed = Number(value.toFixed(6));
    return fixed === 0 ? 0 : fixed;
  };
  for (let frame = 0; frame < frameCount; frame += 1) {
    const t = q(frame / 60);
    const phase = (t / lapSeconds) * Math.PI * 2;
    // A plausible closed lap path: two superposed harmonics around the circuit.
    samples.push({
      t,
      x: q(Math.cos(phase) * (3 + rand() * 0.01)),
      y: q(Math.sin(phase) * (2 + rand() * 0.01)),
      heading: q(phase + Math.PI / 2),
      speed: q(1.4 + Math.sin(phase * 3) * 0.4),
      progress: q((t / lapSeconds) % 1)
    });
  }
  return { schema: "aura3d-turbo-ghost-recording/1.0" as const, lapSeconds, sampleCount: samples.length, samples };
}

describe("turbo ghost replay round trip", () => {
  const recording = syntheticRecording(35.2);

  it("export -> import reproduces the identical lap path hash", () => {
    const exported = serializeTurboGhostRecording(recording);
    const imported = parseTurboGhostRecording(exported);
    expect(turboGhostPathHash(imported)).toBe(turboGhostPathHash(recording));
    expect(imported.samples).toEqual(recording.samples);
    expect(imported.lapSeconds).toBe(recording.lapSeconds);
  });

  it("is stable across repeated serializations", () => {
    expect(serializeTurboGhostRecording(recording))
      .toBe(serializeTurboGhostRecording(parseTurboGhostRecording(serializeTurboGhostRecording(recording))));
  });

  it("changes the hash when the recorded path changes", () => {
    const shifted = syntheticRecording(35.2, 8);
    expect(turboGhostPathHash(shifted)).not.toBe(turboGhostPathHash(recording));
    const retimed: TurboGhostRecording = { ...recording, lapSeconds: recording.lapSeconds + 0.5 };
    expect(turboGhostPathHash(retimed)).not.toBe(turboGhostPathHash(recording));
  });

  it("rejects malformed imports instead of replaying guesses", () => {
    expect(() => parseTurboGhostRecording(JSON.stringify({ ...recording, schema: "other/1" }))).toThrow();
    expect(() => parseTurboGhostRecording(
      JSON.stringify({ ...recording, sampleCount: recording.sampleCount + 1 })
    )).toThrow();
    expect(() => parseTurboGhostRecording(
      JSON.stringify({
        ...recording,
        samples: recording.samples.map((sample, index) => index === 3 ? { ...sample, x: Number.NaN } : sample)
      })
    )).toThrow();
  });

  it("interpolates inside recorded samples only, looping at the lap boundary", () => {
    const first = recording.samples[0]!;
    expect(turboGhostPoseAt(recording, 0)).toEqual({
      x: first.x, y: first.y, heading: first.heading, speed: first.speed, progress: first.progress
    });
    const midA = recording.samples[100]!;
    const midB = recording.samples[101]!;
    const pose = turboGhostPoseAt(recording, midA.t + (midB.t - midA.t) / 2);
    expect(pose.x).toBeGreaterThanOrEqual(Math.min(midA.x, midB.x));
    expect(pose.x).toBeLessThanOrEqual(Math.max(midA.x, midB.x));
    const wrapped = turboGhostPoseAt(recording, recording.lapSeconds + 0.5);
    const direct = turboGhostPoseAt(recording, 0.5);
    expect(wrapped).toEqual(direct);
  });

  it("advances deterministically through a player", () => {
    const a = createTurboGhostPlayer(recording);
    const b = createTurboGhostPlayer(recording);
    for (let step = 0; step < 240; step += 1) {
      expect(a.advance(1 / 60)).toEqual(b.advance(1 / 60));
    }
    b.restart();
    expect(b.elapsedSeconds()).toBe(0);
  });

  it("records monotonic samples and seals nothing when the lap was not driven", () => {
    const recorder = createTurboGhostRecorder();
    recorder.start();
    for (let frame = 0; frame < 30; frame += 1) {
      recorder.record({ t: frame / 60, x: frame, y: 0, heading: 0, speed: 1, progress: frame / 600 });
    }
    const sealed = recorder.finish(0.5);
    expect(sealed).not.toBeNull();
    if (!sealed) return;
    for (let index = 1; index < sealed.samples.length; index += 1) {
      expect(sealed.samples[index]!.t).toBeGreaterThan(sealed.samples[index - 1]!.t);
    }
    const emptyRecorder = createTurboGhostRecorder();
    emptyRecorder.start();
    emptyRecorder.record({ t: 0, x: 0, y: 0, heading: 0, speed: 0, progress: 0 });
    expect(emptyRecorder.finish(10)).toBeNull();
  });
});