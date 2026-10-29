import { createCountedRng } from "@aura3d/engine";
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
  /** Holding away from the foe: guard, but keep walking back (player only; audit IC-06). */
  readonly walkBack?: boolean;
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

/** Deterministic PRNG (the library mulberry32 stream). */
export function seededRng(seed: number): () => number {
  const rng = createCountedRng(seed);
  return () => rng.next();
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
  /** Called by the app once per player throw that becomes active on the CPU; returns true if the CPU techs it. */
  tryTech(): boolean;
}

export function createCpuBrain(fighter: FighterDef, difficulty: Difficulty, seed = 1337): CpuBrain {
  const profile = AI_PROFILES[difficulty];
  const rng = seededRng(seed);
  let cooldown = 0;
  let held: Intent = IDLE_INTENT;
  let holdT = 0;
  // One decision triggers its attack, jump or dash once; the rest of the think cooldown only keeps the movement part
  // (audit IC-13: returning the attack every frame turned one decision into two or three jabs).
  let triggerSpent = false;
  const movementOnly = (intent: Intent): Intent =>
    intent.attack === undefined && !intent.jump && intent.dash === 0 ? intent : { ...intent, attack: undefined, jump: false, dash: 0 };
  const emit = (): Intent => {
    if (triggerSpent) return movementOnly(held);
    triggerSpent = true;
    return held;
  };

  const MIN_STRIKE_RANGE = 1.5;
  const MAX_STRIKE_RANGE = 2.2;
  const preferred = Math.max(MIN_STRIKE_RANGE, Math.min(MAX_STRIKE_RANGE, fighter.ai.preferredRange));

  function decide(ctx: AiContext): Intent {
    if (ctx.selfStunned || ctx.selfAttacking) return IDLE_INTENT;
    const dist = Math.abs(ctx.foeX - ctx.selfX);
    const dir: 1 | -1 = ctx.foeX > ctx.selfX ? 1 : -1;
    const aggression = fighter.ai.aggression * profile.aggression;

    // Anti-air: opponent airborne and close → meet them with a heavy.
    if (ctx.foeAirborne && dist < 2.1 && rng() < profile.antiAirChance) {
      return { axis: 0, crouch: false, guard: false, jump: false, dash: 0, attack: "heavy" };
    }

    // Defensive read: opponent attacking in range → hold away (block).
    if (ctx.foeAttacking && dist < 2.25 && rng() < profile.blockChance) {
      return { axis: 0, crouch: rng() < 0.3, guard: true, jump: false, dash: 0 };
    }

    // Special when meter is full and we're in striking band.
    if (ctx.meter >= 100 && dist <= MAX_STRIKE_RANGE + 0.25 && rng() < profile.specialChance) {
      const step = dist > preferred ? dir * 0.3 : 0;
      return { axis: step, crouch: false, guard: false, jump: false, dash: 0, attack: "special" };
    }

    // Outside striking range (> 2.2m): approach into 1.5m..2.2m band.
    if (dist > Math.max(preferred + 0.3, MAX_STRIKE_RANGE)) {
      const dash: -1 | 0 | 1 = dist > 2.6 && rng() < aggression * 0.22 ? dir : 0;
      return {
        axis: dir * Math.min(1, 0.55 + aggression * 0.45),
        crouch: false,
        guard: false,
        jump: rng() < 0.04,
        dash,
        attack: rng() < 0.1 ? "light" : undefined
      };
    }

    // Inside minimum striking distance (< 1.5m): never walk forward; attack, throw, or step back.
    if (dist < MIN_STRIKE_RANGE) {
      const roll = rng();
      if (profile.throws && roll < 0.18) {
        return { axis: 0, crouch: false, guard: false, jump: false, dash: 0, attack: "throw" };
      }
      if (roll < 0.18 + aggression * 0.52) {
        return { axis: -dir * 0.35, crouch: false, guard: false, jump: false, dash: 0, attack: rng() < 0.6 ? "light" : "heavy" };
      }
      return { axis: -dir * 0.75, crouch: false, guard: false, jump: false, dash: (rng() < 0.18 ? -dir : 0) as -1 | 0 | 1 };
    }

    // In striking range (1.5m .. 2.2m) — footsies micro-spacing, pokes, blocks.
    const stepTowardPreferred = dist > preferred + 0.14 ? dir * 0.35 : dist < preferred - 0.14 ? -dir * 0.35 : 0;
    const roll = rng();
    if (ctx.foeStunned) {
      return { axis: stepTowardPreferred, crouch: false, guard: false, jump: false, dash: 0, attack: roll < 0.75 ? "heavy" : "light" };
    }
    if (roll < aggression * 0.52) {
      return { axis: stepTowardPreferred, crouch: false, guard: false, jump: false, dash: 0, attack: roll < aggression * 0.24 ? "heavy" : "light" };
    }
    if (roll < aggression * 0.52 + profile.blockChance * 0.4) {
      return { axis: 0, crouch: rng() < 0.35, guard: true, jump: false, dash: 0 };
    }
    if (roll > 0.95) {
      return { axis: 0, crouch: false, guard: false, jump: true, dash: 0 };
    }
    return { axis: stepTowardPreferred !== 0 ? stepTowardPreferred : dir * (rng() < 0.45 ? 0.25 : -0.35), crouch: rng() < 0.12, guard: false, jump: false, dash: 0 };
  }

  return {
    think(ctx, dt) {
      cooldown -= dt * 1000;
      holdT -= dt;
      if (ctx.foeX !== undefined && Math.abs(ctx.foeX - ctx.selfX) < MIN_STRIKE_RANGE && held.axis * (ctx.foeX > ctx.selfX ? 1 : -1) > 0) {
        holdT = 0;
        cooldown = 0;
      }
      if (holdT > 0 && cooldown > 0) return emit();
      holdT = 0;
      if (cooldown <= 0) {
        cooldown = profile.thinkMs * (0.65 + rng() * 0.7);
        held = decide(ctx);
        triggerSpent = false;
        // Hold movement decisions briefly so the walk doesn't strobe.
        if (!held.attack && !held.jump && !held.dash) holdT = 0.12 + rng() * 0.18;
      }
      return emit();
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
