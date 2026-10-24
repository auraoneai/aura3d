export interface FrameErrorInfo {
  /** Failures in a row, including this one. */
  readonly consecutive: number;
  /** Failures since the boundary was created. */
  readonly total: number;
  /** True the first time this message is seen. */
  readonly firstOfKind: boolean;
}

export interface FrameErrorBoundaryOptions {
  /** Consecutive failures that count as fatal. Default 30. */
  readonly maxConsecutive?: number;
  /** Called for every failure (default: one `console.error` per distinct message, code `FRAME_ERROR`). */
  readonly onError?: (error: unknown, info: FrameErrorInfo) => void;
  /** Called once when `maxConsecutive` is reached; show an error overlay here. */
  readonly onFatal?: (error: unknown, info: FrameErrorInfo) => void;
}

export interface FrameErrorStats {
  readonly total: number;
  readonly consecutive: number;
  readonly fatal: boolean;
  readonly lastMessage: string | null;
}

export interface FrameErrorBoundary {
  /** Runs `step`; a throw is reported and swallowed so the next frame still runs. Returns `undefined` after a throw. */
  run<T>(step: () => T): T | undefined;
  stats(): FrameErrorStats;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Keeps one throwing frame from freezing a game: a failed step is reported with its stack through a stable console code
 * (`FRAME_ERROR`), the loop carries on, and a run of consecutive failures escalates once to `onFatal`.
 */
export function createFrameErrorBoundary(options: FrameErrorBoundaryOptions = {}): FrameErrorBoundary {
  const maxConsecutive = Math.max(1, options.maxConsecutive ?? 30);
  const seen = new Set<string>();
  let total = 0;
  let consecutive = 0;
  let fatal = false;
  let lastMessage: string | null = null;
  return {
    run(step) {
      try {
        const result = step();
        consecutive = 0;
        return result;
      } catch (error) {
        total += 1;
        consecutive += 1;
        lastMessage = messageOf(error);
        const info: FrameErrorInfo = { consecutive, total, firstOfKind: !seen.has(lastMessage) };
        seen.add(lastMessage);
        if (options.onError) options.onError(error, info);
        else if (info.firstOfKind) console.error(`FRAME_ERROR: ${lastMessage}`, error instanceof Error ? error.stack : "");
        if (!fatal && consecutive >= maxConsecutive) {
          fatal = true;
          options.onFatal?.(error, info);
        }
        return undefined;
      }
    },
    stats: () => ({ total, consecutive, fatal, lastMessage })
  };
}
