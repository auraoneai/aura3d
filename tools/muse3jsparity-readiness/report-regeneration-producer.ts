import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { artifact, sourceIdentity, writeImmutableJson, type Artifact, type ProducerReceipt } from './evidence-lineage';
import { validateReportRegeneration, type ReportRegeneration } from './report-regeneration';
/** Assemble from executed producers only; this does not regenerate missing reports. */
export function produceReportRegeneration(root:string,refs:Artifact[],now=Date.now()){
 const bound=new Map<string,Artifact>();const owned=new Map<string,{artifact:Artifact;producer:Artifact}>();
 const add=(ref:Artifact)=>{if(artifact(root,ref.path).sha256!==ref.sha256)throw Error(`Changed regeneration input: ${ref.path}`);const old=bound.get(ref.path);if(old&&old.sha256!==ref.sha256)throw Error(`Conflicting evidence: ${ref.path}`);bound.set(ref.path,ref);};
 for(const ref of refs){add(ref);const receipt=JSON.parse(readFileSync(resolve(root,ref.path),'utf8')) as ProducerReceipt;
  for(const child of [...receipt.artifacts,...receipt.packages,...receipt.tarballs]){add(child);if(child.path.startsWith('tests/reports/')&&!owned.has(child.path))owned.set(child.path,{artifact:child,producer:ref});}
 }
 const input:ReportRegeneration={schema:'muse301-report-regeneration/v1',source:sourceIdentity(root),receipts:refs,reports:[...owned.values()].sort((a,b)=>a.artifact.path.localeCompare(b.artifact.path))};
 const errors=validateReportRegeneration(root,input,input.source,[...bound.values()],now);
 return {input,artifacts:[...bound.values()],errors};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [inputPath,outputPath]=process.argv.slice(2);if(!inputPath||!outputPath)throw Error('Usage: report-regeneration-producer.ts <receipt-references.json> <output.json>');
 const result=produceReportRegeneration(process.cwd(),JSON.parse(readFileSync(resolve(inputPath),'utf8')));
 if(result.errors.length)throw Error(`Report regeneration incomplete: ${result.errors.join('; ')}`);
 writeImmutableJson(resolve(outputPath),result.input);
}
