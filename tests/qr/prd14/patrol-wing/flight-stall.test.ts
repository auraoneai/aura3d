// tests/qr/prd14/patrol-wing/flight-stall.test.ts — §14.4 stall invariant:
// at throttle 0 and level attitude, airspeed may only fall below the stall
// floor while the aircraft trades altitude for it (the sag sink). Speed must
// never dip under `stallSpeed` at constant or rising altitude.
import { describe, expect, it } from "vitest";
import {
  FLIGHT_CONSTANTS,
  FLIGHT_DT,
  FlightModel,
  NEUTRAL_INPUT
} from "../../../../apps/showcase-patrol-wing/src/gameplay/flight";

const flatOcean = () => -50;

describe("patrol-wing stall model (§14.4)", () => {
  it("throttle 0 + level attitude: sub-stall speed only while sinking", () => {
    const flight = new FlightModel({
      position: [0, 80, 0],
      headingYaw: 0,
      grounded: "airborne",
      throttle: 0.8,
      speed: FLIGHT_CONSTANTS.cruiseSpeed
    });
    // Let throttle decay to 0 with neutral inputs — no pitch/roll/yaw.
    let previousY = flight.position[1];
    for (let i = 0; i < 2400; i += 1) {
      flight.step(NEUTRAL_INPUT, FLIGHT_DT, flatOcean);
      const { speed, stalled } = flight;
      const y = flight.position[1];
      if (speed < FLIGHT_CONSTANTS.stallSpeed) {
        expect(stalled).toBe(true);
        // Below the stall floor the only energy source left is altitude —
        // the sag must be pulling the nose down, never holding level.
        expect(y).toBeLessThan(previousY + 1e-9);
      }
      previousY = y;
    }
  });

  it("held throttle keeps airspeed above the stall floor", () => {
    const flight = new FlightModel({
      position: [0, 80, 0],
      headingYaw: 0,
      grounded: "airborne",
      throttle: 0.75,
      speed: FLIGHT_CONSTANTS.cruiseSpeed
    });
    const input = { ...NEUTRAL_INPUT, throttleUp: true };
    for (let i = 0; i < 600; i += 1) {
      flight.step(input, FLIGHT_DT, flatOcean);
    }
    // Sustained throttle saturates at 1 → speed tracks to maxSpeed, well
    // above the stall floor, and the stall flag stays clear.
    expect(flight.speed).toBeGreaterThan(FLIGHT_CONSTANTS.stallRecoverSpeed);
    expect(flight.stalled).toBe(false);
  });
});
