import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  advanceStartLights,
  canSimulateRace,
  createRaceSessionState,
  createStartLightsState,
  resolveRaceHudStatus,
  resetRaceSession,
  START_LIGHT_JUMP_PENALTY,
  togglePause
} from "../../../apps/showcase-turbo-drift-circuit/src/feel";

// The pure start-lights/session tests below are unchanged: src/feel.ts was
// salvaged verbatim into the single-path rebuild. The former source
// assertions read a src/hud.ts that no longer exists and demanded pause /
// result-card wiring from the trashed dual-path main; the rebuilt route
// has no pause or result card (its finish state publishes through the
// evidence snapshot), so those are replaced with the rebuild's actual
// start-lights wiring.
const MAIN_SOURCE = readFileSync("apps/showcase-turbo-drift-circuit/src/main.ts", "utf8");
const FEEL_SOURCE = readFileSync("apps/showcase-turbo-drift-circuit/src/feel.ts", "utf8");

describe("turbo player feel", () => {
  it("countdown completes before simulation is allowed to move cars", () => {
    let lights = createStartLightsState();
    let session = createRaceSessionState();
    expect(canSimulateRace(session, false)).toBe(false);

    for (let frame = 0; frame < 240 && !lights.complete; frame += 1) {
      lights = advanceStartLights(lights, 1 / 60, false);
    }
    session = { ...session, startLights: lights };
    expect(lights.complete).toBe(true);
    expect(canSimulateRace(session, false)).toBe(true);
  });

  it("jumping the lights applies a small time penalty", () => {
    let lights = createStartLightsState();
    lights = advanceStartLights(lights, 0.05, true);
    expect(lights.jumpedLights).toBe(true);
    expect(lights.penaltySeconds).toBe(START_LIGHT_JUMP_PENALTY);
  });

  it("wires the start lights into the rebuilt route loop", () => {
    const code = MAIN_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).toMatch(/advanceStartLights\(session\.startLights/);
    expect(code).toMatch(/session\.startLights\.complete/);
    expect(code).toMatch(/resetRaceSession\(session\)/);
  });

  it("reset restores start lights and session state", () => {
    let session = createRaceSessionState();
    session = togglePause({ ...session, startLights: { ...session.startLights, complete: true, step: 0 } });
    session = resetRaceSession(session);
    expect(session.startLights.complete).toBe(false);
    expect(session.startLights.step).toBe(3);
    expect(session.paused).toBe(false);
    expect(session.finishCameraBlend).toBe(0);
  });

  it("uses Lights / Racing / Finished / Paused labels in the public HUD", () => {
    expect(resolveRaceHudStatus(createRaceSessionState(), false)).toBe("Lights");
    expect(resolveRaceHudStatus({
      ...createRaceSessionState(),
      startLights: { ...createStartLightsState(), complete: true, step: 0 }
    }, false)).toBe("Racing");
    expect(resolveRaceHudStatus(createRaceSessionState(), true)).toBe("Finished");
    expect(resolveRaceHudStatus({ ...createRaceSessionState(), paused: true }, false)).toBe("Paused");
    expect(FEEL_SOURCE).toContain('"Paused"');
  });
});
