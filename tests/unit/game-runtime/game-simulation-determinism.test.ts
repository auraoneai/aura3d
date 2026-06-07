import { describe, expect, it } from "vitest";
import { game, type GameInputReplayEvent } from "../../../packages/engine/src";

interface FighterState {
  readonly playerX: number;
  readonly rivalHp: number;
  readonly hits: number;
}

function runReplaySimulation(events: readonly GameInputReplayEvent[]) {
  const replay = game.inputReplay(events, { fps: 60, seed: 106, label: "arena-proof" });

  return game.runSimulation<FighterState, FighterState>({
    label: "aura-clash-deterministic-proof",
    fps: replay.fps,
    frames: 8,
    initialState: {
      playerX: 0,
      rivalHp: 100,
      hits: 0
    },
    update: ({ frame, dt, state }) => {
      const frameEvents = game.inputReplayEventsAt(replay, frame);
      const moveRight = frameEvents.some((event) => event.binding === "KeyD" && event.type === "press");
      const heavy = frameEvents.some((event) => event.binding === "KeyK" && event.type === "press");
      const nextX = Number((state.playerX + (moveRight ? 3.6 * dt : 0)).toFixed(4));
      const inRange = nextX >= 0.05;
      const hit = heavy && inRange;

      return {
        state: {
          playerX: nextX,
          rivalHp: Math.max(0, state.rivalHp - (hit ? 14 : 0)),
          hits: state.hits + (hit ? 1 : 0)
        },
        events: hit ? [{ type: "hit", frame, move: "heavy" }] : []
      };
    },
    snapshot: (state) => state
  });
}

describe("game.runSimulation", () => {
  it("produces stable replay evidence for identical fixed-step input", () => {
    const events: readonly GameInputReplayEvent[] = [
      { frame: 1, time: 1 / 60, type: "press", binding: "KeyD" },
      { frame: 3, time: 3 / 60, type: "press", binding: "KeyK" }
    ];

    const first = runReplaySimulation(events);
    const second = runReplaySimulation(events);

    expect(first.kind).toBe("aura-game-simulation-result");
    expect(first.deterministic).toBe(true);
    expect(first.finalSnapshot).toEqual({
      playerX: 0.06,
      rivalHp: 86,
      hits: 1
    });
    expect(first.finalHash).toBe(second.finalHash);
    expect(first.frames.map((frame) => frame.hash)).toEqual(second.frames.map((frame) => frame.hash));
    expect(first.eventCount).toBe(1);

    const changed = runReplaySimulation([
      { frame: 1, time: 1 / 60, type: "press", binding: "KeyD" }
    ]);

    expect(changed.finalSnapshot).toEqual({
      playerX: 0.06,
      rivalHp: 100,
      hits: 0
    });
    expect(changed.finalHash).not.toBe(first.finalHash);
  });
});
