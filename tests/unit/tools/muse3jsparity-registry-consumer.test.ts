import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {validateRegistryConsumer} from '../../../tools/muse3jsparity-readiness/registry-consumer';
function fixture(){
 const source={commit:'a',tree:'b',lockfileSha256:'c',fingerprint:'d'},files=new Map<string,Buffer>();
 const ref=(path:string,value:any)=>{const b=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));files.set(path,b);return {path,sha256:createHash('sha256').update(b).digest('hex')}};
 const archive=ref('download.tgz',Buffer.from('actual bytes')),integrity=`sha512-${createHash('sha512').update(files.get('download.tgz')!).digest('base64')}`;
 const packages=Array.from({length:29},(_,i)=>({name:`@aura3d/p${i}`,version:'3.0.1',sha256:archive.sha256,integrity}));
 const plan=ref('plan.json',{version:'3.0.1',source,packages});
 const lock={packages:Object.fromEntries(packages.map(p=>[`node_modules/${p.name}`,{version:p.version,integrity,resolved:`https://registry.npmjs.org/${p.name}/p.tgz` }]))};
 const lockRef=ref('retained/package-lock.json',lock);
 const consumer={installationSource:'npm-registry',source,releasePlan:plan,retained:'retained',installedIdentity:{lockfileSha256:lockRef.sha256},installCommand:['npm','install',...packages.map(p=>`${p.name}@3.0.1`)],packages:packages.map(p=>({...p,installedIntegrity:integrity,violations:[],importedEntrypoints:[{specifier:p.name,stdout:JSON.stringify({specifier:p.name,exports:['create']})}]}))};
 const input={schema:'muse301-registry-consumer/v1' as const,source,releasePlan:plan,packageReceipt:ref('receipt.json',{}),registry:ref('registry.json',{registry:'https://registry.npmjs.org',releasePlan:plan,packages:packages.map(p=>({...p,latest:p.version,downloadedTarball:archive}))}),consumer:ref('consumer.json',consumer),installedScaffolds:ref('scaffolds.json',{releasePlan:plan,scaffoldSmoke:Array.from({length:19},(_,i)=>({template:`t${i}`,installedArtifacts:[{name:packages[0].name,installedIntegrity:integrity,resolved:'https://registry.npmjs.org/a/t.tgz'}]}))}),provenance:ref('provenance.json',{}),commands:[['pnpm','verify:package-install-smoke:fresh'],['pnpm','verify:package-provenance'],['pnpm','exec','vitest','run','tests/unit/package-dist']].map((command,i)=>ref(`command${i}.json`,{command}))};
 const context={source,read:(r:{path:string})=>files.get(r.path)!,validatePackages:()=>[] as string[],validateCommand:(r:{path:string})=>({errors:[],command:JSON.parse(files.get(r.path)!.toString()).command})};
 return {input,context,consumer,ref};
}
it('requires actual registry lock and all29 consumer observations plus canonical package replay',()=>{const f=fixture();expect(validateRegistryConsumer(f.input,f.context)).toEqual([])});
it('rejects local archive installation even with identical bytes',()=>{const f=fixture();f.consumer.installationSource='local-tarballs';f.input.consumer=f.ref('consumer.json',f.consumer);expect(validateRegistryConsumer(f.input,f.context).join()).toContain('did not install from npm registry')});
it('rejects failed canonical package lifecycle/provenance replay',()=>{const f=fixture();f.context.validatePackages=()=>['missing provenance'];expect(validateRegistryConsumer(f.input,f.context).join()).toContain('Canonical registry package acceptance failed')});
it('rejects an unexercised public package',()=>{const f=fixture();f.consumer.packages[0].importedEntrypoints=[];f.input.consumer=f.ref('consumer.json',f.consumer);expect(validateRegistryConsumer(f.input,f.context).join()).toContain('No actual consumer behavior')});
