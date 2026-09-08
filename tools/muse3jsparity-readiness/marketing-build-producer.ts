import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hostname } from 'node:os';
import { artifact, newRunId, sameSource, sourceIdentity, validateReceipt, writeImmutableJson, type Artifact, type ProducerReceipt } from './evidence-lineage';
import { type MarketingBuildAcceptance } from './marketing-acceptance';
export { marketingOutputPaths, replayMarketingAcceptance } from './marketing-replay';
import { marketingOutputPaths, replayMarketingAcceptance } from './marketing-replay';
/** Run only on the existing remote builder; never deploy or modify source previews here. */
export async function buildMarketing(root:string,previewReceiptInput:string,outDir:string){
 if(process.platform==='darwin')throw Error('Marketing build runs on the remote builder under repository policy');
 const input=JSON.parse(readFileSync(resolve(root,previewReceiptInput),'utf8')) as Pick<MarketingBuildAcceptance,'previewReceipts'|'deployment'>;
 const source=sourceIdentity(root),runId=newRunId(),startedAt=new Date().toISOString();
 const out=relative(root,resolve(root,outDir));if(out.startsWith('..')||!out.startsWith('tests/reports/'))throw Error('Use task-scoped tests/reports output directory');
 mkdirSync(resolve(root,out),{recursive:true});
 const log=`${out}/build.log`,fd=openSync(resolve(root,log),'wx');
 writeImmutableJson(resolve(root,`${out}/started.json`),{source,runId,startedAt,command:['pnpm','--dir','marketing','build'],status:'running'});
 const result=await new Promise<{code:number;signal:string|null}>(done=>{
  const child=spawn('pnpm',['--dir','marketing','build'],{cwd:root,stdio:['ignore',fd,fd],detached:true});
  const timeout=setTimeout(()=>{if(child.pid)try{process.kill(-child.pid,'SIGTERM');}catch{}},45*60*1000);
  const hardTimeout=setTimeout(()=>{if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch{}},46*60*1000);
  child.once('error',()=>{clearTimeout(timeout);clearTimeout(hardTimeout);done({code:1,signal:null});});
  child.once('close',(code,signal)=>{clearTimeout(timeout);clearTimeout(hardTimeout);done({code:code??1,signal});});
 });closeSync(fd);
 const endedAt=new Date().toISOString(),unchanged=sameSource(source,sourceIdentity(root));
 const outputs=existsSync(resolve(root,'marketing/dist'))?marketingOutputPaths(root).map(p=>artifact(root,p)):[];
 const receipt:ProducerReceipt={schema:'muse3jsparity-producer/v1',runId,gate:'marketing-build-command',tasks:[],command:['pnpm','--dir','marketing','build'],cwd:root,exitCode:result.code===0&&unchanged?0:result.code||1,startedAt,endedAt,source,claimSurface:'release tooling',environment:{browser:'none',backend:'remote production build',hardware:`${hostname()} ${process.platform}/${process.arch}`},artifacts:[artifact(root,log),...outputs],packages:[],tarballs:[]};
 const receiptPath=`${out}/build-receipt.json`;writeImmutableJson(resolve(root,receiptPath),receipt);
 if(receipt.exitCode!==0)throw Error(`Marketing build failed or source changed; retained ${receiptPath}`);
 const acceptance:MarketingBuildAcceptance={schema:'muse301-marketing-build/v1',source,build:artifact(root,receiptPath),outputFiles:outputs,sitemap:artifact(root,'marketing/dist/sitemap.xml'),previewManifest:artifact(root,'marketing/public/previews/final-preview-manifest.json'),previewReceipts:input.previewReceipts??[],...(input.deployment?{deployment:input.deployment}:{})};
 const references=[acceptance.build,acceptance.previewManifest,...receipt.artifacts,...acceptance.previewReceipts.flatMap(p=>{const r=JSON.parse(readFileSync(resolve(root,p.receipt.path),'utf8')) as ProducerReceipt;return [p.receipt,...r.artifacts];})];
 const acceptancePath=`${out}/acceptance-input.json`;writeImmutableJson(resolve(root,acceptancePath),acceptance);
 const report={...replayMarketingAcceptance(root,acceptance,references),validationInput:artifact(root,acceptancePath),artifacts:references};
 writeImmutableJson(resolve(root,`${out}/validation.json`),report);
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [input,out]=process.argv.slice(2);if(!input||!out)throw Error('Usage: marketing-build-producer.ts <preview-receipts.json> <tests/reports/task-dir>');
 const report=await buildMarketing(process.cwd(),input,out);console.log(JSON.stringify({status:report.status,errors:report.errors}));if(report.status!=='verified')process.exitCode=1;
}
