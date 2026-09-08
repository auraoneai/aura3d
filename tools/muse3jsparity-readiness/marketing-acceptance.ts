import { isDeepStrictEqual } from 'node:util';
import { sameSource, sha256, type Artifact, type SourceIdentity } from './evidence-lineage';
export interface MarketingBuildAcceptance {
 schema:'muse301-marketing-build/v1'; phase?:'build'|'published'; source:SourceIdentity; build:Artifact;
 outputFiles:Artifact[]; sitemap:Artifact; previewManifest:Artifact;
 previewReceipts:{id:string;receipt:Artifact}[];
 deployment?:{origin:string;receipt?:Artifact;source:SourceIdentity;pages:{url:string;status:number;content:Artifact;built:Artifact}[]};
}
export interface MarketingAcceptanceContext {
 source:SourceIdentity; now:number; artifacts:readonly Artifact[];
 readBytes:(path:string)=>Uint8Array; outputPaths:()=>string[];
 validateCommand:(reference:Artifact)=>{errors:string[];receipt?:{command:string[];startedAt:string;endedAt:string;artifacts:Artifact[]}};
 documentErrors:readonly string[]; readSource?:(path:string)=>string;
}
/** Pure replay: no build, download, deployment, or acceptance of a reported boolean. */
export function validateMarketingAcceptance(data:MarketingBuildAcceptance,ctx:MarketingAcceptanceContext):string[]{
 const errors:string[]=[...ctx.documentErrors];
 if(data?.schema!=='muse301-marketing-build/v1'||!sameSource(data.source,ctx.source))return [...errors,'marketing schema/source mismatch'];
 const bound=(a:Artifact|undefined)=>!!a&&ctx.artifacts.some(x=>x.path===a.path&&x.sha256===a.sha256);
 const bytes=(a:Artifact)=>{if(!bound(a))throw Error(`unbound marketing artifact:${a?.path}`);const body=ctx.readBytes(a.path);if(sha256(body)!==a.sha256)throw Error(`marketing artifact hash mismatch:${a.path}`);return body;};
 const text=(a:Artifact)=>Buffer.from(bytes(a)).toString('utf8');
 try {
  const build=ctx.validateCommand(data.build);errors.push(...build.errors);
  if(!bound(data.build)||!build.receipt||!isDeepStrictEqual(build.receipt.command,['pnpm','--dir','marketing','build']))errors.push('missing exact marketing build command');
  if(!isDeepStrictEqual(data.outputFiles.map(a=>a.path).sort(),ctx.outputPaths().sort())||new Set(data.outputFiles.map(a=>a.path)).size!==data.outputFiles.length)errors.push('marketing output inventory mismatch');
  for(const a of data.outputFiles){bytes(a);if(!a.path.startsWith('marketing/dist/'))errors.push('marketing output escapes dist');if(!build.receipt?.artifacts.some(x=>x.path===a.path&&x.sha256===a.sha256))errors.push(`output not bound to build:${a.path}`);}
  const output=new Map(data.outputFiles.map(a=>[a.path,a]));
  const sitemap=text(data.sitemap);if(data.sitemap.path!=='marketing/dist/sitemap.xml'||!output.has(data.sitemap.path))errors.push('sitemap is not built output');
  const urls=[...sitemap.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map(m=>m[1]!.trim());
  if(!urls.length||new Set(urls).size!==urls.length)errors.push('empty or duplicate sitemap URLs');
  for(const url of urls){const u=new URL(url);if(u.origin!=='https://aura3d.auraone.ai')errors.push(`unexpected sitemap origin:${url}`);const path=decodeURIComponent(u.pathname);const target=`marketing/dist${path.endsWith('/')?path+'index.html':path}`;if(!output.has(target))errors.push(`sitemap route not emitted:${url}`);}
  const manifest=JSON.parse(text(data.previewManifest));
  if(data.previewManifest.path!=='marketing/public/previews/final-preview-manifest.json')errors.push('unexpected preview manifest path');
  const builtManifest=output.get('marketing/dist/previews/final-preview-manifest.json');
  if(!builtManifest||builtManifest.sha256!==data.previewManifest.sha256)errors.push('built preview manifest differs from source manifest');
  if(manifest.schema!=='aura3d.marketing-final-previews/1.0'||!Array.isArray(manifest.previews)||!manifest.previews.length)throw Error('missing marketing preview inventory');
  const previewIds=new Set<string>();
  for(const p of manifest.previews){
   if(previewIds.has(p.id))errors.push('duplicate preview ID');previewIds.add(p.id);
   const refs=data.previewReceipts.filter(r=>r.id===p.id);if(refs.length!==1){errors.push(`missing unique fresh preview receipt:${p.id}`);continue;}
   const ref=refs[0]!.receipt;if(!bound(ref)){errors.push(`unbound preview receipt:${p.id}`);continue;}
   const check=ctx.validateCommand(ref);errors.push(...check.errors);
   const source=check.receipt?.artifacts.find(a=>a.path===p.source&&a.sha256===p.sha256);
   if(!source){errors.push(`preview source missing from current receipt:${p.id}`);continue;}
   const rendered=bytes(source);const target=p.target.replace(/^marketing\/public\//,'marketing/dist/');const built=output.get(target);
   if(!built||built.sha256!==sha256(rendered))errors.push(`built preview differs from evidence:${p.id}`);
   if(rendered.length<24||Buffer.from(rendered.subarray(0,8)).toString('hex')!=='89504e470d0a1a0a'||Buffer.from(rendered).readUInt32BE(16)!==p.width||Buffer.from(rendered).readUInt32BE(20)!==p.height||p.width<1200||p.height<700)errors.push(`invalid preview dimensions:${p.id}`);
   const synced=Date.parse(manifest.generatedAt),renderedAt=Date.parse(check.receipt!.endedAt),buildAt=Date.parse(build.receipt?.startedAt??'');
   if(!Number.isFinite(synced)||synced<renderedAt||synced>buildAt)errors.push(`preview sync not between rendering and build:${p.id}`);
  }
  for(const p of data.previewReceipts)if(!previewIds.has(p.id))errors.push(`extraneous preview receipt:${p.id}`);
  for(const a of data.outputFiles.filter(a=>a.path.endsWith('.html'))){
   for(const m of text(a).matchAll(/(?:src|poster)=["'](\/previews\/[^"'?#]+)["']/g)){const target='marketing/dist'+m[1];if(!output.has(target))errors.push(`missing referenced preview:${target}`);}
  }
  if(data.phase==='published'&&!data.deployment)errors.push('published marketing requires origin observations');
  if(data.phase==='published'){
   const read=ctx.readSource;if(!read)errors.push('published marketing requires controlled source replay');
   else errors.push(...validatePublishedMarketingSource(read));
  }
  if(data.deployment){
   const d=data.deployment;
   if(data.phase==='published'){
    if(!d.receipt||!bound(d.receipt))errors.push('published marketing missing origin command receipt');
    else {const origin=ctx.validateCommand(d.receipt);errors.push(...origin.errors);
     if(!origin.receipt||origin.receipt.command[0]!=='node'||origin.receipt.command[1]!=='tools/muse3jsparity-readiness/marketing-origin-producer.mjs')errors.push('unexpected origin observation command');
     for(const p of d.pages)if(!origin.receipt?.artifacts.some(a=>a.path===p.content.path&&a.sha256===p.content.sha256))errors.push(`origin bytes not bound to observation command:${p.url}`);
     if(Date.parse(origin.receipt?.startedAt??'')<Date.parse(build.receipt?.endedAt??'')||!Number.isFinite(Date.parse(origin.receipt?.endedAt??'')))errors.push('origin observation precedes build');
    }
   }
   if(d.origin!=='https://aura3d.auraone.ai'||!sameSource(d.source,ctx.source))errors.push('deployed marketing origin/source mismatch');
   const required=data.outputFiles.filter(a=>a.path.endsWith('.html')||a.path===data.sitemap.path);
   if(new Set(d.pages.map(p=>p.built.path)).size!==d.pages.length||required.some(a=>!d.pages.some(p=>p.built.path===a.path&&p.built.sha256===a.sha256)))errors.push('deployed page inventory incomplete');
   for(const page of d.pages){const url=new URL(page.url);const expected=`marketing/dist${url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname}`;
    if(url.origin!==d.origin||page.status!==200||expected!==page.built.path||!output.has(page.built.path)||sha256(bytes(page.content))!==sha256(bytes(page.built)))errors.push(`deployed page differs from built artifact:${page.url}`);
   }
  }
 }catch(error){errors.push(String(error));}
 return errors;
}

export function validatePublishedMarketingSource(read:(path:string)=>string):string[]{
 const errors:string[]=[];
 if(/^## 3\.0\.1[^\n]*(?:unreleased|candidate)/im.test(read('CHANGELOG.md')))errors.push('candidate cannot satisfy published marketing obligation');
 for(const path of ['marketing/index.html','marketing/docs/index.html']){
  const source=read(path);const current=source.replace(/<section\b[^>]*id=["']release-204["'][\s\S]*?<\/section>/gi,'');
  if(!/3\.0\.1/.test(current)||!/releases\/tag\/v3\.0\.1/.test(current))errors.push(`published version/link missing:${path}`);
  for(const cls of ['nav-version'])if(!new RegExp(`class=["']${cls}["'][^>]*>\\s*v?3\\.0\\.1`).test(current))errors.push(`published navigation version missing:${path}`);
  if(!/<footer[\s\S]*?3\.0\.1[\s\S]*?<\/footer>/i.test(current))errors.push(`published footer version missing:${path}`);
  if(/3\.0\.1[\s\S]{0,90}(?:source candidate|verification pending)/i.test(current))errors.push(`published surface retains candidate label:${path}`);
 }
 const hero=read('marketing/index.html');
 if(!/<section\b[^>]*id=["']release-30["'][\s\S]*?New in 3\.0\.1/i.test(hero))errors.push('missing current release hero');
 if(!/three@0\.185\.1|three\.js[^\n]*r185|r185 comparison/i.test(hero))errors.push('missing locked marketing comparison');
 if(!/<(?:img|video)\b[^>]*(?:src|poster)=/i.test(hero))errors.push('marketing lacks screenshot/preview');
 if(!/<section\b[^>]*id=["']release-204["'][\s\S]*?history/i.test(hero))errors.push('marketing history removed');
 return errors;
}
