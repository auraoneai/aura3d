import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildFinalReviewDecision, validateFinalReviewApproval } from '../../../tools/release/final-review-approval.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const source = { commit: 'c'.repeat(40), tree: 't'.repeat(40), lockfileSha256: 'l'.repeat(64), fingerprint: 'f'.repeat(64) };
const ids = ['flagship-routes', 'showcase-games', 'aura-clash', 'night-adoption', 'crowd-adoption', 'selected-threejs-comparison'];
function fixture() {
  const files = new Map();
  const sections = ids.map((id, index) => {
    const path = `capture-${index}.png`, reportPath = `receipt-${index}.json`;
    const png = Buffer.alloc(24); Buffer.from('89504e470d0a1a0a','hex').copy(png); Buffer.from('IHDR').copy(png,12); png.writeUInt32BE(1,16); png.writeUInt32BE(1,20);
    const report = Buffer.from(JSON.stringify({ source })); files.set(path, png); files.set(reportPath, report);
    return { id, approvalScope: id, fileCount: 1, artifacts: [{ path, source, sha256: sha(png), bytes: png.length, producer: { command: 'capture', report: { path: reportPath, sha256: sha(report) } } }] };
  });
  const indexPath = 'release-artifacts/index.json'; const index = Buffer.from('{}'); files.set(indexPath,index);
  const manifest = { schema:'aura3d.final-visual-review-manifest/2.0',version:'3.0.1',generatedAt:'2026-09-12T10:00:00Z',command:['gallery'],cwd:'.',source,sourceCommit:source.commit,sourceFingerprint:source.fingerprint,artifactIndex:{path:indexPath,sha256:sha(index)},status:'independent-human-approval-pending',claimBoundary:'Review applies only to the exact artifacts and scopes listed; this producer cannot approve them.',sectionCount:6,artifactCount:6,sections };
  // The production manifest validator rebuilds from its index. This unit focuses
  // approval binding, so provide the rebuilt index represented by the manifest.
  const input = { version:'3.0.1',source,sections:sections.map(section=>({id:section.id,approvalScope:section.approvalScope,artifacts:section.artifacts.map(a=>({path:a.path,source,sha256:a.sha256,producer:a.producer}))})) };
  // validateModernVisualReviewManifest expects the source input, not the derived index.
  files.set(indexPath,Buffer.from(JSON.stringify(input)));
  manifest.artifactIndex.sha256=sha(files.get(indexPath));
  const bytes=Buffer.from(JSON.stringify(manifest));
  const built=buildFinalReviewDecision({manifest,manifestBytes:bytes,source,decision:'approved',reviewer:{id:'gchahal1982',name:'Gurbaksh Chahal',kind:'human'},reviewedAt:'2026-09-12T11:00:00Z',statement:'I reviewed every exact gallery scope and approve these artifacts.',recordId:'github:auraoneai/aura3d/actions/runs/123'});
  files.set('release-artifacts/3.0.1-final-visual-review-origin.json',built.originBytes);
  return {files,manifest,manifestBytes:bytes,approval:built.approval,source,readBytes:path=>files.get(path)};
}

test('approval binds the exact manifest, source, reviewer, scopes, and origin',()=>{const f=fixture();assert.deepEqual(validateFinalReviewApproval({...f,now:Date.parse('2026-09-12T12:00:00Z')}),[]);});
test('changed manifest or machine reviewer fails closed',()=>{const f=fixture();const approval=structuredClone(f.approval);approval.reviewer={kind:'human',id:'ci-fixture',name:'Automated bot'};assert.match(validateFinalReviewApproval({...f,approval,now:Date.parse('2026-09-12T12:00:00Z')}).join(' '),/human reviewer|origin record/);const changed=Buffer.concat([f.manifestBytes,Buffer.from('\n')]);assert.match(validateFinalReviewApproval({...f,manifestBytes:changed,now:Date.parse('2026-09-12T12:00:00Z')}).join(' '),/exact gallery/);});
test('missing scope approval and altered origin fail closed',()=>{const f=fixture();const approval=structuredClone(f.approval);approval.sections.pop();assert.match(validateFinalReviewApproval({...f,approval,now:Date.parse('2026-09-12T12:00:00Z')}).join(' '),/every required/);f.files.set(approval.origin.path,Buffer.from('{}'));assert.match(validateFinalReviewApproval({...f,now:Date.parse('2026-09-12T12:00:00Z')}).join(' '),/origin record/);});
