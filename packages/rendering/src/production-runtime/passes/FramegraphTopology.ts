import type { RenderPass } from '../framegraph/RenderPass';

/**
 * muse3jsparity-PRD T3 — canonical production framegraph topology.
 *
 * Order is load-bearing: depth before shadow before sky before opaque
 * composite before transparency before tone mapping. `validatePassOrder`
 * fails closed on missing, duplicated, or misordered passes so the graph
 * edges (reads/writes) always match the actual resource flow.
 */
export const PRODUCTION_PASS_ORDER: readonly string[] = [
  'DepthPrepass',
  'ShadowPass',
  'SkyboxPass',
  'OpaquePass',
  'TransparentPass',
  'ToneMappingPass'
];

export function validatePassOrder(passes: readonly RenderPass[]): readonly string[] {
  const errors: string[] = [];
  const ids = passes.map((pass) => pass.id);
  for (const expected of PRODUCTION_PASS_ORDER) {
    const count = ids.filter((id) => id === expected).length;
    if (count === 0) errors.push(`Missing production pass: ${expected}.`);
    if (count > 1) errors.push(`Duplicated production pass: ${expected}.`);
  }
  const orderIndex = new Map(PRODUCTION_PASS_ORDER.map((id, index) => [id, index]));
  let lastIndex = -1;
  for (const id of ids) {
    const index = orderIndex.get(id);
    if (index === undefined) {
      errors.push(`Undocumented production pass: ${id}.`);
      continue;
    }
    if (index < lastIndex) errors.push(`Misordered production pass: ${id}.`);
    lastIndex = Math.max(lastIndex, index);
  }
  return errors;
}

export function validatePassResourceFlow(passes: readonly RenderPass[]): readonly string[] {
  const errors: string[] = [];
  const produced = new Set<string>();
  for (const pass of passes) {
    for (const resource of pass.reads) {
      if (!produced.has(resource) && !isExternalResource(resource)) {
        errors.push(`${pass.id} reads unwritten resource: ${resource}.`);
      }
    }
    for (const resource of pass.writes) produced.add(resource);
  }
  return errors;
}

/** Scene/environment inputs exist before the graph runs; everything else must be produced in-graph. */
function isExternalResource(resource: string): boolean {
  return resource.startsWith("scene.") || resource.startsWith("environment.") || resource.startsWith("shadow.");
}
