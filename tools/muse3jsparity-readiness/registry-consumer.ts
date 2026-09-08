import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Artifact, SourceIdentity } from './evidence-lineage';
export interface RegistryConsumerInput {
 schema:'muse301-registry-consumer/v1'; source:SourceIdentity; releasePlan:Artifact;
 packageReceipt:Artifact; registry:Artifact; consumer:Artifact; installedScaffolds:Artifact; provenance:Artifact;
 commands:Artifact[];
}
/** Canonical package acceptance must also replay before this stricter registry leg.
 * Registry URLs in the retained npm lock distinguish an actual registry install
 * from a local tarball install with otherwise identical bytes. */
export function validateRegistryConsumer(input:RegistryConsumerInput,context:{source:SourceIdentity;read:(ref:Artifact)=>Uint8Array;validateCommand:(ref:Artifact)=>{errors:string[];command?:string[]};validatePackages:(ref:Artifact)=>string[]}):string[]{
 const errors:string[]=[];
 const read=(ref:Artifact)=>{const bytes=context.read(ref);if(createHash('sha256').update(bytes).digest('hex')!==ref.sha256)throw Error('Changed registry consumer artifact');return JSON.parse(Buffer.from(bytes).toString('utf8'));};
 try{
  if(input.schema!=='muse301-registry-consumer/v1'||!isDeepStrictEqual(input.source,context.source))throw Error('Registry consumer source/schema mismatch');
  if(context.validatePackages(input.packageReceipt).length)throw Error('Canonical registry package acceptance failed');
  const plan=read(input.releasePlan),registry=read(input.registry),consumer=read(input.consumer),scaffolds=read(input.installedScaffolds);read(input.provenance);
  if(plan.version!=='3.0.1'||plan.packages?.length!==29||new Set(plan.packages.map((p:any)=>p.name)).size!==29||!isDeepStrictEqual(plan.source,context.source))throw Error('Invalid registry release plan');
  if(registry.registry!=='https://registry.npmjs.org'||registry.packages?.length!==29||registry.releasePlan?.sha256!==input.releasePlan.sha256)throw Error('Registry publication inventory mismatch');
  if(consumer.installationSource!=='npm-registry'||consumer.releasePlan?.sha256!==input.releasePlan.sha256||!isDeepStrictEqual(consumer.source,context.source)||!consumer.retained)throw Error('Consumer did not install from npm registry');
  const lock=read({path:`${consumer.retained}/package-lock.json`,sha256:consumer.installedIdentity?.lockfileSha256});
  const command=consumer.installCommand;
  if(command?.[0]!=='npm'||command?.[1]!=='install'||command.some((x:string)=>/\.tgz$|^file:/.test(x)))throw Error('Consumer install command uses local archives');
  if(consumer.packages?.length!==29||new Set(consumer.packages.map((p:any)=>p.name)).size!==29)throw Error('Missing all29 consumer results');
  for(const p of plan.packages){
   const publication=registry.packages.find((r:any)=>r.name===p.name),installed=lock.packages?.[`node_modules/${p.name}`],result=consumer.packages.find((r:any)=>r.name===p.name);
   if(!command.includes(`${p.name}@3.0.1`))throw Error(`Missing exact registry install ${p.name}`);
   if(!publication||publication.version!=='3.0.1'||publication.latest!=='3.0.1'||publication.deprecated||publication.integrity!==p.integrity||publication.downloadedTarball?.sha256!==p.sha256)throw Error(`Registry bytes mismatch ${p.name}`);
   const archive=context.read(publication.downloadedTarball);if(createHash('sha256').update(archive).digest('hex')!==p.sha256||`sha512-${createHash('sha512').update(archive).digest('base64')}`!==p.integrity)throw Error('Downloaded registry archive changed');
   if(installed?.version!=='3.0.1'||installed.integrity!==p.integrity||!installed.resolved||new URL(installed.resolved).origin!=='https://registry.npmjs.org')throw Error(`Consumer lock not from registry ${p.name}`);
   if(!result||result.version!=='3.0.1'||result.sha256!==p.sha256||result.installedIntegrity!==p.integrity||result.violations?.length!==0)throw Error(`Consumer identity failed ${p.name}`);
   if(!result.importedEntrypoints?.length&&!result.binChecks?.length)throw Error(`No actual consumer behavior ${p.name}`);
   for(const probe of result.importedEntrypoints??[]){const raw=JSON.parse(probe.stdout.trim().split('\n').at(-1));if(raw.specifier!==probe.specifier||!Array.isArray(raw.exports))throw Error(`Invalid retained import result ${p.name}`);}
   for(const probe of result.binChecks??[])if(!probe.stdout?.trim()||probe.command?.at(-1)!=='--help')throw Error(`Invalid CLI behavior ${p.name}`);
  }
  if(scaffolds.releasePlan?.sha256!==input.releasePlan.sha256||scaffolds.scaffoldSmoke?.length!==19||new Set(scaffolds.scaffoldSmoke.map((s:any)=>s.template)).size!==19)throw Error('Missing registry scaffold inventory');
  for(const scaffold of scaffolds.scaffoldSmoke){
   if(!scaffold.installedArtifacts?.length)throw Error('Missing registry scaffold installed identities');
   for(const a of scaffold.installedArtifacts){const p=plan.packages.find((p:any)=>p.name===a.name);if(!p||a.installedIntegrity!==p.integrity||!a.resolved||new URL(a.resolved).origin!=='https://registry.npmjs.org')throw Error(`Scaffold not registry installed ${scaffold.template}`);}
  }
  const commands=input.commands.map(ref=>context.validateCommand(ref));
  if(commands.some(c=>c.errors.length))throw Error('Registry verification command failed');
  for(const wanted of [['pnpm','verify:package-install-smoke:fresh'],['pnpm','verify:package-provenance'],['pnpm','exec','vitest','run','tests/unit/package-dist']])if(!commands.some(c=>isDeepStrictEqual(c.command,wanted)))throw Error(`Missing registry command ${wanted.join(' ')}`);
 }catch(error){errors.push(String(error));}
 return errors;
}
