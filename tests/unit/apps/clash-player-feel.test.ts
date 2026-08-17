import { describe, expect, it } from "vitest";
import {
  CLASH_HIT_STOP_SECONDS,
  CLASH_INPUT_BUFFER_FRAMES,
  CLASH_INPUT_BUFFER_LIFETIME_MS,
  clashHitStopSeconds,
  comboClockText,
  comboFlashText,
  readPlayableHudMode,
  resolveRivalAiRole,
  rivalAiStrikeBias,
  rivalAiWantsDash
} from "../../../apps/aura-clash-showcase/src/playable/combat/clashFeel";

describe("Aura Clash player feel", () => {
  it("keeps presentation hit-stop inside a 2–8 frame window", () => {
    const frames = {
      light: CLASH_HIT_STOP_SECONDS.light * 60,
      heavy: CLASH_HIT_STOP_SECONDS.heavy * 60,
      special: CLASH_HIT_STOP_SECONDS.special * 60
    };
    expect(frames.light).toBeGreaterThanOrEqual(2);
    expect(frames.heavy).toBeGreaterThan(frames.light);
    expect(frames.special).toBeGreaterThan(frames.heavy);
    expect(frames.special).toBeLessThanOrEqual(8);
    expect(clashHitStopSeconds("light")).toBe(CLASH_HIT_STOP_SECONDS.light);
  });

  it("uses a 6–8 frame input buffer instead of an 800 ms hold", () => {
    expect(CLASH_INPUT_BUFFER_FRAMES).toBeGreaterThanOrEqual(6);
    expect(CLASH_INPUT_BUFFER_FRAMES).toBeLessThanOrEqual(8);
    expect(CLASH_INPUT_BUFFER_LIFETIME_MS).toBeGreaterThanOrEqual(100);
    expect(CLASH_INPUT_BUFFER_LIFETIME_MS).toBeLessThanOrEqual(140);
  });

  it("wires combo copy only after the second hit", () => {
    expect(comboFlashText(0)).toBe("");
    expect(comboFlashText(1)).toBe("");
    expect(comboFlashText(2)).toBe("2 HIT");
    expect(comboClockText(3)).toBe("3 HITS");
  });

  it("keeps training numbers off the public playable path", () => {
    expect(readPlayableHudMode({ pathname: "/playable/", search: "" }).training).toBe(false);
    expect(readPlayableHudMode({ pathname: "/playable/", search: "?debug=1" }).training).toBe(true);
    expect(readPlayableHudMode({ pathname: "/playable/", search: "?auraTestDriver=1" }).evidence).toBe(true);
    expect(readPlayableHudMode({ pathname: "/evidence/", search: "" }).training).toBe(true);
  });

  it("picks approach, space, whiff punish, and meaty wakeup roles", () => {
    const base = {
      distance: 1.1,
      opponentAlive: true,
      playerAttacking: false,
      playerWhiffing: false,
      playerKnockdownRemaining: 0,
      playerWakeupInvulnerable: false,
      playerGrounded: true
    };
    expect(resolveRivalAiRole({ ...base, distance: 1.8 })).toBe("approach");
    expect(resolveRivalAiRole({ ...base, distance: 0.7 })).toBe("space");
    expect(resolveRivalAiRole({ ...base, playerWhiffing: true, distance: 1.3 })).toBe("punish-whiff");
    expect(resolveRivalAiRole({ ...base, playerKnockdownRemaining: 0.16 })).toBe("meaty-wakeup");
    expect(resolveRivalAiRole({ ...base, opponentAlive: false, distance: 2 })).toBe("neutral");
  });

  it("dashes to close or create space, and biases punish/meaty strikes", () => {
    expect(rivalAiWantsDash("approach", 1.9, false)).toBe(true);
    expect(rivalAiWantsDash("space", 0.8, false)).toBe(true);
    expect(rivalAiWantsDash("punish-whiff", 1.3, false)).toBe(true);
    expect(rivalAiWantsDash("neutral", 1.1, true)).toBe(true);
    expect(rivalAiStrikeBias("punish-whiff").light).toBe(1);
    expect(rivalAiStrikeBias("meaty-wakeup").light).toBeGreaterThan(0.8);
  });
});
