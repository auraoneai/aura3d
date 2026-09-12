#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceIdentity } from './source-identity.mjs';
import { validateModernVisualReviewManifest } from './visual-review-manifest.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const SOURCE_KEYS = ['commit', 'tree', 'lockfileSha256', 'fingerprint'];
const REQUIRED_SECTIONS = ['flagship-routes', 'showcase-games', 'aura-clash', 'night-adoption', 'crowd-adoption', 'selected-threejs-comparison'];
const MANIFEST_PATH = 'release-artifacts/3.0.1-final-visual-review-manifest.json';
const APPROVAL_PATH = 'release-artifacts/3.0.1-final-visual-review-approval.json';
const ORIGIN_PATH = 'release-artifacts/3.0.1-final-visual-review-origin.json';

function safePath(path) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || path.includes('\\') || path.split('/').includes('..') || posix.normalize(path) !== path) throw new Error(`Invalid review path ${path}`);
  return path;
}
function sameSource(a, b) { return SOURCE_KEYS.every(key => typeof a?.[key] === 'string' && a[key] === b?.[key]); }
function populated(value) { return typeof value === 'string' && value.trim().length > 0; }
function humanIdentity(id, name) {
  return populated(id) && populated(name) && !/pending|unassigned|unknown|machine|bot|automated|fixture|synthetic|github-actions|dependabot/i.test(`${id} ${name}`);
}
function readJson(readBytes, path) { return JSON.parse(Buffer.from(readBytes(safePath(path))).toString('utf8')); }

export function validateFinalGallery({ manifest, source, readBytes }) {
  const errors = validateModernVisualReviewManifest(manifest, source, readBytes);
  if (manifest?.schema !== 'aura3d.final-visual-review-manifest/2.0' || manifest?.version !== '3.0.1' || manifest?.status !== 'independent-human-approval-pending' || !sameSource(manifest?.source, source)) errors.push('Final gallery version, status, or source is invalid');
  if (manifest?.sections?.length !== REQUIRED_SECTIONS.length || REQUIRED_SECTIONS.some(id => manifest.sections.filter(section => section.id === id && section.artifacts?.length > 0).length !== 1)) errors.push('Final gallery does not contain exactly the six required review scopes');
  return [...new Set(errors)];
}

export function buildFinalReviewDecision({ manifest, manifestPath = MANIFEST_PATH, manifestBytes, source, decision, reviewer, reviewedAt, statement, recordId }) {
  const normalizedDecision = decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : null;
  if (!normalizedDecision) throw new Error('Review decision must be approved or rejected');
  if (!sameSource(manifest?.source, source) || manifest?.version !== '3.0.1') throw new Error('Review manifest is not bound to the exact 3.0.1 source');
  if (!humanIdentity(reviewer?.id, reviewer?.name) || reviewer?.kind !== 'human') throw new Error('A named human reviewer is required');
  if (!populated(statement) || statement.trim().length < 20) throw new Error('A substantive review statement is required');
  if (!populated(recordId) || !Number.isFinite(Date.parse(reviewedAt)) || Date.parse(reviewedAt) < Date.parse(manifest.generatedAt)) throw new Error('Review origin or time is invalid');
  const manifestSha256 = sha256(manifestBytes);
  const sections = REQUIRED_SECTIONS.map(id => ({ id, decision: normalizedDecision, blockingIssues: normalizedDecision === 'approved' ? [] : ['Reviewer rejected this scope'] }));
  const origin = {
    schema: 'aura3d.final-visual-review-origin/1.0', version: '3.0.1', recordId,
    actor: reviewer, decision: normalizedDecision, independent: true, reviewedAt,
    manifest: { path: manifestPath, sha256: manifestSha256 }, manifestSha256,
    sourceCommit: source.commit, sourceFingerprint: source.fingerprint, statement, sections
  };
  const originBytes = Buffer.from(`${JSON.stringify(origin, null, 2)}\n`);
  const approval = {
    schema: 'aura3d.final-visual-review-approval/1.0', version: '3.0.1', decision: normalizedDecision,
    reviewer, independent: true, reviewedAt, statement,
    manifest: { path: manifestPath, sha256: manifestSha256 }, manifestSha256,
    sourceCommit: source.commit, sourceFingerprint: source.fingerprint, sections,
    origin: { path: ORIGIN_PATH, sha256: sha256(originBytes), recordId }
  };
  return { origin, originBytes, approval, approvalBytes: Buffer.from(`${JSON.stringify(approval, null, 2)}\n`) };
}

export function validateFinalReviewApproval({ manifest, manifestPath = MANIFEST_PATH, manifestBytes, approval, source, readBytes, now = Date.now() }) {
  const errors = validateFinalGallery({ manifest, source, readBytes });
  const manifestSha256 = sha256(manifestBytes);
  const reviewer = approval?.reviewer;
  if (approval?.schema !== 'aura3d.final-visual-review-approval/1.0' || approval?.version !== '3.0.1' || approval?.decision !== 'approved' || approval?.independent !== true) errors.push('Exact gallery has not received an approved independent review');
  if (!humanIdentity(reviewer?.id, reviewer?.name) || reviewer?.kind !== 'human') errors.push('Approval does not identify a valid human reviewer');
  if (approval?.manifest?.path !== manifestPath || approval?.manifest?.sha256 !== manifestSha256 || approval?.manifestSha256 !== manifestSha256 || approval?.sourceCommit !== source.commit || approval?.sourceFingerprint !== source.fingerprint) errors.push('Approval does not bind the exact gallery and source');
  const reviewedAt = Date.parse(approval?.reviewedAt);
  if (!Number.isFinite(reviewedAt) || reviewedAt < Date.parse(manifest?.generatedAt) || reviewedAt > now) errors.push('Approval time is invalid');
  if (!Array.isArray(approval?.sections) || approval.sections.length !== REQUIRED_SECTIONS.length || REQUIRED_SECTIONS.some(id => approval.sections.filter(section => section.id === id && section.decision === 'approved' && Array.isArray(section.blockingIssues) && section.blockingIssues.length === 0).length !== 1)) errors.push('Approval does not approve every required gallery scope');
  try {
    const originRef = approval.origin;
    const originBytes = Buffer.from(readBytes(safePath(originRef?.path)));
    if (originRef?.path !== ORIGIN_PATH || !/^[a-f0-9]{64}$/.test(originRef?.sha256 ?? '') || sha256(originBytes) !== originRef.sha256 || !populated(originRef?.recordId)) throw new Error('origin reference mismatch');
    const origin = JSON.parse(originBytes.toString('utf8'));
    if (origin.schema !== 'aura3d.final-visual-review-origin/1.0' || origin.version !== '3.0.1' || origin.recordId !== originRef.recordId || origin.actor?.id !== reviewer?.id || origin.actor?.name !== reviewer?.name || origin.actor?.kind !== 'human' || origin.decision !== 'approved' || origin.independent !== true || origin.reviewedAt !== approval.reviewedAt || origin.manifest?.path !== manifestPath || origin.manifestSha256 !== manifestSha256 || origin.sourceCommit !== source.commit || origin.sourceFingerprint !== source.fingerprint || origin.statement !== approval.statement) throw new Error('origin record differs from approval');
  } catch (error) { errors.push(`Human decision origin record is invalid: ${error instanceof Error ? error.message : String(error)}`); }
  return [...new Set(errors)];
}

function option(args, name) { const index = args.indexOf(name); if (index < 0) return undefined; const value = args[index + 1]; if (!value || value.startsWith('--')) throw new Error(`Missing ${name}`); return value; }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const [mode, ...args] = process.argv.slice(2);
  const manifestPath = option(args, '--manifest') ?? MANIFEST_PATH;
  if (manifestPath !== MANIFEST_PATH) throw new Error(`Canonical manifest path required: ${MANIFEST_PATH}`);
  const readBytes = path => readFileSync(resolve(root, safePath(path)));
  const manifestBytes = readBytes(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const source = sourceIdentity(root);
  const galleryErrors = validateFinalGallery({ manifest, source, readBytes });
  if (galleryErrors.length) throw new Error(`Final gallery validation failed: ${galleryErrors.join('; ')}`);
  if (mode === 'validate-gallery') {
    console.log(`Validated exact-source 3.0.1 final gallery with ${manifest.artifactCount} artifacts.`);
  } else if (mode === 'record') {
    const decision = process.env.A3D_REVIEW_DECISION;
    const reviewer = { id: process.env.A3D_REVIEWER_ID, name: process.env.A3D_REVIEWER_NAME, kind: 'human' };
    const reviewedAt = process.env.A3D_REVIEWED_AT ?? new Date().toISOString();
    const result = buildFinalReviewDecision({ manifest, manifestPath, manifestBytes, source, decision, reviewer, reviewedAt, statement: process.env.A3D_REVIEW_STATEMENT, recordId: process.env.A3D_REVIEW_RECORD_ID });
    for (const [path, bytes] of [[ORIGIN_PATH, result.originBytes], [APPROVAL_PATH, result.approvalBytes]]) {
      const output = resolve(root, path); if (relative(root, output).startsWith('..') || existsSync(output)) throw new Error(`Refusing to overwrite review record ${path}`); mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, bytes, { flag: 'wx' });
    }
    console.log(`Recorded ${decision} human review for exact manifest ${sha256(manifestBytes)}.`);
  } else if (mode === 'verify') {
    const approval = readJson(readBytes, option(args, '--approval') ?? APPROVAL_PATH);
    const errors = validateFinalReviewApproval({ manifest, manifestPath, manifestBytes, approval, source, readBytes });
    if (errors.length) throw new Error(`Final review approval failed: ${errors.join('; ')}`);
    console.log(`Verified independent human approval for exact 3.0.1 gallery ${sha256(manifestBytes)}.`);
  } else throw new Error('usage: final-review-approval.mjs validate-gallery|record|verify');
}
