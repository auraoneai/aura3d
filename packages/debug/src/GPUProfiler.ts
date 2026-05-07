export interface GPUProfilerSnapshot {
  readonly supported: boolean;
  readonly sampleCount: number;
  readonly samples: readonly GPUSample[];
  readonly unavailableReason?: string;
}

export interface GPUSample {
  readonly label: string;
  readonly durationMs: number;
}

export interface GPUProfilerTimer {
  end(durationMs?: number): GPUSample;
}

export class GPUProfiler {
  private readonly samples: GPUSample[] = [];

  constructor(
    private readonly supported = false,
    private readonly unavailableReason = "GPU timing extension unavailable"
  ) {}

  begin(label: string): GPUProfilerTimer {
    const trimmed = label.trim();
    if (trimmed.length === 0) {
      throw new Error("GPU profiler sample label is required");
    }
    const start = performance.now();
    return {
      end: (durationMs = performance.now() - start) => {
        const sample = { label: trimmed, durationMs };
        this.samples.push(sample);
        return sample;
      }
    };
  }

  snapshot(): GPUProfilerSnapshot {
    return {
      supported: this.supported,
      sampleCount: this.samples.length,
      samples: [...this.samples],
      ...(this.supported ? {} : { unavailableReason: this.unavailableReason })
    };
  }
}
