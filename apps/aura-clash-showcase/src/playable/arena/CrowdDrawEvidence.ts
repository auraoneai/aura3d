/** Runtime node IDs are carried into the actual GLB mesh submission label.
 * Authored display names are not: matching them silently lost every crowd draw. */
export function summarizePublicCrowdDraws(items: readonly { readonly label?: string; readonly instanceTransforms?: ArrayLike<number> }[]) {
  const crowdItems = items.filter(item => /(?:^|:)aura-clash-public-spectator-(?:pool|\d+)(?=:|$)/.test(item.label ?? ''));
  const labels = crowdItems.map(item => item.label!);
  const instancesPerDraw = crowdItems.map(item => {
    if (!item.instanceTransforms) return 1;
    if (item.instanceTransforms.length === 0 || item.instanceTransforms.length % 16 !== 0) throw new Error('Crowd submission has an incomplete instance matrix buffer');
    return item.instanceTransforms.length / 16;
  });
  return { labels, drawItems: crowdItems.length, instancesPerDraw, instances: instancesPerDraw.reduce((sum, count) => sum + count, 0) };
}
