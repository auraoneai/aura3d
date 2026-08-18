import { describe, expect, it } from "vitest";
import {
  createTurboOpponentAi,
  type TurboOpponentInput,
  type TurboOpponentRacingState,
  type TurboOpponentSnapshot,
  type TurboOpponentDriver
} from "../../../apps/showcase-turbo-drift-circuit/src/opponent-ai";

interface FakeSnapshot extends TurboOpponentSnapshot {
  readonly progressValue: number;
}

function makeSnapshot(overrides: Partial<FakeSnapshot> = {}): FakeSnapshot {
  return {
    progress: 0,
    speed: 1,
    heading: 0,
    position: { x: 0, y: 0 },
    offTrack: false,
    trackOffset: 0,
    signedTrackOffset: 0,
    lap: 1,
    checkpoint: 0,
    status: "running",
    frame: 0,
    progressValue: 0,
    ...overrides
  };
}

function turboCarSnapshot(p: TurboOpponentSnapshot) {
  // structural: TurboOpponentRacingState requires snapshot() -> TSnapshot
  void p;
}
void turboCarSnapshot;

function makeFakeState(): {
  state: TurboOpponentRacingState<FakeSnapshot>;
  current: { snapshot: FakeSnapshot };
  stepped: { input: TurboOpponentInput }[];
} {
  const current = { snapshot: makeSnapshot() };
  const stepped: { input: TurboOpponentInput }[] = [];
  const state: TurboOpponentRacingState<FakeSnapshot> = {
    snapshot: () => current.snapshot,
    step: (dt, input) => {
      stepped.push({ input });
      return current.snapshot;
    },
    reset: (progress) => {
      current.snapshot = makeSnapshot({ progress: progress ?? 0 });
      return current.snapshot;
    }
  };
  return { state, current, stepped };
}

function makeFakeDriver(overrides: { targetSpeed?: number; upcomingCurvature?: number; steer?: number } = {}): TurboOpponentDriver {
  const telemetry = {
    upcomingCurvature: overrides.upcomingCurvature ?? 0,
    targetSpeed: overrides.targetSpeed ?? 4
  };
  return {
    decide: (dt, state) => ({ throttle: 1, brake: 0, steer: overrides.steer ?? 0, drift: false }),
    telemetry: () => telemetry,
    reset: () => undefined
  };
}

describe("turbo rival drama is deterministic and route-local", () => {
  it("defends the inside line and dips pace when the player is close late-race", () => {
    const a = makeFakeState();
    const ai = createTurboOpponentAi(a.state, {
      startProgress: 0,
      maxSpeed: 4,
      legalPassingOffset: 0.07,
      maxAsphaltOffset: 0.3,
      yieldEnabled: true,
      dramaSeed: 777,
      driver: makeFakeDriver({ targetSpeed: 4 })
    });
    a.current.snapshot = makeSnapshot({ lap: 3, progress: 0.5, signedTrackOffset: 0, speed: 3.5, position: { x: 1, y: 1 } });
    // Wrapped gap must be close AND just ahead (0.012..0.018) to trigger the
    // "defending" branch (behind triggers "defensive" yielding instead).
    for (let i = 0; i < 3; i += 1) ai.step(1 / 60, 0.514 + i * 0.001, -0.02);
    const ev = ai.evidence(0.514);
    expect(ev.defending).toBe(true);
    expect(Math.abs(ev.preferredSignedOffset)).toBeGreaterThan(0.05);
    expect(Math.abs(ev.preferredSignedOffset)).toBeLessThanOrEqual(0.3);

    // Determinism: identical script on a fresh instance yields identical outcome.
    const b = makeFakeState();
    const redo = createTurboOpponentAi(b.state, {
      startProgress: 0,
      maxSpeed: 4,
      legalPassingOffset: 0.07,
      maxAsphaltOffset: 0.3,
      yieldEnabled: true,
      dramaSeed: 777,
      driver: makeFakeDriver({ targetSpeed: 4 })
    });
    b.current.snapshot = makeSnapshot({ lap: 3, progress: 0.5, signedTrackOffset: 0, speed: 3.5, position: { x: 1, y: 1 } });
    for (let i = 0; i < 3; i += 1) redo.step(1 / 60, 0.514 + i * 0.001, -0.02);
    const ev2 = redo.evidence(0.514);
    expect(ev2.defending).toBe(ev.defending);
    expect(ev2.preferredSignedOffset).toBe(ev.preferredSignedOffset);
    expect(ev2.targetSpeed).toBe(ev.targetSpeed);
  });

  it("leaves a passing lane (returns to the racing line) when the player is ahead and goes wide", () => {
    const a = makeFakeState();
    const ai = createTurboOpponentAi(a.state, {
      startProgress: 0,
      maxSpeed: 4,
      legalPassingOffset: 0.07,
      maxAsphaltOffset: 0.3,
      yieldEnabled: true,
      dramaSeed: 9,
      driver: makeFakeDriver({ targetSpeed: 4 })
    });
    a.current.snapshot = makeSnapshot({ lap: 1, progress: 0.3, signedTrackOffset: 0.04, speed: 3, position: { x: 2, y: 2 } });
    for (let i = 0; i < 2; i += 1) ai.step(1 / 60, 0.36, 0.05);
    const ev = ai.evidence(0.36);
    expect(ev.defending).toBe(false);
    expect(ev.yielding).toBe(false);
    expect(Math.abs(ev.preferredSignedOffset)).toBeLessThan(0.07);
  });

  it("reports an on-road body a human can race against when widths are known", () => {
    const a = makeFakeState();
    const ai = createTurboOpponentAi(a.state, {
      startProgress: 0,
      maxSpeed: 4,
      legalPassingOffset: 0.07,
      maxAsphaltOffset: 0.3,
      bodyHalfWidth: 0.17,
      visualAsphaltHalfWidth: 0.4,
      yieldEnabled: true,
      dramaSeed: 3,
      driver: makeFakeDriver({ targetSpeed: 4 })
    });
    a.current.snapshot = makeSnapshot({ lap: 1, progress: 0.1, signedTrackOffset: 0, speed: 3, position: { x: 0, y: 0 } });
    ai.step(1 / 60, 0.1, 0);
    const ev = ai.evidence(0.1);
    expect(ev.onAsphalt).toBe(true);
    expect(ev.onRoad).toBe(true);
  });
});
