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
}

export interface RendererGpuTimingResult {
  readonly label: string;
  readonly durationMs: number;
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
        this.samples.push(sample);
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
    if (this.gpuBackend.supported && gpuDurationMs !== undefined && Number.isFinite(gpuDurationMs)) {
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
      const sampleIndex = this.samples.findIndex((sample) => sample.label === result.label && sample.source === "cpu-fallback");
      if (sampleIndex < 0) {
        continue;
      }
      const existing = this.samples[sampleIndex]!;
      this.samples[sampleIndex] = {
        label: existing.label,
        durationMs: Number(result.durationMs.toFixed(3)),
        cpuDurationMs: existing.cpuDurationMs,
        gpuDurationMs: Number(result.durationMs.toFixed(3)),
        source: "gpu"
      };
    }
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
}

interface EXTDisjointTimerQueryWebGL2Full extends EXTDisjointTimerQueryWebGL2 {
  readonly TIMESTAMP_EXT?: number;
  /** Extension-object method: stamps `query` with the current GPU timestamp. */
  queryCounterEXT?(query: WebGLQuery, target: number): void;
}

interface WebGL2GpuScopeToken extends RendererGpuTimingToken {
  readonly queryStart: WebGLQuery | null;
  readonly queryEnd: WebGLQuery | null;
}

class WebGL2GpuTimingBackend implements RendererGpuScopedTimingBackend {
  public readonly supported = true;
  public readonly unavailableReason = "GPU timer query result pending or disjoint; using CPU timing fallback for this sample.";
  private readonly pending: WebGL2GpuTimingToken[] = [];
  private readonly pendingScopes: WebGL2GpuScopeToken[] = [];

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly extension: EXTDisjointTimerQueryWebGL2Full
  ) {}

  begin(label: string): WebGL2GpuTimingToken {
    const query = this.gl.createQuery();
    if (query) {
      this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query);
    }
    return { label: requireTimingLabel(label), query };
  }

  end(token: RendererGpuTimingToken, _cpuDurationMs: number): number | undefined {
    const query = (token as WebGL2GpuTimingToken).query;
    if (!query) {
      return undefined;
    }
    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.pending.push(token as WebGL2GpuTimingToken);
    return undefined;
  }

  collectAvailable(): readonly RendererGpuTimingResult[] {
    const results: RendererGpuTimingResult[] = [];
    for (let index = this.pending.length - 1; index >= 0; index -= 1) {
      const token = this.pending[index]!;
      const result = this.readQueryIfAvailable(token);
      if (!result.done) {
        continue;
      }
      this.pending.splice(index, 1);
      if (result.durationMs !== undefined) {
        results.push({ label: token.label, durationMs: result.durationMs });
      }
    }
    return results.reverse();
  }

  private readQueryIfAvailable(token: WebGL2GpuTimingToken): { readonly done: boolean; readonly durationMs?: number } {
    const query = token.query;
    if (!query) {
      return { done: true };
    }
    const available = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE) as boolean;
    const disjoint = Boolean(this.gl.getParameter(this.extension.GPU_DISJOINT_EXT));
    if (!available) {
      return { done: false };
    }
    if (disjoint) {
      this.gl.deleteQuery(query);
      return { done: true };
    }
    const elapsedNanoseconds = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT) as number;
    this.gl.deleteQuery(query);
    return { done: true, durationMs: elapsedNanoseconds / 1_000_000 };
  }

  /**
   * C-28 scope timing: a TIMESTAMP_EXT query pair (`queryCounterEXT` is a
   * method on the extension object). `beginScope` stamps the start; `endScope`
   * stamps the end and queues the token for `poll()`. When `queryCounterEXT`
   * is unavailable the token carries no queries and `poll` settles it with
   * `durationMs: null`.
   */
  beginScope(name: string): WebGL2GpuScopeToken {
    const queryCounter = this.extension.queryCounterEXT?.bind(this.extension);
    const timestampExt = this.extension.TIMESTAMP_EXT;
    const queryStart = typeof queryCounter === "function" && timestampExt !== undefined ? this.gl.createQuery() : null;
    if (queryStart && queryCounter && timestampExt !== undefined) {
      queryCounter(queryStart, timestampExt);
    }
    return { label: requireTimingLabel(name), queryStart, queryEnd: null };
  }

  endScope(token: RendererGpuTimingToken): void {
    const scope = token as WebGL2GpuScopeToken;
    if (scope.queryStart) {
      const queryEnd = this.gl.createQuery();
      (scope as { queryEnd: WebGLQuery | null }).queryEnd = queryEnd;
      if (queryEnd) {
        this.extension.queryCounterEXT?.(queryEnd, this.extension.TIMESTAMP_EXT as number);
      }
    }
    this.pendingScopes.push(scope);
  }

  poll(): readonly RendererGpuScopedResult[] {
    const results: RendererGpuScopedResult[] = [];
    for (let index = this.pendingScopes.length - 1; index >= 0; index -= 1) {
      const token = this.pendingScopes[index]!;
      const settled = this.readScopeIfAvailable(token);
      if (!settled.done) {
        continue;
      }
      this.pendingScopes.splice(index, 1);
      results.push({ token, label: token.label, durationMs: settled.durationMs ?? null });
    }
    return results.reverse();
  }

  private readScopeIfAvailable(token: WebGL2GpuScopeToken): { readonly done: boolean; readonly durationMs?: number } {
    const { queryStart, queryEnd } = token;
    if (!queryStart || !queryEnd) {
      return { done: true };
    }
    const startAvailable = this.gl.getQueryParameter(queryStart, this.gl.QUERY_RESULT_AVAILABLE) as boolean;
    const endAvailable = this.gl.getQueryParameter(queryEnd, this.gl.QUERY_RESULT_AVAILABLE) as boolean;
    if (!startAvailable || !endAvailable) {
      return { done: false };
    }
    const startNs = this.gl.getQueryParameter(queryStart, this.gl.QUERY_RESULT) as number;
    const endNs = this.gl.getQueryParameter(queryEnd, this.gl.QUERY_RESULT) as number;
    const disjoint = Boolean(this.gl.getParameter(this.extension.GPU_DISJOINT_EXT));
    this.gl.deleteQuery(queryStart);
    this.gl.deleteQuery(queryEnd);
    if (disjoint) {
      return { done: true };
    }
    return { done: true, durationMs: Math.max(0, (endNs - startNs) / 1_000_000) };
  }
}

function requireTimingLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    throw new Error("Renderer timing sample label is required");
  }
  return trimmed;
}
