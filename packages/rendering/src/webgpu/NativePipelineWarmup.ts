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
