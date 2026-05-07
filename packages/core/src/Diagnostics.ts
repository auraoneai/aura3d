export type MetricKind = "counter" | "gauge" | "timing";

export interface MetricSnapshot {
  readonly kind: MetricKind;
  readonly name: string;
  readonly value: number;
  readonly samples: readonly number[];
}

export interface DiagnosticsSnapshot {
  readonly metrics: readonly MetricSnapshot[];
  readonly timestamp: number;
}

interface MutableMetric {
  kind: MetricKind;
  value: number;
  samples: number[];
}

export class Diagnostics {
  private readonly metrics = new Map<string, MutableMetric>();
  private readonly activeTimers = new Map<string, number>();

  constructor(private readonly maxHistory = 120) {}

  increment(name: string, amount = 1): void {
    const metric = this.ensure(name, "counter");
    metric.value += amount;
    this.recordSample(metric, metric.value);
  }

  gauge(name: string, value: number): void {
    const metric = this.ensure(name, "gauge");
    metric.value = value;
    this.recordSample(metric, value);
  }

  begin(name: string): void {
    if (this.activeTimers.has(name)) throw new Error(`Timer ${name} already started.`);
    this.activeTimers.set(name, performance.now());
  }

  end(name: string): number {
    const start = this.activeTimers.get(name);
    if (start === undefined) throw new Error(`Timer ${name} was not started.`);
    this.activeTimers.delete(name);
    const duration = performance.now() - start;
    const metric = this.ensure(name, "timing");
    metric.value = duration;
    this.recordSample(metric, duration);
    return duration;
  }

  snapshot(): DiagnosticsSnapshot {
    const metrics = [...this.metrics.entries()].map(([name, metric]) => Object.freeze({
      kind: metric.kind,
      name,
      value: metric.value,
      samples: Object.freeze([...metric.samples])
    }));
    return Object.freeze({ metrics: Object.freeze(metrics), timestamp: Date.now() });
  }

  private ensure(name: string, kind: MetricKind): MutableMetric {
    const existing = this.metrics.get(name);
    if (existing) {
      if (existing.kind !== kind) throw new Error(`Metric ${name} already exists as ${existing.kind}.`);
      return existing;
    }
    const metric: MutableMetric = { kind, value: 0, samples: [] };
    this.metrics.set(name, metric);
    return metric;
  }

  private recordSample(metric: MutableMetric, value: number): void {
    metric.samples.push(value);
    if (metric.samples.length > this.maxHistory) metric.samples.shift();
  }
}
