import { describe, expect, it } from "vitest";
import {
  controlsHint,
  DEFAULT_ACTIONS,
  defaultBindings,
  EXTRA_TOUCH_BUTTONS,
  loadBindings,
  rebind,
  saveBindings,
  TOUCH_BINDINGS,
  undeclaredTouchActions
} from "../../../apps/showcase-iron-crown/src/game/controls";
import { createCpuBrain, type AiContext } from "../../../apps/showcase-iron-crown/src/game/ai";
import { fighterById } from "../../../apps/showcase-iron-crown/src/game/fighters";
import { advanceLadder, createLadder, currentRung } from "../../../apps/showcase-iron-crown/src/game/ladder";

describe("iron crown touch bindings (IC-01)", () => {
  it("every touch control drives a declared action", () => {
    expect(undeclaredTouchActions(TOUCH_BINDINGS, DEFAULT_ACTIONS)).toEqual([]);
    expect(undeclaredTouchActions(Object.fromEntries(EXTRA_TOUCH_BUTTONS.map((b) => [b.id, b.action])), DEFAULT_ACTIONS)).toEqual([]);
    expect(TOUCH_BINDINGS.left).toBe("moveLeft");
    expect(TOUCH_BINDINGS.right).toBe("moveRight");
  });

  it("flags the pre-fix bindings", () => {
    expect(undeclaredTouchActions({ left: "left", right: "right", block: "guard" }, DEFAULT_ACTIONS)).toEqual(["left→left", "right→right"]);
  });

  it("phones get throw, dash, crouch and pause buttons of at least 48 CSS px at 390x844", () => {
    expect(EXTRA_TOUCH_BUTTONS.map((b) => b.action).sort()).toEqual(["crouch", "dash", "pause", "throw"]);
    for (const b of EXTRA_TOUCH_BUTTONS) {
      expect(b.rect.w * 390).toBeGreaterThanOrEqual(48);
      expect(b.rect.h * 844).toBeGreaterThanOrEqual(48);
      expect(b.rect.x + b.rect.w).toBeLessThanOrEqual(1);
      expect(b.rect.y + b.rect.h).toBeLessThanOrEqual(1);
    }
  });
});

describe("iron crown rebinding and hint (IC-14)", () => {
  it("rebinding moves a key off its old action and keeps gamepad bindings", () => {
    const map = rebind(defaultBindings(), "light", "KeyK");
    expect(map.light[0]).toBe("KeyK");
    expect(map.light).toContain("GamepadX");
    expect(map.heavy).not.toContain("KeyK");
  });

  it("round-trips through storage and ignores corrupt data", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    saveBindings(storage, rebind(defaultBindings(), "throw", "KeyT"));
    expect(loadBindings(storage).throw[0]).toBe("KeyT");
    saveBindings(storage, null);
    expect(loadBindings(storage).throw).toEqual([...DEFAULT_ACTIONS.throw]);
    store.set("iron-crown.bindings.v1", "{not json");
    expect(loadBindings(storage)).toEqual(defaultBindings());
  });

  it("the hint lists jump, dash, block and the SUPER rule from the live bindings", () => {
    const hint = controlsHint(DEFAULT_ACTIONS);
    for (const part of ["A/D move", "W jump", "Q or hold back to block", "Shift dash", "L special (full SUPER)", "U throw"]) expect(hint).toContain(part);
    expect(controlsHint(rebind(defaultBindings(), "jump", "Space"))).toContain("Space jump");
  });
});

describe("iron crown CPU (IC-13)", () => {
  const ctx = (over: Partial<AiContext> = {}): AiContext => ({
    selfX: 1.8, foeX: 0, foeAirborne: false, foeStunned: true, foeAttacking: false, selfStunned: false, selfAttacking: false, meter: 0, foeHealthPct: 1, ...over
  });

  it("one decision triggers its attack once, not every frame of the think cooldown", () => {
    const brain = createCpuBrain(fighterById("volt"), "scrapper", 31);
    const attacksPerDecision: number[] = [];
    let current = 0;
    let lastAttack = false;
    for (let i = 0; i < 600; i++) {
      const intent = brain.think(ctx(), 1 / 60);
      if (intent.attack) current += 1;
      if (intent.attack && lastAttack) attacksPerDecision.push(-1); // two frames in a row = repeated attack
      lastAttack = intent.attack !== undefined;
    }
    expect(current).toBeGreaterThan(0);
    expect(attacksPerDecision).toEqual([]);
  });

  it("techChance is used: a boss techs more throws than a novice", () => {
    const rate = (difficulty: "novice" | "boss") => {
      const brain = createCpuBrain(fighterById("kenji"), difficulty, 7);
      let techs = 0;
      for (let i = 0; i < 2000; i++) if (brain.tryTech()) techs += 1;
      return techs / 2000;
    };
    expect(rate("novice")).toBeLessThan(0.1);
    expect(rate("boss")).toBeGreaterThan(0.45);
  });
});

describe("iron crown ladder", () => {
  it("eight rungs ending on Sovereign at the Crown Arena; advancing past rung 8 clears it", () => {
    const l = createLadder("kenji");
    expect(l.rungs).toHaveLength(8);
    expect(l.rungs.every((r) => r.opponent !== "kenji")).toBe(true);
    expect(l.rungs[7]).toMatchObject({ opponent: "sovereign", stage: "crown-arena", difficulty: "boss" });
    for (let i = 0; i < 7; i++) advanceLadder(l);
    expect(currentRung(l)?.rung).toBe(8);
    expect(l.cleared).toBe(false);
    advanceLadder(l);
    expect(l.cleared).toBe(true);
    expect(currentRung(l)).toBeUndefined();
  });
});
