/**
 * §7.2 game wiring: R-11 (spec builders return live rigs under the flag),
 * R-12 (cameraDirector over rigs.fighting + shake), C-13 (racingCamera gate
 * removed), T-7/T-8 (hitStop forwarding to app.time).
 */
import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags.js";
import {
  createGamePlatformerPresentationCamera,
  createGameRacingPresentationCamera,
  type GamePlatformerPresentationCameraOptions,
  type GameRacingPresentationCameraOptions
} from "../../../../packages/engine/src/agent-api/GameSceneGeometryBindings.js";
import { createGameRacingCameraRig } from "../../../../packages/engine/src/agent-api/nodes/game/racingCamera.js";
import {
  applyGameCombatEventsToRuntime,
  createGameCameraDirector,
  type GameCombatEvent
} from "../../../../packages/engine/src/agent-api/GameRuntime.js";
import { createGameFeel } from "../../../../packages/engine/src/agent-api/GameFeel.js";

const QR_ON = { flags: resolveQrFlags({ options: ["camera"] }) };
const QR_OFF = { flags: resolveQrFlags({ options: [] }) };

const rigLike = (v: unknown): boolean =>
  typeof v === "object" && v !== null && "id" in v && typeof (v as { update?: unknown }).update === "function";

const poseFrom = (
  position: readonly [number, number, number],
  heading = 0
): { position: readonly [number, number, number]; rotation: readonly [number, number, number]; heading: number } =>
  ({ position, rotation: [0, heading, 0], heading });

const racingOptions = (extra: Partial<GameRacingPresentationCameraOptions> = {}): GameRacingPresentationCameraOptions => ({
  mode: "follow",
  sceneBinding: {
    toScenePose: (p: readonly [number, number, number]) => poseFrom(p),
    trackModel: { position: [0, 0, 0] }
  } as unknown as GameRacingPresentationCameraOptions["sceneBinding"],
  focus: [0, 0, 0],
  targetNode: "car",
  ...extra
});

const platformerOptions = (
  extra: Partial<GamePlatformerPresentationCameraOptions> = {}
): GamePlatformerPresentationCameraOptions => ({
  sceneBinding: {
    toScenePlayer: (p: { position: readonly [number, number, number]; facing?: 1 | -1 }) => ({
      position: p.position,
      facing: p.facing ?? 1
    }),
    worldModel: { position: [0, 0, 0] }
  } as unknown as GamePlatformerPresentationCameraOptions["sceneBinding"],
  player: { position: [1, 0, 0], facing: 1 } as GamePlatformerPresentationCameraOptions["player"],
  targetNode: "player",
  ...extra
});

describe("R-11 spec builders under A3D_QR_CAMERA", () => {
  it("racing follow camera returns a spec carrying a chase rig when the flag is on", () => {
    const spec = createGameRacingPresentationCamera(racingOptions(QR_ON));
    // 08-RIGCAST: real spec shape + `spec.rig` — no rig-as-spec cast.
    expect(spec.mode).toBe("follow");
    expect(rigLike(spec.rig)).toBe(true);
    expect((spec.rig as unknown as { id: string }).id).toBe("chase");
  });

  it("racing overview returns a spec carrying a topDown rig when the flag is on", () => {
    const spec = createGameRacingPresentationCamera(racingOptions({ ...QR_ON, mode: "overview" }));
    expect(spec.mode).toBe("perspective");
    expect(rigLike(spec.rig)).toBe(true);
    expect((spec.rig as unknown as { id: string }).id).toBe("topDown");
  });

  it("flag off and legacySpec return the legacy spec", () => {
    const off = createGameRacingPresentationCamera(racingOptions(QR_OFF));
    expect(off.mode).toBe("follow");
    expect(off.smoothing).toBeCloseTo(0.045);
    const legacy = createGameRacingPresentationCamera(racingOptions({ ...QR_ON, legacySpec: true }));
    expect(legacy.mode).toBe("follow");
    expect(legacy.smoothing).toBeCloseTo(0.045);
  });

  it("platformer follow returns a spec carrying a follow2d rig when the flag is on", () => {
    const spec = createGamePlatformerPresentationCamera(platformerOptions(QR_ON));
    expect(spec.mode).toBe("follow");
    expect(rigLike(spec.rig)).toBe(true);
    expect((spec.rig as unknown as { id: string }).id).toBe("follow2d");
  });

  it("platformer flag off returns the legacy spec", () => {
    const spec = createGamePlatformerPresentationCamera(platformerOptions(QR_OFF));
    expect(spec.mode).toBe("follow");
    expect(spec.smoothing).toBeCloseTo(0.045);
  });
});

describe("C-13 racingCamera verdict gate removed", () => {
  const compositionBase = {
    mode: "chase" as const,
    sceneBinding: racingOptions().sceneBinding,
    focus: [0, 0, 0] as readonly [number, number, number],
    targetNode: "car"
  };

  it("no composition argument → no throw", () => {
    const spec = createGameRacingCameraRig(compositionBase);
    expect(spec.mode).toBe("follow");
  });

  it("failing verdicts are ignored, not thrown", () => {
    const spec = createGameRacingCameraRig({
      ...compositionBase,
      composition: { verdict: "fail", cameraReadabilityVerdict: "fail", report: "" }
    });
    expect(spec.mode).toBe("follow");
  });

  it("flag on returns a spec carrying a live chase rig", () => {
    const spec = createGameRacingCameraRig({ ...compositionBase, ...QR_ON });
    expect(spec.mode).toBe("follow");
    expect(rigLike(spec.rig)).toBe(true);
    expect((spec.rig as unknown as { id: string }).id).toBe("chase");
  });

  it("flag-on top-down mode returns a spec carrying a topDown rig", () => {
    const spec = createGameRacingCameraRig({ ...compositionBase, ...QR_ON, mode: "top-down" });
    expect(rigLike(spec.rig)).toBe(true);
    expect((spec.rig as unknown as { id: string }).id).toBe("topDown");
  });
});

describe("R-12 createGameCameraDirector", () => {
  const targets = [
    { id: "a", position: [-2, 0.9, 0] as readonly [number, number, number] },
    { id: "b", position: [2, 0.9, 0] as readonly [number, number, number] }
  ];

  it("flag on: presented pose frames the fight (side-on, both in band)", () => {
    const director = createGameCameraDirector(QR_ON);
    const shot = director.update(1 / 60, targets);
    expect(shot.kind).toBe("aura-game-camera-director");
    // Side-on: camera sits on ±Z of the midpoint, near x=0.
    expect(Math.abs(shot.position[0])).toBeLessThan(0.5);
    expect(Math.abs(shot.position[2])).toBeGreaterThan(2);
    expect(shot.target[0]).toBeCloseTo(0, 3);
  });

  it("flag on: impact() raises trauma (shake) into the presented pose", () => {
    const director = createGameCameraDirector(QR_ON);
    director.update(1 / 60, targets);
    director.impact(0.8, 0.2);
    const shot = director.update(1 / 60, targets);
    expect(shot.shake).toBeGreaterThan(0);
  });

  it("flag off: legacy director shape unchanged", () => {
    const director = createGameCameraDirector(QR_OFF);
    const shot = director.update(1 / 60, targets);
    // Legacy zoom: distance 4 → zoom 1+(4-2.2)*0.08, z = baseDistance * zoom.
    expect(shot.zoom).toBeCloseTo(1.144, 3);
    expect(shot.position[2]).toBeCloseTo(6.2 * shot.zoom, 4);
  });
});

describe("T-7/T-8 hitStop forwarding", () => {
  it("gameFeel.hitStop(ms) forwards to app.time.hitStop(seconds)", () => {
    const calls: number[] = [];
    const feel = createGameFeel({ time: { hitStop: (s: number) => calls.push(s) } });
    feel.hitStop(70);
    expect(calls).toEqual([0.07]);
    // Attached: local ms freeze stays out of effectiveDt.
    expect(feel.effectiveDt(16.6)).toBeCloseTo(16.6, 5);
  });

  it("detached gameFeel keeps the local ms freeze", () => {
    const feel = createGameFeel();
    feel.hitStop(70);
    expect(feel.effectiveDt(16.6)).toBe(0);
  });

  it("combat events with hitStop call time.hitStop scoped to the pair", () => {
    const calls: { seconds: number; scope?: unknown }[] = [];
    const event: GameCombatEvent = {
      type: "hit",
      frame: 12,
      time: 0.2,
      attackerId: "a",
      targetId: "b",
      hitStop: 0.06,
      position: [0, 1, 0]
    };
    applyGameCombatEventsToRuntime([event], {
      time: { hitStop: (seconds, o) => calls.push({ seconds, scope: o?.scope }) }
    });
    expect(calls).toEqual([{ seconds: 0.06, scope: ["a", "b"] }]);
  });

  it("autoHitStop: false opts out", () => {
    const calls: number[] = [];
    const event: GameCombatEvent = {
      type: "hit",
      frame: 1,
      time: 0,
      attackerId: "a",
      hitStop: 0.06,
      position: [0, 1, 0]
    };
    applyGameCombatEventsToRuntime([event], {
      time: { hitStop: (s: number) => calls.push(s) },
      autoHitStop: false
    });
    expect(calls).toEqual([]);
  });
});
