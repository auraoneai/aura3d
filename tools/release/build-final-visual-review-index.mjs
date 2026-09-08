#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceIdentity } from './source-identity.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const REQUIRED_SCOPES = ['flagship-routes','showcase-games','aura-clash','night-adoption','crowd-adoption','selected-threejs-comparison'];
function safePath(path) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || path.includes('\\') || path.split('/').includes('..') || posix.normalize(path) !== path) throw new Error(`Invalid artifact path ${path}`);
  return path;
}
function sameSource(a,b){return !!a&&!!b&&['commit','tree','lockfileSha256','fingerprint'].every(key=>a[key]===b[key]);}
function readableArtifact(path,bytes){
  if (/\.png$/i.test(path)) {
    if(bytes.length<24||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.subarray(12,16).toString('ascii')!=='IHDR'||!bytes.readUInt32BE(16)||!bytes.readUInt32BE(20))throw new Error(`Unreadable PNG ${path}`);
  } else if (/\.json$/i.test(path)) JSON.parse(bytes.toString('utf8'));
  else if (/\.webm$/i.test(path)) { if(bytes.subarray(0,4).toString('hex')!=='1a45dfa3')throw new Error(`Unreadable WebM ${path}`); }
  else if (/\.mp4$/i.test(path)) { if(bytes.subarray(4,8).toString('ascii')!=='ftyp')throw new Error(`Unreadable MP4 ${path}`); }
  else throw new Error(`Unsupported review artifact format ${path}`);
}
export function buildFinalVisualReviewIndex({version,source,input,readBytes}) {
  if(version!=='3.0.1'||input?.schema!=='aura3d.final-visual-review-input/1.0'||input.version!==version||!sameSource(input.source,source))throw new Error('Review input version/source mismatch');
  if(!Array.isArray(input.sections)||input.sections.length!==REQUIRED_SCOPES.length)throw new Error('Expected exactly six final review scopes');
  const seen=new Set();
  const sections=REQUIRED_SCOPES.map(id=>{
    const matches=input.sections.filter(section=>section.id===id);
    if(matches.length!==1||typeof matches[0].approvalScope!=='string'||!matches[0].approvalScope.trim()||!Array.isArray(matches[0].artifacts)||!matches[0].artifacts.length)throw new Error(`Missing/duplicate/empty scope ${id}`);
    const section=matches[0];
    const artifacts=section.artifacts.map(candidate=>{
      const path=safePath(candidate.path),producerPath=safePath(candidate.producerReceipt?.path);
      if(seen.has(path))throw new Error(`Duplicate review artifact ${path}`);seen.add(path);
      const bytes=Buffer.from(readBytes(path));readableArtifact(path,bytes);const digest=sha256(bytes);
      const producerBytes=Buffer.from(readBytes(producerPath));
      if(sha256(producerBytes)!==candidate.producerReceipt.sha256)throw new Error(`Changed producer receipt ${producerPath}`);
      const producer=JSON.parse(producerBytes.toString('utf8'));
      if(producer.schema!=='muse3jsparity-producer/v1'||producer.exitCode!==0||!sameSource(producer.source,source)||!Array.isArray(producer.command)||!producer.command.length)throw new Error(`Invalid/wrong-source producer ${producerPath}`);
      const bound=[...(producer.artifacts??[]),...(producer.packages??[]),...(producer.tarballs??[])].filter(ref=>ref.path===path&&ref.sha256===digest);
      if(bound.length!==1)throw new Error(`Artifact is not uniquely bound by producer ${path}`);
      return {path,source,sha256:digest,producer:{command:producer.command.join(' '),report:{path:producerPath,sha256:candidate.producerReceipt.sha256}}};
    });
    return {id,approvalScope:section.approvalScope,artifacts};
  });
  return {schema:'aura3d.final-visual-review-index/1.0',version,source,generatedAt:new Date().toISOString(),sections};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);const option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]};
  const version=option('--version'),inputPath=option('--input'),outputPath=option('--output');
  if(!version||!inputPath||!outputPath)throw new Error('Usage: build-final-visual-review-index.mjs --version 3.0.1 --input <input.json> --output <index.json>');
  const root=process.cwd(),input=JSON.parse(readFileSync(resolve(root,inputPath),'utf8')),source=sourceIdentity(root);
  const document=buildFinalVisualReviewIndex({version,source,input,readBytes:path=>readFileSync(resolve(root,path))});
  const output=resolve(root,outputPath);if(relative(root,output).startsWith('..'))throw new Error('Output escapes checkout');mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(document,null,2)+'\n',{flag:'wx'});
  console.log(`Wrote ${document.sections.length}-scope final review index: ${relative(root,output)}`);
}
