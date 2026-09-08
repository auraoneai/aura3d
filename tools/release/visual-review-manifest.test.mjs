import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildModernVisualReviewManifest, validateModernVisualReviewManifest } from './visual-review-manifest.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
function fixture(){
 const source={commit:'commit',tree:'tree',lockfileSha256:'lock',fingerprint:'fingerprint'},files=new Map();
 const report=Buffer.from(JSON.stringify({source}));files.set('report.json',report);
 const png=Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001','hex');
 const input={version:'3.0.1',source,sections:['flagship-routes','showcase-games','aura-clash','night-adoption','crowd-adoption','selected-threejs-comparison'].map(id=>{const path=`${id}.png`;files.set(path,png);return{id,approvalScope:id,artifacts:[{path,source,sha256:hash(png),producer:{command:'actual producer',report:{path:'report.json',sha256:hash(report)}}}]};})};
 const save=()=>files.set('index.json',Buffer.from(JSON.stringify(input)));save();
 const readBytes=path=>{if(!files.has(path))throw new Error(`Missing ${path}`);return files.get(path);};
 const build=()=>buildModernVisualReviewManifest({version:'3.0.1',source,indexPath:'index.json',indexBytes:readBytes('index.json'),readBytes,generatedAt:'2026-09-05T00:00:00Z',command:['node','producer']});
 return{source,files,input,save,readBytes,build};
}
test('modern gallery rebuild validates all bytes and preserves pending-only schema',()=>{const f=fixture(),m=f.build();assert.equal(m.status,'independent-human-approval-pending');assert.equal(m.sectionCount,6);assert.deepEqual(validateModernVisualReviewManifest(m,f.source,f.readBytes),[]);});
test('manifest-only forgery fails replay',()=>{const f=fixture(),m=f.build();m.sections[0].approvalScope='forged';assert.match(validateModernVisualReviewManifest(m,f.source,f.readBytes).join(' '),/differs/);});
test('changed index, artifact, or producer report fails independently',()=>{for(const path of ['index.json','flagship-routes.png','report.json']){const f=fixture(),m=f.build();f.files.set(path,Buffer.from('changed'));assert.notEqual(validateModernVisualReviewManifest(m,f.source,f.readBytes).length,0,path);}});
test('missing scope and wrong-source report rejected even with new hashes',()=>{const f=fixture();f.input.sections.pop();f.save();assert.throws(f.build,/scope/);const g=fixture();const report=Buffer.from(JSON.stringify({source:{...g.source,commit:'wrong'}}));g.files.set('report.json',report);for(const s of g.input.sections)s.artifacts[0].producer.report.sha256=hash(report);g.save();assert.throws(g.build,/Wrong-source producer/);});
test('traversal report and unsupported artifact formats reject',()=>{const f=fixture();f.input.sections[0].artifacts[0].producer.report.path='../outside.json';f.save();assert.throws(f.build,/Invalid artifact path/);const g=fixture();g.input.sections[0].artifacts[0].path='a.html';g.files.set('a.html',Buffer.from('x'));g.save();assert.throws(g.build,/Unsupported review/);});
