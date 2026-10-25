import { describe, expect, it } from "vitest";
import { runMotionGate } from "../../../packages/game/src/motion/index";
import { RoadsterGame } from "../../../apps/showcase-roadster-rush/src/native/game";
import { Player } from "../../../apps/showcase-roadster-rush/src/native/player";
import { Traffic } from "../../../apps/showcase-roadster-rush/src/native/traffic";
import { FreewayWorld } from "../../../apps/showcase-roadster-rush/src/native/world";
import { SNAP_DISTANCE, blendShown, createRoadsterPresenter, shownOf, viewOf } from "../../../apps/showcase-roadster-rush/src/native/presentation";

const STEP = 1 / 60;

function playing(seed = 42): RoadsterGame {
  const game = new RoadsterGame({ player: new Player(), traffic: new Traffic(), world: new FreewayWorld(), params: new URLSearchParams(`seed=${seed}&autopilot=0`), storage: null });
  game.boot();
  game.start();
  for (let i = 0; i < 180; i += 1) game.simStep(STEP);
  return game;
}

const shown = (z: number) => ({
  time: z,
  player: { x: 0, y: 0, z },
  vehicles: [{ id: "a", x: 1, z: z - 20 }, { id: "b", x: 2, z: z - 40 }],
  skyCars: [{ id: "s", x: 0, y: 10, z: z - 30 }]
});

describe("apex overdrive presentation", () => {
  it("blends the car and entities by id, and snaps a restart or a recycled slot", () => {
    const m = blendShown(shown(0), shown(-1), 0.5);
    expect(m.player.z).toBeCloseTo(-0.5, 12);
    expect(m.vehicles[0]!.z).toBeCloseTo(-20.5, 12);
    expect(m.skyCars[0]!.z).toBeCloseTo(-30.5, 12);
    const recycled = { ...shown(-1), vehicles: [{ id: "a", x: 1, z: -400 }, { id: "c", x: 3, z: -5 }] };
    const r = blendShown(shown(0), recycled, 0.5);
    expect(r.vehicles[0]!.z).toBe(-400);
    expect(r.vehicles[1]!.z).toBe(-5);
    expect(blendShown(shown(0), shown(-SNAP_DISTANCE - 5), 0.5).player.z).toBe(-SNAP_DISTANCE - 5);
  });

  it("viewOf replaces only the presented fields and never changes the real game", () => {
    const game = playing();
    const before = JSON.stringify({ z: game.player.position.z, score: game.score, n: game.traffic.vehicles.length });
    const view = viewOf(game, { ...shownOf(game), player: { x: 0.5, y: 1, z: game.player.position.z + 0.2 } });
    expect(view.player.position.x).toBe(0.5);
    expect(view.player.position.z).toBeCloseTo(game.player.position.z + 0.2, 12);
    expect(view.traffic.vehicles).toHaveLength(game.traffic.vehicles.length);
    expect(view.mode).toBe(game.mode);
    expect(view.player.speed).toBe(game.player.speed);
    expect(JSON.stringify({ z: game.player.position.z, score: game.score, n: game.traffic.vehicles.length })).toBe(before);
  });

  const gate = (hz: number, interpolate: boolean, jitterSeconds = 0) => {
    const game = playing();
    const presenter = createRoadsterPresenter(() => game);
    const tracked = game.traffic.vehicles[0]?.id;
    let lastRel = 0;
    return runMotionGate({
      displayHz: hz,
      jitterSeconds,
      seconds: 4,
      warmupSeconds: 1,
      step: () => game.simStep(STEP),
      afterStep: () => presenter.afterStep(),
      drawn: (alpha) => {
        const s = interpolate ? presenter.present({ alpha }) : shownOf(game);
        const v = s.vehicles.find((x) => x.id === tracked);
        if (v) lastRel = v.z - s.player.z;
        return [s.player.z, lastRel];
      }
    });
  };

  it("the old draw-the-latest-step path stands still on about half the frames at 120 and 144 Hz", () => {
    expect(gate(120, false).stillFraction).toBeGreaterThan(0.4);
    expect(gate(144, false).stillFraction).toBeGreaterThan(0.4);
  });

  it("the presented car and traffic advance on every frame at 60, 120 and 144 Hz", () => {
    for (const hz of [60, 120, 144]) {
      const report = gate(hz, true);
      expect(report.stillFrames).toBe(0);
    }
    expect(gate(60, true, 0.0015).stillFraction).toBeLessThan(0.05);
  });
});
