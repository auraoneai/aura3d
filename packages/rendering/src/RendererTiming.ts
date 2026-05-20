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

class WebGL2GpuTimingBackend implements RendererGpuTimingBackend {
  public readonly supported = true;
  public readonly unavailableReason = "GPU timer query result pending or disjoint; using CPU timing fallback for this sample.";
  private readonly pending: WebGL2GpuTimingToken[] = [];

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly extension: EXTDisjointTimerQueryWebGL2
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
}

function requireTimingLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    throw new Error("Renderer timing sample label is required");
  }
  return trimmed;
}
