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

const MAIN_SOURCE = readFileSync("apps/showcase-turbo-drift-circuit/src/main.ts", "utf8");
const HUD_SOURCE = readFileSync("apps/showcase-turbo-drift-circuit/src/hud.ts", "utf8");
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

  it("pause freezes both cars in the mounted route loop", () => {
    const code = MAIN_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).toMatch(/input\.pressed\("pause"\)/);
    expect(code).toMatch(/if \(raceSession\.paused\)/);
    expect(code).toMatch(/canSimulateRace\(raceSession/);
    expect(code).not.toMatch(/opponentAi\.step\([\s\S]{0,120}?raceSession\.paused/);
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

  it("shows a result card after finish with time, best lap, and position fields", () => {
    expect(HUD_SOURCE).toContain('id="result-card"');
    expect(HUD_SOURCE).toContain('id="result-time-value"');
    expect(HUD_SOURCE).toContain('id="result-best-value"');
    expect(HUD_SOURCE).toContain('id="result-position-value"');
    const code = MAIN_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).toMatch(/resultCardAfterFinish/);
    expect(code).toMatch(/updateFinishCameraBlend/);
  });

  it("uses Lights / Racing / Finished / Paused labels in the public HUD", () => {
    expect(resolveRaceHudStatus(createRaceSessionState(), false)).toBe("Lights");
    expect(resolveRaceHudStatus({
      ...createRaceSessionState(),
      startLights: { ...createStartLightsState(), complete: true, step: 0 }
    }, false)).toBe("Racing");
    expect(resolveRaceHudStatus(createRaceSessionState(), true)).toBe("Finished");
    expect(resolveRaceHudStatus({ ...createRaceSessionState(), paused: true }, false)).toBe("Paused");
    for (const label of ["Lights", "Racing", "Finished"]) {
      expect(HUD_SOURCE, `status label ${label} missing`).toContain(label);
    }
    expect(FEEL_SOURCE).toContain('"Paused"');
  });
});
