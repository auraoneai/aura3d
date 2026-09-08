import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildFinalVisualReviewIndex } from './build-final-visual-review-index.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const png=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.write('IHDR',12);png.writeUInt32BE(1,16);png.writeUInt32BE(1,20);
const source={commit:'c',tree:'t',lockfileSha256:'l',fingerprint:'f'};
const scopes=['flagship-routes','showcase-games','aura-clash','night-adoption','crowd-adoption','selected-threejs-comparison'];
function fixture(){const files=new Map();const sections=scopes.map((id,index)=>{const path=`capture-${index}.png`,report=`receipt-${index}.json`;files.set(path,png);const receipt={schema:'muse3jsparity-producer/v1',exitCode:0,source,command:['capture'],artifacts:[{path,sha256:sha(png)}],packages:[],tarballs:[]};const bytes=Buffer.from(JSON.stringify(receipt));files.set(report,bytes);return{id,approvalScope:id,artifacts:[{path,producerReceipt:{path:report,sha256:sha(bytes)}}]};});return{files,input:{schema:'aura3d.final-visual-review-input/1.0',version:'3.0.1',source,sections}};}
test('builds six-scope index only from uniquely producer-bound captures',()=>{const f=fixture();const result=buildFinalVisualReviewIndex({version:'3.0.1',source,input:f.input,readBytes:path=>f.files.get(path)});assert.equal(result.sections.length,6);assert.equal(result.sections[0].artifacts[0].producer.report.path,'receipt-0.json');});
test('rejects a capture that its producer did not bind',()=>{const f=fixture();f.input.sections[0].artifacts[0].path='other.png';f.files.set('other.png',png);assert.throws(()=>buildFinalVisualReviewIndex({version:'3.0.1',source,input:f.input,readBytes:path=>f.files.get(path)}),/not uniquely bound/);});
test('rejects wrong-source producer receipts',()=>{const f=fixture();const ref=f.input.sections[0].artifacts[0].producerReceipt;const receipt=JSON.parse(f.files.get(ref.path));receipt.source.fingerprint='wrong';const bytes=Buffer.from(JSON.stringify(receipt));f.files.set(ref.path,bytes);ref.sha256=sha(bytes);assert.throws(()=>buildFinalVisualReviewIndex({version:'3.0.1',source,input:f.input,readBytes:path=>f.files.get(path)}),/wrong-source/);});
