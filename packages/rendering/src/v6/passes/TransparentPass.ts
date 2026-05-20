import type { RenderPass } from '../framegraph/RenderPass';
export class TransparentPass implements RenderPass {
  readonly id = 'TransparentPass';
  readonly kind = 'transparent' as const;
  readonly reads: readonly string[] = [];
  readonly writes: readonly string[] = [];
}
