import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOriginObservation, validateVisibleInstallPins } from './verify-release-origin.mjs';
import { validateGitHubRelease, loadRequiredReleaseArtifacts } from './verify-github-release.mjs';
const plan={version:'3.0.1',source:{commit:'commit',tree:'tree',fingerprint:'fingerprint',lockfileSha256:'lock'},reference:{sha256:'plan'},packages:[{name:'@aura3d/engine',tarball:'engine.tgz',sha256:'archive'}]};
const observation=()=>({status:200,markerStatus:200,marker:{version:plan.version,source:{...plan.source},releasePlanSha256:'plan'},text:'Aura3D3.0.1',renderedPages:[{url:'https://aura3d.example/',installBlocks:[{text:'npm install @aura3d/engine@3.0.1; npx create-aura3d@3.0.1',scope:'current',context:''}]}],links:[{url:'https://aura3d.example/docs',status:200,ok:true}],browserErrors:[]});
test('origin requires exact deployed marker and visible pins/link observations',()=>assert.deepEqual(validateOriginObservation(observation(),plan),[]));
test('stale deployed source rejects even whenversionmatches',()=>{const o=observation();o.marker.source.fingerprint='stale';assert.match(validateOriginObservation(o,plan).join(' '),/source marker/);});
test('missingexactpins andbrokenlinks reject',()=>{const o=observation();o.renderedPages[0].installBlocks[0].text='npm install @aura3d/engine@latest';o.links[0].status=404;assert.match(validateOriginObservation(o,plan).join(' '),/Wrong active install pin/);assert.match(validateOriginObservation(o,plan).join(' '),/links/);});
test('browsererrors and failedmarker response reject',()=>{const o=observation();o.browserErrors=['crash'];o.markerStatus=404;assert.equal(validateOriginObservation(o,plan).length,2);});
const github=()=>({tagCommit:'commit',release:{tag_name:'v3.0.1',draft:false,prerelease:false,published_at:'2026-09-05T00:00:00Z',body:'exact notes'},notes:'exact notes',assets:[{name:'engine.tgz',sha256:'archive'}],requiredArtifacts:{artifacts:['registry','visualManifest','humanApproval','bundleSizes'].map(id=>({id,path:`${id}.json`,sha256:id}))},attachments:['registry','visualManifest','humanApproval','bundleSizes'].map(id=>({id,name:`${id}.json`,sha256:id}))});
test('GitHub requires finaltag notes andexactdownloadedarchivebytes',()=>assert.deepEqual(validateGitHubRelease(github(),plan),[]));
test('wrongtagcommit forgednotes andchangedasset rejectindependently',()=>{const g=github();g.tagCommit='wrong';g.release.body='other';g.assets[0].sha256='wrong';assert.equal(validateGitHubRelease(g,plan).length,3);});
test('draftrelease isnotpublication proof',()=>{const g=github();g.release.draft=true;assert.match(validateGitHubRelease(g,plan).join(' '),/final published/);});

test('rawHTML comments scripts andhidden exact pins cannot supply visible install proof',()=>{const o=observation();o.renderedPages[0].installBlocks=[];o.installText='<!-- npm install @aura3d/engine@3.0.1 --> <script>npx create-aura3d@3.0.1</script><span hidden>npm install @aura3d/engine@3.0.1</span>';assert.match(validateOriginObservation(o,plan).join(' '),/Visible current exact install pin missing/);});
test('wrong active command fails even ifanother visible block hascorrectpins',()=>{const o=observation();o.renderedPages[0].installBlocks.push({text:'npm install @aura3d/engine@3.0.0',scope:'current',context:''});assert.match(validateOriginObservation(o,plan).join(' '),/Wrong active install pin/);});
test('explicit visible historical context permits oldcommands without treating them ascurrentproof',()=>{const historical={text:'npm install @aura3d/engine@2.0.0; npx create-aura3d@2.0.0',scope:'historical',context:'Historical installation instructions'};const o=observation();o.renderedPages[0].installBlocks.push(historical);assert.deepEqual(validateOriginObservation(o,plan),[]);assert.equal(validateVisibleInstallPins([historical],'3.0.1').length,2);});
test('historical scope without matching visiblecontext cannot hidewrongactivepins',()=>assert.match(validateVisibleInstallPins([{text:'npx create-aura3d@3.0.0',scope:'historical',context:'Quick start'}],'3.0.1').join(' '),/Wrong active install pin/));
test('unpinned activecommands fail instead of acceptingcorrectpins elsewhere',()=>{const o=observation();o.renderedPages[0].installBlocks.push({text:'npm install @aura3d/engine',scope:'current',context:''});assert.match(validateOriginObservation(o,plan).join(' '),/unpinned/);});

test('GitHub rejects missing required attachments even with all tarballs present',()=>{const g=github();g.attachments=[];assert.equal(validateGitHubRelease(g,plan).length,4);});
test('GitHub rejects attachment filename with changed downloaded bytes',()=>{const g=github();g.attachments[0].sha256='tampered';assert.match(validateGitHubRelease(g,plan).join(' '),/attachment mismatch registry/);});
test('GitHub requires manifest and rejects duplicate attachment observations',()=>{const g=github();g.requiredArtifacts=undefined;assert.match(validateGitHubRelease(g,plan).join(' '),/Missing required/);const duplicate=github();duplicate.attachments.push({...duplicate.attachments[0]});assert.match(validateGitHubRelease(duplicate,plan).join(' '),/attachment mismatch registry/);});

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
test('required GitHub attachment manifest binds exact source plan roles and local bytes',()=>{
 const root=mkdtempSync(join(tmpdir(),'aura-github-attachments-'));
 try {
  const releasePlan={...plan,reference:{path:'plan.json',sha256:'plan'}};
  const document={schema:'aura3d-github-required-artifacts/v1',version:plan.version,source:plan.source,releasePlan:releasePlan.reference,artifacts:['registry','visualManifest','humanApproval','bundleSizes'].map(id=>{const path=`${id}.json`;writeFileSync(join(root,path),id);return{id,path,sha256:createHash('sha256').update(id).digest('hex')};})};
  const save=()=>writeFileSync(join(root,'required.json'),JSON.stringify(document));save();
  assert.equal(loadRequiredReleaseArtifacts(root,'required.json',releasePlan).artifacts.length,4);
  writeFileSync(join(root,'registry.json'),'changed');assert.throws(()=>loadRequiredReleaseArtifacts(root,'required.json',releasePlan),/bytes mismatch registry/);writeFileSync(join(root,'registry.json'),'registry');
  document.source={...plan.source,fingerprint:'stale'};save();assert.throws(()=>loadRequiredReleaseArtifacts(root,'required.json',releasePlan),/source\/plan mismatch/);
  document.source=plan.source;document.artifacts[3]={...document.artifacts[0]};save();assert.throws(()=>loadRequiredReleaseArtifacts(root,'required.json',releasePlan),/duplicate/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
