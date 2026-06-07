export type RenderQueuePanelItemStatus = "queued" | "running" | "done" | "failed";

export interface RenderQueuePanelItem {
  readonly id: string;
  readonly label: string;
  readonly status: RenderQueuePanelItemStatus;
  readonly progress: number;
  readonly currentFrame?: number;
  readonly totalFrames?: number;
  readonly outputPath?: string;
  readonly error?: string;
}

export interface RenderQueuePanelSnapshot {
  readonly kind: "render-queue-panel";
  readonly itemCount: number;
  readonly queuedCount: number;
  readonly runningCount: number;
  readonly doneCount: number;
  readonly failedCount: number;
  readonly progress: number;
  readonly items: readonly RenderQueuePanelItem[];
  readonly outputPaths: readonly string[];
  readonly errors: readonly string[];
}

export class RenderQueuePanel {
  private readonly items = new Map<string, RenderQueuePanelItem>();

  constructor(items: readonly RenderQueuePanelItem[] = []) {
    for (const item of items) this.upsert(item);
  }

  upsert(item: RenderQueuePanelItem): RenderQueuePanelSnapshot {
    this.items.set(item.id, sanitizeRenderQueueItem(item));
    return this.snapshot();
  }

  updateProgress(id: string, progress: number, options: {
    readonly currentFrame?: number;
    readonly totalFrames?: number;
    readonly status?: RenderQueuePanelItemStatus;
    readonly outputPath?: string;
    readonly error?: string;
  } = {}): RenderQueuePanelSnapshot {
    const existing = this.items.get(id);
    if (!existing) throw new Error(`Render queue item does not exist: ${id}`);
    return this.upsert({
      ...existing,
      progress,
      status: options.status ?? existing.status,
      currentFrame: options.currentFrame ?? existing.currentFrame,
      totalFrames: options.totalFrames ?? existing.totalFrames,
      outputPath: options.outputPath ?? existing.outputPath,
      error: options.error ?? existing.error
    });
  }

  snapshot(): RenderQueuePanelSnapshot {
    const items = [...this.items.values()].sort((a, b) => a.id.localeCompare(b.id));
    const sum = items.reduce((total, item) => total + item.progress, 0);
    return {
      kind: "render-queue-panel",
      itemCount: items.length,
      queuedCount: items.filter((item) => item.status === "queued").length,
      runningCount: items.filter((item) => item.status === "running").length,
      doneCount: items.filter((item) => item.status === "done").length,
      failedCount: items.filter((item) => item.status === "failed").length,
      progress: items.length === 0 ? 0 : sum / items.length,
      items,
      outputPaths: items.flatMap((item) => item.outputPath ? [item.outputPath] : []),
      errors: items.flatMap((item) => item.error ? [item.error] : [])
    };
  }
}

export function createRenderQueuePanel(items: readonly RenderQueuePanelItem[] = []): RenderQueuePanel {
  return new RenderQueuePanel(items);
}

function sanitizeRenderQueueItem(item: RenderQueuePanelItem): RenderQueuePanelItem {
  const progress = Number.isFinite(item.progress) ? Math.min(1, Math.max(0, item.progress)) : Number.NaN;
  if (!Number.isFinite(progress)) throw new Error("Render queue item progress must be finite.");
  if (item.currentFrame !== undefined && (!Number.isFinite(item.currentFrame) || item.currentFrame < 0)) {
    throw new Error("Render queue currentFrame must be a non-negative finite number.");
  }
  if (item.totalFrames !== undefined && (!Number.isFinite(item.totalFrames) || item.totalFrames <= 0)) {
    throw new Error("Render queue totalFrames must be a positive finite number.");
  }
  return {
    id: nonEmpty(item.id, "Render queue item id"),
    label: nonEmpty(item.label, "Render queue item label"),
    status: item.status,
    progress,
    currentFrame: item.currentFrame,
    totalFrames: item.totalFrames,
    outputPath: item.outputPath,
    error: item.error
  };
}

function nonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} must be a non-empty string.`);
  return trimmed;
}
