import { readBudgetTargets } from './budget-continuity.mjs';
import { renderBundleSizeMarkdown } from '../bundle-size/markdown.mjs';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { producePackageAcceptance, recordCommand, recordBuild, BUILD_COMMAND, validatePassingReport, COMMANDS, REPORTS } from './package-acceptance.mjs';
const hash=(bytes,algo='sha256')=>createHash(algo).update(bytes).digest(algo==='sha512'?'base64':'hex');
function fixture() {
 const root=mkdtempSync(join(tmpdir(),'package-acceptance-'));
 const write=(path,data)=>{mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),typeof data==='string'?data:JSON.stringify(data));};
 write('pnpm-lock.yaml','lock'); const repository=fileURLToPath(new URL('../../',import.meta.url));
 const gitdir=spawnSync('git',['rev-parse','--absolute-git-dir'],{cwd:repository,encoding:'utf8'});assert.equal(gitdir.status,0,gitdir.stderr);
 write('.git',`gitdir: ${gitdir.stdout.trim()}\n`);
 write('tools/bundle-size/index.ts',readFileSync(join(repository,'tools/bundle-size/index.ts'),'utf8'));

 const packages=Array.from({length:29},(_,i)=>{const name=['@aura3d/engine','@aura3d/physics','@aura3d/physics-rapier'][i]??`@aura3d/p${i}`,manifest=i?`packages/p${i}/package.json`:'package.json',tarball=`packed/p${i}.tgz`,bytes=`tarball${i}`;write(manifest,{name,version:'3.0.1',...(i===0?{devDependencies:{'@aura3d/engine-runtime':'workspace:*'}}:{})});write(tarball,bytes);return{name,version:'3.0.1',tarball,sha256:hash(bytes),integrity:`sha512-${hash(bytes,'sha512')}`};});
 const names=Array.from({length:19},(_,i)=>i===0?'character-controller':`template${i}`);names.forEach(name=>write(`packages/create-aura3d/templates/${name}/package.json`,{private:true}));
 write('packages/create-aura3d/package.json',{private:true});
 write('packages/engine/package.json',{private:true,name:'@aura3d/engine-runtime',version:'2.0.4'});
 write('packages/create-aura3d/templates/character-controller/package.json',{private:true,scripts:{'enable:physics':'npm install @aura3d/physics@3.0.1 @aura3d/physics-rapier@3.0.1'}});
 write('packages/create-aura3d/src/index.ts',`export const CREATE_AURA3D_TEMPLATES = ${JSON.stringify(names)} as const; const v=options.packageVersion ?? "3.0.1";`);
 write('marketing/package.json',{private:true,dependencies:{'@aura3d/engine':'3.0.1'}});
 write('templates/public/package.json',{private:true,dependencies:{'@aura3d/engine':'3.0.1'}});
 write('archive/package/templates/public/package.json',{private:true,dependencies:{'@aura3d/engine':'3.0.1'}});
 const packed=spawnSync('tar',['-czf',join(root,packages[0].tarball),'-C',join(root,'archive'),'package'],{encoding:'utf8'});assert.equal(packed.status,0,packed.stderr);
 const rootBytes=readFileSync(join(root,packages[0].tarball));packages[0].sha256=hash(rootBytes);packages[0].integrity=`sha512-${hash(rootBytes,'sha512')}`;

 const planPath='packed/plan.json';write(planPath,{schema:'aura3d-release-plan/1.0',version:'3.0.1',expectedPackageCount:29,packageCount:29,packages,generatedAt:'2026-01-01T00:00:00Z',source:{commit:'abc',fingerprint:'abc',lockfileSha256:hash('lock')}});
 const checks=Array.from({length:149},(_,i)=>({id:`check${i}`,pass:true}));
 const rows=names.map(template=>({template,build:true,browserSmoke:true,interactionSmoke:true,deployCheck:true,routeHealth:true,routeHealthReport:true,screenshot:true,screenshotFileBytes:1200,installedArtifacts:[{...packages[0],installedIntegrity:packages[0].integrity}]}));
 const reports={source:{pass:true,checks,mode:'workspace-source-aliases',scaffoldSmoke:rows},installed:{pass:true,checks,mode:'fresh-local-3.0.1-tarballs',scaffoldSmoke:rows},compatibility:{pass:true,currentVersion:'3.0.1',baseline:'v3.0.0',counts:{baselinePackages:29,currentPackages:29,removals:0,declarationContractChanges:0},unresolvedEntrypoints:[]},imports:{ok:true,entries:[{ok:true}],workspaceDependencies:[{ok:true}]},exports:{ok:true,packages:packages.map(p=>p.name)},smoke:{ok:true,tarballSha256:packages[0].sha256},provenance:{ok:true,subject:{digest:{sha256:packages[0].sha256}},signature:{verified:true}}};
 const statement={statementType:'https://slsa.dev/provenance',predicateType:'https://slsa.dev/provenance',subject:reports.provenance.subject,builder:{id:'fixture'},materials:[{uri:'packed/p0.tgz',digest:{sha256:packages[0].sha256}}],buildType:'fixture',invocation:{}};
 const keys=generateKeyPairSync('ed25519');reports.provenance={ok:true,...statement,signature:{verified:true,algorithm:'ed25519',publicKeyPem:keys.publicKey.export({type:'spki',format:'pem'}).toString(),signatureBase64:sign(null,Buffer.from(JSON.stringify(statement)),keys.privateKey).toString('base64')}};
 reports.optionalPeers={pass:true,optionalPeerMatrix:['absent','present'].map(mode=>({mode,install:{ok:true},runtime:{ok:true},observation:{mode,rootImport:true,available:mode==='present',resolved:mode==='present'?'file:///fixture':null,missingRequestRejected:mode==='absent',pathPoints:mode==='present'?2:0,disposed:mode==='present'},installedIdentity:{packages:[{name:'@aura3d/engine',sha256:packages[0].sha256},...(mode==='present'?[{name:'@aura3d/navigation-recast'}]:[])]}}))};
 for(const row of reports.optionalPeers.optionalPeerMatrix){row.retained=`peer/${row.mode}`;write(`${row.retained}/optional-peer-result.json`,row.observation);write(`${row.retained}/probe.mjs`,'fixture');write(`${row.retained}/commands.json`,{install:row.install,runtime:row.runtime});write(`${row.retained}/package-lock.json`,'fixture lock');row.installedIdentity.lockfileSha256=hash('fixture lock');}
 const plan=JSON.parse(readFileSync(join(root,planPath))),planRef={path:planPath,sha256:hash(readFileSync(join(root,planPath)))};
 reports.smoke.exactPackages={schema:'aura3d-exact-package-smoke/v1',ok:true,packageCount:29,releasePlan:planRef,packages:packages.map(p=>({...p,installedIntegrity:p.integrity,ok:true,violations:[],importedEntrypoints:[{specifier:p.name}],binChecks:[]}))};
 reports.provenance.packageCount=29;
 reports.provenance.packages=packages.map(p=>{const statement={subject:{name:p.name,version:p.version,digest:{sha256:p.sha256}},installedIntegrity:p.integrity,releasePlan:planRef,source:plan.source,materials:[{uri:p.tarball,digest:{sha256:p.sha256}}]};return{name:p.name,version:p.version,sha256:p.sha256,ok:true,statement,signature:{algorithm:'ed25519',publicKeyPem:keys.publicKey.export({type:'spki',format:'pem'}).toString(),signatureBase64:sign(null,Buffer.from(JSON.stringify(statement)),keys.privateKey).toString('base64')}}});
 reports.frozenLock={schema:'muse301-frozen-lock/v1',pass:true,source:plan.source,releasePlan:planRef};
 const targets=readBudgetTargets(readFileSync(join(root,'tools/bundle-size/index.ts'),'utf8')).map(t=>({...t,label:t.id,jsBytes:100,gzipBytes:50,sizeLimitPassed:true}));
 reports.bundleBudgets={pass:true,checks,targets};write('BUNDLE_SIZES.md',renderBundleSizeMarkdown(targets));write('tools/bundle-size/markdown.mjs',readFileSync(join(repository,'tools/bundle-size/markdown.mjs'),'utf8'));
 const commands={};
 for(const kind of Object.keys(COMMANDS)) {
  write(REPORTS[kind],{...(reports[kind]??{pass:true,checks}),releasePlan:{path:planPath,sha256:hash(readFileSync(join(root,planPath)))}});const log=`commands/${kind}.log`;write(log,'executed');commands[kind]=`commands/${kind}.json`;
  write(commands[kind],{schema:'muse301-package-command/v1',kind,command:COMMANDS[kind],plan:{path:planPath,sha256:hash(readFileSync(join(root,planPath)))},startedAt:'2026-01-01T00:00:01Z',endedAt:'2026-01-01T00:00:02Z',exitCode:0,log:{path:log,sha256:hash('executed')},report:{path:REPORTS[kind],sha256:hash(readFileSync(join(root,REPORTS[kind])))}});
 }
 commands.build='commands/build.json';write('commands/build.log','actual build output');write(commands.build,{schema:'muse301-package-build/v1',command:BUILD_COMMAND,source:plan.source,environment:{platform:'linux',hostname:'fixture-worker',provider:'aws',workerId:'i-0123456789abcdef0'},startedAt:'2025-12-31T23:58:00Z',endedAt:'2025-12-31T23:59:00Z',commandExitCode:0,exitCode:0,validationErrors:[],log:{path:'commands/build.log',sha256:hash('actual build output')}});
 return{root,config:{planPath,commands},write};
}
const run=(fn)=>{const f=fixture();try{fn(f)}finally{rmSync(f.root,{recursive:true,force:true})}};
test('derives acceptance and binds all actual input artifacts',()=>run(({root,config})=>{const r=producePackageAcceptance(root,config);assert.equal(r.acceptance.packages.length,29);assert.equal(r.acceptance.scaffolds.length,19);assert.equal(r.acceptance.lifecycleAssertions,149);assert.equal(r.acceptance.checks.leanIsolation,true);assert.ok(r.artifacts.length>80)}));
test('fails closed without required command',()=>run(({root,config})=>{delete config.commands.imports;assert.throws(()=>producePackageAcceptance(root,config),/receipt missing/)}));
test('rejects failed command even with green report',()=>run(({root,config,write})=>{const path=config.commands.source,c=JSON.parse(readFileSync(join(root,path)));c.exitCode=1;write(path,c);assert.throws(()=>producePackageAcceptance(root,config),/failed or wrong command/)}));
test('rejects report changed after command',()=>run(({root,config,write})=>{write(REPORTS.source,{pass:true});assert.throws(()=>producePackageAcceptance(root,config),/artifact mismatch/)}));
test('rejects changed tarball selected for publication',()=>run(({root,config,write})=>{write('packed/p0.tgz','tampered');assert.throws(()=>producePackageAcceptance(root,config),/tarball mismatch/)}));
test('rejects green summary masking individual failures or duplicates',()=>{assert.throws(()=>validatePassingReport({pass:true,checks:[{id:'x',pass:false}]},'fixture'));assert.throws(()=>validatePassingReport({pass:true,checks:[{id:'x',pass:true},{id:'x',pass:true}]},'fixture'));assert.throws(()=>validatePassingReport({pass:true,violations:['bad']},'fixture'))});
function replaceReport(f,kind,edit){const path=REPORTS[kind],report=JSON.parse(readFileSync(join(f.root,path)));edit(report);f.write(path,report);const c=JSON.parse(readFileSync(join(f.root,f.config.commands[kind])));c.report.sha256=hash(readFileSync(join(f.root,path)));f.write(f.config.commands[kind],c);}
test('rejects installed identity from a different archive despite passing stages',()=>run(f=>{replaceReport(f,'installed',r=>r.scaffoldSmoke[0].installedArtifacts[0].installedIntegrity='sha512-wrong');assert.throws(()=>producePackageAcceptance(f.root,f.config),/installed artifact mismatch/)}));
test('requires the original 149 assertions on each lifecycle leg',()=>run(f=>{replaceReport(f,'source',r=>r.checks.pop());assert.throws(()=>producePackageAcceptance(f.root,f.config),/below baseline/)}));
test('requires all 19 distinct scaffolds',()=>run(f=>{replaceReport(f,'installed',r=>r.scaffoldSmoke[1].template=r.scaffoldSmoke[0].template);assert.throws(()=>producePackageAcceptance(f.root,f.config),/below baseline/)}));
test('rejects a smoke report for a separately repacked archive',()=>run(f=>{replaceReport(f,'smoke',r=>r.tarballSha256='0'.repeat(64));assert.throws(()=>producePackageAcceptance(f.root,f.config),/smoke did not test/)}));
test('rejects underlying clean install from another plan',()=>run(f=>{replaceReport(f,'optionalPeers',r=>r.releasePlan.sha256='0'.repeat(64));assert.throws(()=>producePackageAcceptance(f.root,f.config),/underlying report lacks/)}));

test('rejects claimed verification when provenance signature is invalid',()=>run(f=>{replaceReport(f,'provenance',r=>r.signature.signatureBase64=Buffer.alloc(64).toString('base64'));assert.throws(()=>producePackageAcceptance(f.root,f.config),/signature invalid/)}));

test('rejects clean-install report with no optional-peer runtime matrix',()=>run(f=>{replaceReport(f,'optionalPeers',r=>delete r.optionalPeerMatrix);assert.throws(()=>producePackageAcceptance(f.root,f.config),/matrix missing/)}));

test('rejects root-only smoke despite successful root result',()=>run(f=>{replaceReport(f,'smoke',r=>r.exactPackages.packages.pop());assert.throws(()=>producePackageAcceptance(f.root,f.config),/29 exact package/)}));
test('rejects missing package provenance despite successful root signature',()=>run(f=>{replaceReport(f,'provenance',r=>r.packages.pop());assert.throws(()=>producePackageAcceptance(f.root,f.config),/29 provenance/)}));

test('CLI binds replay input while pure producer stays deterministic',()=>run(f=>{f.write('config.json',f.config);const result=spawnSync(process.execPath,[fileURLToPath(new URL('./package-acceptance.mjs',import.meta.url)),'produce','config.json','output.json'],{cwd:f.root,encoding:'utf8'});assert.equal(result.status,0,result.stderr);const output=JSON.parse(readFileSync(join(f.root,'output.json'))),validationInput={path:'config.json',sha256:hash(readFileSync(join(f.root,'config.json')))};assert.deepEqual(output.validationInput,validationInput);delete output.validationInput;assert.deepEqual(output,producePackageAcceptance(f.root,f.config).acceptance)}));
test('rejects stale canonical scaffold pin from actual manifest',()=>run(f=>{f.write('packages/create-aura3d/templates/template1/package.json',{private:true,dependencies:{'@aura3d/engine':'3.0.0'}});assert.throws(()=>producePackageAcceptance(f.root,f.config),/Internal version constraint mismatch/)}));
test('rejects public version mismatch without widening patch semantics',()=>run(f=>{f.write('packages/p1/package.json',{name:'@aura3d/physics',version:'4.0.0'});assert.throws(()=>producePackageAcceptance(f.root,f.config),/manifest\/version mismatch/)}));
test('rejects stale marketing candidate pin',()=>run(f=>{f.write('marketing/package.json',{private:true,dependencies:{'@aura3d/engine':'3.0.0'}});assert.throws(()=>producePackageAcceptance(f.root,f.config),/Internal version constraint mismatch/)}));
test('rejects a root published template differing from actual archive',()=>run(f=>{f.write('templates/public/package.json',{private:true,dependencies:{'@aura3d/engine':'3.0.0'}});assert.throws(()=>producePackageAcceptance(f.root,f.config),/Packed template differs/)}));
test('requires actual frozen-lock command receipt',()=>run(f=>{delete f.config.commands.frozenLock;assert.throws(()=>producePackageAcceptance(f.root,f.config),/frozenLock: command receipt missing/)}));

test('retains actual successful exit and raw log when command changes source',()=>run(f=>{
 let calls=0;
 const receipt=recordCommand(f.root,{kind:'source',planPath:f.config.planPath,reportPath:REPORTS.source,outputPath:'failed/source.json'},{validatePlan(){if(++calls>1)throw new Error('Exact release source mismatch');return{};},execute(){f.write(REPORTS.source,{pass:true});f.write('source.ts','changed');return{status:0,stdout:'real process stdout',stderr:'real process stderr',signal:null};}});
 assert.equal(receipt.commandExitCode,0);assert.equal(receipt.exitCode,1);assert.match(receipt.validationErrors.join(' '),/source mismatch/);
 assert.equal(readFileSync(join(f.root,receipt.log.path),'utf8'),'real process stdoutreal process stderr');
 assert.deepEqual(JSON.parse(readFileSync(join(f.root,'failed/source.json'))),receipt);
}));
test('retains missing report and actual failing exit without swallowing output',()=>run(f=>{
 const receipt=recordCommand(f.root,{kind:'source',planPath:f.config.planPath,reportPath:REPORTS.source,outputPath:'failed/missing.json'},{validatePlan(){return{};},execute(){return{status:7,stdout:'started',stderr:'failed before report',signal:null};}});
 assert.equal(receipt.commandExitCode,7);assert.equal(receipt.exitCode,7);assert.equal(receipt.report,null);assert.match(receipt.validationErrors.join(' '),/required report/);assert.match(readFileSync(join(f.root,receipt.log.path),'utf8'),/failed before report/);
}));
test('retains original plan binding when command overwrites plan',()=>run(f=>{
 const originalHash=hash(readFileSync(join(f.root,f.config.planPath)));
 const receipt=recordCommand(f.root,{kind:'source',planPath:f.config.planPath,reportPath:REPORTS.source,outputPath:'failed/plan.json'},{validatePlan(){return{};},execute(){f.write(f.config.planPath,'changed');f.write(REPORTS.source,{pass:true});return{status:0,stdout:'changed plan',stderr:'',signal:null};}});
 assert.equal(receipt.exitCode,1);assert.equal(receipt.commandExitCode,0);assert.equal(receipt.plan.sha256,originalHash);assert.match(receipt.validationErrors.join(' '),/plan changed/);
}));

test('requires retained remote build before pack',()=>run(f=>{delete f.config.commands.build;assert.throws(()=>producePackageAcceptance(f.root,f.config),/remote build receipt missing/)}));
test('rejects build for a different source despite successful exit',()=>run(f=>{const receipt=JSON.parse(readFileSync(join(f.root,f.config.commands.build)));receipt.source.fingerprint='different';f.write(f.config.commands.build,receipt);assert.throws(()=>producePackageAcceptance(f.root,f.config),/build source differs/)}));
test('remote build recorder retains failure after source mutation',()=>run(f=>{let calls=0;const receipt=recordBuild(f.root,{outputPath:'build/receipt.json'},{environment:{platform:'linux',hostname:'fixture',provider:'aws',workerId:'i-0123456789abcdef0'},identity:()=>({fingerprint:++calls===1?'before':'after'}),execute:()=>({status:0,stdout:'compiled',stderr:'',signal:null})});assert.equal(receipt.exitCode,1);assert.equal(receipt.commandExitCode,0);assert.match(receipt.validationErrors.join(' '),/Source changed/);assert.equal(readFileSync(join(f.root,receipt.log.path),'utf8'),'compiled')}));

test('streams subprocess output and retains running metadata before execution completes',()=>run(f=>{
 const receipt=recordCommand(f.root,{kind:'source',planPath:f.config.planPath,reportPath:REPORTS.source,outputPath:'live/receipt.json'},{validatePlan(){return{};},execute(command,args,options){
  const running=JSON.parse(readFileSync(join(f.root,'live/receipt.json')));assert.equal(running.status,'running');assert.equal(running.exitCode,null);
  writeSync(options.stdio[1],'live stdout\n');writeSync(options.stdio[2],'live stderr\n');
  assert.equal(readFileSync(join(f.root,'live/receipt.json.log'),'utf8'),'live stdout\nlive stderr\n');
  assert.equal(options.killSignal,'SIGKILL');assert.ok(options.timeout>0);assert.equal(options.detached,process.platform!=='win32');
  return{status:null,signal:'SIGKILL',error:new Error('ETIMEDOUT')};
 }});
 assert.equal(receipt.exitCode,1);assert.equal(receipt.signal,'SIGKILL');assert.match(receipt.validationErrors.join(' '),/ETIMEDOUT/);assert.match(readFileSync(join(f.root,receipt.log.path),'utf8'),/live stdout/);
}));

test('rejects edited bundle Markdown despite green measured report',()=>run(f=>{f.write('BUNDLE_SIZES.md','# Smaller bundles than measured');assert.throws(()=>producePackageAcceptance(f.root,f.config),/Markdown differs/)}));
test('rejects omitted bundle report target despite passing summary',()=>run(f=>{replaceReport(f,'bundleBudgets',r=>r.targets.pop());assert.throws(()=>producePackageAcceptance(f.root,f.config),/target inventory incomplete/)}));
