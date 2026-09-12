/**
 * Add typed acceptance receipts to a source-exact work-order manifest.
 *
 * The work-order collector owns the broad gate receipts, while L01 and Q02 have
 * dedicated producers. This merger refuses invalid validation documents,
 * mismatched source identities, duplicate gates, changed receipt bytes, or a
 * source that differs from the current checkout.
 *
 * Usage: finalize-evidence-manifest.ts <base-manifest.json> <validation.json>...
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  artifact,
  sameSource,
  sourceIdentity,
  type Artifact,
  type ProducerReceipt,
  type SourceIdentity,
} from '../muse3jsparity-readiness/evidence-lineage';

interface EvidenceManifest {
  schema: 'muse301-evidence-manifest/v1';
  generatedAt: string;
  source: SourceIdentity;
  receipts: Artifact[];
}
interface ValidationDocument {
  valid: boolean;
  errors?: unknown[];
  source?: SourceIdentity;
  receipt?: Artifact;
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(resolve(path), 'utf8')) as T;

export function finalizeEvidenceManifest(
  root: string,
  baseManifestPath: string,
  validationPaths: readonly string[],
): EvidenceManifest {
  if (validationPaths.length === 0) throw new Error('At least one acceptance validation is required');
  const currentSource = sourceIdentity(root);
  const manifest = readJson<EvidenceManifest>(resolve(root, baseManifestPath));
  if (manifest.schema !== 'muse301-evidence-manifest/v1' || !Array.isArray(manifest.receipts)) {
    throw new Error('Invalid evidence manifest');
  }
  if (!sameSource(manifest.source, currentSource)) throw new Error('Evidence manifest source differs from checkout');

  const refs = new Map<string, Artifact>();
  const gates = new Map<string, string>();
  const add = (ref: Artifact, owner: string): void => {
    const actual = artifact(root, ref.path);
    if (actual.sha256 !== ref.sha256) throw new Error(`Changed receipt: ${ref.path}`);
    const receipt = readJson<ProducerReceipt>(resolve(root, ref.path));
    if (!sameSource(receipt.source, currentSource)) throw new Error(`Receipt source differs: ${ref.path}`);
    if (receipt.exitCode !== 0 || !receipt.gate) throw new Error(`Receipt did not pass: ${ref.path}`);
    const priorPath = gates.get(receipt.gate);
    if (priorPath && priorPath !== ref.path) throw new Error(`Duplicate gate ${receipt.gate}: ${priorPath}, ${ref.path}`);
    const prior = refs.get(ref.path);
    if (prior && prior.sha256 !== ref.sha256) throw new Error(`Conflicting receipt hash: ${ref.path}`);
    refs.set(ref.path, ref);
    gates.set(receipt.gate, ref.path);
    void owner;
  };

  for (const ref of manifest.receipts) add(ref, baseManifestPath);
  for (const path of validationPaths) {
    const validation = readJson<ValidationDocument>(resolve(root, path));
    if (validation.valid !== true || !validation.receipt) {
      throw new Error(`Acceptance validation failed: ${path}: ${JSON.stringify(validation.errors ?? [])}`);
    }
    if (validation.source && !sameSource(validation.source, currentSource)) {
      throw new Error(`Acceptance validation source differs: ${path}`);
    }
    add(validation.receipt, path);
  }

  return {
    schema: 'muse301-evidence-manifest/v1',
    generatedAt: new Date().toISOString(),
    source: currentSource,
    receipts: [...refs.values()].sort((a, b) => a.path.localeCompare(b.path)),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [baseManifestPath, ...validationPaths] = process.argv.slice(2);
  if (!baseManifestPath) throw new Error('Usage: finalize-evidence-manifest.ts <base-manifest.json> <validation.json>...');
  const finalized = finalizeEvidenceManifest(process.cwd(), baseManifestPath, validationPaths);
  writeFileSync(resolve(process.cwd(), baseManifestPath), `${JSON.stringify(finalized, null, 2)}\n`);
  console.log(JSON.stringify({ manifest: baseManifestPath, receipts: finalized.receipts.length, source: finalized.source }));
}
