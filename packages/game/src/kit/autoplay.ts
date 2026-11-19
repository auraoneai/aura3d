/**
 * Hands-free autoplay kit: one URL reader every game shares (`?autoplay=1` and its aliases) and a small harness that
 * feeds a per-game bot and owns the results-hold-then-restart loop. Extracted from the 30 live games, where each one
 * carried its own `autoplayRequested` copy and results timer. DOM-free, so unit tests drive it against the real sim.
 */

/**
 * URL parameters that switch hands-free play on, in every game: `autoplay` (canonical), `autopilot` (alias) and `demo`
 * (the older name). Pass `names` to {@link readAutoplayFlag} to narrow or widen the set for one game.
 */
export const AUTOPLAY_FLAG_NAMES = Object.freeze(["autoplay", "autopilot", "demo"] as const);

/** A query string (`location.search`, with or without `?`) or anything with `URLSearchParams.get`. */
export type AutoplayFlagSource = string | { get(name: string): string | null };

export interface ReadAutoplayFlagOptions {
  /** Parameter names to read. Default {@link AUTOPLAY_FLAG_NAMES}. */
  readonly names?: readonly string[];
}

/**
 * True when the page asked for hands-free play. A listed parameter turns it on when present with any value except
 * `"0"` or `"false"` (case-insensitive), so `?autoplay=1`, `?autoplay=true`, `?demo` and `?demo=yes` are on and
 * `?autoplay=0` is off. Any listed name being on is enough.
 *
 * @param source Query string or `URLSearchParams`; defaults to `location.search` (empty outside a browser).
 * @example
 * ```ts
 * import { readAutoplayFlag } from "@aura3d/engine/game";
 * let autopilot = readAutoplayFlag(location.search);
 * ```
 */
export function readAutoplayFlag(source?: AutoplayFlagSource, options: ReadAutoplayFlagOptions = {}): boolean {
  const resolved = source ?? (typeof location === "undefined" ? "" : location.search);
  const params = typeof resolved === "string" ? new URLSearchParams(resolved) : resolved;
  for (const name of options.names ?? AUTOPLAY_FLAG_NAMES) {
    const value = params.get(name);
    if (value === null) continue;
    const v = value.trim().toLowerCase();
    if (v !== "0" && v !== "false") return true;
  }
  return false;
}

/** The game-specific player: returns this fixed step's input (keys, intents, actions) the way a human's input arrives. */
export interface AutoplayBot<I> {
  step(dt: number): I;
}

export interface AutoplayHarnessOptions<I> {
  /** The game's bot. Omit when the game only needs the restart loop (its own pilot feeds the input path). */
  readonly bot?: AutoplayBot<I>;
  /** True while a finished run's results are showing (won, lost, full time). The hold only counts while this is true. */
  readonly isFinished: () => boolean;
  /** Seconds the results stay up before the next run starts. Default 3. */
  readonly restartDelay?: number;
  /** Start the next run (the page's normal Play Again path). Called once each time the hold elapses. */
  readonly onRestart?: () => void;
  /** Input returned by `step` while the harness is disabled or has no bot. */
  readonly idle?: I;
  /** Start enabled. Default true. */
  readonly enabled?: boolean;
  /**
   * Also publish `diag()` as a read-only global (for example `"__AUTOPLAY__"`) for QA scripts. Games with their own
   * QA hook object should fold `diag()` into it instead.
   */
  readonly exposeAs?: string;
}

/** What QA reads: whether autoplay is on, how many runs it has started, and how long the current results have shown. */
export interface AutoplayDiag {
  readonly enabled: boolean;
  /** Runs played so far: 1 for the first run, +1 per restart. */
  readonly runs: number;
  readonly restarts: number;
  /** Seconds the current finished run's results have been held (0 while a run is in play). */
  readonly holdSeconds: number;
  readonly restartDelay: number;
}

export interface AutoplayHarness<I> {
  /** Toggle from the game's key (P or O); turning it off clears the hold. */
  enabled: boolean;
  /** Flip `enabled` and return the new value. */
  toggle(): boolean;
  /** This step's bot input while enabled, `idle` otherwise. Does not advance the results hold. */
  step(dt: number): I | undefined;
  /**
   * Advance the results hold by `dt` (render or step seconds, whichever the game timed its card with). Returns true on
   * the call where the hold reaches `restartDelay`: `onRestart` has just run and the hold is cleared. Disabled: false.
   */
  tick(dt: number): boolean;
  /** Clear the hold (the game restarted or left the results by itself). */
  reset(): void;
  readonly runs: number;
  readonly holdSeconds: number;
  diag(): AutoplayDiag;
  /** Remove the `exposeAs` global, if any. */
  dispose(): void;
}

/**
 * The hands-free loop every game repeats: feed the bot through the normal input path, and once a run is finished hold
 * the results for `restartDelay` seconds, then start the next run, forever. The bot stays in the game; the harness never
 * touches the simulation, so replays and determinism are unchanged.
 *
 * @example
 * ```ts
 * const autoplay = createAutoplayHarness({
 *   bot: { step: () => botInput(race) },
 *   isFinished: () => race.resultsOpen,
 *   onRestart: () => begin()
 * });
 * // fixed step: race.frame(STEP, autopilot ? autoplay.step(STEP)! : keys());
 * // frame: if (autopilot) autoplay.tick(frameDt);
 * ```
 */
export function createAutoplayHarness<I = void>(options: AutoplayHarnessOptions<I>): AutoplayHarness<I> {
  const restartDelay = options.restartDelay ?? 3;
  if (!(restartDelay >= 0)) throw new RangeError("createAutoplayHarness: restartDelay must be >= 0");
  let enabled = options.enabled ?? true;
  let held = 0;
  let restarts = 0;

  const harness: AutoplayHarness<I> = {
    get enabled() {
      return enabled;
    },
    set enabled(value: boolean) {
      enabled = value;
      if (!value) held = 0;
    },
    toggle() {
      harness.enabled = !enabled;
      return enabled;
    },
    step(dt) {
      if (!enabled || !options.bot) return options.idle;
      return options.bot.step(dt);
    },
    tick(dt) {
      if (!enabled) return false;
      if (!options.isFinished()) {
        held = 0;
        return false;
      }
      held += dt;
      if (held < restartDelay) return false;
      held = 0;
      restarts += 1;
      options.onRestart?.();
      return true;
    },
    reset() {
      held = 0;
    },
    get runs() {
      return restarts + 1;
    },
    get holdSeconds() {
      return held;
    },
    diag() {
      return { enabled, runs: restarts + 1, restarts, holdSeconds: held, restartDelay };
    },
    dispose() {
      if (options.exposeAs && typeof globalThis !== "undefined") delete (globalThis as Record<string, unknown>)[options.exposeAs];
    }
  };

  if (options.exposeAs) {
    Object.defineProperty(globalThis, options.exposeAs, { configurable: true, enumerable: false, get: () => harness.diag() });
  }
  return harness;
}
