import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { loadMuse301ExecutionRequirements, loadMuse301Ledger, MUSE301_LEDGER_PATH, sha256 } from './requirements.js';

// This producer inventories evidence requirements; it does not certify execution.
const root = process.cwd();
const output = resolve(root, process.argv[2] ?? 'tests/reports/muse3jsparity-301-traceability.json');
const ledger = loadMuse301Ledger(root);
const original = new Map(ledger.requirements.map(item => [item.id, item]));
const references = (paths: readonly string[]) => [...new Set(paths)].map(path => ({
  path,
  status: /[{}*?]/.test(path) ? 'pattern-unresolved' : existsSync(resolve(root, path)) ? 'present' : 'missing',
}));
const requirements = loadMuse301ExecutionRequirements(root).map(item => {
  const historical = original.get(item.id);
  return {
    id: item.id,
    part: item.part,
    sourceLine: item.sourceLine,
    sourceText: item.sourceText,
    gates: item.gates,
    assertions: item.assertions ?? null,
    derivation: item.derivation ?? null,
    allOf: item.allOf ?? null,
    releaseMigration: item.releaseMigration ?? null,
    proofGates: item.proofGates ?? item.gates,
    dependsOn: item.dependsOn ?? [],
    declaredState: historical?.state ?? 'unverified',
    sourceFiles: references(historical?.sourceFiles ?? []),
    tests: references(item.tests),
    acceptanceContract: item.marketingAcceptance ?? item.reportRegenerationAcceptance ?? item.registryConsumerAcceptance ?? item.acceptance ?? item.routeAcceptance ?? item.releaseSequenceAcceptance ?? item.commandAcceptance ?? item.sourceAuditAcceptance ?? item.finalClaimsAcceptance ?? item.cleanupAcceptance ?? (item.allOf ? {allOf:item.allOf} : item.derivation ? {derivation:item.derivation} : item.id==='3.0.1:FINAL.archive' ? {phase:'archive-after-release-verification'} : null),
    producers: historical?.producers ?? [],
    closureEvidence: historical?.closureEvidence ?? [],
    // Absence of historical metadata is explicit, not inferred from nearby work.
    metadataScope: historical ? 'original-ledger' : 'remediation-work-order',
  };
});
const missingTests = [...new Set(requirements.flatMap(item => item.tests.filter(test => test.status === 'missing').map(test => test.path)))].sort();
const report = {
  schema: 'muse301-traceability-inventory/v1',
  generatedAt: new Date().toISOString(),
  claim: 'Requirement inventory only; file presence and declared states do not prove behavior or release readiness.',
  inputs: [MUSE301_LEDGER_PATH].map(path => ({ path, sha256: sha256(readFileSync(resolve(root, path))) })),
  summary: {
    requiredObligations: requirements.length,
    originalObligations: requirements.filter(item => item.metadataScope === 'original-ledger').length,
    remediationObligations: requirements.filter(item => item.metadataScope === 'remediation-work-order').length,
    declaredVerified: requirements.filter(item => item.declaredState === 'verified').length,
    unverified: requirements.filter(item => item.declaredState !== 'verified').length,
    withoutNamedTests: requirements.filter(item => item.tests.length === 0).length,
    explicitNonTestContracts: requirements.filter(item => item.acceptanceContract !== null).length,
    withoutNamedTestsOrAcceptanceContract: requirements.filter(item => item.tests.length === 0 && item.acceptanceContract === null).length,
    missingTestFiles: missingTests.length,
  },
  missingTests,
  requirements,
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: relative(root, output), ...report.summary }, null, 2));

const gaps = requirements.filter(item => item.tests.length === 0 && item.acceptanceContract === null);
const gapPath = output.replace(/\.json$/, '-proof-gaps.md');
const assignment = (id:string): {owner:string;status:string} => {
 if (/^L[23]\./.test(id) || id==='3.0.1:FINAL.check.27') return {owner:'claims_audit + gate_finish',status:'Canonical source replay, surface equality and document invariants in implementation'};
 if (id==='L4.task.3') return {owner:'package_acceptance_producer + gate_finish',status:'Bind generated bundle Markdown to canonical measurements; GH attachments implemented'};
 if (/^L5\./.test(id)) return {owner:'release_prepare + gate_finish',status:'Actual preflight/publication/post-registry command and lifecycle contracts in implementation'};
 if (/^L6\./.test(id)) return {owner:'release_prepare + claims_audit',status:'Retained marketing build/deployment and source/history invariants required'};
 if(id==='3.0.1:L02.task.1')return {owner:'release_prepare/visual_release + gate_finish',status:'Pure exact-gallery validator in implementation'};
 if(/^3\.0\.1:Q02\./.test(id))return {owner:'gate_finish + remote_validation',status:'Exact route gameplay/composition and typed asset provenance integration required'};
 return {owner:'gate_finish + release_prepare',status:'Explicit final-source, sequencing or command contract required; remains open'};
};
const gapLines = ['# Unmapped proof contracts', '', `Generated ${report.generatedAt}. ${requirements.length} total obligations; ${gaps.length} lack a named test or typed acceptance contract.`, '', 'Inventory only. Owner assignments describe implementation responsibility, not verified completion. Every original requirement ID and source text is preserved.', '', '| Requirement | Proof gates | Implementation owner | Contract status | Required behavior |', '| --- | --- | --- | --- | --- |', ...gaps.map(item => {const assigned=assignment(item.id);return `| ${item.id} | ${item.proofGates.join(', ')} | ${assigned.owner} | ${assigned.status} | ${item.sourceText.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`;})];
writeFileSync(gapPath, `${gapLines.join('\n')}\n`);
