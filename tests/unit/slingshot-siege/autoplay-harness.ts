/**
 * Test helper: the Slingshot Siege route's autoplay flow, headless. It runs what main.ts runs (the autopilot's hooks,
 * fireShot on release, the ammo power, the shot-settled / out-of-ammo / late-topple level ends, the result card, Next
 * and Try Again) over the real Rapier-backed SiegeSim with the stage's decor colliders.
 */
import { SiegeSim } from "../../../apps/showcase-slingshot-siege/src/game/sim";
import { LEVELS } from "../../../apps/showcase-slingshot-siege/src/game/levels";
import { DECOR_COLLIDERS } from "../../../apps/showcase-slingshot-siege/src/game/decorLayout";
import { createAutopilot, launchVelocity, solveDraw } from "../../../apps/showcase-slingshot-siege/src/game/autopilot";

type Level = (typeof LEVELS)[number];
const yieldToLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

export interface AutoplayRun {
  readonly levelsPlayed: number;
  readonly results: { readonly level: number; readonly won: boolean; readonly shots: number; readonly heldS: number }[];
  readonly piecesBroken: number;
  readonly gullsSquashed: number;
  readonly shots: number;
  readonly longestIdle: number;
  readonly wrapped: boolean;
  readonly retries: number;
}

/**
 * Runs autoplay over `levels` (Next after the last wraps to the first, as the route wraps LEVELS) until `seconds` of
 * simulated time pass or `stopAfterResults` result cards have been shown.
 */
export async function runAutoplay(levels: readonly Level[], opts: { seconds: number; stopAfterResults?: number }): Promise<AutoplayRun> {
  const dt = 1 / 60;
  let idx = 0;
  let level = levels[idx]!;
  const sim = new SiegeSim({ level, seed: 0x5eed, decor: DECOR_COLLIDERS });
  const ap = createAutopilot({ planBudgetMs: Infinity });
  let shotsUsed = 0, resultOpen = false, resultWon = false, resultAt = 0, settledSinceEmpty = 0, clearedSinceSettle = 0;
  let levelsPlayed = 1, piecesBroken = 0, gullsSquashed = 0, shots = 0, wrapped = false, retries = 0;
  const results: { level: number; won: boolean; shots: number; heldS: number }[] = [];
  // "Idle" = nothing the viewer can see changes: no draw, no shot, no result, no level load.
  let lastActivity = 0, longestIdle = 0, t = 0;
  const activity = (): void => { longestIdle = Math.max(longestIdle, t - lastActivity); lastActivity = t; };
  const endLevel = (won: boolean): void => {
    if (resultOpen) return;
    resultOpen = true;
    resultWon = won;
    resultAt = t;
    results.push({ level: level.id, won, shots: shotsUsed, heldS: -1 });
    activity();
  };
  const closeResult = (): void => {
    const last = results[results.length - 1];
    if (last) last.heldS = t - resultAt;
  };
  const load = (next: Level): void => {
    level = next;
    sim.loadLevel(level);
    shotsUsed = 0; resultOpen = false; settledSinceEmpty = 0; clearedSinceSettle = 0;
    levelsPlayed += 1;
    activity();
  };
  const hooks = {
    canAim: () => !resultOpen && !sim.isShotActive() && level.ammo[shotsUsed] !== undefined,
    resultOpen: () => resultOpen,
    resultWon: () => resultWon,
    currentAmmo: () => level.ammo[shotsUsed] ?? null,
    shotActive: () => sim.isShotActive(),
    abilityUsed: () => sim.activeProjectile()?.abilityUsed ?? true,
    setDraw: () => activity(),
    release: () => {
      const ammo = level.ammo[shotsUsed];
      const sol = solveDraw(ap.pull[0], ap.pull[1]);
      if (ammo && sol.speed > 0.5 && sim.launch(ammo, sol.pouch, launchVelocity(sol))) { shotsUsed += 1; shots += 1; activity(); }
    },
    ability: () => { sim.ability(); },
    nextLevel: () => {
      closeResult();
      idx = (idx + 1) % levels.length;
      if (idx === 0) wrapped = true;
      load(levels[idx]!);
    },
    retryLevel: () => {
      closeResult();
      retries += 1;
      load(level);
    }
  };
  for (let f = 0; t < opts.seconds; f += 1) {
    t += dt;
    const phase = ap.phase;
    ap.tick(dt, sim, hooks);
    if (ap.phase !== phase) activity();
    sim.update(dt);
    for (const ev of sim.drainEvents()) {
      if (ev.kind === "piece-broke") piecesBroken += 1;
      if (ev.kind === "gull-squashed") gullsSquashed += 1;
      if (ev.kind === "shot-settled") {
        activity();
        if (sim.gullsAlive() === 0) endLevel(true);
        else if (shotsUsed >= level.ammo.length) endLevel(false);
      }
    }
    if (sim.isShotActive()) activity(); // a flying / tumbling shot is play the viewer watches
    if (!sim.isShotActive() && !resultOpen && shotsUsed >= level.ammo.length) {
      settledSinceEmpty += dt;
      if (settledSinceEmpty > 1.6) endLevel(sim.gullsAlive() === 0);
    } else settledSinceEmpty = 0;
    if (!sim.isShotActive() && !resultOpen && sim.gullList().length > 0 && sim.gullsAlive() === 0) {
      clearedSinceSettle += dt;
      if (clearedSinceSettle > 1.2) endLevel(true);
    } else clearedSinceSettle = 0;
    if (opts.stopAfterResults !== undefined && results.length >= opts.stopAfterResults) break;
    if (f % 30 === 29) await yieldToLoop();
  }
  activity();
  return { levelsPlayed, results, piecesBroken, gullsSquashed, shots, longestIdle, wrapped, retries };
}

/** Plays one level hands-free from load to its first result card. */
export async function playLevel(level: Level): Promise<{ won: boolean; shots: number }> {
  const run = await runAutoplay([level], { seconds: 120, stopAfterResults: 1 });
  const r = run.results[0];
  return { won: r?.won ?? false, shots: r?.shots ?? run.shots };
}
