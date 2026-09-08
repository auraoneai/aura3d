import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Run after tools/locomotion-301/author-translated-walk.mjs. The CLI owns the
// manifest, typed reference, inspection metadata, hash and public copy.
const project = fileURLToPath(new URL('.', import.meta.url));
const repository = resolve(project, '../../..');
const derivation = JSON.parse(readFileSync(resolve(project, 'rival-translated-walk.glb.provenance.json'), 'utf8'));
const source = derivation.sourceProvenance;
const result = spawnSync(resolve(repository, 'node_modules/.bin/tsx'), [
  resolve(repository, 'packages/aura3d-cli/src/cli.ts'),
  'assets', 'add', 'rival-translated-walk.glb',
  '--name', 'rivalTranslatedWalk',
  '--public-path', '/tests/fixtures/locomotion-301/public/aura-assets/',
  '--license', source.license,
  '--license-name', source.licenseName,
  '--license-url', source.licenseUrl,
  '--source-page', source.sourcePage,
  '--source-url', source.sourceUrl,
  '--author', source.author,
  '--source-family', `${source.sourceFamily}; authored translated walk derivation`,
  '--attribution', 'Quaternius original rig and animation; Aura3D translated root-track derivation, see rival-translated-walk.glb.provenance.json',
  '--quality', 'candidate', '--role', 'character',
  '--provenance-evidence', 'rival-translated-walk.glb.provenance.json',
], { cwd: project, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
