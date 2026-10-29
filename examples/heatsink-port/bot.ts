/**
 * Lane-follow autopilot for tests and QA captures: drives at a capped speed, lines up with the next live target or
 * barrel ahead, dodges obstacles, stays on its side of a split, and holds the trigger when something is in reach.
 * Deterministic and pure (it only reads the race). It is not a player-facing AI; the game has no rivals.
 */
import { CFG } from "./config";
import { clamp } from "./rng";
import type { Race } from "./race";
import type { Frame } from "./track";
import { IDLE, type Input } from "./vehicle";

export interface BotOptions {
  /** cruise speed cap in m/s (the drone's top speed is CFG.vehicle.maxSpeed) */
  speed?: number;
  /** how far ahead (m) the bot looks for a target or barrel to line up with */
  lookAhead?: number;
  /** hold the trigger only when a target or barrel is within this distance ahead */
  fireRange?: number;
}

const V = CFG.vehicle;

export function createBot(opts: BotOptions = {}): (race: Race) => Input {
  const cap = clamp(opts.speed ?? 60, 5, V.maxSpeed);
  const look = opts.lookAhead ?? 220;
  const fireRange = opts.fireRange ?? 120;
  const fr: Partial<Frame> = {};
  return (race) => {
    if (race.state !== "race") return IDLE;
    const p = race.player;
    const tr = race.track;
    const f = tr.frame(p.s, fr) as Frame;
    let aimX: number | null = null;
    let aimD = Infinity;
    for (const t of race.ops.targets) {
      if (!t.alive) continue;
      const d = -tr.wrapDelta(p.s, t.s);
      if (d > 2 && d < look && d < aimD) { aimD = d; aimX = t.x; }
    }
    for (const b of race.barrels) {
      if (!b.alive) continue;
      const d = -tr.wrapDelta(p.s, b.s);
      /* a barrel the bot would ram explodes on it, so aim at the barrel only from far enough out to shoot it first */
      if (d > 25 && d < look && d < aimD) { aimD = d; aimX = b.x; }
    }
    let want = aimX ?? 0;
    const dw = tr.dividerAt(p.s);
    if (dw > 0) {
      const side = p.lane || Math.sign(p.x) || 1;
      want = side * Math.max(dw + V.halfWidth + 1.5, Math.abs(want) * (Math.sign(want) === side ? 1 : 0));
    }
    const edge = f.hw - V.halfWidth - 1.5;
    want = clamp(want, -edge, edge);
    /* sidestep obstacles in the next 70 m */
    for (let k = 0; k < 6; k++) {
      if (!tr.hitObstacle(tr.wrap(p.s + 15 + k * 11), want, V.halfLength, V.halfWidth + 1.2)) continue;
      want = clamp(want + (want > p.x ? 8 : -8), -edge, edge);
    }
    /* barrels close ahead on the bot's line: step around them instead of ramming */
    for (const b of race.barrels) {
      if (!b.alive) continue;
      const d = -tr.wrapDelta(p.s, b.s);
      if (d > 0 && d < 25 && Math.abs(b.x - want) < 5) want = clamp(b.x + (want >= b.x ? 6 : -6), -edge, edge);
    }
    const speed01 = clamp(p.v / V.maxSpeed, 0, 1);
    const rate = V.steerLow + (V.steerHigh - V.steerLow) * speed01;
    const ff = (f.kappa * p.v) / rate;
    /* heading wanted toward the line, limited so the drone never meets a wall at the crash angle */
    const headWant = clamp((want - p.x) * 0.035, -0.22, 0.22);
    const steer = clamp(ff + (headWant - p.theta) * 3 + (headWant - p.phi) * 1.5, -1, 1);
    const throttle = p.v > cap + 2 ? 0 : cap / V.maxSpeed;
    const fire = aimD < fireRange && !p.gunLocked && p.gunHeat < 0.9;
    return { ...IDLE, throttle, brake: p.v > cap + 8 ? 0.4 : 0, steer, fire };
  };
}

/** run a full race with the bot (or until `maxSteps`), returning the race */
export function runBotRace(race: Race, opts: BotOptions & { maxSteps?: number } = {}, frame = 1 / 60): Race {
  const bot = createBot(opts);
  const max = opts.maxSteps ?? 60 * 900;
  for (let i = 0; i < max && !race.resultsOpen; i++) race.frame(frame, bot(race));
  return race;
}
