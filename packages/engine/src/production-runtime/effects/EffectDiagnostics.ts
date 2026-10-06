// PRD-07 P1-T2 — draw-backed effect diagnostics core.
// trackDraw() is fed by the contributor after each transparent phase;
// endFrame() counts consecutive frames where a visible, in-frustum effect
// node produced zero draws. At 30 consecutive frames it raises
// EFFECT_ZERO_PIXELS once (diagnostic entry + console.error).

export interface TrackedEffectNode {
  readonly nodeId: string;
  readonly effect: string;
  consumer: string;
  live: number;
  drawCalls: number;
  instancesDrawn: number;
  sim: string;
  softDepth: boolean;
  zeroPixelFrames: number;
}

export interface EffectDiagnosticsReport {
  readonly nodes: readonly TrackedEffectNode[];
  readonly batches: number;
  readonly liveParticles: number;
  readonly errors: readonly { code: string; nodeId: string; message: string }[];
  readonly pixelBacked: readonly string[];
  readonly gpuMs?: number;
}

const ZERO_PIXEL_FRAME_LIMIT = 30;

export class EffectDiagnostics {
  private readonly nodes = new Map<string, TrackedEffectNode>();
  private readonly errors: { code: string; nodeId: string; message: string }[] = [];
  private readonly pixelBacked = new Set<string>();
  private frameDraws = new Map<string, { draws: number; instances: number }>();
  private gpuMs: number | null = null;
  private batches = 0;
  private liveParticles = 0;
  private readonly warned = new Set<string>();

  track(node: Omit<TrackedEffectNode, "drawCalls" | "instancesDrawn" | "zeroPixelFrames">): TrackedEffectNode {
    let n = this.nodes.get(node.nodeId);
    if (!n) {
      n = { ...node, drawCalls: 0, instancesDrawn: 0, zeroPixelFrames: 0 };
      this.nodes.set(node.nodeId, n);
    } else {
      n.live = node.live;
      n.consumer = node.consumer;
      n.sim = node.sim;
      n.softDepth = node.softDepth;
    }
    return n;
  }

  untrack(nodeId: string): void {
    this.nodes.delete(nodeId);
    this.pixelBacked.delete(nodeId);
    this.frameDraws.delete(nodeId);
  }

  /** Draw submission observed for a node this frame. */
  trackDraw(nodeId: string, drawCalls: number, instancesDrawn: number): void {
    const cur = this.frameDraws.get(nodeId) ?? { draws: 0, instances: 0 };
    cur.draws += drawCalls;
    cur.instances += instancesDrawn;
    this.frameDraws.set(nodeId, cur);
    if (instancesDrawn > 0) this.pixelBacked.add(this.nodes.get(nodeId)?.effect ?? nodeId);
  }

  note(code: string, nodeId: string, message: string): void {
    this.errors.push({ code, nodeId, message });
  }

  setFrameStats(batches: number, liveParticles: number, gpuMs?: number | null): void {
    this.batches = batches;
    this.liveParticles = liveParticles;
    if (gpuMs !== undefined) this.gpuMs = gpuMs;
  }

  /**
   * Close a rendered frame. `visibleNodeIds` are the nodes the app reports as
   * visible + in-frustum this frame; a node that is tracked, particle-backed,
   * visible, yet drew nothing accrues a zero-pixel frame.
   */
  endFrame(visibleNodeIds: ReadonlySet<string>): void {
    for (const node of this.nodes.values()) {
      const draws = this.frameDraws.get(node.nodeId);
      node.drawCalls = draws?.draws ?? 0;
      node.instancesDrawn = draws?.instances ?? 0;
      if (!visibleNodeIds.has(node.nodeId)) {
        node.zeroPixelFrames = 0;
        continue;
      }
      // Fog/atmosphere consumers are not pixel-tracked by design.
      if (node.consumer !== "particle-pass") {
        node.zeroPixelFrames = 0;
        continue;
      }
      if (node.instancesDrawn > 0) this.pixelBacked.add(node.effect);
      if (node.drawCalls === 0 && node.live > 0) {
        node.zeroPixelFrames += 1;
        if (node.zeroPixelFrames === ZERO_PIXEL_FRAME_LIMIT && !this.warned.has(node.nodeId)) {
          this.warned.add(node.nodeId);
          const message = `effect node "${node.nodeId}" (${node.effect}) produced no pixels for ${ZERO_PIXEL_FRAME_LIMIT} consecutive frames`;
          this.errors.push({ code: "EFFECT_ZERO_PIXELS", nodeId: node.nodeId, message });
          if (typeof console !== "undefined") console.error(`EFFECT_ZERO_PIXELS: ${message}`);
        }
      } else {
        node.zeroPixelFrames = 0;
      }
    }
    this.frameDraws = new Map();
  }

  report(): EffectDiagnosticsReport {
    return {
      nodes: [...this.nodes.values()],
      batches: this.batches,
      liveParticles: this.liveParticles,
      errors: [...this.errors],
      pixelBacked: [...this.pixelBacked],
      ...(this.gpuMs !== null ? { gpuMs: this.gpuMs } : {})
    };
  }

  /** Test hook. */
  reset(): void {
    this.nodes.clear();
    this.errors.length = 0;
    this.pixelBacked.clear();
    this.frameDraws.clear();
    this.warned.clear();
    this.gpuMs = null;
  }
}
