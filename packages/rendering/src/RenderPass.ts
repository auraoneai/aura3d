import { type RenderDevice } from "./RenderDevice";

export interface RenderPassContext {
  readonly device: RenderDevice;
  readonly width: number;
  readonly height: number;
}

export interface RenderPass {
  readonly name: string;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  readonly allowReadWriteHazards?: readonly string[];
  /**
   * C-13 (PRD-01 §8.4 step 4): declared working space. A `post-hdr` contributor
   * pass declaring `"display"` is rejected by the FrameGraph
   * (`FRAME_PHASE_SPACE_MISMATCH`); everything upstream of OutputPass is
   * linear scene-referred.
   */
  readonly space?: "linear-hdr" | "display";
  execute(context: RenderPassContext): void;
  executeAsync?(context: RenderPassContext): Promise<void>;
}

export abstract class BaseRenderPass implements RenderPass {
  constructor(
    public readonly name: string,
    public readonly reads: readonly string[] = [],
    public readonly writes: readonly string[] = [],
    public readonly allowReadWriteHazards: readonly string[] = []
  ) {}

  abstract execute(context: RenderPassContext): void;
}
