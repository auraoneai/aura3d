#!/usr/bin/env node
/** Read-only registry observations for the 3.0.1 no-deprecation release contract. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceIdentity } from './source-identity.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function collectRegistrySnapshot({root=process.cwd(),output,fetchImpl=fetch,clock=()=>new Date().toISOString()}) {
 if(!output)throw Error('--output required; choose a distinct before/after artifact path');
 const destination=resolve(root,output);
 if(!relative(root,destination)||relative(root,destination).startsWith('..'))throw Error('Snapshot output must remain inside checkout');
 const source=sourceIdentity(root),startedAt=clock();
 const manifests=[JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')),...readdirSync(resolve(root,'packages'),{withFileTypes:true}).filter(d=>d.isDirectory()).flatMap(d=>{try{return[JSON.parse(readFileSync(resolve(root,'packages',d.name,'package.json'),'utf8'))]}catch{return[]}})].filter(p=>p.private!==true);
 if(manifests.length!==29||new Set(manifests.map(p=>p.name)).size!==29||manifests.some(p=>p.version!=='3.0.1'))throw Error('Requires exact 29-package 3.0.1 manifest inventory');
 mkdirSync(dirname(destination),{recursive:true});
 const responses=[],packages={};
 for(const [index,p] of manifests.entries()) {
  const url=`https://registry.npmjs.org/${encodeURIComponent(p.name)}`;
  const response=await fetchImpl(url,{method:'GET',redirect:'error',headers:{accept:'application/json'},signal:AbortSignal.timeout(30000)});
  if(response.status!==200)throw Error(`Registry HTTP ${response.status} for ${p.name}`);
  const bytes=Buffer.from(await response.arrayBuffer()),body=JSON.parse(bytes.toString('utf8'));
  if(body.name!==p.name||!body.versions||!body['dist-tags'])throw Error(`Invalid registry package document: ${p.name}`);
  const path=`${destination}.package-${index}.json`;
  writeFileSync(path,bytes,{flag:'wx'});
  responses.push({name:p.name,url,method:'GET',status:response.status,observedAt:clock(),body:{path:relative(root,path),sha256:sha(bytes)}});
  packages[p.name]={versions:Object.fromEntries(Object.entries(body.versions).map(([version,data])=>[version,{...(data.deprecated===undefined?{}:{deprecated:data.deprecated}),dist:data.dist}])),distTags:body['dist-tags']};
 }
 if(JSON.stringify(sourceIdentity(root))!==JSON.stringify(source))throw Error('Source changed during registry observation');
 const report={schema:'muse301-registry-snapshot/v1',registry:'https://registry.npmjs.org',source,startedAt,observedAt:clock(),command:['node','tools/release/collect-registry-snapshot.mjs','--output',relative(root,destination)],responses,packages};
 writeFileSync(destination,JSON.stringify(report,null,2)+'\n',{flag:'wx'});return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const i=process.argv.indexOf('--output');
 await collectRegistrySnapshot({output:i<0?undefined:process.argv[i+1]});
}
