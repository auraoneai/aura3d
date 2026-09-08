#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadValidatedReleasePlan } from './exact-release-plan.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
/** Executed inside the browser; evidence comes only from visible rendered command blocks. */
export function collectRenderedInstallEvidence() {
 const visible=element=>element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) && element.getClientRects().length>0;
 const renderedText=element=>{const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let text='',node;while((node=walker.nextNode())){const parent=node.parentElement;if(parent&&!parent.closest('script,style,template,noscript')&&visible(parent))text+=node.textContent;}return text;};
 const historical=/\b(historical|archived?|previous releases?|release history|changelog)\b/i;
 const blocks=[];
 for(const element of document.querySelectorAll('pre,code,p,li')) {
  if(!visible(element)||element.parentElement?.closest('pre,code'))continue;
  const text=renderedText(element);
  if(!text||!/(?:\bnpm\s+(?:install|i|exec|create)|\bnpx\s|\bpnpm\s+(?:add|dlx|create)|\byarn\s+(?:add|create)|\bbun\s+(?:add|x|create))/.test(text))continue;
  let scope='current',context='';
  for(let ancestor=element;ancestor&&ancestor!==document.body;ancestor=ancestor.parentElement) {
   const heading=ancestor.matches('section,article,aside')?ancestor.querySelector(':scope > h1,:scope > h2,:scope > h3,:scope > header'):null;
   if(heading&&visible(heading)&&historical.test(renderedText(heading))){scope='historical';context=renderedText(heading);break;}
   for(let sibling=ancestor.previousElementSibling;sibling;sibling=sibling.previousElementSibling){
    if(/^H[1-6]$/.test(sibling.tagName)&&visible(sibling)) {if(historical.test(renderedText(sibling))){scope='historical';context=renderedText(sibling);}break;}
   }
   if(scope==='historical')break;
  }
  blocks.push({text,scope,context});
 }
 return {text:renderedText(document.body),installBlocks:blocks};
}
export function validateVisibleInstallPins(blocks,version) {
 const errors=[],seen=new Set();
 for(const block of blocks??[]) {
  if(block.scope==='historical' && /\b(historical|archived?|previous releases?|release history|changelog)\b/i.test(block.context??''))continue;
  // A historical prose mention is harmless. Only executable install commands count.
  for(const line of (block.text??'').replace(/\\\n/g,' ').split(/[\n;]/)) {
   if(!/(?:\bnpm\s+(?:install|i|exec|create)|\bnpx\s|\bpnpm\s+(?:add|dlx|create)|\byarn\s+(?:add|create)|\bbun\s+(?:add|x|create))/.test(line))continue;
   for(const match of line.matchAll(/(@aura3d\/engine|create-aura3d)(?:@([^\s`"'<>;&|]+))?/g)) {
    const [,name,pin]=match; if(pin!==version)errors.push(`Wrong active install pin for ${name}: ${pin??'unpinned'}`);else seen.add(name);
   }
  }
 }
 for(const name of ['@aura3d/engine','create-aura3d'])if(!seen.has(name))errors.push(`Visible current exact install pin missing: ${name}@${version}`);
 return errors;
}
export function validateOriginObservation(observation,plan) {
 const errors=[];
 if(observation.markerStatus!==200)errors.push('Origin source marker HTTP status is not200');
 if(observation.status!==200)errors.push('Origin HTTP status is not200');
 if(observation.marker?.version!==plan.version||['commit','tree','lockfileSha256','fingerprint'].some(k=>observation.marker?.source?.[k]!==plan.source[k])||observation.marker?.releasePlanSha256!==plan.reference.sha256)errors.push('Deployed source marker does not match exact release');
 if(!observation.text?.includes(plan.version))errors.push('Visible release version missing');
 errors.push(...validateVisibleInstallPins(observation.renderedPages?.flatMap(page=>page.installBlocks)??[],plan.version));
 if(!observation.links?.length||!observation.links.some(l=>/docs/i.test(l.url))||observation.links.some(l=>!l.ok||l.status!==200))errors.push('Docs/install links missing or failing');
 if(observation.browserErrors?.length)errors.push('Origin browser errors');
 return errors;
}
export async function verifyReleaseOrigin(options) {
 const root=options.root??process.cwd(),plan=loadValidatedReleasePlan(root,options.plan);
 if(!plan||plan.version!=='3.0.1')throw new Error('Requires validated3.0.1release plan');
 const origin=new URL(options.origin??JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')).homepage);
 if(origin.protocol!=='https:')throw new Error('Deployed origin must use HTTPS');
 const output=resolve(root,options.output??'release-artifacts/3.0.1-origin-verification.json'),outDir=dirname(output);
 mkdirSync(outDir,{recursive:true});
 const artifact=(path,bytes)=>{writeFileSync(path,bytes);return {path:relative(root,path),sha256:sha(bytes)}};
 // Browser execution is deliberately explicit and remote-only.
 if(process.env.A3D_REMOTE_BROWSER!=='1')throw new Error('Run on remote browser worker with A3D_REMOTE_BROWSER=1');
 const { chromium }=await import('@playwright/test');const browser=await chromium.launch({headless:true});
 const observations=[],screenshots=[],checks=[],artifacts=[],pages=[];
 try {
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   const context=await browser.newContext({viewport}),page=await context.newPage(),browserErrors=[];
   page.on('pageerror',e=>browserErrors.push(e.message));
   const response=await page.goto(origin.href,{waitUntil:'networkidle'});
   const mainRendered=await page.evaluate(collectRenderedInstallEvidence);
   const text=mainRendered.text,renderedPages=[{url:origin.href,...mainRendered}];
   const markerResponse=await context.request.get(new URL('/release-source.json',origin).href);
   let marker=null;try{marker=await markerResponse.json();}catch{}
   const hrefs=await page.locator('a[href]').evaluateAll(elements=>elements.map(e=>({url:e.href,label:e.textContent??''})).filter(e=>/docs|install|getting.started|npmjs/i.test(e.url+' '+e.label)));
   const links=[];
   for(const entry of [...new Map(hrefs.map(e=>[e.url,e])).values()]){
    const target=new URL(entry.url);if(target.protocol!=='https:')continue;
    const r=await context.request.get(target.href);links.push({url:target.href,status:r.status(),ok:r.ok()});
    if(target.origin===origin.origin && /text\/html/i.test(r.headers()['content-type']??'')) {
     const doc=await context.newPage();doc.on('pageerror',e=>browserErrors.push(`${target.href}: ${e.message}`));
     const renderedResponse=await doc.goto(target.href,{waitUntil:'networkidle'});
     const rendered=await doc.evaluate(collectRenderedInstallEvidence);renderedPages.push({url:target.href,...rendered});
     const id=`3.0.1-doc-${viewport.width}-${renderedPages.length}`;
     const content=artifact(resolve(outDir,`${id}.html`),Buffer.from(await doc.content()));
     const screenshot=artifact(resolve(outDir,`${id}.png`),await doc.screenshot({fullPage:true}));
     artifacts.push(content);screenshots.push(screenshot);
     pages.push({url:target.href,status:renderedResponse?.status(),version:marker?.version,content,screenshot});
     if(renderedResponse?.status()!==200)links.push({url:target.href,status:renderedResponse?.status(),ok:false});
     await doc.close();
    }
   }
   const observation={viewport,status:response?.status(),markerStatus:markerResponse.status(),marker,text,renderedPages,links,browserErrors};
   const errors=validateOriginObservation(observation,plan);observations.push(observation);checks.push({id:`origin-${viewport.width}`,passed:errors.length===0,errors});
   const screenshot=artifact(resolve(outDir,`3.0.1-origin-${viewport.width}.png`),await page.screenshot({fullPage:true}));
   const content=artifact(resolve(outDir,`3.0.1-origin-${viewport.width}.html`),Buffer.from(await page.content()));
   screenshots.push(screenshot);artifacts.push(content);pages.push({url:origin.href,status:response?.status(),version:marker?.version,content,screenshot});
   await context.close();
  }
 }finally{await browser.close();}
 loadValidatedReleasePlan(root,options.plan);
 const report={schema:'aura3d-release-origin/v1',version:plan.version,sourceCommit:plan.source.commit,sourceFingerprint:plan.source.fingerprint,source:plan.source,releasePlan:plan.reference,origin:origin.origin,generatedAt:new Date().toISOString(),command:['node',...process.argv.slice(1)],checks,screenshots,artifacts,observations,pages,links:[...new Map(observations.flatMap(o=>o.links).map(l=>[l.url,l])).values()],passed:checks.every(c=>c.passed)};
 writeFileSync(output,JSON.stringify(report,null,2)+'\n');if(!report.passed)throw new Error(`Origin validation failed; see ${output}`);return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const option=k=>{const i=process.argv.indexOf(k);return i<0?undefined:process.argv[i+1]};await verifyReleaseOrigin({plan:option('--release-plan')??process.env.A3D_RELEASE_PLAN,origin:option('--origin'),output:option('--output')});}
