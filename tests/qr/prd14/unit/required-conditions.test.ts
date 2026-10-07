/**
 * T1.4 (PRD 14 §14.1) — `evaluateRequiredCondition`: every expression
 * published in the §7.2.1 per-game table parses; truthiness, unknown paths,
 * and prototype-polluting segments behave per the contract.
 */

import { describe, expect, it } from "vitest";
import { evaluateRequiredCondition } from "@aura3d/game/art";

// Every expr in the PRD 14 §7.2.1 per-game capture contract table.
const CONTRACT_EXPRESSIONS: readonly string[] = [
  "combat.hitStopActive === true && fx.liveCount > 0",
  "framing.subjectHeightFraction >= 0.45 && framing.subjectHeightFraction <= 0.6",
  "board.linesClearedThisRound >= 1 && fx.liveCount > 0",
  "board.stackHeight >= 4",
  "player.airborne === true && fx.liveCount > 0",
  "level.act >= 2",
  "car.drifting === true && fx.liveCount > 0",
  "car.speedKph >= 120",
  "structures.toppledThisShot >= 1",
  "shot.power > 0.5",
  "loading.sceneSwaps === 0",
  "lander.touchdown === \"landed\"",
  "lander.altitude < 30 && framing.padInFrame === true",
  "swarm.killsThisWave >= 3 && fx.liveCount > 0",
  "fx.liveCount >= 20",
  "pod.state === \"in-flight\" && pod.launchedBy === \"keyboard\"",
  "delivery.completed >= 1",
  "gates.passedOnBeat >= 2 && fx.liveCount > 0",
  "framing.canvasMatchesViewport === true",
  "combat.lastHit === \"heavy\" && fx.liveCount > 0",
  "loading.sceneId === \"pit\"",
  "loading.fetchCount.mechHeroDecimated === 1",
  "table.bumperHitsThisBall >= 1 && fx.liveCount > 0",
  "ball.inPlay === true",
  "shot.result === \"make\" && characters.skinnedVisible >= 2",
  "shot.meter > 0.5",
  "guard.state === \"alert\" && fx.conesVisible >= 1",
  "characters.thiefTracksApplied > 0 && characters.thiefYawErrorDeg <= 15",
  "salvage.grappled >= 1",
  "render.readbacksThisFrame === 0",
  "drones.hitsThisSortie >= 1 && fx.liveCount > 0",
  "rings.inFrame >= 1 && flight.throttle > 0.4",
  "table.pottedThisShot >= 1",
  "balls.maxAngularSpeed > 0",
  "fx.explosionsLive >= 1",
  "framing.dronesUnderHud === 0"
];

describe("T1.4 evaluateRequiredCondition", () => {
  it("parses every §7.2.1 contract expression", () => {
    for (const expr of CONTRACT_EXPRESSIONS) {
      const result = evaluateRequiredCondition(expr, {});
      expect(result.reason, `expr "${expr}" must not be a parse error`).not.toBe("parse-error");
    }
  });

  it("evaluates fx.liveCount > 0 true for liveCount 3", () => {
    expect(evaluateRequiredCondition("fx.liveCount > 0", { fx: { liveCount: 3 } })).toEqual({ ok: true });
  });

  it("evaluates a full contract expression against a mixed scope", () => {
    const scope = {
      beacon: { route: "aura-clash", state: "playing" },
      combat: { hitStopActive: true },
      fx: { liveCount: 7 }
    };
    expect(evaluateRequiredCondition("combat.hitStopActive === true && fx.liveCount > 0", scope)).toEqual({ ok: true });
    expect(evaluateRequiredCondition("beacon.state === \"paused\" || combat.hitStopActive === true", scope)).toEqual({ ok: true });
  });

  it("reports a well-formed false comparison as reason false", () => {
    expect(evaluateRequiredCondition("fx.liveCount > 0", { fx: { liveCount: 0 } })).toEqual({ ok: false, reason: "false" });
    expect(evaluateRequiredCondition("pod.state === \"in-flight\"", { pod: { state: "docked" } })).toEqual({ ok: false, reason: "false" });
  });

  it("reports unknown paths", () => {
    expect(evaluateRequiredCondition("beacon.missing === true", { beacon: {} })).toEqual({ ok: false, reason: "unknown-path" });
    expect(evaluateRequiredCondition("absent.deep.path > 0", {})).toEqual({ ok: false, reason: "unknown-path" });
    expect(evaluateRequiredCondition("fx.liveCount > 0", { fx: null })).toEqual({ ok: false, reason: "unknown-path" });
  });

  it("rejects constructor and __proto__ segments as parse errors", () => {
    expect(evaluateRequiredCondition("a.constructor.x === 1", { a: {} })).toEqual({ ok: false, reason: "parse-error" });
    expect(evaluateRequiredCondition("a.__proto__.polluted === true", { a: {} })).toEqual({ ok: false, reason: "parse-error" });
    expect(evaluateRequiredCondition("a.prototype.x === 1", { a: {} })).toEqual({ ok: false, reason: "parse-error" });
  });

  it("rejects operators outside the grammar", () => {
    for (const expr of [
      "a == 1",
      "a = 1",
      "a.b + 1 > 0",
      "a.b - 1 > 0",
      "a.b / 2 > 0",
      "a.b ? 1 : 2",
      "fn()",
      "a.b !=== 1"
    ]) {
      expect(evaluateRequiredCondition(expr, { a: { b: 2 } }), `expr "${expr}"`).toEqual({ ok: false, reason: "parse-error" });
    }
  });

  it("supports negation and parentheses", () => {
    const scope = { ball: { inPlay: false }, fx: { liveCount: 4 } };
    expect(evaluateRequiredCondition("!(ball.inPlay === true)", scope)).toEqual({ ok: true });
    expect(evaluateRequiredCondition("(fx.liveCount > 0 && ball.inPlay === true) || fx.liveCount >= 4", scope)).toEqual({ ok: true });
  });

  it("never reads through the prototype chain for value access", () => {
    // "toString" is reachable via Object.prototype; an own-property walk
    // reports the path unknown instead of returning the function.
    const scope = { fx: { liveCount: 1 } };
    expect(evaluateRequiredCondition("fx.toString === true", scope)).toEqual({ ok: false, reason: "unknown-path" });
  });
});
