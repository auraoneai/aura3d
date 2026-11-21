/**
 * Autoplay (`?autoplay=1`, alias `?autopilot=1`; the O key toggles it): the computer plays the kid hands-free through the
 * game's normal input path (it only builds the same `StepInput` the keyboard builds, so the sim and its recorded-reference
 * replay are untouched). It plays like a decent human: steers between rocks and logs toward spirit orbs, roasts and low
 * sky pearls, jumps the gaps, boulders and tail swipes, plants the staff at every gorge and power-launches at its far end,
 * bonks diving pteranodons and the tyrant's bites (which starts the rock-paper-scissors duel), keeps right of the tyrant,
 * vaults the river, kicks off the cliff wall and rides the sky cloud whenever it is charged. Around the run it leaves the
 * title after a beat, waits on the result card ~3 s and starts the next run, looping forever.
 */
import { createAutoplayHarness } from "@aura3d/engine/game";
import type { Game } from "./game";
import { IDLE, OBSTACLE_REACH, worldLayout, type StepInput } from "./sim";
import { BOULDER_RADIUS } from "./encounters";

/** Seconds on the title before the run starts, and on the result card before the next run. */
export const AUTOPLAY_TITLE_SECONDS = 1.2;
export const AUTOPLAY_RESULT_SECONDS = 3;

const LANES = [-4.6, -3.8, -3, -2.2, -1.4, -0.7, 0, 0.7, 1.4, 2.2, 3, 3.8, 4.6];

export interface Autopilot {
  on: boolean;
  /** The input the computer gives this frame (IDLE when off or not playing). */
  input(game: Game): StepInput;
  /** Phase handling outside play: leave the title, and start the next run from the result card (a pause stays a pause). */
  tick(game: Game, dt: number): void;
}

export function createAutopilot(on = false): Autopilot {
  let menuT = 0, jumpCooldown = 0, poleCooldown = 0, gliderCooldown = 0;
  let currentGame: Game | null = null;
  const harness = createAutoplayHarness({
    enabled: on,
    isFinished: () => currentGame?.phase === "result",
    restartDelay: AUTOPLAY_RESULT_SECONDS,
    onRestart: () => currentGame?.retry()
  });
  return {
    get on() { return harness.enabled; },
    set on(value: boolean) {
      harness.enabled = value;
      if (!value) menuT = 0;
    },
    tick(game, dt) {
      currentGame = game;
      if (!harness.enabled) { menuT = 0; harness.reset(); return; }
      if (game.phase === "menu") { menuT += dt; if (menuT >= AUTOPLAY_TITLE_SECONDS) { menuT = 0; game.start(0); } }
      else menuT = 0;
      harness.tick(dt);
    },
    input(game) {
      if (!harness.enabled || game.phase !== "playing") return IDLE;
      const s = game.state, ch = game.chapter, enc = game.enc, n = s.glider;
      const dt = 1 / 60;
      jumpCooldown = Math.max(0, jumpCooldown - dt); poleCooldown = Math.max(0, poleCooldown - dt); gliderCooldown = Math.max(0, gliderCooldown - dt);
      const riding = n.active || n.call > 0;
      const grounded = s.jump < 0.03 && s.jumpVelocity <= 0;
      let jump = false, pole = false, glider = false;
      const ahead = (at: number, lo: number, hi: number): boolean => at - s.s > lo && at - s.s < hi;

      /* ---- lane choice: clear of rocks / logs, right of the tyrant, toward the nearest orb, roast or low pearl ---- */
      const obstacles = worldLayout(ch).obstacles.filter((o) => !s.crashed.has(o.id) && ahead(o.s, -1.5, 34));
      const trexZone = ch.creatures.some((c) => c.type === "trex" && s.s > c.s - 30 && s.s < (c.until ?? 0) + 4);
      const goals: { lane: number; w: number }[] = [];
      for (const o of game.orbs) if (!s.collected.has(o.id) && ahead(o.s, 0, 22)) goals.push({ lane: o.lane, w: 1.2 * (1 - (o.s - s.s) / 26) });
      for (const m of ch.meat) if (!s.eaten.has(m.s) && ahead(m.s, 0, 40)) goals.push({ lane: m.lane, w: 4 });
      for (const b of ch.balls) if (!s.balls.includes(b.star) && b.height < 2.5 && ahead(b.s, 0, 45)) goals.push({ lane: b.lane, w: 6 });
      let best = s.lane, bestCost = Infinity;
      for (const lane of LANES) {
        let cost = Math.abs(lane - s.lane) * 0.15 + Math.abs(lane) * 0.02;
        for (const o of obstacles) {
          const reach = (o.type === "log" ? OBSTACLE_REACH.log : OBSTACLE_REACH.rock) + 0.55;
          if (Math.abs(lane - o.lane) < reach) cost += 40 * (1 - Math.max(0, o.s - s.s) / 40);
        }
        if (trexZone && lane < 0.6) cost += 30;
        for (const d of enc.dives) if (d.target !== null && !d.passed && !d.hit && Math.abs(lane - d.target) < 2.4) cost += 12;
        for (const g of goals) if (Math.abs(lane - g.lane) < 1.1) cost -= g.w;
        if (cost < bestCost) { bestCost = cost; best = lane; }
      }
      const diff = best - s.lane;
      const steer = Math.abs(diff) < 0.12 ? 0 : Math.max(-1, Math.min(1, diff * 1.6));

      /* ---- jumps: gaps, boulders, tail swipes, high sky pearls, an obstacle still in the way, the cliff wall ---- */
      if (!riding && grounded && jumpCooldown <= 0) {
        const gap = ch.gaps.some((g) => ahead(g.start, 0.6, 2.8));
        const boulder = enc.boulders.some((b) => !b.passed && ahead(b.s, 5, 6.6) && Math.abs(s.lane - enc.boulderLane(b, b.s)) < BOULDER_RADIUS + 1.2);
        const swipe = !!enc.trex && enc.trex.attacks.some((a) => a.kind === "swipe" && !a.done && ahead(a.s, 2.2, 3.8));
        const pearl = ch.balls.some((b) => !s.balls.includes(b.star) && b.height >= 2.5 && ahead(b.s, 7, 8.4) && Math.abs(s.lane - b.lane) < 1.6);
        const blocked = obstacles.some((o) => ahead(o.s, 2.2, 3.6) && Math.abs(s.lane - o.lane) < (o.type === "log" ? OBSTACLE_REACH.log : OBSTACLE_REACH.rock) + 0.2);
        const wall = ch.walls.some((w) => s.s > w.start + 4 && s.s < w.end - 8) && !obstacles.some((o) => ahead(o.s, 0, 18));
        if (gap || boulder || swipe || pearl || blocked || wall) { jump = true; jumpCooldown = wall && !(gap || boulder || swipe || pearl || blocked) ? 1.4 : 0.35; }
      }

      /* ---- the staff: plant before every gorge, power-launch at its far end, bonk attackers, vault the river ---- */
      if (!riding && poleCooldown <= 0 && s.poleTimer <= 0) {
        const gorge = ch.poles.find((p) => ahead(p.start, 4, 30) && s.pole?.start !== p.start);
        const dive = enc.dives.some((d) => !d.passed && !d.hit && ahead(d.s, 3, 6.5));
        const bite = !!enc.trex && s.s >= enc.trex.stunnedUntil && enc.trex.attacks.some((a) => a.kind === "bite" && !a.done && ahead(a.s, 3, 6.5));
        const river = ch.waters.some((w) => s.s > w.start + 2 && s.s < w.end - 18) && grounded && !ch.poles.some((p) => ahead(p.start, -2, 50));
        if (gorge || dive || bite || river) { pole = true; poleCooldown = river && !(gorge || dive || bite) ? 1.1 : 0.3; }
      }
      if (s.pole && !s.launchQueued && s.pole.end - s.s < 5.2 && s.pole.end - s.s > 1) jump = true;
      if (riding && enc.dives.some((d) => !d.passed && !d.hit && ahead(d.s, 3, 6.5))) pole = true;

      /* ---- the sky cloud, whenever it is charged and allowed ---- */
      if (!riding && gliderCooldown <= 0 && n.charge >= 1 && n.ready && !n.blocked) { glider = true; gliderCooldown = 2; }

      return { steer, jump, pole, glider, brake: false };
    }
  };
}
