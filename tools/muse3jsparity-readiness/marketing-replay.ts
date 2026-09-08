import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { sourceIdentity, validateReceipt, type Artifact, type ProducerReceipt } from './evidence-lineage';
import { validateMarketingAcceptance, type MarketingBuildAcceptance } from './marketing-acceptance';
import { validateDocumentInvariants } from '../muse3jsparity-docs-audit/document-invariants';
export function marketingOutputPaths(root:string):string[]{
 const walk=(dir:string):string[]=>readdirSync(resolve(root,dir),{withFileTypes:true}).flatMap(e=>{const p=`${dir}/${e.name}`;if(e.isSymbolicLink())throw Error(`Symlink in marketing output:${p}`);return e.isDirectory()?walk(p):e.isFile()?[p]:[];});
 return walk('marketing/dist').sort();
}
export function replayMarketingAcceptance(root:string,input:MarketingBuildAcceptance,artifacts:Artifact[],now=Date.now()){
 const source=sourceIdentity(root);
 const errors=validateMarketingAcceptance(input,{source,now,artifacts,readBytes:p=>readFileSync(resolve(root,p)),outputPaths:()=>marketingOutputPaths(root),documentErrors:validateDocumentInvariants(root).errors,readSource:p=>readFileSync(resolve(root,p),'utf8'),
 validateCommand:ref=>{try {const receipt=JSON.parse(readFileSync(resolve(root,ref.path),'utf8')) as ProducerReceipt;
  if(receipt.marketingProofs?.length||receipt.releaseSequenceProofs?.length||receipt.finalClaimsProofs?.length)throw Error('Recursive marketing command receipt');
  return validateReceipt(root,ref,{source,gate:receipt.gate,now});
 }catch(error){return {errors:[String(error)]};}},});
 return {schema:'muse301-marketing-validation/v1',source,errors,status:errors.length?'unverified':'verified'};
}
