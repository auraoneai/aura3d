import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getSkylineActPalette,
  resolveSkylineActIndex,
  skylineActPaletteSignature,
  skylineDistrictPaletteSignature
} from "../../../apps/showcase-skyline-runner/src/act-palette";
import {
  SKYLINE_REQUIRED_EVENT_FEEDBACK,
  createSkylineFeel
} from "../../../apps/showcase-skyline-runner/src/feel";
import { skylineCameraFrame, skylineCameraTuning } from "../../../apps/showcase-skyline-runner/src/camera-readability";
import { SKYLINE_SECTION_STRIDE } from "../../../apps/showcase-skyline-runner/src/level";
import {
  SKYLINE_DISTRICTS,
  resolveSkylineDistrict,
  skylineDistrictForAct
} from "../../../apps/showcase-skyline-runner/src/districts";
import { skylineAmbienceBusForAct } from "../../../apps/showcase-skyline-runner/src/skyline-audio-manifest";
import type { SkylineAudioController } from "../../../apps/showcase-skyline-runner/src/skyline-audio";

describe("Skyline player feel", () => {
  it("changes act palette signatures across the five acts", () => {
    const signatures = [0, 1, 2, 3, 4].map((actIndex) => skylineActPaletteSignature(getSkylineActPalette(actIndex)));
    expect(new Set(signatures).size).toBe(5);
    expect(getSkylineActPalette(0).title).toBe("Home Grove");
    expect(getSkylineActPalette(4).title).toBe("Aurora Crown");
    expect(getSkylineActPalette(0).skyRamp[0]).not.toBe(getSkylineActPalette(2).skyRamp[0]);
  });

  it("maps the five certified acts into three PRD-owned visual districts", () => {
    expect(SKYLINE_DISTRICTS.map((district) => district.title)).toEqual([
      "Steel Dawn", "Hanging Grove", "Crown Heights"
    ]);
    expect([0, 1, 2, 3, 4].map((act) => skylineDistrictForAct(act).id)).toEqual([
      "steel-dawn", "steel-dawn", "hanging-grove", "hanging-grove", "crown-heights"
    ]);
    const signatures = [0, 2, 4].map(skylineDistrictPaletteSignature);
    expect(new Set(signatures).size).toBe(3);
    expect(resolveSkylineDistrict(0).title).toBe("Steel Dawn");
    expect(resolveSkylineDistrict(SKYLINE_SECTION_STRIDE * 5).title).toBe("Hanging Grove");
    expect(resolveSkylineDistrict(SKYLINE_SECTION_STRIDE * 9).title).toBe("Crown Heights");
  });

  it("assigns one distinct ambience stem to each visual district", () => {
    expect(skylineAmbienceBusForAct(0)).toBe("ambience-steel");
    expect(skylineAmbienceBusForAct(1)).toBe("ambience-steel");
    expect(skylineAmbienceBusForAct(2)).toBe("ambience-grove");
    expect(skylineAmbienceBusForAct(3)).toBe("ambience-grove");
    expect(skylineAmbienceBusForAct(4)).toBe("ambience-crown");
  });

  it("resolves act progression from traversal x", () => {
    expect(resolveSkylineActIndex(0)).toBe(0);
    expect(resolveSkylineActIndex(SKYLINE_SECTION_STRIDE * 2.2)).toBeGreaterThanOrEqual(1);
    expect(resolveSkylineActIndex(SKYLINE_SECTION_STRIDE * 9.2)).toBe(4);
  });

  it("reports frozen simulation while paused", () => {
    const feel = createSkylineFeel({
      reducedMotion: true,
      cameraTuning: skylineCameraTuning(false)
    });
    expect(feel.snapshot().simFrozen).toBe(false);
    feel.togglePause();
    expect(feel.snapshot().simFrozen).toBe(true);
    feel.resetPause();
    expect(feel.snapshot().simFrozen).toBe(false);
  });

  it("defines nine distinct scene-and-audio contracts for the required platformer events", () => {
    const contracts = Object.values(SKYLINE_REQUIRED_EVENT_FEEDBACK);
    expect(contracts).toHaveLength(9);
    expect(new Set(contracts.map((entry) => entry.sceneSignature)).size).toBe(9);
    expect(new Set(contracts.map((entry) => entry.audioCue)).size).toBe(9);
    expect(contracts.map((entry) => entry.kitEvent)).toEqual([
      "jump", "land", "dash", "collect", "checkpoint", "hazard-or-fall",
      "defeat-or-stomp", "respawn", "complete"
    ]);
  });

  it("publishes cumulative proof only after each event handler applies its scene effect and cue", () => {
    const requestedCues: string[] = [];
    const audio = {
      cue: async (cue: string) => { requestedCues.push(cue); }
    } as unknown as SkylineAudioController;
    const feel = createSkylineFeel({
      reducedMotion: true,
      cameraTuning: skylineCameraTuning(false),
      audio
    });
    const point = [0, 0, 0.42] as const;

    expect(feel.eventFeedbackProof().observedEventCount).toBe(0);
    feel.onJump(point);
    feel.onLand(point);
    feel.onDash(point);
    feel.onCollect(point);
    feel.onCheckpoint("Steel Dawn · Home Grove", point);
    feel.onHazard(point);
    feel.onSentryDefeat(point, 150);
    feel.onRespawn(point);
    feel.onSummit(point);

    const proof = feel.eventFeedbackProof();
    expect(proof.requiredEventCount).toBe(9);
    expect(proof.observedEventCount).toBe(9);
    expect(proof.allRequiredObserved).toBe(true);
    expect(proof.distinctSceneSignatureCount).toBe(9);
    expect(proof.distinctAudioCueCount).toBe(9);
    expect(Object.values(proof.events).every((entry) =>
      entry.observedCount === 1 && entry.sceneEffectApplied && entry.audioCueRequested
    )).toBe(true);
    expect(new Set(requestedCues)).toEqual(new Set([
      "jump", "land-dust", "dash", "coin-chime", "checkpoint", "death",
      "sentry-defeat", "respawn", "summit"
    ]));
  });

  it("leads the current facing direction on desktop and compact viewports", () => {
    for (const compact of [false, true]) {
      const tuning = skylineCameraTuning(compact);
      const right = skylineCameraFrame(tuning, 1);
      const left = skylineCameraFrame(tuning, -1);

      expect(right.leadDirection).toBe("right");
      expect(right.targetOffset[0]).toBeGreaterThan(0);
      expect(right.leadMatchesFacing).toBe(true);
      expect(left.leadDirection).toBe("left");
      expect(left.targetOffset[0]).toBeLessThan(0);
      expect(left.leadMatchesFacing).toBe(true);
      expect(Math.abs(left.targetOffset[0])).toBe(Math.abs(right.targetOffset[0]));
      expect(tuning.targetHeight).toBeGreaterThan(0);
    }
  });

  it("applies impact shake without reversing directional lead", () => {
    const tuning = skylineCameraTuning(false);
    const right = skylineCameraFrame(tuning, 1, [0.04, -0.02, 0]);
    const left = skylineCameraFrame(tuning, -1, [0.04, -0.02, 0]);

    expect(right.leadMatchesFacing).toBe(true);
    expect(left.leadMatchesFacing).toBe(true);
    expect(right.offset[1]).toBeCloseTo(tuning.height - 0.02, 3);
    expect(left.offset[2]).toBe(tuning.distance);
  });

  it("suppresses requested camera impacts under reduced motion without suppressing event truth", () => {
    const feel = createSkylineFeel({
      reducedMotion: true,
      cameraTuning: skylineCameraTuning(false)
    });
    const point = [0, 0, 0.42] as const;
    feel.onDash(point);
    feel.updatePresentation(1 / 60, {
      simTime: 1,
      playerX: 0,
      playerY: 0,
      playerFacing: 1,
      sceneBinding: { toScenePoint: ({ x, y }) => [x, y, 0] },
      defeatedHazardIds: [],
      sentryNodes: {},
      sentryAccentNodes: {},
      emberVolleys: [],
      emberVolleyNodes: [],
      firePressed: false,
      emberStock: 0
    });

    const snapshot = feel.snapshot();
    expect(snapshot.reducedMotion).toBe(true);
    expect(snapshot.cameraImpactRequests).toBe(1);
    expect(snapshot.cameraImpactsSuppressed).toBe(1);
    expect(snapshot.maximumCameraShakeMagnitude).toBe(0);
    expect(snapshot.cameraShakeOffset).toEqual([0, 0, 0]);
    expect(feel.eventFeedbackProof().events.dash.observedCount).toBe(1);
  });

  it("keeps public HUD free of raw x unless debug mode is enabled", () => {
    const hudSource = readFileSync("apps/showcase-skyline-runner/src/hud.ts", "utf8");
    const mainSource = readFileSync("apps/showcase-skyline-runner/src/main.ts", "utf8");
    const publicMetrics = hudSource.slice(
      hudSource.indexOf('class="metrics-row game-metrics"'),
      hudSource.indexOf("checkpoint-row")
    );
    expect(hudSource).toContain('aria-label", "Skyline Runner game HUD"');
    expect(hudSource).toContain("publicSkylineHudShowsRawX");
    expect(hudSource).toContain('debug ? requireElement("x-value") : null');
    expect(publicMetrics).not.toContain("x-value");
    expect(publicMetrics).toContain("score-value");
    expect(publicMetrics).toContain("act-title-value");
    expect(mainSource).toContain("setupSkylineHud");
    expect(mainSource).toContain("updateSkylineHud");
  });

  it("wires pause, cameraDirector, and act palette helpers in main.ts", () => {
    const source = readFileSync("apps/showcase-skyline-runner/src/main.ts", "utf8");
    expect(source).toContain('pause: ["KeyP"]');
    expect(source).toContain("createSkylineFeel");
    expect(source).toContain("if (paused) {");
    expect(source).toContain("applySkylineActPaletteVisibility");
    expect(source).toContain("setupSkylineHud");
    expect(source).not.toContain('aria-label="Skyline Runner controls and evidence"');
    for (const event of ["jump", "land", "dash", "collect", "checkpoint", "respawn", "complete"]) {
      expect(source).toContain(`if (event.type === "${event}")`);
    }
    expect(source).toContain('if (event.type === "hazard" || event.type === "fall")');
    expect(source).toContain('if (event.type === "defeat" || event.type === "stomp")');
    expect(source).not.toContain("if (dashPressed) {\n    const pose");
  });
});
