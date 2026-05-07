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
