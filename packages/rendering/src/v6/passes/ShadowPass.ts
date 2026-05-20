import type { RenderPass } from '../framegraph/RenderPass';
export class ShadowPass implements RenderPass {
  readonly id = 'ShadowPass';
  readonly kind = 'shadow' as const;
  readonly reads: readonly string[] = [];
  readonly writes: readonly string[] = [];
}
