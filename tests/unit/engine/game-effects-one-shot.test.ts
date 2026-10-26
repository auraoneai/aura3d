import { beforeEach, describe, expect, it } from "vitest";
import { createAuraApp, scene } from "../../../packages/engine/src";
import { createGameEffects } from "../../../packages/engine/src/agent-api/vfx/gameEffects.js";
import { collectEffectsSection } from "../../../packages/engine/src/agent-api/vfx/diagnostics.js";
import { resetPrd07AppRegistry } from "../../../packages/engine/src/agent-api/vfx/effects-api.js";
import { createTraumaLayer } from "../../../packages/engine/src/agent-api/camera/layers.js";

beforeEach(() => resetPrd07AppRegistry());

function runFor(app: ReturnType<typeof createAuraApp>, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 60); i++) app.step(1 / 60);
}

describe("game effects are one-shot bursts", () => {
  it("particles from hit sparks, dust and rings are gone within 3 s (no emitter keeps running at the spot)", () => {
    const app = createAuraApp(null, { autoStart: false, scene: scene(), qualityRebuild: { flags: ["vfx"] } });
    const fx = createGameEffects();
    fx.hitSpark([0, 1, 0]);
    fx.groundDust([4, 0.08, 2]);
    fx.ringShockwave([-6, 1, 3]);
    fx.dashTrail([8, 1, -2]);
    runFor(app, 0.2);
    const early = collectEffectsSection(app).liveParticles;
    expect(early).toBeGreaterThan(0);
    runFor(app, 3);
    const late = collectEffectsSection(app).liveParticles;
    console.log("GAMEFX_ONE_SHOT", JSON.stringify({ early, late }));
    expect(late).toBe(0);
    app.dispose();
  });

  it("a burst does not keep spawning: the live count never grows after the first frames", () => {
    const app = createAuraApp(null, { autoStart: false, scene: scene(), qualityRebuild: { flags: ["vfx"] } });
    const fx = createGameEffects();
    fx.groundDust([0, 0.08, 0]);
    runFor(app, 0.1);
    const a = collectEffectsSection(app).liveParticles;
    runFor(app, 0.5);
    const b = collectEffectsSection(app).liveParticles;
    expect(b).toBeLessThanOrEqual(a);
    app.dispose();
  });

  it("game effects never add camera shake of their own (juice owns the camera)", () => {
    const app = createAuraApp(null, { autoStart: false, scene: scene(), qualityRebuild: { flags: ["vfx"] } });
    const fx = createGameEffects();
    fx.ringShockwave([0, 1, 0]);
    fx.dashTrail([0, 1, 0]);
    fx.superFlash([0, 1, 0]);
    runFor(app, 0.05);
    const energy = (app as any).camera?.shake?.energy?.() ?? 0;
    expect(energy).toBe(0);
    app.dispose();
  });
});

describe("trauma shake: capped and brief", () => {
  const pose = { position: [0, 20, 30] as [number, number, number], target: [0, 0, 0] as [number, number, number], up: [0, 1, 0] as [number, number, number], fov: 54, roll: 0 };
  function peakRotationDeg(trauma: number, maxAngleDeg: number, seconds: number) {
    const layer = createTraumaLayer();
    layer.configure({ maxAngleDeg, maxOffset: 0.02, frequency: 14, decayPerSecond: 2.8, maxTrauma: 0.7 });
    layer.add(trauma);
    let peakRoll = 0, peakAim = 0, lastLive = 0;
    const baseDir = [pose.target[0] - pose.position[0], pose.target[1] - pose.position[1], pose.target[2] - pose.position[2]];
    const bl = Math.hypot(baseDir[0]!, baseDir[1]!, baseDir[2]!);
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      const out = layer.apply(pose as never, { dt: 1 / 60, reducedMotion: false });
      peakRoll = Math.max(peakRoll, Math.abs(out.roll) * 180 / Math.PI);
      const d = [out.target[0] - out.position[0], out.target[1] - out.position[1], out.target[2] - out.position[2]];
      const dl = Math.hypot(d[0]!, d[1]!, d[2]!);
      const cos = (d[0]! * baseDir[0]! + d[1]! * baseDir[1]! + d[2]! * baseDir[2]!) / (dl * bl);
      peakAim = Math.max(peakAim, Math.acos(Math.min(1, cos)) * 180 / Math.PI);
      if (layer.energy!() > 0.02) lastLive = (i + 1) / 60;
    }
    return { peakRoll, peakAim, lastLive };
  }

  it("stacked events cannot sum past maxTrauma, and the peak rotation stays under 0.5 degrees", () => {
    const stacked = peakRotationDeg(0.6 + 0.35 + 0.25 + 1, 0.5, 2);
    console.log("SHAKE_CAP", JSON.stringify({ peakRollDeg: +stacked.peakRoll.toFixed(3), peakAimDeg: +stacked.peakAim.toFixed(3), settledAtS: +stacked.lastLive.toFixed(2) }));
    expect(stacked.peakRoll).toBeLessThan(0.5);
    expect(stacked.peakAim).toBeLessThan(0.5);
  });

  it("a goal-sized event (0.6) settles in under 0.4 s", () => {
    const goal = peakRotationDeg(0.6, 0.5, 2);
    expect(goal.lastLive).toBeLessThan(0.4);
  });
});
