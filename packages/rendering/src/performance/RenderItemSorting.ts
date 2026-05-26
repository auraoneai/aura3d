export type RenderQueueBucket = "opaque" | "mask" | "transparent";

export interface RenderQueueSortItem<T = unknown> {
  readonly item: T;
  readonly bucket: RenderQueueBucket;
  readonly depth: number;
  readonly pipelineKey?: string;
  readonly batchKey?: string;
  readonly instanceCount?: number;
  readonly renderOrder?: number;
}

export interface RenderQueueSortOptions {
  readonly transparentBackToFront?: boolean;
  readonly opaqueFrontToBack?: boolean;
  readonly groupOpaqueByPipeline?: boolean;
}

export interface RenderQueuePlan<T = unknown> {
  readonly items: readonly T[];
  readonly diagnostics: RenderQueueSortDiagnostics;
}

export interface RenderQueueSortDiagnostics {
  readonly total: number;
  readonly objectCount: number;
  readonly estimatedDrawCalls: number;
  readonly totalInstances: number;
  readonly batchableGroups: number;
  readonly largestBatch: number;
  readonly materialSwitches: number;
  readonly opaqueCount: number;
  readonly maskedCount: number;
  readonly transparentCount: number;
  readonly pipelineTransitions: number;
  readonly opaqueFrontToBack: boolean;
  readonly transparentBackToFront: boolean;
}

export function sortRenderQueueItems<T>(
  items: readonly RenderQueueSortItem<T>[],
  options: RenderQueueSortOptions = {}
): RenderQueuePlan<T> {
  const opaqueFrontToBack = options.opaqueFrontToBack ?? true;
  const transparentBackToFront = options.transparentBackToFront ?? true;
  const groupOpaqueByPipeline = options.groupOpaqueByPipeline ?? false;
  const decorated = items.map((entry, index) => {
    validateRenderQueueItem(entry, index);
    return { ...entry, index };
  });

  decorated.sort((left, right) => {
    const orderDelta = (left.renderOrder ?? 0) - (right.renderOrder ?? 0);
    if (orderDelta !== 0) return orderDelta;

    const bucketDelta = bucketRank(left.bucket) - bucketRank(right.bucket);
    if (bucketDelta !== 0) return bucketDelta;

    if (left.bucket === "transparent" || right.bucket === "transparent") {
      if (transparentBackToFront) {
        const depthDelta = right.depth - left.depth;
        if (Math.abs(depthDelta) > 1e-6) return depthDelta;
      }
      return left.index - right.index;
    }

    if (groupOpaqueByPipeline) {
      const pipelineDelta = pipelineKey(left).localeCompare(pipelineKey(right));
      if (pipelineDelta !== 0) return pipelineDelta;
    }

    if (opaqueFrontToBack) {
      const depthDelta = left.depth - right.depth;
      if (Math.abs(depthDelta) > 1e-6) return depthDelta;
    }

    if (!groupOpaqueByPipeline) {
      const pipelineDelta = pipelineKey(left).localeCompare(pipelineKey(right));
      if (pipelineDelta !== 0 && Math.abs(left.depth - right.depth) <= 1e-6) return pipelineDelta;
    }

    return left.index - right.index;
  });

  return {
    items: decorated.map((entry) => entry.item),
    diagnostics: buildDiagnostics(decorated, opaqueFrontToBack, transparentBackToFront)
  };
}

export interface SortableRenderItem {
  readonly id: string;
  readonly materialBucket: RenderQueueBucket;
  readonly pipelineKey: string;
  readonly depth: number;
}

export function sortRenderItems(items: readonly SortableRenderItem[]): SortableRenderItem[] {
  return [...sortRenderQueueItems(items.map((item) => ({
    item,
    bucket: item.materialBucket,
    pipelineKey: item.pipelineKey,
    depth: item.depth
  })), { groupOpaqueByPipeline: true }).items];
}

function bucketRank(bucket: RenderQueueBucket): number {
  if (bucket === "opaque") return 0;
  if (bucket === "mask") return 1;
  return 2;
}

function validateRenderQueueItem(item: RenderQueueSortItem, index: number): void {
  if (!Number.isFinite(item.depth)) {
    throw new RangeError(`Render queue item ${index} depth must be finite.`);
  }
  if (item.renderOrder !== undefined && !Number.isFinite(item.renderOrder)) {
    throw new RangeError(`Render queue item ${index} renderOrder must be finite.`);
  }
  if (item.instanceCount !== undefined && (!Number.isInteger(item.instanceCount) || item.instanceCount <= 0)) {
    throw new RangeError(`Render queue item ${index} instanceCount must be a positive integer.`);
  }
}

function pipelineKey(item: RenderQueueSortItem): string {
  return item.pipelineKey ?? "";
}

function buildDiagnostics(
  items: readonly (RenderQueueSortItem & { readonly index: number })[],
  opaqueFrontToBack: boolean,
  transparentBackToFront: boolean
): RenderQueueSortDiagnostics {
  let pipelineTransitions = 0;
  let previousPipeline: string | undefined;
  const batchGroups = new Map<string, number>();
  let totalInstances = 0;
  for (const item of items) {
    const key = pipelineKey(item);
    if (previousPipeline !== undefined && previousPipeline !== key) pipelineTransitions += 1;
    previousPipeline = key;
    const instances = item.instanceCount ?? 1;
    totalInstances += instances;
    const batchKey = item.batchKey ?? key;
    if (batchKey) {
      batchGroups.set(batchKey, (batchGroups.get(batchKey) ?? 0) + 1);
    }
  }
  const batchSizes = [...batchGroups.values()];
  const batchableGroups = batchSizes.filter((size) => size > 1).length;
  const largestBatch = batchSizes.length > 0 ? Math.max(...batchSizes) : 0;
  return {
    total: items.length,
    objectCount: items.length,
    estimatedDrawCalls: items.length,
    totalInstances,
    batchableGroups,
    largestBatch,
    materialSwitches: pipelineTransitions,
    opaqueCount: items.filter((item) => item.bucket === "opaque").length,
    maskedCount: items.filter((item) => item.bucket === "mask").length,
    transparentCount: items.filter((item) => item.bucket === "transparent").length,
    pipelineTransitions,
    opaqueFrontToBack,
    transparentBackToFront
  };
}
