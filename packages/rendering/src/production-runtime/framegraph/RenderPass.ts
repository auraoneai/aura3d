export type RenderPassKind = 'depth' | 'shadow' | 'opaque' | 'transparent' | 'skybox' | 'postprocess';

export interface RenderPassExecutionContext {
  readonly frameIndex: number;
  readonly width: number;
  readonly height: number;
}

export interface RenderPass {
  readonly id: string;
  readonly kind: RenderPassKind;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  execute?(context: RenderPassExecutionContext): void;
}
