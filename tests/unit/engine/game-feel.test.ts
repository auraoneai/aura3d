import { describe, expect, it } from "vitest";
import { createGameEffects } from "../../../packages/engine/src/agent-api/GameRuntime";
import {
  createGameFeel,
  GAME_FEEL_HIT_STOP_DEFAULT_S,
  gameFeelBuilders
} from "../../../packages/engine/src/agent-api/GameFeel";

function wired() {
  return createGameFeel({ effects: createGameEffects(), budgetMs: 50 });
}

describe("game feel time control", () => {
  it("slowMo scales time and expires", () => {
    const feel = wired();
    expect(feel.snapshot().timeScale).toBe(1);
    expect(feel.slowMo(0.25, 100)).toEqual({ accepted: true });
    expect(feel.snapshot().slowMoActive).toBe(true);
    expect(feel.snapshot().timeScale).toBe(0.25);
    expect(feel.effectiveDt(16)).toBeCloseTo(4, 5);
    feel.update(100);
    expect(feel.snapshot().timeScale).toBe(1);
  });

  it("hitStop freezes time using the generalized combat default", () => {
    const feel = wired();
    expect(GAME_FEEL_HIT_STOP_DEFAULT_S).toBe(0.06);
    expect(feel.hitStop(GAME_FEEL_HIT_STOP_DEFAULT_S * 1000)).toEqual({ accepted: true });
    expect(feel.snapshot().frozen).toBe(true);
    expect(feel.snapshot().timeScale).toBe(0);
    expect(feel.effectiveDt(16)).toBe(0);
    feel.update(GAME_FEEL_HIT_STOP_DEFAULT_S * 1000);
    expect(feel.snapshot().frozen).toBe(false);
  });

  it("names the exact API on bad input", () => {
    const feel = wired();
    expect(() => feel.slowMo(2, 100)).toThrow("gameFeel.slowMo scale");
    expect(() => feel.slowMo(0.5, 0)).toThrow("gameFeel.slowMo durationMs");
    expect(() => feel.hitStop(-5)).toThrow("gameFeel.hitStop durationMs");
  });
});

describe("game feel pixel-backed effects", () => {
  it("damageFlash spawns a real scene node and telemetry", () => {
    const feel = wired();
    const receipt = feel.damageFlash("#ff3b30", [0, 1, 0]);
    expect(receipt.accepted).toBe(true);
    expect(receipt.effectId).toMatch(/impact-flash/);
    expect(feel.snapshot().flashActive).toBe(true);
    expect(feel.snapshot().effectsActive).toBe(1);
    const nodes = feel.nodes();
    expect(nodes.length).toBe(1);
    const flash = nodes[0] as { kind: string; primitive: string; material: { color: string } };
    expect(flash.kind).toBe("primitive");
    expect(flash.material.color).toBe("#ff3b30");
    feel.update(200);
    expect(feel.snapshot().flashActive).toBe(false);
  });

  it("speedLines picks the streak kind by intensity and reports it", () => {
    const feel = wired();
    const soft = feel.speedLines(0.4);
    expect(soft.effectId).toMatch(/dash-trail/);
    expect(feel.snapshot().lineIntensity).toBe(0.4);
    feel.clear();
    const hard = feel.speedLines(0.9);
    expect(hard.effectId).toMatch(/slash-trail/);
    expect(feel.nodes().length).toBe(1);
  });

  it("landingDust spawns ground dust at the contact point", () => {
    const feel = wired();
    const receipt = feel.landingDust([1, 0, 2]);
    expect(receipt.accepted).toBe(true);
    expect(receipt.effectId).toMatch(/ground-dust/);
    expect(feel.snapshot().dustSpawned).toBe(1);
    expect(() => feel.landingDust([1, Number.NaN, 2])).toThrow("gameFeel.landingDust position");
  });
});

describe("game feel budget + on/off contract", () => {
  it("records frame-budget telemetry on every update", () => {
    const feel = wired();
    const snap = feel.update(16);
    expect(snap.budget.updates).toBe(1);
    expect(snap.budget.budgetMs).toBe(50);
    expect(snap.budget.lastMs).toBeGreaterThanOrEqual(0);
    expect(snap.budget.maxMs).toBeGreaterThanOrEqual(snap.budget.lastMs);
    expect(snap.budget.overBudget).toBe(false);
  });

  it("disabled kit refuses every trigger with a named reason (no silent no-ops)", () => {
    const feel = wired();
    feel.setEnabled(false);
    expect(feel.snapshot().enabled).toBe(false);
    for (const receipt of [
      feel.slowMo(0.5, 50),
      feel.hitStop(50),
      feel.damageFlash("#fff"),
      feel.speedLines(0.5),
      feel.landingDust([0, 0, 0])
    ]) {
      expect(receipt.accepted).toBe(false);
      expect(receipt.reason).toMatch(/kit disabled/);
    }
    expect(feel.nodes()).toEqual([]);
    feel.setEnabled(true);
    expect(feel.slowMo(0.5, 50).accepted).toBe(true);
  });

  it("unwired kit refuses pixel-backed triggers instead of faking pixels", () => {
    const feel = createGameFeel();
    expect(feel.effectsWired).toBe(false);
    expect(feel.damageFlash("#fff").reason).toMatch(/no effects controller wired/);
    expect(feel.speedLines(0.5).reason).toMatch(/no effects controller wired/);
    expect(feel.landingDust([0, 0, 0]).reason).toMatch(/no effects controller wired/);
    // Time control is controller-free and still works unwired.
    expect(feel.hitStop(30).accepted).toBe(true);
  });

  it("exposes the exact root-bridge surface", () => {
    expect(typeof gameFeelBuilders.create).toBe("function");
    expect(gameFeelBuilders.hitStopDefaults.default).toBe(0.06);
    expect(gameFeelBuilders.hitStopDefaults.light).toBe(0.045);
  });
});
