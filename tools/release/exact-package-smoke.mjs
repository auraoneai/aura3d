import { withNpmTransport } from './npm-transport.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { inspectInstalledRelease, loadValidatedReleasePlan } from './exact-release-plan.mjs';

/** Run only on the remote release worker: installs and exercises the exact29archive set. */
export function runExactPackageSmoke(root, plan, options={}) {
 const project=mkdtempSync(join(tmpdir(),'aura29-exact-smoke-'));
 const results=[]; let installedIdentity; let installOutput='';
 const run=(exe,args)=>execFileSync(exe,args,{cwd:project,encoding:'utf8',maxBuffer:32*1024*1024,timeout:180000});
 try {
  writeFileSync(join(project,'package.json'),JSON.stringify({name:'aura29-exact-consumer',version:'0.0.0',private:true,type:'module'}));
  const installCommand=['npm',...withNpmTransport(['install','--ignore-scripts','--no-audit','--no-fund',...plan.packages.map(p=>options.registry ? `${p.name}@${p.version}` : resolve(root,p.tarball))])];
  installOutput=run(installCommand[0],installCommand.slice(1));
  installedIdentity=inspectInstalledRelease(root,project,plan);
  for(const candidate of plan.packages) {
   const violations=[], importedEntrypoints=[], binChecks=[];
   const installed=installedIdentity.packages.find(p=>p.name===candidate.name);
   const directory=join(project,'node_modules',candidate.name);
   const manifest=JSON.parse(readFileSync(join(directory,'package.json'),'utf8'));
   const exports=manifest.exports;
   const entrypoints=exports && typeof exports==='object' && Object.keys(exports).some(k=>k.startsWith('.')) ? Object.entries(exports).filter(([k,v])=>!k.includes('*') && v!==null).map(([k])=>k) : (exports||manifest.main?['.']:[]);
   for(const subpath of entrypoints) {
    // Metadata and styles have their own content contract, not an ECMAScript import contract.
    if(/\.(json|css)$/.test(subpath))continue;
    const specifier=candidate.name+(subpath==='.'?'':subpath.slice(1));
    const script=join(project,'probe.mjs');
    writeFileSync(script,`const value=await import(${JSON.stringify(specifier)}); if(!value || typeof value !== 'object')throw new Error('Missing module namespace'); console.log(JSON.stringify({specifier:${JSON.stringify(specifier)},exports:Object.keys(value).sort()}));`);
    try { const stdout=run(process.execPath,[script]); importedEntrypoints.push({specifier,stdout}); } catch(error){violations.push(`${specifier}: ${error.message}`);}
   }
   const bins=typeof manifest.bin==='string'?{[candidate.name]:manifest.bin}:manifest.bin??{};
   for(const [name,path] of Object.entries(bins)) {
    try {const stdout=run(process.execPath,[join(directory,path),'--help']); if(!stdout.trim())throw new Error('Empty CLI help');binChecks.push({name,command:[process.execPath,path,'--help'],stdout});}catch(error){violations.push(`${name} --help: ${error.message}`);}
   }
   if(!installed || installed.integrity!==candidate.integrity)violations.push('Missing exact installed archive integrity');
   if(!importedEntrypoints.length && !binChecks.length)violations.push('No public entrypoint or CLI executed');
   results.push({...candidate,installedIntegrity:installed?.integrity,importedEntrypoints,binChecks,ok:violations.length===0,violations});
  }
  let retained;
  if(options.registry){
   if(!options.retainDir||!options.retainDir.startsWith('tests/reports/'))throw new Error('Registry consumer requires retained evidence directory');
   retained=resolve(root,options.retainDir);mkdirSync(retained,{recursive:true});
   for(const name of ['package.json','package-lock.json'])cpSync(join(project,name),join(retained,name));
   writeFileSync(join(retained,'consumer-results.json'),JSON.stringify(results,null,2));
  }
  const finishedPlan=loadValidatedReleasePlan(root,plan.reference.path);
  if(finishedPlan.reference.sha256!==plan.reference.sha256)throw new Error('Release plan changed during exact smoke');
  return {schema:'aura3d-exact-package-smoke/v1',...(options.registry?{installationSource:'npm-registry',retained:options.retainDir}:{}),releasePlan:plan.reference,source:plan.source,packageCount:results.length,ok:results.length===29&&results.every(p=>p.ok),installCommand,installOutput,installedIdentity,packages:results};
 } finally {rmSync(project,{recursive:true,force:true});}
}
