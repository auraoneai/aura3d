// 07-TIMEOUTS — bounded mount: `app.ready()` has no internal timeout, so a
// stalled WebGL mount left every spec polling `waitForFunction` for the full
// 90 s page timeout. Racing ready() against MOUNT_TIMEOUT_MS converts the
// silent hang into an "error" status carrying performance.mark/measure
// mount-phase evidence the triage output can read.

export const MOUNT_TIMEOUT_MS = 20_000;

export interface MountTiming {
  readonly mountMs: number | null;
  readonly mountMark: string;
}

export async function mountReady(app: { ready(): Promise<unknown> }, label = "mount"): Promise<MountTiming> {
  const startMark = `${label}:start`;
  const endMark = `${label}:end`;
  performance.mark(startMark);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`MountTimeoutError: app.ready() exceeded ${MOUNT_TIMEOUT_MS} ms (${performance.now().toFixed(0)} ms)`)),
      MOUNT_TIMEOUT_MS
    );
  });
  try {
    await Promise.race([app.ready(), timeout]);
    performance.mark(endMark);
    const measure = performance.measure(`${label}:duration`, startMark, endMark);
    return { mountMs: measure.duration, mountMark: startMark };
  } catch (error) {
    performance.mark(`${label}:timeout`);
    performance.measure(`${label}:stalled`, startMark, `${label}:timeout`);
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
