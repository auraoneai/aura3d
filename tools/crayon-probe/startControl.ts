// R-25: pure decision logic for getting a Crayon game past its title/menu and for deciding when its
// scene graph has settled. Kept free of any browser API so it is unit-testable; index.ts feeds it data.

export interface Control {
  readonly index: number;
  readonly tag: string;
  readonly text: string;
  readonly id: string;
  readonly cls: string;
  readonly role: string;
  readonly cursor: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly disabled: boolean;
}

const EXACT_START = /^\s*(tap to start|click to start|press to start|press any key|start( game)?|play( now)?|tap to play|begin)\s*[.!]?\s*$/i;
const VERB_START = /^\s*(drive|start|play|ride|fly|begin|launch|go|enter|continue|resume|new (game|run|journey)|let'?s|embark|set off|take off|race|tap|click|press)\b/i;
const CONTAINS_START = /\b(drive|start|play|begin|launch|ride|embark)\b/i;
// Menu entries that look like actions but do not begin the run.
const NOT_START = /\b(settings?|sound|audio|music|mute|records?|upgrades?|studio|tuning|routes?|credits|options|quit|exit|pause|reset|back|close|help|how to|controls|share|leaderboard)\b/i;

const isButtonish = (c: Control): boolean =>
  c.tag === "button" || c.tag === "a" || c.tag === "input" || c.tag === "summary" || c.role === "button" || c.cursor === "pointer";

/** Score a control as "begins the run"; 0 means not a candidate. */
export function startScore(c: Control): number {
  if (c.disabled || c.w < 8 || c.h < 8 || !c.text) return 0;
  const text = c.text.replace(/\s+/g, " ").trim();
  if (text.length > 48) return 0;
  if (EXACT_START.test(text)) return 100;
  if (!isButtonish(c)) return 0;
  if (NOT_START.test(text)) return 0;
  if (VERB_START.test(text)) return 80;
  if (CONTAINS_START.test(text)) return 50;
  return 0;
}

/** Highest-scoring control not yet tried; ties go to the larger, then the earlier one. */
export function chooseStartControl(controls: readonly Control[], tried: ReadonlySet<number> = new Set()): Control | null {
  let best: Control | null = null;
  let bestScore = 0;
  for (const c of controls) {
    if (tried.has(c.index)) continue;
    const score = startScore(c);
    if (score === 0) continue;
    if (!best || score > bestScore || (score === bestScore && c.w * c.h > best.w * best.h)) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

export interface Sample {
  /** ms since the wait started */
  readonly t: number;
  readonly objects: number;
  readonly renderCalls: number;
}

export type SettleCriterion = "strict" | "plateau";

export interface SettleOptions {
  /** strict: object count within `strictPct` of the latest for this long */
  readonly settleMs: number;
  readonly strictPct: number;
  /** plateau: streaming/churning worlds — count within `plateauPct` of the max over this window, scene still rendering */
  readonly plateauMs: number;
  readonly plateauPct: number;
}

export interface SettleResult {
  readonly settled: boolean;
  readonly criterion: SettleCriterion | null;
  readonly detail: string;
}

const spread = (window: readonly Sample[]): { readonly min: number; readonly max: number } => {
  let min = Infinity;
  let max = -Infinity;
  for (const s of window) {
    if (s.objects < min) min = s.objects;
    if (s.objects > max) max = s.objects;
  }
  return { min, max };
};

/**
 * Decide whether the scene graph has settled. Requires a populated scene, at least three samples in the
 * window, and (plateau only) that the renderer is still drawing so a stalled page cannot count as settled.
 */
export function settleStatus(samples: readonly Sample[], opts: SettleOptions): SettleResult {
  const last = samples[samples.length - 1];
  if (!last || last.objects <= 1) return { settled: false, criterion: null, detail: "no populated scene" };

  const inWindow = (ms: number): readonly Sample[] => samples.filter((s) => last.t - s.t <= ms);
  const strict = inWindow(opts.settleMs);
  const strictSpanOk = samples[0] !== undefined && last.t - samples[0].t >= opts.settleMs;
  if (strictSpanOk && strict.length >= 3) {
    const { min, max } = spread(strict);
    if (max - min <= Math.max(1, max) * opts.strictPct) {
      return { settled: true, criterion: "strict", detail: `objects within ${(opts.strictPct * 100).toFixed(0)}% for ${opts.settleMs} ms (${min}..${max})` };
    }
  }

  const plateau = inWindow(opts.plateauMs);
  const plateauSpanOk = samples[0] !== undefined && last.t - samples[0].t >= opts.plateauMs;
  if (plateauSpanOk && plateau.length >= 3) {
    const { min, max } = spread(plateau);
    const rendering = plateau[plateau.length - 1].renderCalls > plateau[0].renderCalls;
    if (rendering && max - min <= Math.max(1, max) * opts.plateauPct) {
      return { settled: true, criterion: "plateau", detail: `objects within ${(opts.plateauPct * 100).toFixed(0)}% of the max over ${opts.plateauMs} ms (${min}..${max}) while still rendering` };
    }
  }
  return { settled: false, criterion: null, detail: `still changing (latest ${last.objects})` };
}

/** Keep at most `limit` samples, always including the first and last, for the evidence file. */
export function downsample<T>(items: readonly T[], limit: number): readonly T[] {
  if (items.length <= limit) return items;
  const out: T[] = [];
  for (let i = 0; i < limit; i++) out.push(items[Math.round((i * (items.length - 1)) / (limit - 1))]);
  return out;
}
