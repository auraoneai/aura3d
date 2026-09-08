import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { writeTypedAssets } from '../../../packages/aura3d-cli/src/asset-manifest.js';
import { produceTypedAssetAcceptance, validateRouteGameplayStates, validateSmartCityComposition, validateTypedAssetProject } from '../../../tools/muse3jsparity-readiness/route-acceptance.js';
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'route-contract-test-')); roots.push(root);
  mkdirSync(resolve(root, 'public'), { recursive: true });
  const bytes = Buffer.from('RIFF0000WAVEfmt '), hash = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(resolve(root, 'public/tone.wav'), bytes);
  const manifest: any = { schema: 'aura3d.assets/1.0', assetBasePath: '/', outputDir: 'public', typegen: 'src/assets.ts', assets: [{ id: 'tone', type: 'audio', format: 'wav', source: 'tone.wav', outputPath: 'public/tone.wav', url: '/tone.wav', hash: `sha256-${hash}`, sizeBytes: bytes.length, materials: [], animations: [], textures: [], provenance: { license: 'CC0-1.0', sourceUrl: 'https://example.com/tone', author: 'Test author' } }] };
  writeFileSync(resolve(root, 'aura.assets.json'), JSON.stringify(manifest)); writeTypedAssets(root, manifest);
  return { root, manifest };
}
describe('Q02 typed asset replay', () => {
  it('replays CLI hashes/licenses and exact generated module bytes', () => {
    const { root } = fixture();
    expect(validateTypedAssetProject(root, '.').failures).toEqual([]);
    writeFileSync(resolve(root, 'src/assets.ts'), readFileSync(resolve(root, 'src/assets.ts'), 'utf8').replace('/tone.wav', '/other.wav'));
    expect(validateTypedAssetProject(root, '.').failures.join(' ')).toContain('generated references differ');
  });
  it('rejects changed output and missing license despite retained manifest claims', () => {
    const { root, manifest } = fixture();
    writeFileSync(resolve(root, 'public/tone.wav'), 'changed');
    delete manifest.assets[0].provenance;
    writeFileSync(resolve(root, 'aura.assets.json'), JSON.stringify(manifest));
    const failures = validateTypedAssetProject(root, '.').failures.join(' ');
    expect(failures).toContain('Hash mismatch'); expect(failures).toContain('license/provenance');
  });

  it('excludes explicitly retired app manifests while retaining active app validation', () => {
    const { root } = fixture();
    const apps = resolve(root, 'apps');
    for (const name of ['active-game', 'retired-game']) {
      const project = resolve(apps, name);
      mkdirSync(resolve(project, 'public'), { recursive: true });
      const bytes = Buffer.from(`asset-${name}`);
      const hash = createHash('sha256').update(bytes).digest('hex');
      writeFileSync(resolve(project, 'public/tone.wav'), bytes);
      const manifest: any = { schema: 'aura3d.assets/1.0', assetBasePath: '/', outputDir: 'public', typegen: 'src/assets.ts', assets: [{ id: 'tone', type: 'audio', format: 'wav', source: 'tone.wav', outputPath: 'public/tone.wav', url: '/tone.wav', hash: `sha256-${hash}`, sizeBytes: bytes.length, materials: [], animations: [], textures: [], provenance: { license: 'CC0-1.0', sourceUrl: 'https://example.com/tone', author: 'Test author' } }] };
      writeFileSync(resolve(project, 'aura.assets.json'), JSON.stringify(manifest));
      writeTypedAssets(project, manifest);
    }
    writeFileSync(resolve(apps, 'retired-game', 'RETIRED.md'), '# Retired');
    writeFileSync(resolve(apps, 'active-game', 'public/tone.wav'), 'tampered');
    const result = produceTypedAssetAcceptance(root);
    expect(result.routes).toContain('apps/active-game');
    expect(result.routes).not.toContain('apps/retired-game');
    expect(result.failures.join(' ')).toContain('apps/active-game');
    expect(result.failures.join(' ')).not.toContain('apps/retired-game');
  });

  it('rejects an escaping generator destination without writing outside the scratch project', () => {
    const { root, manifest } = fixture(); manifest.typegen = '../escaped.ts';
    writeFileSync(resolve(root, 'aura.assets.json'), JSON.stringify(manifest));
    expect(validateTypedAssetProject(root, '.').failures.join(' ')).toContain('Escaping artifact');
  });
});
describe('Q02 raw gameplay replay', () => {
  const racing = () => ({ before: { speed: 0, lap: 1, checkpoint: 0, raceState: { heading: 0 } }, after: { speed: 1, lap: 1, checkpoint: 1, raceState: { heading: .1 } }, reset: { speed: 0, lap: 1, checkpoint: 0, raceState: { progress: 0 } } });
  it('accepts observed racing transitions and rejects a boolean-only checkpoint claim', () => {
    const states = racing(); expect(validateRouteGameplayStates('showcase-turbo-drift-circuit', states)).toEqual([]);
    states.after.checkpoint = 0;
    expect(validateRouteGameplayStates('showcase-turbo-drift-circuit', { ...states, kitContractProof: { checkpointAdvances: true } })).toContain('raw checkpoint/lap progression absent');
  });
  it('fails missing and nonfinite raw states', () => {
    expect(validateRouteGameplayStates('showcase-skyline-runner', { pass: true })).toContain('missing before/after/reset gameplay states');
    const states = racing(); states.after.speed = NaN;
    expect(validateRouteGameplayStates('showcase-turbo-drift-circuit', states)).toContain('throttle speed transition absent');
  });
});
