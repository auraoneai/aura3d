import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  decideTurboOpponentYield,
  measureTurboPassingLane,
  turboBodyOnAsphalt,
  turboMaxAsphaltOffset,
  turboVehicleBoundaryInset,
  turboVisualAsphaltWidth
} from "../../../apps/showcase-turbo-drift-circuit/src/passing-lane";

const SCENE_SCALE = 2.509;
const ROAD_WIDTH = 0.437;
const PLAYER_RENDERED_WIDTH = 0.425265 * (0.96 / 1.1);
const OPPONENT_RENDERED_WIDTH = 0.398878 * (0.91 / 1.04);
const PLAYER_CHASSIS_HALF_WIDTH = 0.174359 * (0.96 / 1.1);

describe("turbo passing lane", () => {
  it("converts chassis width into game units so two cars fit side by side", () => {
    const inset = turboVehicleBoundaryInset({
      roadWidth: ROAD_WIDTH,
      sceneScale: SCENE_SCALE,
      chassisHalfWidth: PLAYER_CHASSIS_HALF_WIDTH,
      wheelRadius: 0.124676
    });
    expect(inset).toBeLessThan(ROAD_WIDTH * 0.42);
    expect(inset).toBeGreaterThan(0.04);

    const mixedUnits = Math.min(ROAD_WIDTH * 0.475, PLAYER_CHASSIS_HALF_WIDTH);
    expect(inset).toBeLessThan(mixedUnits);

    const lane = measureTurboPassingLane({
      roadWidth: ROAD_WIDTH,
      sceneScale: SCENE_SCALE,
      playerRenderedWidth: PLAYER_RENDERED_WIDTH,
      opponentRenderedWidth: OPPONENT_RENDERED_WIDTH,
      playerCollisionWidth: PLAYER_RENDERED_WIDTH + 0.002,
      opponentCollisionWidth: OPPONENT_RENDERED_WIDTH + 0.002,
      playerChassisHalfWidth: PLAYER_CHASSIS_HALF_WIDTH,
      wheelRadius: 0.124676,
      passingMargin: 0.02
    });
    expect(lane.legalPassingOffset).toBeGreaterThan(0.04);
    expect(lane.vehicleCenterHalfWidth).toBeGreaterThan(0.05);
    expect(lane.usableRoadWidth).toBeGreaterThan(lane.playerCollisionWidth * 0.7);
    const visualAsphalt = turboVisualAsphaltWidth(ROAD_WIDTH);
    expect(visualAsphalt).toBeGreaterThan(lane.twoCarPlusMarginWidth);
    expect(lane.sideBySideFit, "two rendered bodies plus margin must fit on grey asphalt").toBe(true);
    const playerHalf = lane.playerRenderedWidth / 2;
    const opponentHalf = lane.opponentRenderedWidth / 2;
    const yieldOffset = decideTurboOpponentYield({
      wrappedPlayerGap: -0.03,
      playerSignedOffset: 0,
      opponentSignedOffset: 0,
      legalPassingOffset: lane.legalPassingOffset,
      maxAsphaltOffset: turboMaxAsphaltOffset({
        bodyHalfWidth: opponentHalf,
        visualAsphaltHalfWidth: visualAsphalt / 2
      })
    }).preferredSignedOffset;
    expect(turboBodyOnAsphalt({
      signedTrackOffset: yieldOffset,
      bodyHalfWidth: opponentHalf,
      visualAsphaltHalfWidth: visualAsphalt / 2
    })).toBe(true);
    expect(turboBodyOnAsphalt({
      signedTrackOffset: -yieldOffset,
      bodyHalfWidth: playerHalf,
      visualAsphaltHalfWidth: visualAsphalt / 2
    })).toBe(true);
    mkdirSync("/var/folders/3s/trh_q1fd5yn1mdhbvwbf0qrw0000gn/T/grok-goal-d625ec9e6e37/implementer", { recursive: true });
    writeFileSync(
      "/var/folders/3s/trh_q1fd5yn1mdhbvwbf0qrw0000gn/T/grok-goal-d625ec9e6e37/implementer/turbo-widths.json",
      `${JSON.stringify({
        roadWidth: ROAD_WIDTH,
        visualAsphaltWidth: visualAsphalt,
        usableRoadWidth: lane.usableRoadWidth,
        playerRenderedWidth: lane.playerRenderedWidth,
        opponentRenderedWidth: lane.opponentRenderedWidth,
        combinedRenderedWidth: lane.playerRenderedWidth + lane.opponentRenderedWidth,
        twoCarPlusMarginWidth: lane.twoCarPlusMarginWidth,
        legalPassingOffset: lane.legalPassingOffset,
        sideBySideFit: lane.sideBySideFit,
        yieldKeepsBothOnAsphalt: true
      }, null, 2)}\n`
    );
  });

  it("leaves a legal passing side when the player closes from behind", () => {
    const closing = decideTurboOpponentYield({
      wrappedPlayerGap: -0.03,
      playerSignedOffset: 0.01,
      opponentSignedOffset: 0,
      legalPassingOffset: 0.07
    });
    expect(closing.yielding).toBe(true);
    expect(closing.mode).toBe("defensive");
    expect(closing.passingSide).toBe("left");
    expect(closing.preferredSignedOffset).toBeLessThan(0);

    const onLine = decideTurboOpponentYield({
      wrappedPlayerGap: -0.03,
      playerSignedOffset: 0,
      opponentSignedOffset: 0,
      legalPassingOffset: 0.07
    });
    expect(onLine.yielding).toBe(true);
    expect(onLine.passingSide).toBe("right");
    expect(onLine.preferredSignedOffset).toBeGreaterThan(0);

    const alongside = decideTurboOpponentYield({
      wrappedPlayerGap: 0,
      playerSignedOffset: 0.06,
      opponentSignedOffset: -0.06,
      legalPassingOffset: 0.07
    });
    expect(alongside.mode).toBe("side-by-side");
    expect(alongside.preferredSignedOffset).toBeLessThan(0);

    const ahead = decideTurboOpponentYield({
      wrappedPlayerGap: 0.04,
      playerSignedOffset: 0.06,
      opponentSignedOffset: -0.06,
      legalPassingOffset: 0.07
    });
    expect(ahead.yielding).toBe(false);
    expect(Math.abs(ahead.preferredSignedOffset)).toBeLessThan(Math.abs(alongside.preferredSignedOffset));
  });
});
