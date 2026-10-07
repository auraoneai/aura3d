import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { artifact, sourceIdentity } from '../muse3jsparity-readiness/evidence-lineage';
import { finalClaimsDocuments, type FinalClaimsConfig, type FinalClaim } from './claims';
// Authored exact source mapping. Missing validated receipts remain visible;
// source-only implementation or raw historical results cannot close these rows.
const scopes = [
 {prefix:'| `createAuraApp` root safe API | Awaitable', requirements:['3.0.1:R01','3.0.1:R02','3.0.1:R04','3.0.1:I02'],surface:'createAuraApp root safe API'},
 {prefix:'| `rendering` package /',requirements:['3.0.1:R03','3.0.1:R05','3.0.1:R06'],surface:'rendering package / production-runtime'},
 {prefix:'| `createAuraApp` root safe API and animation',requirements:['3.0.1:E01'],surface:'createAuraApp root safe API and animation packages'},
 {prefix:'| Controls package',requirements:['3.0.1:I01'],surface:'controls package and root routes'},
 {prefix:'| Product routes',requirements:['3.0.1:I03','3.0.1:I04','3.0.1:Q02.task.1'],surface:'product routes'},
 {prefix:'| CLI asset pipeline',requirements:['3.0.1:D01'],surface:'CLI asset pipeline and package decoders'},
 {prefix:'| Release tooling',requirements:['3.0.1:G01','3.0.1:G02','3.0.1:G03','3.0.1:L01'],surface:'release tooling'},
];
const root=process.cwd();const file='docs/project/aura3d-301-release-notes.md';const lines=readFileSync(file,'utf8').split('\n');
const claims:FinalClaim[]=scopes.map(scope=>{const line=lines.findIndex(text=>text.startsWith(scope.prefix));if(line<0)throw new Error(`Missing authored claim:${scope.prefix}`);return {file,line:line+1,text:lines[line]!,sourceSha256:artifact(root,file).sha256,kind:'limitation',surface:scope.surface,requirements:scope.requirements,receipts:[],assertions:[]};});
const taaFile='docs/rendering/webgpu-current-architecture.md';const taaLines=readFileSync(taaFile,'utf8').split('\n');const taa=taaLines.findIndex(text=>text.startsWith('| `taa` |'));
if(taa>=0)claims.push({file:taaFile,line:taa+1,text:taaLines[taa]!,sourceSha256:artifact(root,taaFile).sha256,kind:'history',surface:'rendering package native WebGPU; run34001658939 source snapshot',requirements:['3.0.1:R03'],receipts:[],assertions:[]});
const config:FinalClaimsConfig={schema:'muse301-final-claims/v1',source:sourceIdentity(root),documents:finalClaimsDocuments(root).map(path=>artifact(root,path)),claims,historicalInventory:[]};
const out=process.argv[2]??'tests/reports/muse3jsparity-final-claims-input.json';mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(config,null,2)+'\n');console.log(JSON.stringify({out,claims:claims.length,status:'unverified',reason:'Remaining document claims and validated receipts require explicit mapping'}));
