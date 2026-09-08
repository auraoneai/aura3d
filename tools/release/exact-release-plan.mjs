import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { sourceIdentity } from './source-identity.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export function loadValidatedReleasePlan(root=process.cwd(), path=process.env.A3D_RELEASE_PLAN) {
 if(!path)return null;
 const absolute=resolve(root,path), bytes=readFileSync(absolute), plan=JSON.parse(bytes), source=sourceIdentity(root);
 if(!plan.source||Object.keys(source).some(k=>plan.source[k]!==source[k]))throw new Error('Exact release source mismatch');
 const manifestPaths=['package.json',...readdirSync(resolve(root,'packages')).map(n=>`packages/${n}/package.json`).filter(p=>existsSync(resolve(root,p)))];
 const manifests=manifestPaths.map(p=>JSON.parse(readFileSync(resolve(root,p),'utf8'))).filter(p=>p.private!==true);
 if(manifests.length!==29||plan.packages?.length!==29||new Set(plan.packages.map(p=>p.name)).size!==29)throw new Error('Exact release requires29publicpackages');
 for(const manifest of manifests){const p=plan.packages.find(p=>p.name===manifest.name);if(!p||p.version!==manifest.version||p.version!==plan.version)throw new Error(`Exact release version mismatch ${manifest.name}`);const data=readFileSync(resolve(root,p.tarball));if(hash(data)!==p.sha256||`sha512-${createHash('sha512').update(data).digest('base64')}`!==p.integrity)throw new Error(`Exact archive mismatch ${p.name}`);}
 return {...plan,reference:{path:relative(root,absolute),sha256:hash(bytes)}};
}
export function inspectInstalledRelease(root, project, plan) {
 const lock=JSON.parse(readFileSync(resolve(project,'package-lock.json'),'utf8'));
 const observed=[];
 for(const [path,p] of Object.entries(lock.packages??{})) {
  const candidate=plan.packages.find(entry=>path.endsWith(`node_modules/${entry.name}`));if(!candidate)continue;
  const installed=JSON.parse(readFileSync(resolve(project,path,'package.json'),'utf8'));
  if(installed.version!==candidate.version||p.integrity!==candidate.integrity)throw new Error(`Installed archive identity mismatch ${path}`);
  observed.push({name:candidate.name,version:installed.version,integrity:p.integrity,resolved:p.resolved,tarball:candidate.tarball,sha256:candidate.sha256});
 }
 if(!observed.length)throw new Error('No exact release packages observed in installed lock');
 return {project:relative(root,project),lockfileSha256:hash(readFileSync(resolve(project,'package-lock.json'))),packages:observed};
}
