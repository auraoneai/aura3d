import type { RenderPass } from '../framegraph/RenderPass';
export class OpaquePass implements RenderPass {
  readonly id = 'OpaquePass';
  readonly kind = 'opaque' as const;
  readonly reads: readonly string[] = [];
  readonly writes: readonly string[] = [];
}
