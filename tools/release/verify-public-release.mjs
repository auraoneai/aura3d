#!/usr/bin/env node
// Read-only verification. No publish, deprecate, dist-tag, or registry mutation commands.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sourceIdentity } from './source-identity.mjs';
const root = resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); if (i < 0) return undefined; if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing ${name}`); return args[i + 1]; };
const version = option('--version');
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('--version requires an exact version');
const planPath = option('--release-plan') ?? 'tests/reports/release-tarballs/release-plan.json';
const planBytes = readFileSync(resolve(root, planPath));
const plan = JSON.parse(planBytes);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim()) throw new Error('Registry verification requires frozen tracked source');
if (plan.version !== version || plan.commit !== commit || plan.lockfileSha256 !== sha256(readFileSync(resolve(root, 'pnpm-lock.yaml')))) throw new Error('Release plan differs from frozen source/version/lockfile');
const source = sourceIdentity(root);
if (Object.entries(source).some(([key, value]) => plan.source?.[key] !== value)) throw new Error('Release plan full source identity mismatch');
const manifests = [JSON.parse(readFileSync(resolve(root, 'package.json')))];
for (const entry of readdirSync(resolve(root, 'packages'))) {
  const path = resolve(root, 'packages', entry, 'package.json');
  if (existsSync(path)) { const manifest = JSON.parse(readFileSync(path)); if (manifest.private !== true) manifests.push(manifest); }
}
const expectedNames = manifests.map(p => p.name).sort();
if (manifests.length !== 29 || new Set(expectedNames).size !== 29 || manifests.some(p => p.version !== version) || plan.expectedPackageCount !== 29 || plan.packageCount !== 29 || plan.packages?.length !== 29 || JSON.stringify(plan.packages.map(p => p.name).sort()) !== JSON.stringify(expectedNames)) throw new Error('Expected the exact 29 public packages at target version');
const packages = [];
for (const entry of plan.packages) {
  if (entry.version !== version || !entry.integrity?.startsWith('sha512-') || !entry.sha256 || !entry.tarball) throw new Error(`Incomplete packed artifact ${entry.name}`);
  const localBytes = readFileSync(resolve(root, entry.tarball));
  const integrity = bytes => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  if (sha256(localBytes) !== entry.sha256 || integrity(localBytes) !== entry.integrity) throw new Error(`Changed candidate tarball ${entry.name}`);
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(entry.name)}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${entry.name}: registry HTTP ${response.status}`);
  const metadata = await response.json();
  const published = metadata.versions?.[version];
  if (!published || published.name !== entry.name || published.version !== version || published.deprecated || metadata['dist-tags']?.latest !== version || !Number.isFinite(Date.parse(metadata.time?.[version])) || published.dist?.integrity !== entry.integrity) throw new Error(`${entry.name}: missing, deprecated, or mismatched publication`);
  const tarball = new URL(published.dist.tarball);
  if (tarball.protocol !== 'https:' || tarball.hostname !== 'registry.npmjs.org') throw new Error(`${entry.name}: unexpected tarball origin`);
  const download = await fetch(tarball, { signal: AbortSignal.timeout(60000) });
  if (!download.ok) throw new Error(`${entry.name}: tarball HTTP ${download.status}`);
  const bytes = Buffer.from(await download.arrayBuffer());
  if (integrity(bytes) !== entry.integrity || sha256(bytes) !== entry.sha256) throw new Error(`${entry.name}: registry bytes differ from candidate`);
  const downloadedTarballPath = `release-artifacts/${version}-registry-tarballs/${entry.name.replaceAll('/', '-').replace('@', '')}-${version}.tgz`;
  mkdirSync(dirname(resolve(root, downloadedTarballPath)), { recursive: true });
  writeFileSync(resolve(root, downloadedTarballPath), bytes);
  packages.push({ downloadedTarball: { path: downloadedTarballPath, sha256: sha256(bytes) }, validatedTarballSha256: entry.sha256, deprecated: false, name: entry.name, version, publishedAt: metadata.time[version], integrity: entry.integrity, sha256: entry.sha256, tarball: tarball.href, latest: metadata['dist-tags']?.latest ?? null, provenance: published.dist.attestations ?? null, matchesCandidate: true });
}
const output = resolve(root, option('--output') ?? `release-artifacts/${version}-npm-registry-verification.json`);
const receipt = { schema: 'aura3d.npm-public-release-verification/2.0', version, expectedVersion: version, generatedAt: new Date().toISOString(), command: ['node', ...process.argv.slice(1)], cwd: '.', source, releasePlan: { path: planPath, sha256: sha256(planBytes) }, registry: 'https://registry.npmjs.org', expectedPackageCount: 29, packageCount: packages.length, status: 'pass', scope: 'Published tarball byte identity only. Registry-installed lifecycles, provenance attestation verification, deployment and human review require separate evidence.', packages };
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`Verified ${packages.length}/29 exact ${version} registry tarballs: ${output}`);
