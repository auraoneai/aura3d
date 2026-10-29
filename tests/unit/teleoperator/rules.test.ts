import { describe, expect, it } from "vitest";
import {
  ASSIST,
  KERB_STOP_X,
  PLAYABLE_FLEET,
  PLAYABLE_IDS,
  SCENE_CAM_POS,
  cameraClearance,
  cameraOffsets,
  careerRating,
  createShift,
  crossedStopLine,
  fittedSize,
  gmodeLabel,
  isTextEntryTarget,
  isWrongWay,
  kerbGate,
  loadCareer,
  nearestIndices,
  nextAssist,
  nextStopLineZ,
  resolveLaneFollowing,
  rideOutcome,
  saveCareer,
  shiftAddFare,
  shiftScore,
  shiftTick,
  signalPhase,
  signalSpeedCap,
  viewX,
  SHIFT_FARES,
  SHIFT_SECONDS,
  type LaneBody
} from "../../../apps/showcase-teleoperator/src/rules";

describe("grid dispatch kerb gate (C1)", () => {
  const atKerb = { playerX: KERB_STOP_X, dz: 1, speed: 0.5 };
  it("a driving player must be in the kerb lane and nearly stopped", () => {
    expect(kerbGate({ playerDrives: true, ...atKerb })).toBe("stop");
    expect(kerbGate({ playerDrives: true, ...atKerb, playerX: 3.4 })).toBe("approach");
    expect(kerbGate({ playerDrives: true, ...atKerb, speed: 9.5 })).toBe("approach");
  });
  it("driving past the beacon misses it instead of firing", () => {
    expect(kerbGate({ playerDrives: true, playerX: 3.4, dz: -7, speed: 9.5 })).toBe("missed");
    expect(kerbGate({ playerDrives: true, playerX: 3.4, dz: -2, speed: 9.5 })).toBe("approach");
  });
  it("the self-driving levels stop by themselves inside the window", () => {
    expect(kerbGate({ playerDrives: false, playerX: KERB_STOP_X, dz: 3, speed: 2.2 })).toBe("stop");
    expect(kerbGate({ playerDrives: false, playerX: KERB_STOP_X, dz: 10, speed: 5 })).toBe("approach");
  });
});

describe("grid dispatch camera offsets per car (C4)", () => {
  for (const id of PLAYABLE_IDS) {
    const spec = PLAYABLE_FLEET[id];
    const size = fittedSize(spec.bounds, spec.maxDim);
    it(`${id}: no camera mode puts the eye inside the car`, () => {
      const offs = cameraOffsets(size);
      for (const mode of [0, 1, 2, 3] as const) expect(cameraClearance(size, offs[mode]).inside, `mode ${mode}`).toBe(false);
      // roof camera above the roof, bumper camera ahead of the front bumper
      expect(cameraClearance(size, offs[2]).dy).toBeGreaterThan(0.3);
      expect(cameraClearance(size, offs[3]).dz).toBeGreaterThan(0.3);
    });
  }
  it("matches the hand-tuned offsets of the default car", () => {
    const s = fittedSize(PLAYABLE_FLEET.cruiser.bounds, PLAYABLE_FLEET.cruiser.maxDim);
    const o = cameraOffsets(s);
    expect(Math.abs(o[2].y - 0.25)).toBeLessThan(0.2);
    expect(o[2].z).toBeCloseTo(8.4, 1);
    expect(o[3].y).toBeCloseTo(2.6, 5);
    expect(o[3].z).toBeCloseTo(9.6, 1);
  });
  it("the old fallback offsets put the eye inside four of the five cars", () => {
    const inside = PLAYABLE_IDS.filter((id) => id !== "cruiser").filter((id) => {
      const size = fittedSize(PLAYABLE_FLEET[id].bounds, PLAYABLE_FLEET[id].maxDim);
      return cameraClearance(size, { y: 1.45, z: 5.2 }).inside || cameraClearance(size, { y: 2.15, z: 7.4 }).inside;
    });
    expect(inside.length).toBe(4);
    expect(SCENE_CAM_POS[2]).toBe(6.5);
  });
});

describe("grid dispatch view shift (C2)", () => {
  it("the road and the car shift together, so the car keeps its lane offset from the centre line", () => {
    for (const playerX of [-3.2, 0, 3.4, 7.4]) {
      const car = viewX(playerX, playerX);
      const line = viewX(0.18, playerX);
      expect(car - line).toBeCloseTo(playerX - 0.18, 6);
    }
  });
});

describe("grid dispatch ride scoring and shift (C7)", () => {
  const base = { style: "comfort" as const, fareUsd: 30, parSec: 50, elapsedSec: 40, comfortScore: 100, collisions: 0, streetMultiplier: 3 };
  it("tip depends on comfort, time and collisions", () => {
    const clean = rideOutcome(base);
    expect(clean.tipUsd).toBeCloseTo(9, 2);
    expect(clean.stars).toBe(5);
    expect(rideOutcome({ ...base, comfortScore: 70 }).tipUsd).toBeLessThan(clean.tipUsd / 2 + 0.01);
    const late = rideOutcome({ ...base, elapsedSec: 75 });
    expect(late.late).toBe(true);
    expect(late.tipUsd).toBeCloseTo(4.5, 2);
    expect(late.stars).toBe(4);
    expect(rideOutcome({ ...base, elapsedSec: 100 }).tipUsd).toBe(0);
    expect(rideOutcome({ ...base, collisions: 3 }).tipUsd).toBe(0);
    expect(rideOutcome({ ...base, collisions: 2 }).stars).toBe(3);
  });
  it("street tips scale with the multiplier", () => {
    expect(rideOutcome({ ...base, style: "street", streetMultiplier: 5 }).tipUsd).toBeCloseTo(12, 2);
    expect(rideOutcome({ ...base, style: "street", streetMultiplier: 1 }).tipUsd).toBeCloseTo(2.4, 2);
  });
  it("a shift ends after five fares or when the clock runs out", () => {
    const s = createShift();
    for (let i = 0; i < SHIFT_FARES; i++) shiftAddFare(s, rideOutcome(base));
    expect(s.over).toBe(true);
    expect(s.reason).toBe("fares");
    expect(shiftScore(s)).toBe(Math.round(5 * 39 + 25));
    const t = createShift();
    expect(shiftTick(t, SHIFT_SECONDS - 1)).toBe(false);
    expect(shiftTick(t, 2)).toBe(true);
    expect(t.reason).toBe("time");
  });
});

describe("grid dispatch career storage (P-01)", () => {
  it("starts from zero and round-trips through storage", () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const c = loadCareer(storage);
    expect(c).toEqual({ earningsUsd: 0, rides: 0, starsSum: 0, bestShiftScore: 0 });
    expect(careerRating(c)).toBeNull();
    saveCareer(storage, { earningsUsd: 70, rides: 2, starsSum: 9, bestShiftScore: 120 });
    expect(loadCareer(storage)).toEqual({ earningsUsd: 70, rides: 2, starsSum: 9, bestShiftScore: 120 });
    expect(careerRating(loadCareer(storage))).toBe(4.5);
    mem.set("grid-dispatch:career:v1", "{not json");
    expect(loadCareer(storage).rides).toBe(0);
  });
});

describe("grid dispatch assist levels (C19)", () => {
  it("each level behaves differently and the label follows the level", () => {
    const keys = new Set(Object.values(ASSIST).map((a) => `${a.steering}:${a.speed}:${a.brakeAssist}:${a.cruiseMps}`));
    expect(keys.size).toBe(5);
    expect(gmodeLabel("MAN", "cruiser")).toBe("MANUAL · DUAL-MOTOR EV");
    expect(gmodeLabel("L4", "gt")).toBe("L4 · LANE CRUISE · 8-SPEED V8");
    expect(nextAssist("L5 MAX")).toBe("MAN");
  });
  it("red lights: stop lines, crossings and the speed cap", () => {
    expect(signalPhase(0)).toBe(0);
    expect(signalPhase(11)).toBe(1);
    expect(signalPhase(14)).toBe(2);
    expect(nextStopLineZ(0)).toBeCloseTo(-82.5, 6);
    expect(crossedStopLine(-80, -85)).toBeCloseTo(-82.5, 6);
    expect(crossedStopLine(-85, -90)).toBeNull();
    expect(signalSpeedCap({ phase: 0, distToLine: 10, speed: 15 })).toBe(Infinity);
    expect(signalSpeedCap({ phase: 2, distToLine: 1.5, speed: 3 })).toBe(0);
    expect(signalSpeedCap({ phase: 1, distToLine: 10, speed: 15 })).toBe(Infinity);
    expect(isWrongWay(-3.2)).toBe(true);
    expect(isWrongWay(3.4)).toBe(false);
  });
});

describe("grid dispatch lane following (C5)", () => {
  it("a faster car is held behind the car ahead in its lane", () => {
    const cars: LaneBody[] = [
      { laneX: 3.4, z: -40, speed: 10, direction: 1, length: 4.6 },
      { laneX: 3.4, z: -38, speed: 15, direction: 1, length: 4.6 },
      { laneX: -3.2, z: -40, speed: 9.5, direction: -1, length: 8.2 },
      { laneX: -3.2, z: -44, speed: 15, direction: -1, length: 4.75 }
    ];
    resolveLaneFollowing(cars);
    expect(cars[1]!.z - cars[0]!.z).toBeGreaterThanOrEqual(4.6 + 2.5 - 1e-9);
    expect(cars[1]!.speed).toBe(10);
    expect(cars[2]!.z - cars[3]!.z).toBeGreaterThanOrEqual((8.2 + 4.75) / 2 + 2.5 - 1e-9);
    expect(cars[3]!.speed).toBe(9.5);
  });
  it("tags only the nearest rivals in full (C15)", () => {
    expect(nearestIndices([40, 12, 90, 25, 60], 2)).toEqual([1, 3]);
  });
});

describe("grid dispatch keys (C9)", () => {
  it("text fields keep their keys; buttons and the page drive the car", () => {
    expect(isTextEntryTarget({ tagName: "input" })).toBe(true);
    expect(isTextEntryTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });
});
