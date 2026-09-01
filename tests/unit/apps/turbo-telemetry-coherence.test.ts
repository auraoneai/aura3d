import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { game } from "@aura3d/engine";
import { gameGeometryContract } from "../../../apps/showcase-turbo-drift-circuit/src/generated/game-geometry";
import { createRaceSessionState, resolveRaceHudStatus } from "../../../apps/showcase-turbo-drift-circuit/src/feel";

/**
 * WS-5.3 / WS-7.3: displayed values must match simulation state.
 *
 * The reported live-site defect was `SPEED 0` shown next to `STATUS running`, which reads as a
 * simulation that has died. Reproducing it first, as the PRD requires, showed it is not a
 * disagreement between two state objects: the HUD reads `raceSnapshot`, and `raceSnapshot` is
 * exactly what `racingState.step()` returned on the same frame. There is only one state.
 *
 * The real problem is vocabulary. `game.racing`'s status is `running | finished` and describes
 * whether the *race* is over, so it is `running` from frame zero. A car nobody has touched is
 * therefore correctly 0 km/h and correctly `running` — and looks broken.
 *
 * Classification: application-authoring / presentation. Fixed in the route HUD with a
 * `Lights` / `Racing` / `Finished` label rather than by adding a third state to the kit, because
 * "has the player pressed anything" is a property of a session, not of the racing model.
 */
const SOURCE = readFileSync("apps/showcase-turbo-drift-circuit/src/main.ts", "utf8");
const HUD_SOURCE = readFileSync("apps/showcase-turbo-drift-circuit/src/hud.ts", "utf8");

function buildRacing() {
  const contract = gameGeometryContract;
  const route = game.assetBoundRacingRoute({
    vehicleAsset: "turboRaceCar",
    trackAsset: "turboFormulaCircuit",
    authoredLapSeconds: 35,
    minLapSeconds: 30,
    minCheckpoints: 6,
    topology: contract.topology,
    route: {
      id: contract.route.id,
      width: contract.route.width,
      points: contract.route.points,
      checkpoints: contract.route.checkpoints
    }
  });
  const maxSpeed = route.assetBinding.speedModel.certifiedSpeed * 4;
  return game.racing({
    route,
    paceMultiplier: 4,
    maxSpeed,
    acceleration: Number((maxSpeed * 4.1).toFixed(3)),
    drag: 0.28,
    steerRate: 3.2
  });
}

describe("turbo drift telemetry is coherent with simulation", () => {
  it("reproduces the reported condition: speed 0 while status is running", () => {
    // The bug report, reproduced exactly. This is correct kit behaviour, not a fault.
    const racing = buildRacing();
    const snapshot = racing.snapshot();
    expect(snapshot.speed).toBe(0);
    expect(snapshot.status).toBe("running");
  });

  it("throttle produces speed, so the simulation was never stalled", () => {
    const racing = buildRacing();
    let snapshot = racing.snapshot();
    for (let frame = 0; frame < 60; frame += 1) snapshot = racing.step(1 / 60, { throttle: true });
    expect(snapshot.speed).toBeGreaterThan(0.1);
  });

  it("displayed speed is derived from the same snapshot the simulation returns", () => {
    /*
     * The coherence invariant, checked structurally.
     *
     * `raceSnapshot` must be assigned from `racingState.step(...)` and the HUD must read
     * `raceSnapshot.speed`. If a future change introduces a second cached speed for display, these
     * assertions are what catch it — a HUD reading a different object is the defect class WS-7.3
     * exists to prevent.
     */
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).toMatch(/raceSnapshot\s*=\s*[\s\S]{0,200}?racingState\.step\(/);
    expect(HUD_SOURCE).toMatch(/Math\.round\(Math\.abs\(input\.snapshot\.speed\)/);
  });

  it("the HUD does not label an untouched car as racing", () => {
    expect(resolveRaceHudStatus(createRaceSessionState(), false)).toBe("Lights");
    expect(HUD_SOURCE).toContain("resolveRaceHudStatus");
    for (const label of ["Lights", "Racing", "Finished"]) {
      expect(HUD_SOURCE, `status label ${label} missing`).toContain(label);
    }
    expect(HUD_SOURCE).not.toMatch(/raceSnapshot\.status/);
  });
});
