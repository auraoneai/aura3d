import { expect, it } from 'vitest';
import { summarizePublicCrowdDraws } from '../../../apps/aura-clash-showcase/src/playable/arena/CrowdDrawEvidence';
it('counts each actual typed mesh submission by runtime identity, preserving native and individual populations', () => {
  const native = summarizePublicCrowdDraws([
    { label: 'actor-0:mesh-0:aura-clash-public-spectator-pool:Body:geometry-0', instanceTransforms: new Float32Array(28 * 16) },
    { label: 'actor-0:mesh-1:aura-clash-public-spectator-pool:Head:geometry-1', instanceTransforms: new Float32Array(28 * 16) },
    { label: 'actor-1:mesh-0:player-rig:typed spectator crowd:geometry-0' }
  ]);
  expect(native).toMatchObject({ drawItems: 2, instances: 56, instancesPerDraw: [28, 28] });
  expect(native.labels).toHaveLength(2);
  expect(summarizePublicCrowdDraws(Array.from({ length: 28 }, (_, index) => ({ label: `actor-${index}:mesh-0:aura-clash-public-spectator-${index}:Body:geometry-0` })))).toMatchObject({ drawItems: 28, instances: 28, instancesPerDraw: Array(28).fill(1) });
  expect(summarizePublicCrowdDraws([{ label: 'actor-0:mesh-0:arena:geometry' }])).toEqual({ labels: [], drawItems: 0, instances: 0, instancesPerDraw: [] });
  expect(() => summarizePublicCrowdDraws([{ label: 'aura-clash-public-spectator-pool:mesh', instanceTransforms: new Float32Array(17) }])).toThrow('incomplete');
});
