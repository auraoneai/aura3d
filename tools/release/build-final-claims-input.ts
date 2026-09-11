/**
 * Build the Q02 final-claims config from current source.
 *
 * The contract requires an explicit row for EVERY nonempty line of every controlled
 * document, so nothing can be silently omitted. That splits cleanly in two:
 *
 *  - `structuralLines`: lines `isStructuralDocumentLine` already recognises as
 *    formatting (fences, table rules, horizontal rules, standard headings, closing
 *    tags). These are generated mechanically; the validator re-checks each one
 *    against the same predicate and the exact source text, so a generated row
 *    cannot smuggle a claim through.
 *  - `claims`: everything else. Each needs kind/surface/requirements plus a
 *    receipt-bound assertion. This tool emits them with their exact text and
 *    source hash and leaves `requirements`/`receipts`/`assertions` empty, so the
 *    validator reports precisely which lines still need authored review instead of
 *    failing with 3,988 undifferentiated "unmapped document line" errors.
 *
 * `historicalInventory` rows carry a written reason: they record a 2.0.4/3.0.0
 * measurement as history rather than promoting it into 3.0.1 evidence.
 *
 * Usage: build-final-claims-input.ts [output.json]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { finalClaimsDocuments } from '../muse3jsparity-docs-audit/claims';
import { isStructuralDocumentLine } from '../muse3jsparity-docs-audit/document-invariants';
import { artifact, sourceIdentity } from '../muse3jsparity-readiness/evidence-lineage';

/** A measured claim names a direction and states a number the receipt can contradict. */
const MEASURED_DIRECTION = /\b(?:win|faster|improv|reduc|lower|less|loss|slower|regress|higher|larger|worse)/i;
const EXACT_NUMBER = /`\d+(?:\.\d+)?`/;

const root = process.cwd();
const out = process.argv[2] ?? 'tests/reports/muse3jsparity-final-claims-input.json';
const documents = finalClaimsDocuments(root) as string[];
const source = sourceIdentity(root);

const structuralLines: { file: string; sourceSha256: string; line: number; text: string }[] = [];
const claims: Record<string, unknown>[] = [];
for (const file of documents) {
  const sha = artifact(root, file).sha256;
  readFileSync(resolve(root, file), 'utf8').split('\n').forEach((text, index) => {
    if (!text.trim()) return;
    if (isStructuralDocumentLine(text)) { structuralLines.push({ file, sourceSha256: sha, line: index + 1, text }); return; }
    /*
     * validateReleaseClaimCoverage requires each release-notes document to carry at
     * least one `performance` row describing a measured win and one describing a
     * measured loss, and every performance row must state an exact numeric value that
     * also appears in the line and cite a receipt path present in the document. Only
     * lines that actually state such a number are classified `performance`; anything
     * else stays `capability` so a prose sentence cannot masquerade as a measurement.
     */
    const measured = MEASURED_DIRECTION.test(text) && EXACT_NUMBER.test(text);
    claims.push({ file, line: index + 1, text, sourceSha256: sha,
      kind: measured ? 'performance' : 'capability',
      surface: 'createAuraApp root safe API', requirements: [], receipts: [], assertions: [] });
  });
}

// Historical 2.0.4/3.0.0 references across all tracked markdown, each with a reason.
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim().split('\0').filter(Boolean);
const markdown = [...new Set([...git('ls-files','--cached','--others','--exclude-standard','-z')])]
  .filter(p => p.endsWith('.md') && existsSync(resolve(root, p)) && !/^(archive|release-artifacts|tests\/reports|\.goal|\.orchestrate)\//.test(p));
const historicalInventory: { file: string; sourceSha256: string; line: number; text: string; reason: string }[] = [];
for (const file of markdown) {
  const sha = artifact(root, file).sha256;
  readFileSync(resolve(root, file), 'utf8').split('\n').forEach((text, index) => {
    if (!/\b(?:2\.0\.4|3\.0\.0)\b/.test(text)) return;
    historicalInventory.push({ file, sourceSha256: sha, line: index + 1, text,
      reason: 'Historical release reference retained verbatim as a record of the 2.0.4/3.0.0 train. '
        + 'Its measurements belong to that release and are not promoted into 3.0.1 rendered, package, or publication evidence.' });
  });
}

const config = { schema: 'muse301-final-claims/v1', source,
  documents: documents.map(path => artifact(root, path)), claims, historicalInventory, structuralLines };
writeFileSync(resolve(root, out), `${JSON.stringify(config, null, 2)}\n`);
console.log(JSON.stringify({ out, documents: documents.length, structuralLines: structuralLines.length,
  claims: claims.length, historicalInventory: historicalInventory.length }));
