/**
 * Mech Hangar bout simulation — route-local fighting rules.
 *
 * Authored here (PRD section 5): attack windows, i-frames, knockback, guard drain
 * with break stagger, power economy, and KO. The sim is fixed-step (60 Hz) and
 * fully deterministic for a given seed + input script: the rival is createCombatAi
 * (seeded), and outcomeHash() lets tests prove identical inputs produce identical
 * bouts. No DOM, no renderer — main.ts and feel.ts consume its events.
 */
import type { MechStats } from "../stats";
import { aggregateStats } from "../stats";
import type { BuildSelection } from "../parts-catalog";
import { createRivalController, type RivalIntent } from "./rival";

export const SIM_FPS = 60;
export const STEP = 1 / SIM_FPS;
/** Half-width of the floodlit pit; fighters clamp to these walls. */
export const PIT_HALF_WIDTH = 4.2;
export const FLOOR_Y = 0;
/** Keep rigid fighter assemblies readable when both combatants meet a wall. */
const MIN_FIGHTER_GAP = 0.9;

/** Route-local frame data (frames at 60fps). Windows are authored, not imported. */
interface MoveWindow {
  readonly id: "light" | "heavy" | "special";
  readonly startup: number;
  readonly active: number;
  readonly recovery: number;
  readonly hitstun: number;
  readonly range: number;
  knockback: number;
  hitstop: number;
}

const MOVE_WINDOWS: Readonly<Record<MoveWindow["id"], MoveWindow>> = {
  light: { id: "light", startup: 7, active: 3, recovery: 11, hitstun: 14, range: 1.1, knockback: 1.7, hitstop: 4 },
  heavy: { id: "heavy", startup: 13, active: 4, recovery: 20, hitstun: 22, range: 1.3, knockback: 3.2, hitstop: 7 },
  special: { id: "special", startup: 17, active: 5, recovery: 26, hitstun: 28, range: 1.65, knockback: 4.6, hitstop: 9 }
};

const IFRAMES_AFTER_HIT = 10;
const GUARD_DAMAGE_SCALE = 0.25;
const GUARD_DRAIN_SCALE = 0.55;
const GUARD_BREAK_STAGGER_FRAMES = 42;
const POWER_REGEN_PER_FRAME = 0.06;

export interface FighterState {
  readonly id: "player" | "rival";
  x: number;
  y: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  guard: number;
  power: number;
  guarding: boolean;
  move: { id: MoveWindow["id"]; frame: number } | null;
  stunFrames: number;
  iframes: number;
  airborne: boolean;
  ko: boolean;
}

export type BoutEventType =
  | "hit"
  | "blocked"
  | "guardBreak"
  | "specialFire"
  | "jump"
  | "land"
  | "ko";

export interface BoutEvent {
  readonly type: BoutEventType;
  readonly frame: number;
  readonly attackerId: "player" | "rival" | null;
  readonly victimId: "player" | "rival" | null;
  readonly damage: number;
  readonly x: number;
  readonly y: number;
  readonly heavy: boolean;
}

export interface BoutInputs {
  /** -1 left, +1 right. */
  readonly moveX: number;
  readonly jump: boolean;
  readonly light: boolean;
  readonly heavy: boolean;
  readonly special: boolean;
  readonly guard: boolean;
}

export type BoutPhase = "countdown" | "fighting" | "ko" | "lost";

export interface BoutSnapshot {
  readonly phase: BoutPhase;
  readonly frame: number;
  readonly player: Readonly<FighterState>;
  readonly rival: Readonly<FighterState>;
  readonly events: readonly BoutEvent[];
  readonly hitstopFrames: number;
}

export interface MechBoutOptions {
  readonly playerSelection: BuildSelection;
  readonly rivalSelection: BuildSelection;
  /** Aggression preset index (cycles on rematch); rival build stays fixed. */
  readonly presetIndex: number;
  readonly seed: number;
}

function makeFighter(id: "player" | "rival", startX: number, stats: MechStats): FighterState {
  return {
    id,
    x: startX,
    y: FLOOR_Y,
    vy: 0,
    facing: id === "player" ? 1 : -1,
    hp: stats.hpMax,
    guard: stats.guardMax,
    power: Math.round(stats.powerMax * 0.5),
    guarding: false,
    move: null,
    stunFrames: 0,
    iframes: 0,
    airborne: false,
    ko: false
  };
}

function inWindow(move: { id: MoveWindow["id"]; frame: number }): boolean {
  const w = MOVE_WINDOWS[move.id];
  return move.frame >= w.startup && move.frame < w.startup + w.active;
}

function moveDone(move: { id: MoveWindow["id"]; frame: number }): boolean {
  const w = MOVE_WINDOWS[move.id];
  return move.frame >= w.startup + w.active + w.recovery;
}

/**
 * Create a deterministic bout.
 *
 * The rival runs through createRivalController (createCombatAi under the hood);
 * both fighters obey the same authored windows, so the AI's decisions are the only
 * asymmetry between sides. outcomeHash() folds the full trajectory into one value
 * for determinism proofs.
 */
export function createMechBout(options: MechBoutOptions) {
  const playerStats = aggregateStats(options.playerSelection);
  const rivalStats = aggregateStats(options.rivalSelection);
  let player = makeFighter("player", -1.9, playerStats);
  let rival = makeFighter("rival", 1.9, rivalStats);
  const rivalAi = createRivalController({ presetIndex: options.presetIndex, seed: options.seed, rivalStats });
  let frame = 0;
  let phase: BoutPhase = "countdown";
  let countdownFrames = Math.round(SIM_FPS * 1.2);
  let hitstopFrames = 0;
  let events: BoutEvent[] = [];
  let koEvents: BoutEvent[] = [];
  let accumulator = 0;

  const emit = (event: Omit<BoutEvent, "frame">): void => {
    const full = { ...event, frame };
    events.push(full);
    if (event.type === "ko") koEvents.push(full);
  };

  function tryStartMove(fighter: FighterState, id: MoveWindow["id"], stats: MechStats): boolean {
    if (fighter.ko || fighter.stunFrames > 0 || fighter.move) return false;
    if (id === "special") {
      if (fighter.power < stats.specialCost) return false;
      fighter.power -= stats.specialCost;
      emit({ type: "specialFire", attackerId: fighter.id, victimId: null, damage: 0, x: fighter.x, y: fighter.y, heavy: true });
    }
    fighter.move = { id, frame: 0 };
    return true;
  }

  function applyHit(attacker: FighterState, victim: FighterState, attackerStats: MechStats, victimStats: MechStats, moveId: MoveWindow["id"]): void {
    const window = MOVE_WINDOWS[moveId];
    const baseDamage =
      moveId === "light" ? attackerStats.lightDamage : moveId === "heavy" ? attackerStats.heavyDamage : attackerStats.specialDamage;
    const blocked = victim.guarding && !victim.airborne;
    attacker.power = Math.min(attackerStats.powerMax, attacker.power + 3);
    if (blocked) {
      const chip = round4(baseDamage * GUARD_DAMAGE_SCALE);
      victim.hp = Math.max(0, victim.hp - chip);
      victim.guard -= baseDamage * GUARD_DRAIN_SCALE;
      emit({ type: "blocked", attackerId: attacker.id, victimId: victim.id, damage: chip, x: midpoint(attacker.x, victim.x), y: 1, heavy: moveId !== "light" });
      if (victim.guard <= 0) {
        victim.guard = 0;
        victim.stunFrames = GUARD_BREAK_STAGGER_FRAMES;
        victim.move = null;
        emit({ type: "guardBreak", attackerId: attacker.id, victimId: victim.id, damage: 0, x: victim.x, y: 1, heavy: true });
      }
    } else if (victim.iframes > 0) {
      // i-frames: the swing connects with nothing; no event, no damage.
    } else {
      const damage = round4(baseDamage);
      victim.hp = Math.max(0, victim.hp - damage);
      victim.stunFrames = Math.max(victim.stunFrames, window.hitstun);
      victim.iframes = IFRAMES_AFTER_HIT;
      victim.vy += window.knockback * 0.35;
      victim.x = clampX(victim.x - victim.facing * window.knockback * 0.22);
      victim.power = Math.min(victimStats.powerMax, victim.power + 2);
      emit({
        type: "hit",
        attackerId: attacker.id,
        victimId: victim.id,
        damage,
        x: midpoint(attacker.x, victim.x),
        y: victim.y + 1.05,
        heavy: moveId !== "light"
      });
      if (victim.hp <= 0 && !victim.ko) {
        victim.ko = true;
        phase = victim.id === "rival" ? "ko" : "lost";
        emit({ type: "ko", attackerId: attacker.id, victimId: victim.id, damage: 0, x: victim.x, y: victim.y, heavy: true });
      }
    }
    hitstopFrames = Math.max(hitstopFrames, window.hitstop);
  }

  function stepFighterMotion(fighter: FighterState, stats: MechStats, moveX: number, wantsGuard: boolean, intent?: RivalIntent): void {
    if (fighter.ko) return;
    const stunned = fighter.stunFrames > 0;
    const attacking = fighter.move !== null;
    fighter.guarding = wantsGuard && !stunned && !attacking && !fighter.airborne;

    // Movement: authored arcade motion, explicitly non-physical.
    const canMove = !stunned && (!attacking || fighter.move!.id === "light");
    if (canMove && !fighter.guarding) {
      const speed = stats.moveSpeed * (fighter.airborne ? 0.6 : 1);
      fighter.x = clampX(fighter.x + moveX * speed * STEP);
    }

    // Vertical: jump-thrust impulse then gravity.
    if (!fighter.airborne && canMove && !fighter.airborne && fighter.vy === 0) {
      // handled by caller via inputs (jump edge)
    }
    if (fighter.airborne) {
      fighter.vy -= 14 * STEP;
      fighter.y += fighter.vy * STEP;
      if (fighter.y <= FLOOR_Y) {
        fighter.y = FLOOR_Y;
        fighter.vy = 0;
        fighter.airborne = false;
        emit({ type: "land", attackerId: fighter.id, victimId: null, damage: 0, x: fighter.x, y: FLOOR_Y, heavy: false });
      }
    }

    // Facing tracks the opponent.
    const opponent = fighter.id === "player" ? rival : player;
    if (!stunned && Math.abs(opponent.x - fighter.x) > 0.05) {
      fighter.facing = opponent.x >= fighter.x ? 1 : -1;
    }

    // Timers.
    if (fighter.stunFrames > 0) fighter.stunFrames -= 1;
    if (fighter.iframes > 0) fighter.iframes -= 1;

    // Power regen when committed to nothing.
    if (!attacking && !stunned) {
      fighter.power = Math.min(stats.powerMax, fighter.power + POWER_REGEN_PER_FRAME * (intent ? 1 : 1));
    }
  }

  function startJump(fighter: FighterState, thrust: number): void {
    if (fighter.airborne || fighter.stunFrames > 0 || fighter.ko) return;
    fighter.airborne = true;
    fighter.vy = thrust;
    emit({ type: "jump", attackerId: fighter.id, victimId: null, damage: 0, x: fighter.x, y: fighter.y, heavy: false });
  }

  function resolveAttacks(): void {
    const pairs: [FighterState, FighterState, MechStats, MechStats][] = [
      [player, rival, playerStats, rivalStats],
      [rival, player, rivalStats, playerStats]
    ];
    for (const [attacker, victim, aStats, vStats] of pairs) {
      if (!attacker.move || !inWindow(attacker.move)) continue;
      const alreadyResolved = resolvedThisFrame.has(attacker.id);
      if (alreadyResolved) continue;
      const reach = MOVE_WINDOWS[attacker.move.id].range;
      const distance = Math.abs(victim.x - attacker.x);
      // Facing check: swings go where the mech looks.
      const inFront = (victim.x - attacker.x) * attacker.facing >= -0.15;
      if (distance <= reach && inFront) {
        resolvedThisFrame.add(attacker.id);
        applyHit(attacker, victim, aStats, vStats, attacker.move.id);
      }
    }
  }

  /**
   * The route mounts each fighter from several rigid typed parts.  Letting the
   two roots occupy the same x coordinate makes those real assemblies collapse
   into one unreadable silhouette (especially at a pit wall).  Resolve only the
   authored horizontal arcade envelope; Rapier remains the owner of physical
   simulation elsewhere in the repository.
   */
  function resolveFighterSpacing(): void {
    if (player.ko || rival.ko) return;
    const delta = rival.x - player.x;
    const distance = Math.abs(delta);
    if (distance >= MIN_FIGHTER_GAP) return;
    const direction = delta >= 0 ? 1 : -1;
    const needed = MIN_FIGHTER_GAP - distance;
    const playerNext = clampX(player.x - direction * needed * 0.5);
    const rivalNext = clampX(rival.x + direction * needed * 0.5);
    player.x = playerNext;
    rival.x = rivalNext;
    // At a wall, the first symmetric correction can be clamped back into an
    // overlap.  Give the inward-moving fighter the remaining separation.
    if (Math.abs(rival.x - player.x) < MIN_FIGHTER_GAP) {
      if (direction > 0) player.x = clampX(rival.x - MIN_FIGHTER_GAP);
      else rival.x = clampX(player.x + MIN_FIGHTER_GAP);
    }
  }

  const resolvedThisFrame = new Set<string>();

  function stepFixed(): void {
    frame += 1;
    events = [];
    resolvedThisFrame.clear();

    if (phase === "countdown") {
      countdownFrames -= 1;
      if (countdownFrames <= 0) phase = "fighting";
      return;
    }
    if (phase === "ko" || phase === "lost") {
      // Let physics settle so the KO fall reads; no further decisions.
      stepFighterMotion(player, playerStats, 0, false);
      stepFighterMotion(rival, rivalStats, 0, false);
      return;
    }

    // Hit-stop lite freezes BOTH mechs for the window; nothing advances but the clock.
    if (hitstopFrames > 0) {
      hitstopFrames -= 1;
      return;
    }

    // Player intent comes from the caller each frame via pendingPlayerInputs.
    const pi = pendingPlayerInputs ?? { moveX: 0, jump: false, light: false, heavy: false, special: false, guard: false };
    pendingPlayerInputs = undefined;

    if (!player.ko) {
      if (pi.jump) startJump(player, playerStats.jumpThrust);
      if (pi.light) tryStartMove(player, "light", playerStats);
      else if (pi.heavy) tryStartMove(player, "heavy", playerStats);
      else if (pi.special) tryStartMove(player, "special", playerStats);
    }
    stepFighterMotion(player, playerStats, pi.moveX, pi.guard);

    // Rival intent from createCombatAi.
    if (!rival.ko) {
      const distance = Math.abs(player.x - rival.x);
      const decision = rivalAi.decide({
        distance,
        playerMoveId: player.move?.id,
        playerMoveFrame: player.move?.frame ?? 0,
        rivalStunned: rival.stunFrames > 0,
        rivalRecoveryFrames: rival.move ? recoveryLeft(rival.move) : 0,
        rivalHealthFraction: rival.hp / rivalStats.hpMax,
        playerHealthFraction: player.hp / playerStats.hpMax,
        powerFraction: rival.power / rivalStats.powerMax,
        specialCostFraction: rivalStats.specialCost / rivalStats.powerMax
      });
      if (decision.moveId === "light") tryStartMove(rival, "light", rivalStats);
      else if (decision.moveId === "heavy") tryStartMove(rival, "heavy", rivalStats);
      else if (decision.moveId === "special") tryStartMove(rival, "special", rivalStats);
      // Approach intent is relative to the opponent (+1 closes distance), so it
      // converts to a signed x velocity here rather than raw world +x.
      const rivalApproachVector = Math.sign(player.x - rival.x || 1) * decision.approach;
      stepFighterMotion(rival, rivalStats, rivalApproachVector, decision.guard, decision);
    }

    resolveFighterSpacing();

    // Advance move clocks after resolution bookkeeping.
    advanceMoveClock(player);
    advanceMoveClock(rival);
    resolveAttacks();
    advanceMoveClockPost(player);
    advanceMoveClockPost(rival);
  }

  function recoveryLeft(move: { id: MoveWindow["id"]; frame: number }): number {
    const w = MOVE_WINDOWS[move.id];
    return Math.max(0, w.startup + w.active + w.recovery - move.frame);
  }

  function advanceMoveClock(fighter: FighterState): void {
    if (fighter.move) fighter.move.frame += 1;
  }
  function advanceMoveClockPost(fighter: FighterState): void {
    if (fighter.move && moveDone(fighter.move)) fighter.move = null;
  }

  let pendingPlayerInputs: BoutInputs | undefined;

  return {
    /** Queue this display frame's player inputs; consumed by the next fixed step(s). */
    pushInputs(inputs: BoutInputs): void {
      pendingPlayerInputs = inputs;
    },
    /** Advance the fixed-step sim by dt seconds using an internal accumulator. */
    step(dt: number): BoutSnapshot {
      accumulator += Math.min(0.25, Math.max(0, dt));
      while (accumulator >= STEP) {
        stepFixed();
        accumulator -= STEP;
      }
      return this.snapshot();
    },
    snapshot(): BoutSnapshot {
      return {
        phase,
        frame,
        player,
        rival,
        events: [...events],
        hitstopFrames
      };
    },
    consumeEvents(): readonly BoutEvent[] {
      const out = events;
      events = [];
      return out;
    },
    koEvents(): readonly BoutEvent[] {
      return koEvents;
    },
    stats() {
      return { player: playerStats, rival: rivalStats };
    },
    preset() {
      return rivalAi.preset;
    },
    rivalTelemetry() {
      return rivalAiPatchedTelemetry ?? null;
    },
    /**
     * Deterministic trajectory hash (FNV-1a over frame, phases, hp/guard/power/x/y).
     * Same seed + same scripted inputs -> same hash; that is the PRD's seeded-determinism gate.
     */
    outcomeHash(): string {
      const parts = [
        frame,
        phase,
        round2(player.hp),
        round2(rival.hp),
        round2(player.guard),
        round2(rival.guard),
        round2(player.power),
        round2(rival.power),
        round2(player.x),
        round2(rival.x),
        koEvents.length
      ];
      const text = parts.join("|");
      let hash = 0x811c9dc5;
      for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
      }
      return (hash >>> 0).toString(16).padStart(8, "0");
    },
    reset(): void {
      player = makeFighter("player", -1.9, playerStats);
      rival = makeFighter("rival", 1.9, rivalStats);
      rivalAi.reset();
      frame = 0;
      phase = "countdown";
      countdownFrames = Math.round(SIM_FPS * 1.2);
      hitstopFrames = 0;
      events = [];
      koEvents = [];
      accumulator = 0;
      pendingPlayerInputs = undefined;
    }
  };
}

let rivalAiPatchedTelemetry: unknown = null;

function clampX(x: number): number {
  return Math.max(-PIT_HALF_WIDTH, Math.min(PIT_HALF_WIDTH, x));
}
function midpoint(a: number, b: number): number {
  return (a + b) / 2;
}
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}
