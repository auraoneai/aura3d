import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { loadValidatedReleasePlan, inspectInstalledRelease } from '../../../tools/release/exact-release-plan.mjs';
import { packageAcceptanceDocument, recordBuild, validateRemoteBuildEnvironment } from '../../../tools/release/package-acceptance.mjs';
import { sourceIdentity } from '../../../tools/release/source-identity.mjs';
import { buildReleaseArtifactManifest } from '../../../tools/release/build-artifact-manifest.mjs';
import { RELEASE_INVENTORIES, publicPackageNames } from '../../../tools/release/release-inventory.mjs';
const hash=(data,kind='sha256',encoding='hex')=>createHash(kind).update(data).digest(encoding);
// Release planning is inventory-driven (tools/release/release-inventory.mjs):
// the fixture uses the real package names of the version's inventory, with
// @aura3d/engine first. A short fixture drops names; a long one adds names
// from other inventories, so the inventory check must name both.
function inventoryFixtureNames(version,count){
 const expected=publicPackageNames(version),names=['@aura3d/engine',...expected.filter(n=>n!=='@aura3d/engine')];
 // @aura3d/addons selects the native inventory itself, so it is never an extra here.
 const extras=[...new Set(Object.values(RELEASE_INVENTORIES).flat())].filter(n=>!expected.includes(n)&&n!=='@aura3d/addons').sort();
 return count<=names.length?names.slice(0,count):[...names,...extras.slice(0,count-names.length)];
}
function fixture(version='3.0.1', count=29) {
 const root=mkdtempSync(join(tmpdir(),'aura-exact-plan-')); const write=(p,data)=>{mkdirSync(join(root,p,'..'),{recursive:true});writeFileSync(join(root,p),data);};
 write('tools/release/publish-all.mjs',readFileSync(resolve('tools/release/publish-all.mjs')));
 write('tools/release/source-identity.mjs',readFileSync(resolve('tools/release/source-identity.mjs')));
 write('tools/release/release-inventory.mjs',readFileSync(resolve('tools/release/release-inventory.mjs')));
 write('tools/release/exact-release-plan.mjs',readFileSync(resolve('tools/release/exact-release-plan.mjs')));
 const names=inventoryFixtureNames(version,count);assert.equal(names.length,count);
 const packages=names.map((name,i)=>({name,version,path:i?`packages/p${i}`:'.'}));
 for(const p of packages)write(`${p.path}/package.json`,JSON.stringify({name:p.name,version:p.version}));
 write('pnpm-lock.yaml','lockfileVersion: 9.0\n');
 execFileSync('git',['init','-q'],{cwd:root});execFileSync('git',['add','.'],{cwd:root});execFileSync('git',['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture'],{cwd:root});
 const plan={schema:'aura3d-release-plan/1.0',source:sourceIdentity(root),generatedAt:'2026-09-07T00:00:00.000Z',version,dryRun:false,packOnly:true,targetVersionUnpublished:null,expectedPackageCount:count,packageCount:count,commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),lockfileSha256:hash(readFileSync(join(root,'pnpm-lock.yaml'))),packages:packages.map((p,i)=>{const bytes=Buffer.from('archive'+i),tarball=`tests/reports/release-tarballs/p${i}.tgz`;write(tarball,bytes);return {name:p.name,version:p.version,tarball,sha256:hash(bytes),integrity:`sha512-${hash(bytes,'sha512','base64')}`};})};
 write('tests/reports/release-tarballs/release-plan.json',JSON.stringify(plan));
 return {root,plan,run:(args)=>spawnSync(process.execPath,['tools/release/publish-all.mjs',...args],{cwd:root,encoding:'utf8'}),cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
test('exact plan reuses all29archives and leaves original plan immutable',()=>{const f=fixture();try{const before=readFileSync(join(f.root,'tests/reports/release-tarballs/release-plan.json'),'utf8');const r=f.run(['--pack-only','--from-plan','tests/reports/release-tarballs/release-plan.json']);assert.equal(r.status,0,r.stderr);assert.equal(readFileSync(join(f.root,'tests/reports/release-tarballs/release-plan.json'),'utf8'),before);}finally{f.cleanup();}});
test('tampered archive fails before publication and before any repack',()=>{const f=fixture();try{writeFileSync(join(f.root,f.plan.packages[28].tarball),'tampered');const r=f.run(['--from-plan','tests/reports/release-tarballs/release-plan.json']);assert.notEqual(r.status,0);// The shared exact-plan loader rejects the changed archive before any publish or pack step.
assert.match(r.stderr,new RegExp(`Exact archive mismatch ${f.plan.packages[28].name.replace('/','\\/')}\\n`));assert.doesNotMatch(r.stdout+r.stderr,/npm (?:publish|pack)/);}finally{f.cleanup();}});
test('publishing without validated plan fails closed',()=>{const f=fixture();try{const r=f.run([]);assert.notEqual(r.status,0);assert.match(r.stderr,/Publication requires --from-plan/);}finally{f.cleanup();}});

test('dirty source invalidates exact plan even with identicalHEAD andlock',()=>{const f=fixture();try{writeFileSync(join(f.root,'packages/p1/package.json'),JSON.stringify({...JSON.parse(readFileSync(join(f.root,'packages/p1/package.json'),'utf8')),description:'changed'}));const r=f.run(['--pack-only','--from-plan','tests/reports/release-tarballs/release-plan.json']);assert.notEqual(r.status,0);assert.match(r.stderr,/Exact release source mismatch/);}finally{f.cleanup();}});

test('generated release artifact manifest preserves exact release identity',()=>{const f=fixture();try{const before=sourceIdentity(f.root);const manifest=buildReleaseArtifactManifest(f.root,'tests/reports/release-tarballs/release-plan.json');assert.equal(manifest.version,'3.0.1');assert.equal(manifest.artifacts.length,29);assert.deepEqual(manifest.source,before);assert.equal(manifest.releasePlan.sha256,hash(readFileSync(join(f.root,'tests/reports/release-tarballs/release-plan.json'))));assert.deepEqual(manifest.artifacts.map(a=>a.sha256),f.plan.packages.map(a=>a.sha256));mkdirSync(join(f.root,'docs/project'),{recursive:true});writeFileSync(join(f.root,'docs/project/release-artifacts.json'),JSON.stringify(manifest));assert.deepEqual(sourceIdentity(f.root),before);assert.doesNotThrow(()=>loadValidatedReleasePlan(f.root,'tests/reports/release-tarballs/release-plan.json'));}finally{f.cleanup();}});

test('artifact manifest rejects a noncanonical or tampered exact plan',()=>{const f=fixture();try{const path=join(f.root,'tests/reports/release-tarballs/release-plan.json');writeFileSync(path,JSON.stringify({...f.plan,packOnly:false}));assert.throws(()=>buildReleaseArtifactManifest(f.root,'tests/reports/release-tarballs/release-plan.json'),/requires either/);writeFileSync(path,JSON.stringify(f.plan));writeFileSync(join(f.root,f.plan.packages[0].tarball),'tampered');assert.throws(()=>buildReleaseArtifactManifest(f.root,'tests/reports/release-tarballs/release-plan.json'),/Exact archive mismatch/);}finally{f.cleanup();}});

test('hash-bound source review dispositions preserve exact release identity',()=>{const f=fixture();try{const before=sourceIdentity(f.root);mkdirSync(join(f.root,'docs/project/reviews'),{recursive:true});writeFileSync(join(f.root,'docs/project/reviews/muse3jsparity-301-combined-source-dispositions.json'),JSON.stringify({dispositions:[{reviewed:true}]}));assert.deepEqual(sourceIdentity(f.root),before);assert.doesNotThrow(()=>loadValidatedReleasePlan(f.root,'tests/reports/release-tarballs/release-plan.json'));}finally{f.cleanup();}});

test('administrative PRD checkbox changes preserve exact release identity',()=>{const f=fixture();try{writeFileSync(join(f.root,'muse3jsparity-3.0.1-PRD.md'),'- [ ] gate\n');execFileSync('git',['add','muse3jsparity-3.0.1-PRD.md'],{cwd:f.root});execFileSync('git',['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','add prd'],{cwd:f.root});const before=sourceIdentity(f.root);const planPath=join(f.root,'tests/reports/release-tarballs/release-plan.json');const plan={...f.plan,source:before,commit:before.commit,lockfileSha256:before.lockfileSha256};writeFileSync(planPath,JSON.stringify(plan));writeFileSync(join(f.root,'muse3jsparity-3.0.1-PRD.md'),'- [x] gate\n');assert.deepEqual(sourceIdentity(f.root),before);assert.doesNotThrow(()=>loadValidatedReleasePlan(f.root,'tests/reports/release-tarballs/release-plan.json'));}finally{f.cleanup();}});

test('package build receipts accept attested Azure Linux identity and reject local or malformed identity',()=>{const f=fixture();try{const environment={platform:'linux',hostname:'aura301-package-worker',provider:'azure',workerId:'0ec39c8a-c597-4354-92d0-500fb88a97cc'};assert.deepEqual(validateRemoteBuildEnvironment(environment),environment);const receipt=recordBuild(f.root,{outputPath:'tests/reports/release-build.json'},{identity:sourceIdentity,environment,execute:()=>({status:0,signal:null})});assert.equal(receipt.exitCode,0);assert.deepEqual(receipt.environment,environment);assert.throws(()=>validateRemoteBuildEnvironment({...environment,platform:'darwin'}),/Remote Linux/);assert.throws(()=>validateRemoteBuildEnvironment({...environment,workerId:'not-a-vm'}),/Invalid Azure/);}finally{f.cleanup();}});

test('package acceptance producer serializes the replayed schema at document root',()=>{const acceptance={schema:'muse301-packages/v1',version:'3.0.1',packages:[],scaffolds:[],lifecycleAssertions:149,checks:{}};const validationInput={path:'validation.json',sha256:'a'.repeat(64)};assert.deepEqual(packageAcceptanceDocument({acceptance},validationInput),{...acceptance,validationInput});assert.throws(()=>packageAcceptanceDocument({},validationInput),/invalid package acceptance result/);});

test('exact shared loader verifies candidate and observed npm installed integrity',()=>{const f=fixture();try{const plan=loadValidatedReleasePlan(f.root,'tests/reports/release-tarballs/release-plan.json');const project=join(f.root,'tests/reports/install');mkdirSync(join(project,'node_modules/@aura3d/engine'),{recursive:true});writeFileSync(join(project,'node_modules/@aura3d/engine/package.json'),JSON.stringify({name:'@aura3d/engine',version:'3.0.1'}));const lock={packages:{'node_modules/@aura3d/engine':{version:'3.0.1',integrity:f.plan.packages[0].integrity,resolved:'file:../release-tarballs/p0.tgz'}}};writeFileSync(join(project,'package-lock.json'),JSON.stringify(lock));assert.equal(inspectInstalledRelease(f.root,project,plan).packages.length,1);lock.packages['node_modules/@aura3d/engine'].integrity='sha512-wrong';writeFileSync(join(project,'package-lock.json'),JSON.stringify(lock));assert.throws(()=>inspectInstalledRelease(f.root,project,plan),/Installed archive identity mismatch/);}finally{f.cleanup();}});

// Fixture archives are already materialized; pack-only/from-plan validates without packing or publishing.
test('lean 4.0 candidate validates exactly 24 existing archives without publication',()=>{const f=fixture('4.0.0',24);try{assert.equal(loadValidatedReleasePlan(f.root,'tests/reports/release-tarballs/release-plan.json').packages.length,24);const r=f.run(['--pack-only','--from-plan','tests/reports/release-tarballs/release-plan.json']);assert.equal(r.status,0,r.stderr);}finally{f.cleanup();}});
for(const [version,count,expected] of [['3.0.1',24,29],['4.0.0',29,24]]) {
 test(`rejects ${version} inventory of ${count}; requires ${expected}`,()=>{const f=fixture(version,count);try{
  assert.equal(publicPackageNames(version).length,expected);
  const names=f.plan.packages.map(p=>p.name),required=publicPackageNames(version);
  const missing=required.filter(n=>!names.includes(n)),unexpected=names.filter(n=>!required.includes(n)).sort();
  assert.equal(missing.length+unexpected.length,Math.abs(count-expected));
  const message=new RegExp(`Release package inventory mismatch: missing \\[${missing.join(', ')}\\]; unexpected \\[${unexpected.join(', ')}\\]`);
  assert.throws(()=>loadValidatedReleasePlan(f.root,'tests/reports/release-tarballs/release-plan.json'),message);
  const r=f.run(['--pack-only','--from-plan','tests/reports/release-tarballs/release-plan.json']);assert.notEqual(r.status,0);assert.match(r.stderr,message);
 }finally{f.cleanup();}});
}

test('lean preparation checks 24 manifests without changing the candidate or selecting a release',()=>{const f=fixture('4.0.0',24);try{
 const write=(path,data)=>{mkdirSync(join(f.root,path,'..'),{recursive:true});writeFileSync(join(f.root,path),data);};
 write('tools/release/prepare-version.mjs',readFileSync(resolve('tools/release/prepare-version.mjs')));
 write('packages/create-aura3d/src/index.ts','export const CREATE_AURA3D_TEMPLATES = ["minimal"] as const;\n');
 write('packages/create-aura3d/templates/minimal/package.json',JSON.stringify({dependencies:{'@aura3d/engine':'4.0.0'}},null,2)+'\n');
 write('marketing/package.json',JSON.stringify({dependencies:{'@aura3d/engine':'4.0.0'}},null,2)+'\n');
 // prepare-version also versions the private engine-runtime workspace manifest.
 write('packages/engine/package.json',JSON.stringify({name:'@aura3d/engine-runtime',version:'4.0.0',private:true},null,2)+'\n');
 // Format the source fixture once so --check must be a true no-op.
 for(let i=0;i<24;i++){const path=i?`packages/p${i}/package.json`:'package.json';write(path,JSON.stringify(JSON.parse(readFileSync(join(f.root,path),'utf8')),null,2)+'\n');}
 const before=readFileSync(join(f.root,'package.json'),'utf8');
 const result=spawnSync(process.execPath,['tools/release/prepare-version.mjs','4.0.0','--check'],{cwd:f.root,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);const output=JSON.parse(result.stdout);assert.equal(output.publicPackages,24);assert.deepEqual(output.changed,[]);assert.equal(readFileSync(join(f.root,'package.json'),'utf8'),before);
}finally{f.cleanup();}});
