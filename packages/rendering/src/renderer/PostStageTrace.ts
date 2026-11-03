/** A recorded operation, emitted only after it ran or failed. */
export interface PostStageTraceEvent {
  readonly name: string;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  readonly drawCalls: number | null;
  readonly cpuTimeMs: number | null;
  readonly gpuTimeMs: number | null;
  readonly status: "completed" | "failed";
}

export interface PostStageTraceSnapshot {
  readonly frameNumber: number;
  readonly passes: readonly PostStageTraceEvent[];
  /** True only after finish and if the caller reported no unobserved phases. */
  readonly complete: boolean;
}

export interface PostStageTraceDescriptor {
  readonly name: string;
  /** Omit when resources cannot be identified; the frame is then partial. */
  readonly reads?: readonly string[];
  readonly writes?: readonly string[];
  /** Actual per-frame device counter. Omit when the operation bypasses it. */
  readonly readDrawCalls?: () => number;
}

interface TraceFrame {
  readonly frameNumber: number;
  readonly passes: PostStageTraceEvent[];
  closed: boolean;
  incomplete: boolean;
}

/**
 * Instance-owned trace. A renderer creates one per device/renderer and passes
 * its frame session to the post driver. It has no global active-frame state.
 */
export class PostStageTrace {
  private frame: TraceFrame | null = null;
  private disposed = false;

  constructor(private readonly now: () => number = defaultNow) {}

  beginFrame(frameNumber: number): PostStageTraceSession {
    if (this.disposed) throw new Error("Cannot begin a frame on a disposed post-stage trace.");
    if (!Number.isSafeInteger(frameNumber) || frameNumber < 0) throw new Error("Frame number must be a non-negative safe integer.");
    if (this.frame && !this.frame.closed) {
      this.frame.incomplete = true;
      this.frame.closed = true;
    }
    const frame: TraceFrame = { frameNumber, passes: [], closed: false, incomplete: false };
    this.frame = frame;
    return new PostStageTraceSession(frame, () => !this.disposed && this.frame === frame, this.now);
  }

  snapshot(): PostStageTraceSnapshot | null {
    return this.frame ? copySnapshot(this.frame) : null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frame) {
      this.frame.incomplete = true;
      this.frame.closed = true;
    }
    this.frame = null;
  }
}

/** A token for one frame. Late records cannot be attached to a newer frame. */
export class PostStageTraceSession {
  /** @internal Obtain a session from PostStageTrace.beginFrame. */
  constructor(
    private readonly frame: TraceFrame,
    private readonly isCurrent: () => boolean,
    private readonly now: () => number
  ) {}

  record(event: PostStageTraceEvent): boolean {
    if (!this.active()) return false;
    if (!validEvent(event)) {
      this.frame.incomplete = true;
      return false;
    }
    this.frame.passes.push(copyEvent(event));
    return true;
  }

  markIncomplete(): void {
    if (this.active()) this.frame.incomplete = true;
  }

  /** Measure one synchronous operation; any original operation error is rethrown. */
  measure<T>(descriptor: PostStageTraceDescriptor, execute: () => T): T {
    const start = safeRead(this.now);
    const drawsBefore = readCounter(descriptor.readDrawCalls);
    let result: T;
    try {
      result = execute();
    } catch (error) {
      this.tryRecordMeasured(descriptor, start, drawsBefore, "failed");
      throw error;
    }
    this.tryRecordMeasured(descriptor, start, drawsBefore, "completed");
    return result;
  }

  /** Async work may finish after a new frame; such a late event is discarded. */
  async measureAsync<T>(descriptor: PostStageTraceDescriptor, execute: () => Promise<T>): Promise<T> {
    const start = safeRead(this.now);
    const drawsBefore = readCounter(descriptor.readDrawCalls);
    let result: T;
    try {
      result = await execute();
    } catch (error) {
      this.tryRecordMeasured(descriptor, start, drawsBefore, "failed");
      throw error;
    }
    this.tryRecordMeasured(descriptor, start, drawsBefore, "completed");
    return result;
  }

  finish(): void {
    if (this.active()) this.frame.closed = true;
  }

  snapshot(): PostStageTraceSnapshot {
    return copySnapshot(this.frame);
  }

  private active(): boolean {
    return !this.frame.closed && this.isCurrent();
  }

  private tryRecordMeasured(descriptor: PostStageTraceDescriptor, start: number | null, drawsBefore: number | null, status: "completed" | "failed"): void {
    try {
      this.recordMeasured(descriptor, start, drawsBefore, status);
    } catch {
      // Diagnostics must never replace an operation's result or original error.
      this.markIncomplete();
    }
  }

  private recordMeasured(descriptor: PostStageTraceDescriptor, start: number | null, drawsBefore: number | null, status: "completed" | "failed"): void {
    const end = safeRead(this.now);
    const drawsAfter = readCounter(descriptor.readDrawCalls);
    if (!descriptor.reads || !descriptor.writes) this.markIncomplete();
    this.record({
      name: descriptor.name,
      reads: descriptor.reads ?? [],
      writes: descriptor.writes ?? [],
      drawCalls: drawsBefore !== null && drawsAfter !== null && drawsAfter >= drawsBefore ? drawsAfter - drawsBefore : null,
      cpuTimeMs: start !== null && end !== null && end >= start ? end - start : null,
      gpuTimeMs: null,
      status
    });
  }
}

function copySnapshot(frame: TraceFrame): PostStageTraceSnapshot {
  return { frameNumber: frame.frameNumber, passes: frame.passes.map(copyEvent), complete: frame.closed && !frame.incomplete };
}

function copyEvent(event: PostStageTraceEvent): PostStageTraceEvent {
  return { ...event, reads: [...event.reads], writes: [...event.writes] };
}

function validEvent(event: PostStageTraceEvent): boolean {
  const validDuration = (value: number | null): boolean => value === null || Number.isFinite(value) && value >= 0;
  return typeof event.name === "string" && Boolean(event.name.trim())
    && Array.isArray(event.reads) && event.reads.every((name) => typeof name === "string" && Boolean(name.trim()))
    && Array.isArray(event.writes) && event.writes.every((name) => typeof name === "string" && Boolean(name.trim()))
    && (event.drawCalls === null || Number.isSafeInteger(event.drawCalls) && event.drawCalls >= 0)
    && validDuration(event.cpuTimeMs) && validDuration(event.gpuTimeMs)
    && (event.status === "completed" || event.status === "failed");
}

function safeRead(read: () => number): number | null {
  try {
    const value = read();
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function readCounter(read: (() => number) | undefined): number | null {
  if (!read) return null;
  const value = safeRead(read);
  return value !== null && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function defaultNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
