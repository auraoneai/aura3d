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
  /** Lazy section loaders; imported only when evidence is opted in. Either an
   * async loader returning the section map, or the section map itself (each
   * value is still a lazy getter evaluated per read). */
  readonly sections?:
    | (() => Promise<Readonly<Record<string, EvidenceSectionCollect>>>)
    | Readonly<Record<string, EvidenceSectionCollect>>;
  /** Legacy window aliases must not use the game beacon or evidence globals. */
  readonly legacyGlobals?: readonly string[];
}

export interface EvidenceChannelInstall {
  readonly id: string;
  /** Built-in sections (session/capture/perf) — same lazy gating as route sections. */
  readonly builtins: Readonly<Record<string, EvidenceSectionCollect>>;
  /** Route-provided lazy loader (from `createGame({ evidence })`). */
  readonly loader?: () => Promise<Readonly<Record<string, EvidenceSectionCollect>>>;
  /** Aliases (e.g. "__BANK_SHOT_EVIDENCE__") bound to the same evidence object.
   * `__AURA3D_GAME__`, `__AURA3D_GAME_EVIDENCE__`, and `__AURA3D_EVIDENCE_OPT_IN__`
   * are reserved for explicit and ambient window targets. Without one the channel is inert. */
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

interface EvidencePropertyOwner {
  readonly target: Record<string, unknown>;
  readonly name: string;
  readonly descriptor: PropertyDescriptor & { get: () => unknown; set: (value: unknown) => void };
  readonly previous: PropertyDescriptor | undefined;
  active: boolean;
}

const evidencePropertyOwners = new WeakMap<() => unknown, EvidencePropertyOwner>();

function installEvidenceProperty(
  target: Record<string, unknown>,
  name: string,
  descriptor: EvidencePropertyOwner["descriptor"]
): () => void {
  const owner: EvidencePropertyOwner = {
    target,
    name,
    descriptor,
    previous: Object.getOwnPropertyDescriptor(target, name),
    active: true
  };
  Object.defineProperty(target, name, descriptor);
  evidencePropertyOwners.set(descriptor.get, owner);
  return () => {
    if (!owner.active) return;
    owner.active = false;
    const current = Object.getOwnPropertyDescriptor(target, name);
    if (
      current?.get !== descriptor.get ||
      current.set !== descriptor.set ||
      current.enumerable !== descriptor.enumerable ||
      current.configurable !== descriptor.configurable
    ) return;
    let previous = owner.previous;
    while (previous?.get !== undefined) {
      const earlier = evidencePropertyOwners.get(previous.get);
      if (
        earlier === undefined || earlier.active || earlier.target !== target || earlier.name !== name ||
        earlier.descriptor.set !== previous.set ||
        earlier.descriptor.enumerable !== previous.enumerable ||
        earlier.descriptor.configurable !== previous.configurable
      ) break;
      previous = earlier.previous;
    }
    if (previous === undefined) delete target[name];
    else Object.defineProperty(target, name, previous);
  };
}

export function installEvidenceChannel(options: EvidenceChannelInstall): { dispose(): void } {
  const win = (options.win ??
    (typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : undefined)) as
    | (Record<string, unknown> & EvidenceGlobal)
    | undefined;
  if (win === undefined) return { dispose() {} };

  const aliases = new Set(options.legacyGlobals ?? []);
  for (const alias of aliases) {
    // Beacon and channel ownership are independent; shadowing the beacon can
    // resurrect a disposed session when this channel restores its descriptor.
    if (alias === "__AURA3D_GAME__") {
      throw new Error('EVIDENCE_CHANNEL_RESERVED_ALIAS_V1: "__AURA3D_GAME__" is reserved for the game beacon.');
    }
    if (alias === "__AURA3D_GAME_EVIDENCE__" || alias === "__AURA3D_EVIDENCE_OPT_IN__") {
      throw new Error(`EVIDENCE_CHANNEL_RESERVED_ALIAS_V1: "${alias}" is reserved for the evidence channel.`);
    }
  }

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
  // Route-published evidence (`__AURA3D_GAME_EVIDENCE__[id] = { get x() {...} }`,
  // the v2 routes' publish*Evidence). Kept for the channel's lifetime: it used
  // to live only as a 250 ms memo, after which the next collect replaced it
  // with the shell-only snapshot, so route sections vanished for every reader.
  let routeOwned: Record<string, unknown> | null = null;
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
    const value: Record<string, unknown> = {};
    // Copy descriptors, not values: route getters stay lazy (read-time only).
    if (routeOwned !== null) Object.defineProperties(value, Object.getOwnPropertyDescriptors(routeOwned));
    Object.assign(value, { id: options.id, collectedAt: now, optIn: optedIn });
    if (routeOwned === null || !("sections" in routeOwned)) value.sections = sections;
    memo = { at: now, value };
    return value;
  };

  const setRouteOwned = (value: unknown): void => {
    routeOwned = value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
    memo = null;
  };
  const releases: Array<() => void> = [];
  try {
    releases.push(installEvidenceProperty(registry, options.id, {
      configurable: true,
      enumerable: true,
      get: () => build(),
    // Strict-mode `window.x = ...` writes must not throw. An assigned object
    // is the route's own evidence: every later collect layers id/collectedAt/
    // optIn (and the shell sections) over its properties instead of dropping it.
      set: setRouteOwned
    }));

    for (const alias of aliases) {
      releases.push(installEvidenceProperty(win, alias, {
        configurable: true,
        enumerable: false,
        get: () => build(),
      // Legacy code assigns `window.x = ...` before the channel is read; a
      // getter-only property throws in strict mode. Forward the assignment to
      // the underlying registry slot and flag the write path.
        set: (value: unknown) => {
          if (typeof console !== "undefined") {
            console.warn(`[aura3d] legacy global "${alias}" assigned — route it through the evidence channel instead.`);
          }
          setRouteOwned(value);
        }
      }));
    }
  } catch (error) {
    for (let i = releases.length - 1; i >= 0; i -= 1) releases[i]!();
    throw error;
  }

  return {
    dispose() {
      for (let i = releases.length - 1; i >= 0; i -= 1) releases[i]!();
    }
  };
}
