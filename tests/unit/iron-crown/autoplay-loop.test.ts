import { describe, expect, it } from "vitest";
import { game, type GameCombatWorldSnapshot } from "@aura3d/engine";
import { createCpuBrain, seededRng, type AiContext, type CpuBrain, type Intent } from "../../../apps/showcase-iron-crown/src/game/ai";
import {
  AUTOPLAY_RESULT_MS,
  AUTOPLAY_STAGE_ORDER,
  AUTOPLAY_TOGGLE_KEY,
  autoplayHint,
  autoplayRequested,
  nextAutoplayStage
} from "../../../apps/showcase-iron-crown/src/game/autoplay";
import { FIGHTERS, fighterById, type FighterDef } from "../../../apps/showcase-iron-crown/src/game/fighters";
import type { AttackKind } from "../../../apps/showcase-iron-crown/src/game/moves";
import {
  awardRound,
  BOUT_RESULT_DELAY_MS,
  canUseSpecial,
  KO_HOLD_SECONDS,
  METER_MAX,
  moveAgainst,
  ROUND_END_SECONDS,
  timeUpWinner
} from "../../../apps/showcase-iron-crown/src/game/rules";
import { stageById, type StageId } from "../../../apps/showcase-iron-crown/src/game/stages";

/**
 * Hands-free autoplay loop (owner addendum 2026-11-18). main.ts cannot run headless (it mounts the renderer at import), so
 * this harness drives the same pure pieces in the same per-frame order as main.ts's frame loop: both fighters think with
 * `createCpuBrain` (Player 1 on autoplay uses "scrapper", as main.ts does), intents go through the drive rules
 * (`driveFighter`: stun/attack/guard gates, separation, cancel chain, SUPER-meter specials), kinematic bodies and the
 * engine combat world resolve the exchange, and the bout flow uses main.ts's beats (K.O. hold, round break, result delay)
 * plus the autoplay result hold and venue tour from game/autoplay.ts.
 */
const DT = 1 / 60;
const ROUND_SECONDS = 60;
const MIN_SEP = 1.45;
const PLAYER_START: [number, number, number] = [-2.2, 0, 0];
const RIVAL_START: [number, number, number] = [2.2, 0, 0];
const APP_SEED = 20261012;
const TIER: Record<AttackKind, number> = { light: 1, throw: 1.5, heavy: 2, special: 3 };

type Phase = "fight" | "ko" | "roundEnd" | "boutEnd" | "result";
interface Fighter { side: "p1" | "cpu"; id: "player" | "rival"; def: FighterDef; body: ReturnType<typeof game.kinematicBody>; brain: CpuBrain; attack: { kind: AttackKind; connected: boolean } | null; guard: boolean; crouch: boolean; dashT: number }

const box = (offset: readonly [number, number, number], size: readonly [number, number, number]) => ({ id: "b", offset, size });
const actorDefaults = () => ({
  hurtboxes: [box([0, 0.85, 0], [0.72, 1.5, 0.46])],
  guardboxes: [box([0.34, 0.92, 0], [0.68, 1.42, 0.55])],
  pushboxes: [box([0, 0.72, 0], [MIN_SEP, 1.25, 0.5])]
});

interface Stats { p1Hits: number; cpuHits: number; blocks: number; specials: number; throws: number; heavies: number; dashes: number; jumps: number }

function runAutoplay(seconds: number) {
  const pickRng = seededRng(APP_SEED);
  const randomCpu = (exclude: string): FighterDef => {
    const pool = FIGHTERS.filter((f) => f.id !== exclude && f.id !== "sovereign");
    return pool[Math.floor(pickRng() * pool.length)] ?? fighterById("volt");
  };
  const combat = game.combatWorld();
  let snap: GameCombatWorldSnapshot = combat.snapshot();
  const refresh = (): void => { snap = combat.snapshot(); };
  const actor = (id: string) => snap.actors.find((a) => a.id === id);
  const attacking = (f: Fighter): boolean => snap.activeAttacks.some((a) => a.attackerId === f.id);

  let stage: StageId = "crown-arena";
  let P1!: Fighter, CPU!: Fighter;
  const make = (side: "p1" | "cpu", def: FighterDef, pos: [number, number, number], brain: CpuBrain): Fighter => {
    const b = stageById(stage).bounds;
    const body = game.kinematicBody({
      id: side === "p1" ? "player" : "rival", position: pos, bounds: { minX: b.minX, maxX: b.maxX, minY: 0, maxY: 3.4, minZ: -0.2, maxZ: 0.2 },
      groundY: 0, gravity: -26, maxSpeed: def.stats.walkSpeed, jumpVelocity: def.stats.jumpVelocity, groundAccel: 42, groundDecel: 55, airControl: 0.55, coyoteMs: 90, jumpBufferMs: 130
    });
    return { side, id: side === "p1" ? "player" : "rival", def, body, brain, attack: null, guard: false, crouch: false, dashT: 0 };
  };
  const addActors = (): void => {
    combat.reset();
    combat.addActor({ id: "player", team: "p1", position: [...PLAYER_START], facing: 1, health: P1.def.stats.maxHealth, ...actorDefaults() });
    combat.addActor({ id: "rival", team: "cpu", position: [...RIVAL_START], facing: -1, health: CPU.def.stats.maxHealth, ...actorDefaults() });
    refresh();
  };
  const newBout = (p1: FighterDef, cpu: FighterDef): void => {
    P1 = make("p1", p1, [...PLAYER_START], createCpuBrain(p1, "scrapper", APP_SEED + 7));
    CPU = make("cpu", cpu, [...RIVAL_START], createCpuBrain(cpu, "scrapper", APP_SEED + 31));
    addActors();
  };
  const facingTo = (a: Fighter, b: Fighter): 1 | -1 => (b.body.position[0] >= a.body.position[0] ? 1 : -1);
  const ctx = (self: Fighter, foe: Fighter): AiContext => ({
    selfX: self.body.position[0], foeX: foe.body.position[0], foeAirborne: !foe.body.grounded,
    foeStunned: (actor(foe.id)?.stun ?? 0) > 0, foeAttacking: attacking(foe), selfStunned: (actor(self.id)?.stun ?? 0) > 0,
    selfAttacking: attacking(self), meter: actor(self.id)?.meter ?? 0, foeHealthPct: (actor(foe.id)?.health ?? 0) / foe.def.stats.maxHealth
  });
  const separate = (): void => {
    const x1 = P1.body.position[0], x2 = CPU.body.position[0];
    if (Math.abs(x2 - x1) >= MIN_SEP) return;
    const sign = x2 - x1 >= 0 ? 1 : -1, half = MIN_SEP / 2, b = stageById(stage).bounds;
    const mid = Math.max(b.minX + half, Math.min(b.maxX - half, (x1 + x2) / 2));
    P1.body.position = [mid - sign * half, P1.body.position[1], P1.body.position[2]];
    CPU.body.position = [mid + sign * half, CPU.body.position[1], CPU.body.position[2]];
  };
  const syncActors = (): void => {
    for (const f of [P1, CPU]) {
      const a = actor(f.id);
      if (!a) continue;
      const facing = f.attack ? a.facing : facingTo(f, f === P1 ? CPU : P1);
      combat.setActor(f.id, {
        position: [f.body.position[0], f.body.position[1], f.body.position[2]], facing,
        guarding: (f.guard || f.crouch) && f.body.grounded && !f.attack,
        guardboxes: [{ id: "guard", offset: [facing * 0.26, 0.92, 0], size: [0.55, 1.42, 0.55] }],
        hurtboxes: [{ id: "body", offset: [0, f.crouch ? 0.55 : 0.85, 0], size: [0.6, f.crouch ? 1.0 : 1.5, 0.46] }]
      });
      if (a.meter > METER_MAX) combat.setActor(f.id, { meter: METER_MAX });
      if (f.attack && !snap.activeAttacks.some((x) => x.attackerId === f.id)) f.attack = null;
    }
  };
  const stats: Stats = { p1Hits: 0, cpuHits: 0, blocks: 0, specials: 0, throws: 0, heavies: 0, dashes: 0, jumps: 0 };
  let progressed = false;
  const tryAttack = (f: Fighter, foe: Fighter, kind: AttackKind): void => {
    const a = actor(f.id);
    if (!a || a.knockedOut || a.stun > 0) return;
    if (attacking(f) && (!f.attack || !f.attack.connected || TIER[kind] <= TIER[f.attack.kind])) return;
    if (kind === "special") {
      if (!canUseSpecial(a.meter)) return;
      combat.setActor(f.id, { meter: 0 });
      stats.specials++;
    }
    if (kind === "throw") stats.throws++;
    if (kind === "heavy") stats.heavies++;
    combat.beginAttack(f.id, moveAgainst(kind, f.def, foe.def));
    f.attack = { kind, connected: false };
    progressed = true;
    refresh();
  };
  const drive = (f: Fighter, foe: Fighter, intent: Intent): void => {
    const a = actor(f.id);
    const ko = a?.knockedOut ?? false, stunned = (a?.stun ?? 0) > 0, busy = f.attack !== null && attacking(f);
    f.crouch = intent.crouch && !stunned && !busy && f.body.grounded && !ko;
    f.guard = intent.guard && !stunned && !busy && !ko;
    const foeDir = facingTo(f, foe), dist = Math.abs(foe.body.position[0] - f.body.position[0]);
    const toward = intent.axis * foeDir > 0;
    const canMove = !ko && !stunned && !busy && !f.crouch && !f.guard;
    f.body.move(canMove && !(toward && dist <= MIN_SEP + 0.04) ? intent.axis : 0);
    if (!ko && !stunned && !busy && !f.guard && !f.crouch && intent.jump && f.body.grounded) { f.body.jump(); stats.jumps++; }
    if (!ko && !stunned && !f.guard && intent.dash !== 0 && f.dashT <= 0 && !(intent.dash * foeDir > 0 && dist <= MIN_SEP + 0.22)) {
      f.dashT = 0.34; f.body.dash([intent.dash, 0, 0], f.def.stats.dashSpeed); stats.dashes++;
    }
    f.dashT = Math.max(0, f.dashT - DT);
    if (!ko && !stunned && !f.guard && intent.attack) tryAttack(f, foe, intent.attack);
  };

  let phase: Phase = "fight", phaseT = 0, timer = ROUND_SECONDS, pips = { p1: 0, cpu: 0 }, roundWinner: "p1" | "cpu" | "draw" = "draw";
  let resultAt = -1, clock = 0, sinceProgress = 0, maxStall = 0, firstStrikeRangeAt = -1;
  const bouts: Array<{ stage: StageId; p1Won: boolean; p1Hits: number; cpuHits: number }> = [];
  const stages: StageId[] = [stage];
  const resultHolds: number[] = [];
  let boutHits = { p1: 0, cpu: 0 };
  newBout(fighterById("kenji"), fighterById("volt"));

  const endRound = (winner: "p1" | "cpu" | "draw"): void => {
    const award = awardRound(pips, winner);
    pips = { p1: award.p1, cpu: award.cpu };
    phaseT = 0;
    if (award.boutOver) {
      phase = "boutEnd";
      bouts.push({ stage, p1Won: award.p1Won, p1Hits: boutHits.p1, cpuHits: boutHits.cpu });
    } else phase = "roundEnd";
    progressed = true;
  };

  for (let tick = 0; tick < Math.round(seconds / DT); tick++) {
    clock += DT;
    if (phase === "ko") { phaseT += DT; if (phaseT > KO_HOLD_SECONDS) endRound(roundWinner); }
    else if (phase === "roundEnd") {
      phaseT += DT;
      if (phaseT > ROUND_END_SECONDS) {
        addActors();
        P1.body.position = [...PLAYER_START]; CPU.body.position = [...RIVAL_START];
        P1.body.velocity = [0, 0, 0]; CPU.body.velocity = [0, 0, 0];
        P1.attack = null; CPU.attack = null; timer = ROUND_SECONDS; phase = "fight"; progressed = true;
      }
    } else if (phase === "boutEnd") {
      phaseT += DT;
      if (phaseT * 1000 >= BOUT_RESULT_DELAY_MS) { phase = "result"; phaseT = 0; resultAt = clock; progressed = true; }
    } else if (phase === "result") {
      phaseT += DT;
      // showResultCard → scheduleAutoplayAdvance: the card's primary action ("NEXT BOUT") after AUTOPLAY_RESULT_MS.
      if (phaseT * 1000 >= AUTOPLAY_RESULT_MS) {
        resultHolds.push(clock - resultAt);
        stage = nextAutoplayStage(stage);
        stages.push(stage);
        newBout(P1.def, randomCpu(P1.def.id));
        phase = "fight"; phaseT = 0; timer = ROUND_SECONDS; pips = { p1: 0, cpu: 0 }; boutHits = { p1: 0, cpu: 0 };
        progressed = true;
      }
    } else {
      timer -= DT;
      if (timer <= 0) {
        const p = actor("player"), c = actor("rival");
        endRound(timeUpWinner((p?.health ?? 0) / P1.def.stats.maxHealth, (c?.health ?? 0) / CPU.def.stats.maxHealth));
      }
    }

    if (phase === "fight" || phase === "ko" || phase === "roundEnd") {
      refresh();
      const pIntent = P1.brain.think(ctx(P1, CPU), DT);
      const cIntent = CPU.brain.think(ctx(CPU, P1), DT);
      drive(P1, CPU, pIntent);
      drive(CPU, P1, cIntent);
      P1.body.update(DT); CPU.body.update(DT);
      separate(); refresh(); syncActors();
      combat.update(DT); refresh();
      for (const ev of combat.consumeEvents()) {
        const attacker = ev.attackerId === "player" ? P1 : CPU;
        const target = ev.targetId === "player" ? P1 : ev.targetId === "rival" ? CPU : undefined;
        if (ev.type === "hit" && target) {
          progressed = true;
          if (attacker.attack) attacker.attack.connected = true;
          if (ev.knockback) target.body.applyKnockback([ev.knockback[0] * 3.0, Math.abs(ev.knockback[1]) * 2.4, 0]);
          combat.setActor(target.id, { meter: Math.min(METER_MAX, (actor(target.id)?.meter ?? 0) + (ev.damage ?? 0) * 0.45 * target.def.stats.meterGain) });
          if (attacker.side === "p1") { stats.p1Hits++; boutHits.p1++; } else { stats.cpuHits++; boutHits.cpu++; }
        }
        if (ev.type === "blocked" && target) { progressed = true; stats.blocks++; if (attacker.attack) attacker.attack.connected = true; }
        if (ev.type === "knockout" && ev.targetId && phase === "fight") {
          phase = "ko"; phaseT = 0; roundWinner = ev.targetId === "player" ? "cpu" : "p1"; progressed = true;
        }
      }
      refresh();
      for (const f of [P1, CPU]) {
        const a = actor(f.id);
        if (a && Math.abs(a.position[0] - f.body.position[0]) > 0.001) f.body.position = [a.position[0], f.body.position[1], a.position[2]];
      }
      separate(); syncActors(); refresh();
      if (firstStrikeRangeAt < 0 && Math.abs(CPU.body.position[0] - P1.body.position[0]) <= 2.25) firstStrikeRangeAt = clock;
    }
    sinceProgress = progressed ? 0 : sinceProgress + DT;
    progressed = false;
    maxStall = Math.max(maxStall, sinceProgress);
  }
  return { stats, bouts, stages, resultHolds, maxStall, firstStrikeRangeAt };
}

describe("iron crown autoplay: URL switches, toggle key, venue tour", () => {
  it("?autoplay=1, the ?autopilot=1 alias and the original ?demo=1 all turn autoplay on", () => {
    expect(autoplayRequested(new URLSearchParams("?autoplay=1"))).toBe(true);
    expect(autoplayRequested(new URLSearchParams("?autopilot=1"))).toBe(true);
    expect(autoplayRequested(new URLSearchParams("?demo=1"))).toBe(true);
    expect(autoplayRequested(new URLSearchParams("?autoplay=0"))).toBe(false);
    expect(autoplayRequested(new URLSearchParams(""))).toBe(false);
  });

  it("O toggles autoplay and the hint names it until a fight action is bound to O", () => {
    expect(AUTOPLAY_TOGGLE_KEY).toBe("KeyO");
    expect(autoplayHint(new Set(["KeyA", "KeyJ"]))).toBe("O autoplay");
    expect(autoplayHint(new Set(["KeyO"]))).toBe("");
  });

  it("the venue tour visits all six stages and wraps", () => {
    expect(AUTOPLAY_STAGE_ORDER).toHaveLength(6);
    const seen: StageId[] = ["crown-arena"];
    for (let i = 0; i < 6; i++) seen.push(nextAutoplayStage(seen[seen.length - 1]!));
    expect(new Set(seen).size).toBe(6);
    expect(seen[6]).toBe("crown-arena");
  });
});

describe("iron crown autoplay: both fighters AI, bouts loop forever", () => {
  it("five simulated minutes: approach, strikes, blocks and specials; no 5 s stall; each result card gives way to the next venue", () => {
    const run = runAutoplay(300);
    // Approach: the fighters start 4.4 m apart and close to striking range within ~3 s.
    expect(run.firstStrikeRangeAt).toBeGreaterThan(0);
    expect(run.firstStrikeRangeAt).toBeLessThan(3);
    // Both sides fight: hits for each, blocks, heavies and SUPER specials.
    expect(run.stats.p1Hits).toBeGreaterThan(10);
    expect(run.stats.cpuHits).toBeGreaterThan(10);
    expect(run.stats.blocks).toBeGreaterThan(0);
    expect(run.stats.heavies).toBeGreaterThan(0);
    expect(run.stats.specials).toBeGreaterThan(0);
    // Never stuck: something happens at least every 5 s, including the K.O., round break and result card beats.
    expect(run.maxStall).toBeLessThan(5);
    // The loop: several bouts finish, each result card is held AUTOPLAY_RESULT_MS, then the next venue starts.
    expect(run.bouts.length).toBeGreaterThanOrEqual(2);
    expect(run.resultHolds.length).toBeGreaterThanOrEqual(2);
    for (const hold of run.resultHolds) expect(hold * 1000).toBeCloseTo(AUTOPLAY_RESULT_MS, -2);
    expect(run.stages.slice(0, 3)).toEqual(["crown-arena", nextAutoplayStage("crown-arena"), nextAutoplayStage(nextAutoplayStage("crown-arena"))]);
  }, 120_000);
});
