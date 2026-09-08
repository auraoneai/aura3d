import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const fail=(ok,message)=>{if(!ok)throw new Error(message)};
export function validateVersionInventory(root,plan){
 const paths=new Set(['package.json','packages/engine/package.json','packages/create-aura3d/src/index.ts','marketing/package.json']);
 const read=p=>{paths.add(p);return JSON.parse(readFileSync(resolve(root,p),'utf8'))};
 const manifests=['package.json',...readdirSync(resolve(root,'packages')).map(n=>`packages/${n}/package.json`).filter(p=>existsSync(resolve(root,p)))].map(path=>({path,data:read(path)}));
 const published=manifests.filter(p=>p.data.private!==true), names=new Set(published.map(p=>p.data.name));
 const workspaceNames=new Set(manifests.map(p=>p.data.name).filter(name=>typeof name==='string'));
 fail(published.length===29 && names.size===29,'Version inventory requires 29 public packages');
 for(const {path,data} of published)fail(data.version==='3.0.1' && plan.packages.some(p=>p.name===data.name && p.version===data.version),`Public version mismatch: ${path}`);
 const privateEngine=read('packages/engine/package.json');fail(privateEngine.private===true && !names.has(privateEngine.name),'Private engine leaked into publication');
 const generator=readFileSync(resolve(root,'packages/create-aura3d/src/index.ts'),'utf8');
 const block=generator.match(/CREATE_AURA3D_TEMPLATES = \[([\s\S]*?)\] as const/);
 fail(block,'Canonical generator inventory missing');
 const templates=[...block[1].matchAll(/"([^"]+)"/g)].map(m=>m[1]);fail(templates.length===19 && new Set(templates).size===19,'Canonical 19 scaffolds missing');
 fail(/options\.packageVersion \?\? "3\.0\.1"/.test(generator) && !/options\.packageVersion \?\? "(?!3\.0\.1")/.test(generator),'Generator default version mismatch');
 const archive=plan.packages.find(p=>p.name===read('package.json').name);fail(archive,'Root archive missing');
 const entries=execFileSync('tar',['-tzf',resolve(root,archive.tarball)],{encoding:'utf8'}).split('\n');
 const rootTemplates=entries.filter(p=>/^package\/templates\/.+\/package\.json$/.test(p)).map(p=>p.slice('package/'.length));
 fail(rootTemplates.length>0 && new Set(rootTemplates).size===rootTemplates.length,'Root archive template inventory missing or duplicated');
 for(const path of rootTemplates){const packed=JSON.parse(execFileSync('tar',['-xOzf',resolve(root,archive.tarball),`package/${path}`],{encoding:'utf8'}));fail(JSON.stringify(packed)===JSON.stringify(read(path)),`Packed template differs from source: ${path}`);}
 const scaffoldPaths=templates.map(n=>`packages/create-aura3d/templates/${n}/package.json`);
 for(const path of [...published.map(p=>p.path),...scaffoldPaths,...rootTemplates,'marketing/package.json']){
  const data=read(path),exact=scaffoldPaths.includes(path)||rootTemplates.includes(path)||path==='marketing/package.json';
  for(const field of ['dependencies','devDependencies','peerDependencies','optionalDependencies'])for(const [name,constraint]of Object.entries(data[field]??{})){
   if(!name.startsWith('@aura3d/'))continue;
   fail(workspaceNames.has(name),`Unknown internal dependency: ${path} ${name}`);
   if(names.has(name))fail(exact?constraint==='3.0.1':/^(workspace:(\*|\^|~)|[~^]?3\.0\.1)$/.test(constraint),`Internal version constraint mismatch: ${path} ${name}=${constraint}`);
   else fail(field==='devDependencies' && /^workspace:(\*|\^|~)$/.test(constraint),`Private workspace package may only be a workspace devDependency: ${path} ${name}=${constraint}`);
  }
  for(const command of Object.values(exact ? data.scripts??{} : {}))for(const match of command.matchAll(/(@aura3d\/[a-z0-9-]+)@([^\s"']+)/g))fail(names.has(match[1])&&match[2]==='3.0.1',`Script install version mismatch: ${path} ${match[0]}`);
 }
 fail(read('marketing/package.json').dependencies?.['@aura3d/engine']==='3.0.1','Marketing candidate must use exact 3.0.1 engine');
 const physics=read('packages/create-aura3d/templates/character-controller/package.json').scripts?.['enable:physics'];
 fail(typeof physics==='string'&&physics.includes('@aura3d/physics@3.0.1')&&physics.includes('@aura3d/physics-rapier@3.0.1'),'Generated physics install command missing exact pins');
 return {schema:'muse301-version-inventory/v1',version:'3.0.1',publicManifests:published.map(p=>p.path),privateEngine:'packages/engine/package.json',scaffoldManifests:scaffoldPaths,rootTemplateManifests:rootTemplates,marketingManifest:'marketing/package.json',generator:'packages/create-aura3d/src/index.ts',paths:[...paths].sort()};
}
