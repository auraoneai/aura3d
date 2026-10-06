/**
 * `renderer/InterleavedTransparentPass.ts` (PRD-01 §9.1 "transparent", C-01) —
 * the v2 transparent phase: forward transparents and contributor
 * `TransparentQueueItem`s drawn in one sequence merged by `sortDepth`
 * (larger = farther; `order` breaks contributor ties), rather than the
 * contributor queue running as a block after the engine transparents.
 * Consecutive engine items group into a single `ForwardPass` draw run so the
 * merge costs nothing when no contributor emits queue items.
 */

import { ForwardPass, type ForwardPassOptions, type RenderItem } from "../ForwardPass";
import { BaseRenderPass, type RenderPassContext } from "../RenderPass";
import type { FrameContributorContext, TransparentQueueItem } from "../contracts/frameGraph";

export interface TransparentEngineItem {
  readonly item: RenderItem;
  readonly sortDepth: number;
}

interface DrawSegment {
  readonly engine?: readonly RenderItem[];
  readonly queue?: TransparentQueueItem;
}

export function mergeTransparentSegments(
  engineItems: readonly TransparentEngineItem[],
  queues: readonly TransparentQueueItem[]
): readonly DrawSegment[] {
  const queue = [...queues].sort((a, b) => (b.sortDepth - a.sortDepth) || ((a.order ?? 0) - (b.order ?? 0)));
  const segments: DrawSegment[] = [];
  let run: RenderItem[] = [];
  let qi = 0;
  const flush = (): void => {
    if (run.length > 0) {
      segments.push({ engine: run });
      run = [];
    }
  };
  for (const { item, sortDepth } of engineItems) {
    while (qi < queue.length && (queue[qi]?.sortDepth ?? 0) >= sortDepth) {
      flush();
      segments.push({ queue: queue[qi] });
      qi += 1;
    }
    run.push(item);
  }
  flush();
  while (qi < queue.length) {
    segments.push({ queue: queue[qi] });
    qi += 1;
  }
  return segments;
}

export class InterleavedTransparentPass extends BaseRenderPass {
  constructor(
    private readonly forwardOptions: ForwardPassOptions,
    private readonly engineItems: readonly TransparentEngineItem[],
    private readonly queues: readonly TransparentQueueItem[],
    private readonly contributorContext: FrameContributorContext,
    reads: readonly string[] = ["aura.scene.color.opaque"]
  ) {
    // The interleaved pass is the sole canonical writer of `aura.scene.color`
    // — post-phase contributors chain to it. Earlier phases write their own
    // per-phase resources since the graph enforces single-producer writes.
    super("prd01.transparent", reads, ["aura.scene.color"]);
  }

  execute(context: RenderPassContext): void {
    const segments = mergeTransparentSegments(this.engineItems, this.queues);
    for (const segment of segments) {
      if (segment.engine) {
        new ForwardPass({ ...this.forwardOptions, items: segment.engine }).execute(context);
      } else if (segment.queue) {
        segment.queue.draw(this.contributorContext);
      }
    }
  }
}
