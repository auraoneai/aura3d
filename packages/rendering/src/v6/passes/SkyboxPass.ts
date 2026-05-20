import type { RenderPass } from '../framegraph/RenderPass';
export class SkyboxPass implements RenderPass {
  readonly id = 'SkyboxPass';
  readonly kind = 'skybox' as const;
  readonly reads: readonly string[] = [];
  readonly writes: readonly string[] = [];
}
