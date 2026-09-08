import {describe,it,expect} from 'vitest';
import {sha256} from '../../../tools/muse3jsparity-readiness/evidence-lineage';
import {validateMarketingAcceptance,validatePublishedMarketingSource,type MarketingBuildAcceptance,type MarketingAcceptanceContext} from '../../../tools/muse3jsparity-readiness/marketing-acceptance';
function fixture(){
 const source={commit:'a',tree:'b',fingerprint:'c',lockfileSha256:'d'};const files=new Map<string,Buffer>();
 const add=(path:string,body:string|Buffer)=>{const bytes=Buffer.isBuffer(body)?body:Buffer.from(body);files.set(path,bytes);return {path,sha256:sha256(bytes)};};
 const png=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.writeUInt32BE(1440,16);png.writeUInt32BE(900,20);
 const hero=add('tests/reports/hero.png',png),built=add('marketing/dist/previews/hero.png',png),index=add('marketing/dist/index.html','<img src="/previews/hero.png">');
 const sitemap=add('marketing/dist/sitemap.xml','<urlset><url><loc>https://aura3d.auraone.ai/</loc></url></urlset>');
 const build=add('tests/reports/build.json','{}'),previewReceipt=add('tests/reports/preview.json','{}');
 const previewManifest=add('marketing/public/previews/final-preview-manifest.json',JSON.stringify({schema:'aura3d.marketing-final-previews/1.0',generatedAt:'2026-09-06T01:01:00Z',previews:[{id:'hero',source:hero.path,target:'marketing/public/previews/hero.png',width:1440,height:900,sha256:hero.sha256}]}));
 const builtManifest=add('marketing/dist/previews/final-preview-manifest.json',files.get(previewManifest.path)!);const outputFiles=[built,index,sitemap,builtManifest];const data:MarketingBuildAcceptance={schema:'muse301-marketing-build/v1',source,build,outputFiles,sitemap,previewManifest,previewReceipts:[{id:'hero',receipt:previewReceipt}]};
 const ctx:MarketingAcceptanceContext={source,now:Date.parse('2026-09-06T01:05:00Z'),artifacts:[hero,build,previewReceipt,previewManifest,...outputFiles],readBytes:p=>files.get(p)!,outputPaths:()=>outputFiles.map(a=>a.path),documentErrors:[],validateCommand:r=>({errors:[],receipt:{command:r.path===build.path?['pnpm','--dir','marketing','build']:['browser-test'],startedAt:'2026-09-06T01:02:00Z',endedAt:r.path===build.path?'2026-09-06T01:03:00Z':'2026-09-06T01:00:00Z',artifacts:r.path===build.path?outputFiles:[hero]}})};
 return {data,ctx,files,add,index};
}
describe('marketing source/build/origin evidence',()=>{
 it('replays complete retained build and current preview evidence',()=>{const {data,ctx}=fixture();expect(validateMarketingAcceptance(data,ctx)).toEqual([]);});
 it('rejects dropping an emitted file from the inventory',()=>{const {data,ctx}=fixture();data.outputFiles=data.outputFiles.slice(1);expect(validateMarketingAcceptance(data,ctx)).toContain('marketing output inventory mismatch');});
 it('rejects unbound stale preview sources rather than trusting old manifest hashes',()=>{const {data,ctx}=fixture();data.previewReceipts=[];expect(validateMarketingAcceptance(data,ctx)).toContain('missing unique fresh preview receipt:hero');});
 it('rejects artifact tampering after build',()=>{const {data,ctx,files,index}=fixture();files.set(index.path,Buffer.from('replaced'));expect(validateMarketingAcceptance(data,ctx).join()).toContain('marketing artifact hash mismatch');});
 it('requires deployed bytes equal built bytes and exhaustive html/sitemap coverage',()=>{const {data,ctx,add,index}=fixture();const changed=add('tests/reports/origin.html','changed');ctx.artifacts=[...ctx.artifacts,changed];data.deployment={origin:'https://aura3d.auraone.ai',source:data.source,pages:[{url:'https://aura3d.auraone.ai/',status:200,content:changed,built:index}]};expect(validateMarketingAcceptance(data,ctx)).toEqual(expect.arrayContaining(['deployed page inventory incomplete','deployed page differs from built artifact:https://aura3d.auraone.ai/']));});
 it('will not use candidate build evidence to close a published source obligation',()=>{expect(validatePublishedMarketingSource(p=>p==='CHANGELOG.md'?'## 3.0.1 (unreleased candidate)':'3.0.1 source candidate')).toContain('candidate cannot satisfy published marketing obligation');const {data,ctx}=fixture();data.phase='published';expect(validateMarketingAcceptance(data,ctx)).toContain('published marketing requires origin observations');});

 it('checks published hero, navigation, footer, comparison and retained history independently',()=>{
  const html='<span class="nav-version">v3.0.1</span><a href="/releases/tag/v3.0.1">notes</a><section id="release-30">New in 3.0.1 r185 comparison<img src="/previews/hero.png"></section><section id="release-204">history</section><footer>3.0.1</footer>';
  expect(validatePublishedMarketingSource(p=>p==='CHANGELOG.md'?'## 3.0.1 (released)':html)).toEqual([]);
  expect(validatePublishedMarketingSource(p=>p==='CHANGELOG.md'?'## 3.0.1 (released)':html.replace('<footer>3.0.1</footer>',''))).toContain('published footer version missing:marketing/index.html');
 });

});
