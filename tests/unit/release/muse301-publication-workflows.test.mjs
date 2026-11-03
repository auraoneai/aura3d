import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildFinalReviewDecision,
  validateFinalGallery,
  validateFinalReviewApproval,
} from '../../../tools/release/final-review-approval.mjs';
import {
  assertReleaseInventory,
  publicPackageNames,
} from '../../../tools/release/release-inventory.mjs';
import { buildModernVisualReviewManifest } from '../../../tools/release/visual-review-manifest.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const scopes = [
  'flagship-routes',
  'showcase-games',
  'aura-clash',
  'night-adoption',
  'crowd-adoption',
  'selected-threejs-comparison',
];
const now = Date.parse('2026-09-12T12:00:00Z');
const originPath = 'release-artifacts/3.0.1-final-visual-review-origin.json';
const readSource = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

function galleryFixture() {
  const files = new Map();
  const source = {
    commit: 'a'.repeat(40),
    tree: 'b'.repeat(40),
    lockfileSha256: 'c'.repeat(64),
    fingerprint: 'd'.repeat(64),
  };
  const sections = scopes.map((id, index) => {
    const path = `capture-${index}.png`;
    const reportPath = `receipt-${index}.json`;
    const png = Buffer.alloc(24);
    Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
    Buffer.from('IHDR').copy(png, 12);
    png.writeUInt32BE(1, 16);
    png.writeUInt32BE(1, 20);
    const report = Buffer.from(JSON.stringify({ source }));
    files.set(path, png);
    files.set(reportPath, report);
    return {
      id,
      approvalScope: id,
      artifacts: [{
        path,
        source,
        sha256: sha256(png),
        producer: { command: 'capture', report: { path: reportPath, sha256: sha256(report) } },
      }],
    };
  });
  const indexPath = 'release-artifacts/test-gallery-index.json';
  const indexBytes = Buffer.from(JSON.stringify({ version: '3.0.1', source, sections }));
  files.set(indexPath, indexBytes);
  const readBytes = (path) => {
    if (!files.has(path)) throw new Error(`Missing fixture bytes: ${path}`);
    return files.get(path);
  };
  const manifest = buildModernVisualReviewManifest({
    version: '3.0.1',
    source,
    indexPath,
    indexBytes,
    readBytes,
    generatedAt: '2026-09-12T10:00:00Z',
    command: ['gallery'],
  });
  return { files, source, readBytes, manifest, manifestBytes: Buffer.from(JSON.stringify(manifest)) };
}

function decisionInput(fixture, overrides = {}) {
  return {
    manifest: fixture.manifest,
    manifestBytes: fixture.manifestBytes,
    source: fixture.source,
    decision: 'approved',
    reviewer: { id: 'reviewer-42', name: 'Alex Park', kind: 'human' },
    reviewedAt: '2026-09-12T11:00:00Z',
    statement: 'I reviewed every exact gallery scope and approve these artifacts.',
    recordId: 'manual:visual-review:42',
    ...overrides,
  };
}

function approvedFixture() {
  const fixture = galleryFixture();
  const decision = buildFinalReviewDecision(decisionInput(fixture));
  fixture.files.set(originPath, decision.originBytes);
  return { ...fixture, approval: decision.approval };
}

test('the publisher source requires a committed exact plan and validates archives before publication', () => {
  const publisher = readSource('tools/release/publish-all.mjs');
  const committed = publisher.indexOf('if (!DRY_RUN && !PACK_ONLY) assertCommittedReleaseSource(ROOT);');
  const loadPlan = publisher.indexOf('const retainedPlan = FROM_PLAN ? loadValidatedReleasePlan(ROOT, FROM_PLAN) : null;');
  const requirePlan = publisher.indexOf('if (!DRY_RUN && !PACK_ONLY && !retainedPlan) throw');
  const bindCommit = publisher.indexOf('if (!DRY_RUN && !PACK_ONLY) bindReleasePlanToCurrentCommit(ROOT, retainedPlan);');
  const archiveFailure = publisher.indexOf('Archive changed:');
  const publish = publisher.indexOf('sh(`npm publish ');
  assert.ok(committed >= 0 && committed < loadPlan && loadPlan < requirePlan && requirePlan < bindCommit && bindCommit < publish);
  assert.ok(requirePlan < archiveFailure && archiveFailure < bindCommit);
  const planValidation = publisher.slice(requirePlan, bindCommit);
  assert.match(planValidation, /retainedPlan\.version !== version[\s\S]*retainedPlan\.lockfileSha256 !== frozenSource\.lockfileSha256/);
  assert.match(planValidation, /assertReleaseInventory\(version,\s*retainedPlan\.packages\.map/);
  assert.match(planValidation, /createHash\("sha256"\)\.update\(bytes\)\.digest\("hex"\) !== entry\.sha256\s*\|\|\s*`sha512-\$\{createHash\("sha512"\)\.update\(bytes\)\.digest\("base64"\)\}` !== entry\.integrity\)\s*throw new Error\(`Archive changed:/);
  assert.match(publisher, /const packOutput = retained \? resolve\(ROOT,\s*retained\.tarball\) : sh\(`pnpm pack/);
  assert.equal([...publisher.matchAll(/\bsh\(`pnpm pack\b/g)].length, 1);
  assert.doesNotMatch(publisher, /\bsh\(`pnpm build\b/);
});

test('the exact-plan loader checks source, inventory, archive paths, and both archive digests', () => {
  const loader = readSource('tools/release/exact-release-plan.mjs');
  assert.match(loader, /Object\.keys\(source\)\.every\(key => plan\.source\[key\] === source\[key\]\)/);
  assert.match(loader, /bindSourceIdentityToCommit\(root,\s*plan\.source/);
  assert.match(loader, /assertReleaseInventory\(plan\.version,\s*plan\.packages\.map/);
  assert.match(loader, /candidate\.version !== manifest\.version/);
  assert.match(loader, /readFileSync\(localPath\(root,\s*candidate\.tarball\)\)/);
  assert.match(loader, /path\.split\('\/'\)\.some\(part => !part \|\| part === '\.' \|\| part === '\.\.'\)/);
  assert.match(loader, /real\.startsWith\(base \+ sep\)/);
  assert.match(loader, /hash\(data\) !== candidate\.sha256\s*\|\|\s*`sha512-\$\{createHash\('sha512'\)\.update\(data\)\.digest\('base64'\)\}` !== candidate\.integrity\)\s*throw new Error\(`Exact archive mismatch/);
});

test('the 3.0.1 release inventory rejects missing, duplicate, and unexpected packages', () => {
  const packages = publicPackageNames('3.0.1');
  assert.equal(packages.length, 29);
  assert.deepEqual(assertReleaseInventory('3.0.1', [...packages]), packages);
  assert.throws(() => assertReleaseInventory('3.0.1', packages.slice(1)), /inventory mismatch/);
  assert.throws(() => assertReleaseInventory('3.0.1', [...packages, packages[0]]), /unique/);
  assert.throws(() => assertReleaseInventory('3.0.1', [...packages, '@aura3d/unexpected']), /inventory mismatch/);
});

test('validated gallery evidence remains pending without a separate review decision', () => {
  const fixture = galleryFixture();
  assert.equal(fixture.manifest.status, 'independent-human-approval-pending');
  assert.deepEqual(validateFinalGallery(fixture), []);
  assert.match(
    validateFinalReviewApproval({ ...fixture, approval: undefined, now }).join(' '),
    /has not received an approved independent review/,
  );
});

test('decision validation rejects bot identifiers, non-human types, and invalid inputs', () => {
  const fixture = galleryFixture();
  assert.throws(
    () => buildFinalReviewDecision(decisionInput(fixture, { reviewer: { id: 'build-bot', name: 'Build Bot', kind: 'human' } })),
    /named human reviewer/,
  );
  assert.throws(
    () => buildFinalReviewDecision(decisionInput(fixture, { reviewer: { id: 'reviewer-42', name: 'Alex Park', kind: 'bot' } })),
    /named human reviewer/,
  );
  assert.throws(() => buildFinalReviewDecision(decisionInput(fixture, { decision: 'pending' })), /approved or rejected/);
  assert.throws(() => buildFinalReviewDecision(decisionInput(fixture, { statement: 'yes' })), /substantive/);
  assert.throws(
    () => buildFinalReviewDecision(decisionInput(fixture, { reviewedAt: '2026-09-12T09:00:00Z' })),
    /origin or time is invalid/,
  );
  const rejected = buildFinalReviewDecision(decisionInput(fixture, { decision: 'rejected' }));
  fixture.files.set(originPath, rejected.originBytes);
  assert.match(
    validateFinalReviewApproval({ ...fixture, approval: rejected.approval, now }).join(' '),
    /has not received an approved independent review/,
  );
});

test('an approved decision binds the exact gallery, source, reviewer, scopes, and origin', () => {
  const fixture = approvedFixture();
  assert.deepEqual(fixture.approval.sections.map((section) => section.id), scopes);
  assert.deepEqual(validateFinalReviewApproval({ ...fixture, now }), []);
  const changedBytes = Buffer.concat([fixture.manifestBytes, Buffer.from('\n')]);
  assert.match(
    validateFinalReviewApproval({ ...fixture, manifestBytes: changedBytes, now }).join(' '),
    /does not bind the exact gallery and source/,
  );
  const changedSource = { ...fixture.source, fingerprint: 'e'.repeat(64) };
  assert.match(
    validateFinalReviewApproval({ ...fixture, source: changedSource, now }).join(' '),
    /source|exact gallery/i,
  );
});

test('changed gallery artifacts, producer reports, or index invalidate approval', () => {
  for (const [path, expected] of [
    ['capture-0.png', /Unreadable PNG|changed artifact/i],
    ['receipt-0.json', /Missing\/changed producer report/i],
    ['release-artifacts/test-gallery-index.json', /Changed artifact index/i],
  ]) {
    const fixture = approvedFixture();
    fixture.files.set(path, Buffer.from('{}'));
    assert.match(validateFinalReviewApproval({ ...fixture, now }).join(' '), expected, path);
  }
});

test('missing or rejected scopes, invalid times, and changed origins fail closed', () => {
  const fixture = approvedFixture();
  const missingScope = structuredClone(fixture.approval);
  missingScope.sections.pop();
  assert.match(
    validateFinalReviewApproval({ ...fixture, approval: missingScope, now }).join(' '),
    /does not approve every required gallery scope/,
  );
  const rejectedScope = structuredClone(fixture.approval);
  rejectedScope.sections[0].decision = 'rejected';
  assert.match(
    validateFinalReviewApproval({ ...fixture, approval: rejectedScope, now }).join(' '),
    /does not approve every required gallery scope/,
  );
  const futureReview = structuredClone(fixture.approval);
  futureReview.reviewedAt = '2026-09-12T13:00:00Z';
  assert.match(validateFinalReviewApproval({ ...fixture, approval: futureReview, now }).join(' '), /Approval time is invalid/);
  const changedReviewer = structuredClone(fixture.approval);
  changedReviewer.reviewer = { id: 'reviewer-99', name: 'Another Person', kind: 'human' };
  assert.match(validateFinalReviewApproval({ ...fixture, approval: changedReviewer, now }).join(' '), /origin record is invalid/);
  const unsafeOrigin = structuredClone(fixture.approval);
  unsafeOrigin.origin.path = '../outside.json';
  assert.match(validateFinalReviewApproval({ ...fixture, approval: unsafeOrigin, now }).join(' '), /origin record is invalid/);
  fixture.files.set(originPath, Buffer.from('{}'));
  assert.match(validateFinalReviewApproval({ ...fixture, now }).join(' '), /origin record is invalid/);
});
