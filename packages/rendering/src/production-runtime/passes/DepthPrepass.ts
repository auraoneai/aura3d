import type { RenderPass } from '../framegraph/RenderPass';
export class DepthPrepass implements RenderPass {
  readonly id = 'DepthPrepass';
  readonly kind = 'depth' as const;
  readonly reads: readonly string[] = [];
  readonly writes: readonly string[] = [];
}
