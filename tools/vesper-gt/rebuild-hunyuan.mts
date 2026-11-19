/** Run at repository root with pnpm exec tsx --tsconfig tsconfig.base.json tools/vesper-gt/rebuild-hunyuan.mts RAW.glb OUTPUT.glb. */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [inputArgument, outputArgument] = process.argv.slice(2);
if (!inputArgument || !outputArgument) throw new Error('Expected the original Hunyuan GLB and an output GLB path');
const input = resolve(inputArgument);
const output = resolve(outputArgument);
if (input === output) throw new Error('Choose an output path different from the source GLB');

const projectDir = process.cwd();
const commandsDir = join(projectDir, 'packages/aura3d-cli/src/commands');
if (!existsSync(commandsDir)) throw new Error('Run from the Aura3D repository root');
const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const inputSha = '55c17a4896018bcc191d72506ff5640166e13ca9640662ed1eeed6129951206b';
if (digest(input) !== inputSha) throw new Error('Source GLB differs from the recorded original generation');

const { optimizeGlbFile } = await import(pathToFileURL(join(commandsDir, 'assets/optimize.ts')).href);
const { normalizeGlb } = await import(pathToFileURL(join(commandsDir, 'asset-post/normalize.ts')).href);
const { slimGlb } = await import(pathToFileURL(join(commandsDir, 'asset-post/slim.ts')).href);
const scratch = mkdtempSync(join(tmpdir(), 'vesper-hunyuan-'));
try {
  const optimized = join(scratch, 'optimized.glb');
  const normalized = join(scratch, 'normalized.glb');
  await optimizeGlbFile({ input, output: optimized, projectDir, role: 'hero', maxVerts: 90000, tex: 2048, error: 0.006 });
  await normalizeGlb(optimized, normalized, {
    front: '+z', size: { length: 4.72 }, yawDeg: 0, projectDir,
    provenance: { generator: 'fal-ai/hunyuan-3d/v3.1/pro/image-to-3d', requestId: '01a1f55f-2f39-7091-aa25-28a3e1678689' },
  });
  await slimGlb(normalized, { projectDir });
  const materialsScript = join(dirname(fileURLToPath(import.meta.url)), 'hunyuan-materials.py');
  const run = spawnSync('python3', [materialsScript, normalized, output], { stdio: 'inherit' });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error('Vesper material curation failed');
  console.log(digest(output), output);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
