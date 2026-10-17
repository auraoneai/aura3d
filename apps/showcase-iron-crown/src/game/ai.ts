import type { FighterDef } from "./fighters";
import type { AttackKind } from "./moves";

/**
 * Iron Crown CPU brain.
 *
 * Produces the same `Intent` shape the player controller produces so both
 * fighters run through the identical drive path. Three difficulties plus a
 * boss profile; a deterministic per-fighter RNG seeded at bout start keeps
 * replays/evidence stable.
 */

export interface Intent {
  /** -1 .. 1 toward/away from opponent. */
  readonly axis: number;
  readonly crouch: boolean;
  readonly guard: boolean;
  readonly jump: boolean;
  readonly dash: -1 | 0 | 1;
  readonly attack?: AttackKind;
}

export const IDLE_INTENT: Intent = { axis: 0, crouch: false, guard: false, jump: false, dash: 0 };

export type Difficulty = "novice" | "scrapper" | "champion" | "boss";

export interface AiProfile {
  readonly id: Difficulty;
  readonly label: string;
  /** seconds between decision ticks. */
  readonly thinkMs: number;
  /** chance [0..1] of blocking an incoming attack when in range. */
  readonly blockChance: number;
  /** aggression weight vs fighter.ai.aggression. */
  readonly aggression: number;
  /** chance of spending meter on special when full. */
  readonly specialChance: number;
  /** chance of anti-airing when opponent jumps close. */
  readonly antiAirChance: number;
  /** chance of teching a throw (app-layer). */
  readonly techChance: number;
  readonly throws: boolean;
}

export const AI_PROFILES: Record<Difficulty, AiProfile> = {
  novice: { id: "novice", label: "Novice", thinkMs: 620, blockChance: 0.12, aggression: 0.55, specialChance: 0.4, antiAirChance: 0.05, techChance: 0.05, throws: false },
  scrapper: { id: "scrapper", label: "Scrapper", thinkMs: 380, blockChance: 0.28, aggression: 0.8, specialChance: 0.65, antiAirChance: 0.2, techChance: 0.15, throws: true },
  champion: { id: "champion", label: "Champion", thinkMs: 230, blockChance: 0.48, aggression: 1.0, specialChance: 0.85, antiAirChance: 0.45, techChance: 0.35, throws: true },
  boss: { id: "boss", label: "The Iron Crown", thinkMs: 150, blockChance: 0.62, aggression: 1.1, specialChance: 1, antiAirChance: 0.65, techChance: 0.55, throws: true }
};

/** mulberry32 — tiny deterministic PRNG. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface AiContext {
  readonly selfX: number;
  readonly foeX: number;
  readonly foeAirborne: boolean;
  readonly foeStunned: boolean;
  readonly foeAttacking: boolean;
  readonly selfStunned: boolean;
  readonly selfAttacking: boolean;
  readonly meter: number;
  readonly foeHealthPct: number;
}

export interface CpuBrain {
  think(ctx: AiContext, dt: number): Intent;
  /** Called by the app when a throw lands on the CPU — returns true if teched. */
  tryTech(): boolean;
}

export function createCpuBrain(fighter: FighterDef, difficulty: Difficulty, seed = 1337): CpuBrain {
  const profile = AI_PROFILES[difficulty];
  const rng = seededRng(seed);
  let cooldown = 0;
  let held: Intent = IDLE_INTENT;
  let holdT = 0;

  const preferred = fighter.ai.preferredRange;

  function decide(ctx: AiContext): Intent {
    if (ctx.selfStunned || ctx.selfAttacking) return IDLE_INTENT;
    const dist = Math.abs(ctx.foeX - ctx.selfX);
    const dir: 1 | -1 = ctx.foeX > ctx.selfX ? 1 : -1;
    const aggression = fighter.ai.aggression * profile.aggression;

    // Anti-air: opponent airborne and close → meet them with a heavy.
    if (ctx.foeAirborne && dist < 1.7 && rng() < profile.antiAirChance) {
      return { axis: 0, crouch: false, guard: false, jump: false, dash: 0, attack: "heavy" };
    }

    // Defensive read: opponent attacking in range → hold away (block).
    if (ctx.foeAttacking && dist < 2.0 && rng() < profile.blockChance) {
      return { axis: 0, crouch: rng() < 0.3, guard: true, jump: false, dash: 0 };
    }

    // Special when meter is full and we're not out of range.
    if (ctx.meter >= 100 && dist < 2.4 && rng() < profile.specialChance) {
      return { axis: dir * 0.4, crouch: false, guard: false, jump: false, dash: 0, attack: "special" };
    }

    // Spacing game: approach preferred range, sometimes dash in.
    if (dist > preferred + 0.55) {
      const dash: -1 | 0 | 1 = rng() < aggression * 0.25 ? dir : 0;
      return { axis: dir * Math.min(1, 0.55 + aggression * 0.5), crouch: false, guard: false, jump: rng() < 0.06, dash, attack: rng() < 0.12 ? "light" : undefined };
    }
    if (dist < preferred * 0.6) {
      // Too close — either throw, attack, or back off.
      const roll = rng();
      if (profile.throws && roll < 0.18) {
        return { axis: 0, crouch: false, guard: false, jump: false, dash: 0, attack: "throw" };
      }
      if (roll < 0.18 + aggression * 0.55) {
        return { axis: 0, crouch: false, guard: false, jump: false, dash: 0, attack: rng() < 0.6 ? "light" : "heavy" };
      }
      return { axis: -dir * 0.7, crouch: false, guard: false, jump: false, dash: (rng() < 0.15 ? -dir : 0) as -1 | 0 | 1 };
    }

    // In poke range — weighted mix of pokes, whiff-punish walks, blocks.
    const roll = rng();
    if (ctx.foeStunned) {
      return { axis: dir * 0.6, crouch: false, guard: false, jump: false, dash: 0, attack: roll < 0.75 ? "heavy" : "light" };
    }
    if (roll < aggression * 0.5) {
      return { axis: dir * 0.3, crouch: false, guard: false, jump: false, dash: 0, attack: roll < aggression * 0.22 ? "heavy" : "light" };
    }
    if (roll < aggression * 0.5 + profile.blockChance * 0.4) {
      return { axis: 0, crouch: rng() < 0.35, guard: true, jump: false, dash: 0 };
    }
    if (roll > 0.94) {
      return { axis: 0, crouch: false, guard: false, jump: true, dash: 0 };
    }
    return { axis: dir * (rng() < 0.5 ? 0.45 : -0.3), crouch: rng() < 0.12, guard: false, jump: false, dash: 0 };
  }

  return {
    think(ctx, dt) {
      cooldown -= dt * 1000;
      holdT -= dt;
      if (holdT > 0 && cooldown > 0) return held;
      holdT = 0;
      if (cooldown <= 0) {
        cooldown = profile.thinkMs * (0.65 + rng() * 0.7);
        held = decide(ctx);
        // Hold movement decisions briefly so the walk doesn't strobe.
        if (!held.attack && !held.jump && !held.dash) holdT = 0.14 + rng() * 0.22;
      }
      return held;
    },
    tryTech() {
      return rng() < profile.techChance;
    }
  };
}

/* ---------------- Combo Lab dummy ---------------- */

export type DummyStance = "stand" | "crouch" | "guard" | "cpu";

export function dummyIntent(stance: DummyStance, brain: CpuBrain | null, ctx: AiContext, dt: number): Intent {
  switch (stance) {
    case "crouch":
      return { axis: 0, crouch: true, guard: true, jump: false, dash: 0 };
    case "guard":
      return { axis: 0, crouch: false, guard: true, jump: false, dash: 0 };
    case "cpu":
      return brain ? brain.think(ctx, dt) : IDLE_INTENT;
    case "stand":
    default:
      return IDLE_INTENT;
  }
}
