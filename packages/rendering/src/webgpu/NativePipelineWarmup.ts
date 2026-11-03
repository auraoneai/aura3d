/**
 * WebGPU has no cancellation primitive for an already issued pipeline compile.
 * Keep one warmup compile in flight per native device, even after its caller
 * aborts, so abandoned driver promises cannot create an unbounded backlog.
 */
const deviceTails = new WeakMap<object, Promise<void>>();

function abortReason(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error("Pipeline warmup was aborted");
  error.name = "AbortError";
  return error;
}

export function assertWarmupActive(signals: readonly (AbortSignal | undefined)[]): void {
  const aborted = signals.find((signal) => signal?.aborted);
  if (aborted) throw abortReason(aborted);
}

/** Detach an aborted waiter while still observing the underlying promise. */
export function waitForWarmup<T>(pending: Promise<T>, signals: readonly (AbortSignal | undefined)[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const liveSignals = signals.filter((signal): signal is AbortSignal => signal !== undefined);
    let settled = false;
    const cleanup = (): void => { for (const signal of liveSignals) signal.removeEventListener("abort", onAbort); };
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = (): void => {
      const signal = liveSignals.find((entry) => entry.aborted);
      if (signal) finish(() => reject(abortReason(signal)));
    };
    for (const signal of liveSignals) signal.addEventListener("abort", onAbort, { once: true });
    void pending.then((value) => finish(() => resolve(value)), (error: unknown) => finish(() => reject(error)));
    onAbort();
  });
}

/** Serialize render and compute warmup work on the same native device. */
export async function enqueueNativePipelineWarmup<T>(
  device: object,
  create: () => T | Promise<T>,
  signals: readonly (AbortSignal | undefined)[]
): Promise<T> {
  assertWarmupActive(signals);
  const previous = deviceTails.get(device) ?? Promise.resolve();
  let release!: () => void;
  const reserved = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => reserved);
  deviceTails.set(device, tail);
  void tail.then(() => { if (deviceTails.get(device) === tail) deviceTails.delete(device); });
  let issued = false;
  try {
    await waitForWarmup(previous, signals);
    assertWarmupActive(signals);
    const compilation = Promise.resolve().then(() => {
      assertWarmupActive(signals);
      return create();
    });
    issued = true;
    // Do not release the device slot merely because the waiter cancelled.
    void compilation.then(release, release);
    return await waitForWarmup(compilation, signals);
  } finally {
    if (!issued) release();
  }
}

/** One speculative pipeline variant: identity, cache probe, creation and publication. */
export interface NativePipelineWarmupJob<T> {
  /** Cache identity of the variant (target, layout and convention dependent). */
  readonly key: string;
  /** True when the destination cache already holds this identity. */
  isCached(): boolean;
  /** Issue the native compile (prefer the async entry point). */
  create(): T | Promise<T>;
  /** Store a compiled variant in the cache the draw/dispatch path reads. */
  publish(value: T): void;
}

export interface NativePipelineWarmupOutcome {
  /** Variants compiled and published by this call. */
  readonly created: number;
  /** Variants already present in the destination cache. */
  readonly cached: number;
  /** Variants whose speculative creation failed; the draw path keeps its own errors. */
  readonly skipped: number;
}

/**
 * Warm a set of pipeline variants through the per-device serialized compile
 * slot. `assertCurrent` must throw once the owning device generation is lost
 * or disposed: no variant compiled for a stale generation is ever published.
 * Cancellation stops further creation and rejects with the signal's reason
 * (an `AbortError` when the reason is not an Error). Render and compute
 * variants share the per-device slot, so one signal coordinates both.
 */
export async function warmNativePipelineVariants<T>(
  device: object,
  jobs: readonly NativePipelineWarmupJob<T>[],
  options: {
    readonly signals: readonly (AbortSignal | undefined)[];
    readonly assertCurrent: () => void;
    /** Speculative (default) warmups skip a failed variant; explicit ones reject with its error. */
    readonly speculative?: boolean;
  }
): Promise<NativePipelineWarmupOutcome> {
  const { signals, assertCurrent, speculative = true } = options;
  let created = 0, cached = 0, skipped = 0;
  const seen = new Set<string>();
  for (const job of jobs) {
    assertWarmupActive(signals);
    assertCurrent();
    if (seen.has(job.key)) continue;
    seen.add(job.key);
    if (job.isCached()) { cached += 1; continue; }
    let value: T;
    try {
      value = await enqueueNativePipelineWarmup(device, () => {
        assertCurrent();
        return job.create();
      }, signals);
    } catch (error) {
      // Cancellation and generation loss are terminal; a rejected speculative
      // compile is not (the real draw/dispatch reports its own error).
      assertWarmupActive(signals);
      assertCurrent();
      if (!speculative) throw error;
      skipped += 1;
      continue;
    }
    assertWarmupActive(signals);
    assertCurrent();
    if (!job.isCached()) { job.publish(value); created += 1; } else cached += 1;
  }
  return { created, cached, skipped };
}
