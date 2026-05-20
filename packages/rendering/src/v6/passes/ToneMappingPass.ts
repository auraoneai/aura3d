import type { RenderPass } from '../framegraph/RenderPass';
export class ToneMappingPass implements RenderPass {
  readonly id = 'ToneMappingPass';
  readonly kind = 'postprocess' as const;
  readonly reads: readonly string[] = [];
  readonly writes: readonly string[] = [];
}
