import { normalizePromptAnimationTime, type PromptAnimationSeconds } from "./PromptAnimationContract.js";

export type RenderProgressStatus = "idle" | "running" | "cancelled" | "completed" | "failed";

export interface RenderProgressSnapshot {
  readonly status: RenderProgressStatus;
  readonly totalFrames: number;
  readonly completedFrames: number;
  readonly currentFrame?: number | undefined;
  readonly currentTime?: PromptAnimationSeconds | undefined;
  readonly progress: number;
  readonly startedAtMs?: number | undefined;
  readonly updatedAtMs?: number | undefined;
  readonly elapsedMs: number;
  readonly estimatedRemainingMs?: number | undefined;
  readonly averageFrameMs?: number | undefined;
  readonly cancelled: boolean;
  readonly message?: string | undefined;
}

export interface RenderProgressTracker {
  readonly totalFrames: number;
  start(message?: string): RenderProgressSnapshot;
  advance(input?: RenderProgressAdvanceInput): RenderProgressSnapshot;
  complete(message?: string): RenderProgressSnapshot;
  cancel(message?: string): RenderProgressSnapshot;
  fail(message: string): RenderProgressSnapshot;
  snapshot(): RenderProgressSnapshot;
  onProgress(listener: (snapshot: RenderProgressSnapshot) => void): () => void;
}

export interface RenderProgressAdvanceInput {
  readonly frame?: number | undefined;
  readonly time?: PromptAnimationSeconds | undefined;
  readonly completedFrames?: number | undefined;
  readonly message?: string | undefined;
}

export interface CreateRenderProgressTrackerOptions {
  readonly totalFrames: number;
  readonly now?: (() => number) | undefined;
}

export function createRenderProgressTracker(options: CreateRenderProgressTrackerOptions): RenderProgressTracker {
  const totalFrames = Math.max(0, Math.floor(options.totalFrames));
  const now = options.now ?? defaultNow;
  const listeners = new Set<(snapshot: RenderProgressSnapshot) => void>();
  let status: RenderProgressStatus = "idle";
  let completedFrames = 0;
  let currentFrame: number | undefined;
  let currentTime: PromptAnimationSeconds | undefined;
  let startedAtMs: number | undefined;
  let updatedAtMs: number | undefined;
  let message: string | undefined;

  const publish = (): RenderProgressSnapshot => {
    const snapshot = createProgressSnapshot({
      status,
      totalFrames,
      completedFrames,
      currentFrame,
      currentTime,
      startedAtMs,
      updatedAtMs,
      message
    });
    for (const listener of listeners) listener(snapshot);
    return snapshot;
  };

  return {
    totalFrames,
    start(nextMessage) {
      status = "running";
      completedFrames = 0;
      currentFrame = undefined;
      currentTime = undefined;
      startedAtMs = now();
      updatedAtMs = startedAtMs;
      message = nextMessage;
      return publish();
    },
    advance(input = {}) {
      if (status === "idle") {
        status = "running";
        startedAtMs = now();
      }
      if (status === "cancelled" || status === "failed" || status === "completed") return publish();
      completedFrames = Math.min(totalFrames, Math.max(0, input.completedFrames ?? completedFrames + 1));
      currentFrame = input.frame ?? currentFrame;
      currentTime = input.time === undefined ? currentTime : normalizePromptAnimationTime(input.time);
      updatedAtMs = now();
      message = input.message ?? message;
      return publish();
    },
    complete(nextMessage) {
      status = "completed";
      completedFrames = totalFrames;
      updatedAtMs = now();
      message = nextMessage ?? message;
      return publish();
    },
    cancel(nextMessage) {
      status = "cancelled";
      updatedAtMs = now();
      message = nextMessage ?? "Render cancelled.";
      return publish();
    },
    fail(nextMessage) {
      status = "failed";
      updatedAtMs = now();
      message = nextMessage;
      return publish();
    },
    snapshot: publish,
    onProgress(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

export function createProgressSnapshot(input: {
  readonly status: RenderProgressStatus;
  readonly totalFrames: number;
  readonly completedFrames: number;
  readonly currentFrame?: number | undefined;
  readonly currentTime?: PromptAnimationSeconds | undefined;
  readonly startedAtMs?: number | undefined;
  readonly updatedAtMs?: number | undefined;
  readonly message?: string | undefined;
}): RenderProgressSnapshot {
  const elapsedMs =
    input.startedAtMs === undefined || input.updatedAtMs === undefined ? 0 : Math.max(0, input.updatedAtMs - input.startedAtMs);
  const progress = input.totalFrames === 0 ? (input.status === "completed" ? 1 : 0) : input.completedFrames / input.totalFrames;
  const averageFrameMs = input.completedFrames > 0 ? elapsedMs / input.completedFrames : undefined;
  const estimatedRemainingMs =
    averageFrameMs === undefined || input.status !== "running"
      ? undefined
      : Math.max(0, (input.totalFrames - input.completedFrames) * averageFrameMs);
  return {
    status: input.status,
    totalFrames: input.totalFrames,
    completedFrames: input.completedFrames,
    ...(input.currentFrame !== undefined ? { currentFrame: input.currentFrame } : {}),
    ...(input.currentTime !== undefined ? { currentTime: input.currentTime } : {}),
    progress: Math.max(0, Math.min(1, progress)),
    ...(input.startedAtMs !== undefined ? { startedAtMs: input.startedAtMs } : {}),
    ...(input.updatedAtMs !== undefined ? { updatedAtMs: input.updatedAtMs } : {}),
    elapsedMs,
    ...(estimatedRemainingMs !== undefined ? { estimatedRemainingMs } : {}),
    ...(averageFrameMs !== undefined ? { averageFrameMs } : {}),
    cancelled: input.status === "cancelled",
    ...(input.message ? { message: input.message } : {})
  };
}

function defaultNow(): number {
  return typeof globalThis.performance === "undefined" ? Date.now() : globalThis.performance.now();
}
