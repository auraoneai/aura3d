export type RendererTimingSampleSource = "gpu" | "cpu-fallback";

export interface RendererTimingSample {
  readonly label: string;
  readonly durationMs: number;
  readonly cpuDurationMs: number;
  readonly gpuDurationMs?: number;
  readonly source: RendererTimingSampleSource;
  readonly fallbackReason?: string;
}

export interface RendererTimingSnapshot {
  readonly gpuTimingSupported: boolean;
  readonly cpuFallbackActive: boolean;
  readonly sampleCount: number;
  readonly unavailableReason?: string;
  readonly samples: readonly RendererTimingSample[];
}

export interface RendererGpuTimingToken {
  readonly label: string;
}

export interface RendererGpuTimingBackend {
  readonly supported: boolean;
  readonly unavailableReason?: string;
  begin(label: string): RendererGpuTimingToken;
  end(token: RendererGpuTimingToken, cpuDurationMs: number): number | undefined;
  collectAvailable?(): readonly RendererGpuTimingResult[];
  /** Tokens which will not produce a GPU result, such as disjoint queries. */
  drainDiscarded?(): readonly RendererGpuTimingToken[];
  /** Release query resources owned by this backend. */
  dispose?(): void;
}

export interface RendererGpuTimingResult {
  readonly label: string;
  readonly durationMs: number;
  /** Backends should return the original token to distinguish repeated labels. */
  readonly token?: RendererGpuTimingToken;
}

/**
 * C-28 (PRD 11 Phase 0) — scoped GPU timing. A scoped backend brackets
 * arbitrary work with GPU timestamp queries (`queryCounter`), so several
 * scopes may overlap a frame (`TIME_ELAPSED_EXT` queries cannot nest). Results
 * land 2-3 frames later and are attributed back to their token by `poll()`.
 */
export interface RendererGpuScopedTimingBackend extends RendererGpuTimingBackend {
  beginScope(name: string): RendererGpuTimingToken;
  endScope(token: RendererGpuTimingToken): void;
  /** Drains settled scope/frame tokens. `durationMs: null` = settled but discarded (disjoint). */
  poll(): readonly RendererGpuScopedResult[];
  /** Observe settled queries without advancing the query-expiry generation. */
  pollWithoutAging?(): readonly RendererGpuScopedResult[];
}

export interface RendererGpuScopedResult {
  readonly token: RendererGpuTimingToken;
  readonly label: string;
  readonly durationMs: number | null;
}

export function isScopedGpuTimingBackend(backend: RendererGpuTimingBackend | undefined | null): backend is RendererGpuScopedTimingBackend {
  return Boolean(backend && typeof (backend as RendererGpuScopedTimingBackend).beginScope === "function"
    && typeof (backend as RendererGpuScopedTimingBackend).endScope === "function"
    && typeof (backend as RendererGpuScopedTimingBackend).poll === "function");
}

export interface RendererTimingCollectorOptions {
  readonly gpuBackend?: RendererGpuTimingBackend;
  readonly now?: () => number;
  readonly fallbackReason?: string;
}

export class RendererTimingCollector {
  private readonly samples: RendererTimingSample[] = [];
  private readonly gpuBackend: RendererGpuTimingBackend;
  private readonly now: () => number;
  private readonly fallbackReason: string;
  private readonly pendingGpuSamples = new Map<RendererGpuTimingToken, number>();

  constructor(options: RendererTimingCollectorOptions = {}) {
    this.gpuBackend = options.gpuBackend ?? createCpuFallbackGpuTimingBackend(options.fallbackReason);
    this.now = options.now ?? (() => performance.now());
    this.fallbackReason = options.fallbackReason ?? this.gpuBackend.unavailableReason ?? "GPU timing unavailable; using CPU timing fallback.";
  }

  measure<T>(label: string, callback: () => T): T {
    const timer = this.begin(label);
    try {
      return callback();
    } finally {
      timer.end();
    }
  }

  begin(label: string): { end(): RendererTimingSample } {
    const trimmed = requireTimingLabel(label);
    const gpuToken = this.gpuBackend.begin(trimmed);
    const started = this.now();
    let ended = false;
    return {
      end: () => {
        if (ended) {
          throw new Error(`Renderer timing sample already ended: ${trimmed}`);
        }
        ended = true;
        const cpuDurationMs = Math.max(0, this.now() - started);
        const gpuDurationMs = this.gpuBackend.end(gpuToken, cpuDurationMs);
        const sample = this.createSample(trimmed, cpuDurationMs, gpuDurationMs);
        const sampleIndex = this.samples.push(sample) - 1;
        if (this.gpuBackend.supported && gpuDurationMs === undefined) {
          this.pendingGpuSamples.set(gpuToken, sampleIndex);
          // Some external backends never report cancelled tokens. Bound the
          // attribution state without changing the retained sample history.
          if (this.pendingGpuSamples.size > WEBGL2_GPU_TIMING_MAX_PENDING * 2) {
            this.pendingGpuSamples.delete(this.pendingGpuSamples.keys().next().value!);
          }
        }
        return sample;
      }
    };
  }

  snapshot(): RendererTimingSnapshot {
    this.collectAvailableGpuResults();
    const cpuFallbackActive = this.samples.some((sample) => sample.source === "cpu-fallback");
    return {
      gpuTimingSupported: this.gpuBackend.supported,
      cpuFallbackActive,
      sampleCount: this.samples.length,
      ...(this.gpuBackend.supported && !cpuFallbackActive ? {} : { unavailableReason: this.fallbackReason }),
      samples: [...this.samples]
    };
  }

  private createSample(label: string, cpuDurationMs: number, gpuDurationMs: number | undefined): RendererTimingSample {
    if (this.gpuBackend.supported && gpuDurationMs !== undefined && Number.isFinite(gpuDurationMs) && gpuDurationMs >= 0) {
      return {
        label,
        durationMs: Number(gpuDurationMs.toFixed(3)),
        cpuDurationMs: Number(cpuDurationMs.toFixed(3)),
        gpuDurationMs: Number(gpuDurationMs.toFixed(3)),
        source: "gpu"
      };
    }
    return {
      label,
      durationMs: Number(cpuDurationMs.toFixed(3)),
      cpuDurationMs: Number(cpuDurationMs.toFixed(3)),
      source: "cpu-fallback",
      fallbackReason: this.fallbackReason
    };
  }

  private collectAvailableGpuResults(): void {
    const results = this.gpuBackend.collectAvailable?.() ?? [];
    for (const result of results) {
      const sampleIndex = result.token
        ? this.pendingGpuSamples.get(result.token) ?? -1
        : this.samples.findIndex((sample) => sample.label === result.label && sample.source === "cpu-fallback");
      if (sampleIndex < 0) {
        continue;
      }
      if (result.token) this.pendingGpuSamples.delete(result.token);
      else {
        // Preserve the existing label-only backend contract while ensuring a
        // later token-bearing result cannot update the same sample twice.
        for (const [token, index] of this.pendingGpuSamples) {
          if (index === sampleIndex) this.pendingGpuSamples.delete(token);
        }
      }
      if (!Number.isFinite(result.durationMs) || result.durationMs < 0) continue;
      const existing = this.samples[sampleIndex]!;
      if (existing.source !== "cpu-fallback") continue;
      this.samples[sampleIndex] = {
        label: existing.label,
        durationMs: Number(result.durationMs.toFixed(3)),
        cpuDurationMs: existing.cpuDurationMs,
        gpuDurationMs: Number(result.durationMs.toFixed(3)),
        source: "gpu"
      };
    }
    for (const token of this.gpuBackend.drainDiscarded?.() ?? []) this.pendingGpuSamples.delete(token);
  }
}

export function createCpuFallbackGpuTimingBackend(
  unavailableReason = "GPU timing unavailable; using CPU timing fallback."
): RendererGpuTimingBackend {
  return {
    supported: false,
    unavailableReason,
    begin(label: string): RendererGpuTimingToken {
      return { label: requireTimingLabel(label) };
    },
    end(_token: RendererGpuTimingToken, _cpuDurationMs: number): number | undefined {
      return undefined;
    }
  };
}

export function createImmediateGpuTimingBackend(durationMs: number): RendererGpuTimingBackend {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new RangeError("Immediate GPU timing duration must be a finite non-negative number.");
  }
  return {
    supported: true,
    begin(label: string): RendererGpuTimingToken {
      return { label: requireTimingLabel(label) };
    },
    end(_token: RendererGpuTimingToken, _cpuDurationMs: number): number {
      return durationMs;
    }
  };
}

export function createWebGL2GpuTimingBackend(gl: WebGL2RenderingContext): RendererGpuTimingBackend {
  const extension = gl.getExtension("EXT_disjoint_timer_query_webgl2") as EXTDisjointTimerQueryWebGL2 | null;
  if (!extension) {
    return createCpuFallbackGpuTimingBackend("EXT_disjoint_timer_query_webgl2 unavailable; using CPU timing fallback.");
  }
  return new WebGL2GpuTimingBackend(gl, extension);
}

interface EXTDisjointTimerQueryWebGL2 {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

interface WebGL2GpuTimingToken extends RendererGpuTimingToken {
  readonly query: WebGLQuery | null;
  /** `poll`/`collectAvailable` generation at which the query was issued. */
  readonly issuedAt: number;
}

interface EXTDisjointTimerQueryWebGL2Full extends EXTDisjointTimerQueryWebGL2 {
  readonly TIMESTAMP_EXT?: number;
  readonly QUERY_COUNTER_BITS_EXT?: number;
  /** Extension-object method: stamps `query` with the current GPU timestamp. */
  queryCounterEXT?(query: WebGLQuery, target: number): void;
}

interface WebGL2GpuScopeToken extends RendererGpuTimingToken {
  readonly queryStart: WebGLQuery | null;
  readonly queryEnd: WebGLQuery | null;
  /** TIME_ELAPSED fallback query (outermost scope only) when timestamps are unsupported. */
  readonly elapsed: WebGLQuery | null;
  readonly issuedAt: number;
}

/** `QUERY_COUNTER_BITS_EXT` per the EXT_disjoint_timer_query_webgl2 spec. */
const QUERY_COUNTER_BITS_EXT_DEFAULT = 0x8864;

/**
 * T11-TIMING (PRD-16 T0-35): a query that has not settled after this many
 * `poll()`/`collectAvailable()` generations (one per frame) is deleted and
 * settled as discarded. Real GPUs answer in 2-3 frames; this bounds the
 * pending lists when a driver never answers.
 */
export const WEBGL2_GPU_TIMING_MAX_PENDING_GENERATIONS = 8;

/** Hard cap on in-flight tokens per list; the oldest is discarded beyond it. */
export const WEBGL2_GPU_TIMING_MAX_PENDING = 64;

class WebGL2GpuTimingBackend implements RendererGpuScopedTimingBackend {
  public readonly supported = true;
  public readonly unavailableReason = "GPU timer query result pending or disjoint; using CPU timing fallback for this sample.";
  private readonly pending: WebGL2GpuTimingToken[] = [];
  private readonly pendingScopes: WebGL2GpuScopeToken[] = [];
  private readonly activeFrames = new Set<WebGL2GpuTimingToken>();
  private readonly activeScopes = new Set<WebGL2GpuScopeToken>();
  private readonly disjointFrames = new WeakSet<WebGL2GpuTimingToken>();
  private readonly disjointScopes = new WeakSet<WebGL2GpuScopeToken>();
  private readonly discardedFrames: WebGL2GpuTimingToken[] = [];
  private readonly discardedScopes: WebGL2GpuScopeToken[] = [];
  private disposed = false;
  private timestampSupport: boolean | null = null;
  /** True while a TIME_ELAPSED query is open (they cannot nest). */
  private elapsedActive = false;
  private generation = 0;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly extension: EXTDisjointTimerQueryWebGL2Full
  ) {}

  /** Test/diagnostic read: in-flight whole-frame and scope tokens. */
  pendingCounts(): { readonly frames: number; readonly scopes: number } {
    return { frames: this.pending.length, scopes: this.pendingScopes.length };
  }

  begin(label: string): WebGL2GpuTimingToken {
    this.assertAlive();
    const name = requireTimingLabel(label);
    if (this.elapsedActive) {
      return { label: name, query: null, issuedAt: this.generation };
    }
    const query = this.gl.createQuery();
    if (query) {
      try {
        this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query);
        this.elapsedActive = true;
      } catch (error) {
        this.deleteQueries([query]);
        throw error;
      }
    }
    const token = { label: name, query, issuedAt: this.generation };
    if (query) this.activeFrames.add(token);
    return token;
  }

  end(token: RendererGpuTimingToken, _cpuDurationMs: number): number | undefined {
    const query = (token as WebGL2GpuTimingToken).query;
    if (!query) {
      this.rememberDiscarded(this.discardedFrames, token as WebGL2GpuTimingToken);
      return undefined;
    }
    if (this.disposed || !this.activeFrames.delete(token as WebGL2GpuTimingToken)) return undefined;
    try {
      this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    } catch {
      this.elapsedActive = false;
      this.deleteQueries([query]);
      this.rememberDiscarded(this.discardedFrames, token as WebGL2GpuTimingToken);
      return undefined;
    }
    this.elapsedActive = false;
    if (this.disjointFrames.has(token as WebGL2GpuTimingToken)) {
      this.deleteQueries([query]);
      this.rememberDiscarded(this.discardedFrames, token as WebGL2GpuTimingToken);
      return undefined;
    }
    this.pending.push(token as WebGL2GpuTimingToken);
    this.enforceCap(this.pending, (entry) => {
      this.deleteQueries([entry.query]);
      this.rememberDiscarded(this.discardedFrames, entry);
    });
    return undefined;
  }

  collectAvailable(): readonly RendererGpuTimingResult[] {
    if (this.disposed) return [];
    this.generation += 1;
    const disjoint = this.readDisjoint();
    const results: RendererGpuTimingResult[] = [];
    let write = 0;
    for (let read = 0; read < this.pending.length; read += 1) {
      const token = this.pending[read]!;
      const result = this.readQueryIfAvailable(token, disjoint);
      if (!result.done) {
        this.pending[write++] = token;
        continue;
      }
      if (result.durationMs !== undefined && Number.isFinite(result.durationMs) && result.durationMs >= 0) {
        results.push({ label: token.label, durationMs: result.durationMs, token });
      } else this.rememberDiscarded(this.discardedFrames, token);
    }
    this.pending.length = write;
    return results;
  }

  drainDiscarded(): readonly RendererGpuTimingToken[] {
    return this.discardedFrames.splice(0);
  }

  private readQueryIfAvailable(token: WebGL2GpuTimingToken, disjoint: boolean): { readonly done: boolean; readonly durationMs?: number } {
    const query = token.query;
    if (!query) {
      return { done: true };
    }
    if (disjoint || this.expired(token.issuedAt)) {
      this.gl.deleteQuery(query);
      return { done: true };
    }
    const available = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE) as boolean;
    if (!available) {
      return { done: false };
    }
    const elapsedNanoseconds = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT) as number;
    this.gl.deleteQuery(query);
    return { done: true, durationMs: elapsedNanoseconds / 1_000_000 };
  }

  /**
   * T11-TIMING: timestamps are usable only when the extension exposes
   * `queryCounterEXT` and `getQuery(TIMESTAMP_EXT, QUERY_COUNTER_BITS_EXT) > 0`.
   * Browsers that disable timestamps report 0 bits; issuing `queryCounterEXT`
   * then yields queries that never settle. Checked once per backend.
   */
  private timestampsSupported(): boolean {
    if (this.timestampSupport !== null) return this.timestampSupport;
    const timestampExt = this.extension.TIMESTAMP_EXT;
    let supported = false;
    if (typeof this.extension.queryCounterEXT === "function" && timestampExt !== undefined) {
      try {
        const getQuery = (this.gl as { getQuery?: (target: number, pname: number) => unknown }).getQuery;
        const bits = typeof getQuery === "function"
          ? getQuery.call(this.gl, timestampExt, this.extension.QUERY_COUNTER_BITS_EXT ?? QUERY_COUNTER_BITS_EXT_DEFAULT)
          : 0;
        supported = typeof bits === "number" && bits > 0;
      } catch {
        supported = false;
      }
    }
    this.timestampSupport = supported;
    return supported;
  }

  /**
   * C-28 scope timing: a TIMESTAMP_EXT query pair (`queryCounterEXT` is a
   * method on the extension object). `beginScope` stamps the start; `endScope`
   * stamps the end and queues the token for `poll()`. Without usable
   * timestamps the outermost open scope (the whole-frame scope) falls back to
   * one TIME_ELAPSED query; nested scopes carry no queries and settle with
   * `durationMs: null`.
   */
  beginScope(name: string): WebGL2GpuScopeToken {
    this.assertAlive();
    const label = requireTimingLabel(name);
    if (this.timestampsSupported()) {
      const queryStart = this.gl.createQuery();
      if (queryStart) {
        try {
          this.extension.queryCounterEXT!(queryStart, this.extension.TIMESTAMP_EXT as number);
        } catch (error) {
          this.deleteQueries([queryStart]);
          throw error;
        }
      }
      const token = { label, queryStart, queryEnd: null, elapsed: null, issuedAt: this.generation };
      this.activeScopes.add(token);
      return token;
    }
    let elapsed: WebGLQuery | null = null;
    if (!this.elapsedActive) {
      elapsed = this.gl.createQuery();
      if (elapsed) {
        try {
          this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, elapsed);
          this.elapsedActive = true;
        } catch (error) {
          this.deleteQueries([elapsed]);
          throw error;
        }
      }
    }
    const token = { label, queryStart: null, queryEnd: null, elapsed, issuedAt: this.generation };
    this.activeScopes.add(token);
    return token;
  }

  endScope(token: RendererGpuTimingToken): void {
    const scope = token as WebGL2GpuScopeToken;
    if (this.disposed || !this.activeScopes.delete(scope)) return;
    try {
      if (scope.queryStart) {
        const queryEnd = this.gl.createQuery();
        (scope as { queryEnd: WebGLQuery | null }).queryEnd = queryEnd;
        if (queryEnd) {
          this.extension.queryCounterEXT?.(queryEnd, this.extension.TIMESTAMP_EXT as number);
        }
      } else if (scope.elapsed) {
        this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
        this.elapsedActive = false;
      }
    } catch (error) {
      if (scope.elapsed) this.elapsedActive = false;
      this.deleteQueries([scope.queryStart, scope.queryEnd, scope.elapsed]);
      throw error;
    }
    if (this.disjointScopes.has(scope)) {
      this.deleteQueries([scope.queryStart, scope.queryEnd, scope.elapsed]);
      this.rememberDiscarded(this.discardedScopes, scope);
      return;
    }
    this.pendingScopes.push(scope);
    this.enforceCap(this.pendingScopes, (entry) => {
      this.deleteQueries([entry.queryStart, entry.queryEnd, entry.elapsed]);
      this.rememberDiscarded(this.discardedScopes, entry);
    });
  }

  poll(): readonly RendererGpuScopedResult[] {
    if (!this.disposed) this.generation += 1;
    return this.pollScopes();
  }

  pollWithoutAging(): readonly RendererGpuScopedResult[] {
    return this.pollScopes();
  }

  private pollScopes(): readonly RendererGpuScopedResult[] {
    if (this.disposed) {
      return this.discardedScopes.splice(0).map((token) => ({ token, label: token.label, durationMs: null }));
    }
    const disjoint = this.readDisjoint();
    const results: RendererGpuScopedResult[] = this.discardedScopes.splice(0)
      .map((token) => ({ token, label: token.label, durationMs: null }));
    let write = 0;
    for (let read = 0; read < this.pendingScopes.length; read += 1) {
      const token = this.pendingScopes[read]!;
      const settled = this.readScopeIfAvailable(token, disjoint);
      if (!settled.done) {
        this.pendingScopes[write++] = token;
        continue;
      }
      results.push({ token, label: token.label, durationMs: settled.durationMs ?? null });
    }
    this.pendingScopes.length = write;
    return results;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.elapsedActive) {
      try { this.gl.endQuery(this.extension.TIME_ELAPSED_EXT); } catch { /* Context loss may already have ended the query. */ }
      this.elapsedActive = false;
    }
    for (const token of [...this.activeFrames, ...this.pending]) {
      this.deleteQueries([token.query]);
      this.rememberDiscarded(this.discardedFrames, token);
    }
    for (const token of [...this.activeScopes, ...this.pendingScopes]) {
      this.deleteQueries([token.queryStart, token.queryEnd, token.elapsed]);
      this.rememberDiscarded(this.discardedScopes, token);
    }
    this.activeFrames.clear();
    this.activeScopes.clear();
    this.pending.length = 0;
    this.pendingScopes.length = 0;
  }

  private readScopeIfAvailable(token: WebGL2GpuScopeToken, disjoint: boolean): { readonly done: boolean; readonly durationMs?: number } {
    const { queryStart, queryEnd, elapsed } = token;
    if (!elapsed && (!queryStart || !queryEnd)) {
      this.deleteQueries([queryStart, queryEnd]);
      return { done: true };
    }
    if (disjoint || this.expired(token.issuedAt)) {
      this.deleteQueries([queryStart, queryEnd, elapsed]);
      return { done: true };
    }
    if (elapsed) {
      if (!(this.gl.getQueryParameter(elapsed, this.gl.QUERY_RESULT_AVAILABLE) as boolean)) {
        return { done: false };
      }
      const elapsedNs = this.gl.getQueryParameter(elapsed, this.gl.QUERY_RESULT) as number;
      this.deleteQueries([elapsed]);
      return Number.isFinite(elapsedNs) && elapsedNs >= 0
        ? { done: true, durationMs: elapsedNs / 1_000_000 }
        : { done: true };
    }
    const startAvailable = this.gl.getQueryParameter(queryStart!, this.gl.QUERY_RESULT_AVAILABLE) as boolean;
    const endAvailable = this.gl.getQueryParameter(queryEnd!, this.gl.QUERY_RESULT_AVAILABLE) as boolean;
    if (!startAvailable || !endAvailable) {
      return { done: false };
    }
    const startNs = this.gl.getQueryParameter(queryStart!, this.gl.QUERY_RESULT) as number;
    const endNs = this.gl.getQueryParameter(queryEnd!, this.gl.QUERY_RESULT) as number;
    this.deleteQueries([queryStart, queryEnd]);
    return Number.isFinite(startNs) && Number.isFinite(endNs) && startNs >= 0 && endNs >= startNs
      ? { done: true, durationMs: (endNs - startNs) / 1_000_000 }
      : { done: true };
  }

  /** A disjoint event invalidates both result queues and queries still open. */
  private readDisjoint(): boolean {
    const disjoint = Boolean(this.gl.getParameter(this.extension.GPU_DISJOINT_EXT));
    if (!disjoint) return false;
    for (const token of this.activeFrames) this.disjointFrames.add(token);
    for (const token of this.activeScopes) this.disjointScopes.add(token);
    for (const token of this.pending) {
      this.deleteQueries([token.query]);
      this.rememberDiscarded(this.discardedFrames, token);
    }
    for (const token of this.pendingScopes) {
      this.deleteQueries([token.queryStart, token.queryEnd, token.elapsed]);
      this.rememberDiscarded(this.discardedScopes, token);
    }
    this.pending.length = 0;
    this.pendingScopes.length = 0;
    return true;
  }

  private expired(issuedAt: number): boolean {
    return this.generation - issuedAt > WEBGL2_GPU_TIMING_MAX_PENDING_GENERATIONS;
  }

  private enforceCap<T>(list: T[], discard: (entry: T) => void): void {
    while (list.length > WEBGL2_GPU_TIMING_MAX_PENDING) {
      discard(list.shift()!);
    }
  }

  private deleteQueries(queries: readonly (WebGLQuery | null)[]): void {
    for (const query of queries) {
      if (query) {
        try { this.gl.deleteQuery(query); } catch { /* Context loss invalidates query handles. */ }
      }
    }
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("GPU timing backend is disposed.");
  }

  private rememberDiscarded<T>(list: T[], value: T): void {
    list.push(value);
    if (list.length > WEBGL2_GPU_TIMING_MAX_PENDING) list.shift();
  }
}

function requireTimingLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    throw new Error("Renderer timing sample label is required");
  }
  return trimmed;
}
