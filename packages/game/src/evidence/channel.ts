/**
 * evidence/channel.ts — PRD-09 day-0 (`window.__AURA3D_GAME_EVIDENCE__`).
 *
 * `window.__AURA3D_GAME_EVIDENCE__[id]` is a lazy getter object: the memoized
 * evidence snapshot (250 ms) is built only when read, and each section's
 * `collect()` runs only when the section is read — and only when the page
 * opts in via `?evidence=1` or `window.__AURA3D_EVIDENCE_OPT_IN__`. A section
 * function must never run just because frames passed (the "600 simulated
 * frames without a read" test).
 *
 * `legacyGlobals` defines window aliases bound to the same object so
 * route-local globals keep working while the fleet migrates. The built-in
 * `perf` section reads a rAF ring buffer (240 samples → p50/p95).
 */

/** A section collector — runs only when its section is read (never per frame). */
export type EvidenceSectionCollect = () => unknown;

/** Contract shape (C-24): route evidence sections load lazily by opt-in only. */
export interface EvidenceChannelContract {
  readonly schema: number;
  /** Lazy section loaders; imported only when evidence is opted in. */
  readonly sections?: () => Promise<Readonly<Record<string, EvidenceSectionCollect>>>;
  readonly legacyGlobals?: readonly string[];
}

export interface EvidenceChannelInstall {
  readonly id: string;
  /** Built-in sections (session/capture/perf) — same lazy gating as route sections. */
  readonly builtins: Readonly<Record<string, EvidenceSectionCollect>>;
  /** Route-provided lazy loader (from `createGame({ evidence })`). */
  readonly loader?: () => Promise<Readonly<Record<string, EvidenceSectionCollect>>>;
  /** Aliases (e.g. "__BANK_SHOT_EVIDENCE__") bound to the same evidence object. */
  readonly legacyGlobals?: readonly string[];
  readonly win?: Record<string, unknown>;
}

const MEMO_MS = 250;

interface EvidenceGlobal {
  __AURA3D_GAME_EVIDENCE__?: Record<string, unknown>;
  __AURA3D_EVIDENCE_OPT_IN__?: boolean;
}

const optIn = (win: EvidenceGlobal): boolean => {
  if (win.__AURA3D_EVIDENCE_OPT_IN__ === true) return true;
  try {
    if (typeof location !== "undefined") {
      return new URL(location.href).searchParams.get("evidence") === "1";
    }
  } catch {
    /* ignore */
  }
  return false;
};

/** rAF ring buffer of frame durations feeding the built-in `perf` section. */
export function createPerfRing(capacity = 240): { record(ms: number): void; summary(): { frames: number; p50: number | null; p95: number | null } } {
  const ring = new Float32Array(capacity);
  let head = 0;
  let count = 0;
  return {
    record(ms: number) {
      ring[head] = ms;
      head = (head + 1) % capacity;
      count = Math.min(count + 1, capacity);
    },
    summary() {
      const samples = [...ring.slice(0, count)].sort((a, b) => a - b);
      const pct = (p: number) => (samples.length === 0 ? null : samples[Math.min(samples.length - 1, Math.floor((p / 100) * samples.length))]);
      return { frames: count, p50: pct(50), p95: pct(95) };
    }
  };
}

export function installEvidenceChannel(options: EvidenceChannelInstall): { dispose(): void } {
  const win = (options.win ??
    (typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : undefined)) as
    | (Record<string, unknown> & EvidenceGlobal)
    | undefined;
  if (win === undefined) return { dispose() {} };

  win.__AURA3D_GAME_EVIDENCE__ = (win.__AURA3D_GAME_EVIDENCE__ ?? {}) as Record<string, unknown>;
  const registry = win.__AURA3D_GAME_EVIDENCE__;

  // Route sections resolve through the lazy loader, at most once and only on
  // an opted-in read. Built-ins share the same gating.
  let loaded: Record<string, EvidenceSectionCollect> | null = null;
  let loading: Promise<void> | null = null;
  const collectors = (): Record<string, EvidenceSectionCollect> => ({
    ...options.builtins,
    ...(loaded ?? {})
  });
  const ensureLoaded = (): void => {
    if (loaded !== null || loading !== null || options.loader === undefined) return;
    loading = options.loader().then((map) => {
      loaded = map;
      loading = null;
      memo = null; // sections changed — drop the memoized snapshot
    }).catch(() => {
      loading = null;
    });
  };

  let memo: { at: number; value: Record<string, unknown> } | null = null;
  const build = (): Record<string, unknown> => {
    const now = Date.now();
    if (memo !== null && now - memo.at < MEMO_MS) return memo.value;
    const optedIn = optIn(win);
    const sections: Record<string, unknown> = {};
    if (optedIn) {
      ensureLoaded();
      for (const [name, collect] of Object.entries(collectors())) {
        Object.defineProperty(sections, name, {
          configurable: true,
          enumerable: true,
          get: collect
        });
      }
    }
    const value: Record<string, unknown> = {
      id: options.id,
      collectedAt: now,
      optIn: optedIn,
      sections
    };
    memo = { at: now, value };
    return value;
  };

  Object.defineProperty(registry, options.id, {
    configurable: true,
    enumerable: true,
    get: build
  });

  for (const alias of options.legacyGlobals ?? []) {
    Object.defineProperty(win, alias, {
      configurable: true,
      enumerable: false,
      get: build
    });
  }

  return {
    dispose() {
      delete registry[options.id];
      for (const alias of options.legacyGlobals ?? []) {
        delete win[alias];
      }
    }
  };
}
