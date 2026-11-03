import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  HISTORICAL_INPUT_SCHEMA,
  HISTORICAL_REQUEST_SCHEMA,
  HISTORICAL_REPORT_PATHS,
  buildHistoricalInputManifest,
  evaluateHistoricalResults,
  evaluateHistoricalReplayResults,
  validateHistoricalReplayContract,
  validateHistoricalInputs
} from '../../../tools/remote-acr/historical-acceptance.mjs';
import { HISTORICAL_ACCEPTANCE_TESTS, HISTORICAL_REPLAY_ASSERTIONS, HISTORICAL_REPLAY_FIXTURES,
  HISTORICAL_REPLAY_INAPPLICABLE, HISTORICAL_REPLAY_SOURCE_TEST, HISTORICAL_REPLAY_TEST } from '../../../tools/remote-acr/source-checks.mjs';

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const firstCommit = `8471cb2f${'a'.repeat(32)}`;
const gatePath = 'tests/reports/native-capabilities/code-complete-go.json';
const gateHash = 'b'.repeat(64);

/** Synthetic source-only values: these are never written as acceptance evidence. */
function fixture() {
  const gate = {
    freezeCommit: 'c'.repeat(40), sourceInputDigest: 'd'.repeat(64), lockfileSha256: 'e'.repeat(64),
    runId: 'source-fixture', candidatePlan: { path: 'tests/reports/native-capabilities/run/candidate-plan.json', sha256: 'f'.repeat(64) },
    deferredAcceptanceTests: (HISTORICAL_ACCEPTANCE_TESTS as readonly string[]).map((path, index) => ({
      path, sha256: String(index + 1).repeat(64), phase: 'acceptance', status: 'not-run',
      assertionIds: [`${path}::case one`, `${path}::case two`]
    }))
  };
  const bytes = new Map<string, Buffer>();
  const reports = (HISTORICAL_REPORT_PATHS as readonly string[]).map((path, index) => {
    const body = Buffer.from(JSON.stringify({ synthetic: true, index }));
    bytes.set(path, body);
    const artifactPath = `aura3d-browser-artifacts/reports/${path.slice('tests/reports/'.length)}`;
    const receiptPath = `tests/reports/native-historical-inputs/example/receipt-${index}.json`;
    const receipt = Buffer.from(JSON.stringify({
      schema: 'aura3d.native-browser-run/1', runId: `browser-${index}`, sourceRunId: gate.runId,
      gateSha256: gateHash, freezeCommit: gate.freezeCommit, sourceInputDigest: gate.sourceInputDigest,
      lockfileSha256: gate.lockfileSha256, candidatePlan: gate.candidatePlan,
      discoveryExit: 0, playwrightExit: 0, inventoryExit: 0, project: 'chromium-automation',
      artifacts: [{ path: artifactPath, size: body.length, sha256: hash(body) }]
    }));
    bytes.set(receiptPath, receipt);
    return { path, sha256: hash(body), size: body.length,
      provenance: { kind: 'candidate-browser-run', receipt: { path: receiptPath, sha256: hash(receipt) }, artifactPath } };
  });
  const historyPath = 'tests/reports/native-historical-inputs/example/history.bundle';
  const historyBytes = Buffer.from('synthetic bundle bytes, never executed');
  bytes.set(historyPath, historyBytes);
  const manifest = {
    schema: HISTORICAL_INPUT_SCHEMA, gate: { path: gatePath, sha256: gateHash },
    candidate: { freezeCommit: gate.freezeCommit, sourceInputDigest: gate.sourceInputDigest,
      lockfileSha256: gate.lockfileSha256, candidatePlan: gate.candidatePlan },
    reports, history: { path: historyPath, sha256: hash(historyBytes), size: historyBytes.length,
      freezeCommit: gate.freezeCommit, firstCommit, parentCommit: '9'.repeat(40) }
  };
  const read = (ref: { path: string; sha256: string }, max: number) => {
    const body = bytes.get(ref.path);
    if (!body || body.length > max || hash(body) !== ref.sha256) throw new Error('input hash mismatch');
    return body;
  };
  return { gate, manifest, bytes, read };
}

describe('historical acceptance input preflight', () => {
  it('binds the exact deferred files and all measured artifacts to the candidate', () => {
    const { gate, manifest, read } = fixture();
    const result = validateHistoricalInputs(manifest, gate, gatePath, gateHash, read);
    expect(result.assertionIds).toHaveLength(6);
    expect(result.testPaths).toEqual([...HISTORICAL_ACCEPTANCE_TESTS]);
    expect(result.files).toContain(manifest.history.path);
    for (const report of manifest.reports) {
      expect(result.files).toContain(report.path);
      expect(result.files).toContain(report.provenance.receipt.path);
    }
  });

  it('rejects a mismatched gate, candidate, lockfile or plan before accepting inputs', () => {
    for (const mutate of [
      (x: ReturnType<typeof fixture>) => { x.manifest.gate.sha256 = '0'.repeat(64); },
      (x: ReturnType<typeof fixture>) => { x.manifest.candidate.freezeCommit = '0'.repeat(40); },
      (x: ReturnType<typeof fixture>) => { x.manifest.candidate.sourceInputDigest = '0'.repeat(64); },
      (x: ReturnType<typeof fixture>) => { x.manifest.candidate.lockfileSha256 = '0'.repeat(64); },
      (x: ReturnType<typeof fixture>) => { x.manifest.candidate.candidatePlan = { ...x.gate.candidatePlan, sha256: '0'.repeat(64) }; }
    ]) {
      const x = fixture(); mutate(x);
      expect(() => validateHistoricalInputs(x.manifest, x.gate, gatePath, gateHash, x.read)).toThrow();
    }
  });

  it('does not turn old reports, changed bytes or an unbound producer into current evidence', () => {
    const old = fixture();
    old.manifest.reports[0]!.provenance.kind = 'historical';
    expect(() => validateHistoricalInputs(old.manifest, old.gate, gatePath, gateHash, old.read)).toThrow(/historical|provenance/);
    const changed = fixture();
    changed.bytes.set(changed.manifest.reports[0]!.path, Buffer.from('changed'));
    expect(() => validateHistoricalInputs(changed.manifest, changed.gate, gatePath, gateHash, changed.read)).toThrow(/hash/);
    const malformed = fixture();
    const invalidBytes = Buffer.from('{');
    const malformedReport = malformed.manifest.reports[0]!;
    malformed.bytes.set(malformedReport.path, invalidBytes);
    malformedReport.sha256 = hash(invalidBytes); malformedReport.size = invalidBytes.length;
    expect(() => validateHistoricalInputs(malformed.manifest, malformed.gate, gatePath, gateHash, malformed.read)).toThrow(/malformed report/);
    const unbound = fixture();
    const ref = unbound.manifest.reports[0]!.provenance.receipt;
    const receipt = JSON.parse(unbound.bytes.get(ref.path)!.toString('utf8'));
    receipt.sourceInputDigest = '0'.repeat(64);
    const encoded = Buffer.from(JSON.stringify(receipt));
    unbound.bytes.set(ref.path, encoded); ref.sha256 = hash(encoded);
    expect(() => validateHistoricalInputs(unbound.manifest, unbound.gate, gatePath, gateHash, unbound.read)).toThrow(/unverified producer/);
  });

  it('rejects missing, duplicate, unsafe and mismatched retained inputs', () => {
    const missing = fixture(); missing.manifest.reports.pop();
    expect(() => validateHistoricalInputs(missing.manifest, missing.gate, gatePath, gateHash, missing.read)).toThrow(/inventory/);
    const duplicate = fixture(); duplicate.manifest.reports[1] = duplicate.manifest.reports[0]!;
    expect(() => validateHistoricalInputs(duplicate.manifest, duplicate.gate, gatePath, gateHash, duplicate.read)).toThrow(/inventory/);
    const unsafe = fixture(); unsafe.manifest.reports[0]!.provenance.receipt.path = '../credential';
    expect(() => validateHistoricalInputs(unsafe.manifest, unsafe.gate, gatePath, gateHash, unsafe.read)).toThrow(/unsafe/);
    const history = fixture(); history.manifest.history.freezeCommit = '0'.repeat(40);
    expect(() => validateHistoricalInputs(history.manifest, history.gate, gatePath, gateHash, history.read)).toThrow(/history/);
    const failed = fixture();
    const ref = failed.manifest.reports[0]!.provenance.receipt;
    const receipt = JSON.parse(failed.bytes.get(ref.path)!.toString('utf8')); receipt.playwrightExit = 1;
    const encoded = Buffer.from(JSON.stringify(receipt)); failed.bytes.set(ref.path, encoded); ref.sha256 = hash(encoded);
    expect(() => validateHistoricalInputs(failed.manifest, failed.gate, gatePath, gateHash, failed.read)).toThrow(/unverified producer/);
  });

  it('refuses launcher entrypoints from a guarded source process', () => {
    for (const args of [
      ['tools/remote-acr/historical-acceptance.mjs', '--phase', 'preflight'],
      ['tools/remote-acr/historical-acceptance.mjs', '--phase', 'execute'],
      ['tools/remote-acr/historical-acceptance.mjs', '--phase', 'prepare'],
      ['tools/remote-acr/historical-acceptance.mjs', '--phase', 'replay-preflight'],
      ['tools/remote-acr/historical-acceptance.mjs', '--phase', 'replay-execute']
    ]) {
      if (process.env.AURA3D_SOURCE_PROCESS_GUARD === '1') {
        expect(() => spawnSync(process.execPath, args, { cwd: process.cwd(), env: { ...process.env }, encoding: 'utf8' })).toThrow(/source phase refuses/);
        continue;
      }
      const child = spawnSync(process.execPath, args, { cwd: process.cwd(), env: { ...process.env, AURA3D_SOURCE_PROCESS_GUARD: '1' }, encoding: 'utf8' });
      expect(child.status).toBe(2);
      expect(child.stderr).toContain('forbidden during source work');
    }
    for (const path of ['tools/remote-acr/run.sh', 'tools/remote-acr/task-run.sh']) {
      // In a source job, source-checks installs a stronger process-level guard
      // which refuses either outer launcher before Bash can start it.
      if (process.env.AURA3D_SOURCE_PROCESS_GUARD === '1') {
        expect(() => spawnSync('bash', [path], { cwd: process.cwd(), env: { ...process.env }, encoding: 'utf8' })).toThrow(/source phase refuses/);
        continue;
      }
      const child = spawnSync('bash', [path], { cwd: process.cwd(), env: { ...process.env, AURA3D_SOURCE_PROCESS_GUARD: '1' }, encoding: 'utf8' });
      expect(child.status).toBe(2);
      expect(child.stderr).toContain('forbidden');
    }
  });
});

describe('separate first-party historical replay cell', () => {
  function replayFixture() {
    const row = { schema: 'aura3d.historical-replay-inventory/1', kind: 'first-party-historical-regression',
      path: HISTORICAL_REPLAY_TEST, sha256: '1'.repeat(64), phase: 'acceptance', status: 'not-run',
      assertionIds: [...HISTORICAL_REPLAY_ASSERTIONS], inapplicableAssertionIds: [...HISTORICAL_REPLAY_INAPPLICABLE],
      sourceTest: { path: HISTORICAL_REPLAY_SOURCE_TEST, sha256: '2'.repeat(64) },
      fixtures: HISTORICAL_REPLAY_FIXTURES.map((ref: { path: string; sha256: string }): { path: string; sha256: string } => ({ ...ref })), currentCandidateBrowserReceipt: false };
    const gate = { deferredReplayTests: row };
    const assertions = row.assertionIds.map(id => ({ fullName: id.slice(row.path.length + 2), status: 'passed' }));
    const inapplicable = row.inapplicableAssertionIds.map(id => ({ fullName: id.slice(row.path.length + 2), status: 'pending' }));
    const report = { success: true, numTotalTests: assertions.length + inapplicable.length,
      testResults: [{ name: `/repo/${row.path}`, assertionResults: [...assertions, ...inapplicable] }] };
    return { gate, row, report };
  }

  it('binds the nine assertions and all first-party fixture identities without claiming browser evidence', () => {
    const { gate, row } = replayFixture();
    expect(validateHistoricalReplayContract(gate)).toEqual(row);
    expect(row.assertionIds).toHaveLength(9);
    expect(row.fixtures).toHaveLength(8);
    expect(row.currentCandidateBrowserReceipt).toBe(false);
  });

  it('rejects fixture, path, assertion and provenance changes', () => {
    const changed = replayFixture(); changed.row.fixtures[0]!.sha256 = '0'.repeat(64);
    expect(() => validateHistoricalReplayContract(changed.gate)).toThrow(/fixture/);
    const missing = replayFixture(); missing.row.assertionIds.pop();
    expect(() => validateHistoricalReplayContract(missing.gate)).toThrow(/assertion/);
    const mislabeled = replayFixture(); mislabeled.row.currentCandidateBrowserReceipt = true;
    expect(() => validateHistoricalReplayContract(mislabeled.gate)).toThrow(/contract/);
    const wrongSource = replayFixture(); wrongSource.row.sourceTest.path = 'tests/unit/other.test.ts';
    expect(() => validateHistoricalReplayContract(wrongSource.gate)).toThrow(/contract/);
  });

  it('requires the nine applicable assertions to pass and labels inactive declarations inapplicable', () => {
    const { gate, report } = replayFixture();
    const result = evaluateHistoricalReplayResults(report, gate, '/repo');
    expect(result.status).toBe('passed');
    expect(result.passed).toHaveLength(9);
    expect(result.inapplicable).toHaveLength(2);
    expect(result.inapplicable.every((item: { status: string }) => item.status === 'pending')).toBe(true);
    report.testResults[0]!.assertionResults[9]!.status = 'passed';
    expect(evaluateHistoricalReplayResults(report, gate, '/repo').invalidInactive).toHaveLength(1);
  });

  it('distinguishes missing, failed, skipped, unexpected and omitted inactive cases', () => {
    const { gate, report } = replayFixture();
    const assertions = report.testResults[0]!.assertionResults;
    assertions[0]!.status = 'failed';
    assertions[1]!.status = 'pending';
    assertions.splice(2, 1);
    assertions.pop(); // one expected inactive declaration was not discovered
    assertions.push({ fullName: 'unexpected assertion', status: 'passed' });
    report.success = false; report.numTotalTests = assertions.length;
    const result = evaluateHistoricalReplayResults(report, gate, '/repo');
    expect(result.status).toBe('failed');
    expect(result.failed).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.missing).toHaveLength(1);
    expect(result.unexpected).toHaveLength(1);
    expect(result.inapplicable.some((item: { status: string }) => item.status === 'not-discovered')).toBe(true);
  });
});

describe('historical manifest preparation', () => {
  function requestFixture() {
    const source = fixture();
    const request = { schema: HISTORICAL_REQUEST_SCHEMA,
      reports: source.manifest.reports.map(report => ({ path: report.path, receiptPath: report.provenance.receipt.path })),
      history: { path: source.manifest.history.path, firstCommit: source.manifest.history.firstCommit, parentCommit: source.manifest.history.parentCommit } };
    const read = (path: string, max: number) => {
      const body = source.bytes.get(path);
      if (!body || body.length > max) throw new Error('missing or oversized input');
      return body;
    };
    return { ...source, request, readPath: read };
  }

  it('derives hashes and exact artifact references from existing candidate-bound bytes', () => {
    const x = requestFixture();
    const before = new Map(x.bytes);
    const manifest = buildHistoricalInputManifest(x.request, x.gate, gatePath, gateHash, x.readPath);
    expect(manifest).toEqual(x.manifest);
    expect(x.bytes).toEqual(before);
  });

  it('fails rather than inventing a missing or ambiguous report, receipt or history', () => {
    const missing = requestFixture(); missing.bytes.delete(missing.request.reports[0]!.path);
    expect(() => buildHistoricalInputManifest(missing.request, missing.gate, gatePath, gateHash, missing.readPath)).toThrow(/missing/);
    const receipt = requestFixture(); receipt.bytes.delete(receipt.request.reports[0]!.receiptPath);
    expect(() => buildHistoricalInputManifest(receipt.request, receipt.gate, gatePath, gateHash, receipt.readPath)).toThrow(/missing/);
    const history = requestFixture(); history.bytes.delete(history.request.history.path);
    expect(() => buildHistoricalInputManifest(history.request, history.gate, gatePath, gateHash, history.readPath)).toThrow(/missing/);
    const duplicate = requestFixture(); duplicate.request.reports[1] = duplicate.request.reports[0]!;
    expect(() => buildHistoricalInputManifest(duplicate.request, duplicate.gate, gatePath, gateHash, duplicate.readPath)).toThrow(/ambiguous/);
  });

  it('refuses malformed reports and self-consistent receipts from a different candidate', () => {
    const malformed = requestFixture(); malformed.bytes.set(malformed.request.reports[0]!.path, Buffer.from('{'));
    expect(() => buildHistoricalInputManifest(malformed.request, malformed.gate, gatePath, gateHash, malformed.readPath)).toThrow();
    const stale = requestFixture();
    const receiptPath = stale.request.reports[0]!.receiptPath;
    const receipt = JSON.parse(stale.bytes.get(receiptPath)!.toString('utf8'));
    receipt.freezeCommit = '0'.repeat(40);
    stale.bytes.set(receiptPath, Buffer.from(JSON.stringify(receipt)));
    expect(() => buildHistoricalInputManifest(stale.request, stale.gate, gatePath, gateHash, stale.readPath)).toThrow(/unverified producer/);
  });
});

describe('historical acceptance result inventory', () => {
  function resultFixture() {
    const { gate } = fixture();
    const testResults = gate.deferredAcceptanceTests.map(row => ({ name: `/repo/${row.path}`,
      assertionResults: row.assertionIds.map(id => ({ fullName: id.slice(row.path.length + 2), status: 'passed' })) }));
    return { gate, report: { success: true, numTotalTests: 6, testResults } };
  }

  it('requires every exact named assertion once', () => {
    const { gate, report } = resultFixture();
    const result = evaluateHistoricalResults(report, gate, '/repo');
    expect(result.status).toBe('passed');
    expect(result.passed).toHaveLength(6);
    report.testResults[0]!.assertionResults.push({ ...report.testResults[0]!.assertionResults[0]! });
    expect(() => evaluateHistoricalResults(report, gate, '/repo')).toThrow(/duplicate/);
  });

  it('keeps failed, skipped, missing and unexpected cases distinct', () => {
    const { gate, report } = resultFixture();
    report.success = false;
    report.testResults[0]!.assertionResults[0]!.status = 'failed';
    report.testResults[0]!.assertionResults[1]!.status = 'pending';
    report.testResults[1]!.assertionResults.pop();
    report.testResults[2]!.assertionResults.push({ fullName: 'unexpected', status: 'passed' });
    const result = evaluateHistoricalResults(report, gate, '/repo');
    expect(result.status).toBe('failed');
    expect(result.failed).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.missing).toHaveLength(1);
    expect(result.unexpected).toHaveLength(1);
  });
});
