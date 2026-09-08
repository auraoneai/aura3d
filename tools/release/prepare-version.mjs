#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync, writeFileSync, globSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('Usage: node tools/release/prepare-version.mjs VERSION [--check]');
const check = process.argv.includes('--check');
const read = p => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
const packages = ['package.json', ...readdirSync(resolve(root, 'packages')).map(n => `packages/${n}/package.json`).filter(p => existsSync(resolve(root,p)) && read(p).private !== true)];
if (packages.length !== 29) throw new Error(`Public package inventory changed: ${packages.length}, expected 29`);
const names = new Set(packages.map(p => read(p).name));
const generatorPath = 'packages/create-aura3d/src/index.ts';
const generator = readFileSync(resolve(root,generatorPath),'utf8');
const templateBlock = generator.match(/CREATE_AURA3D_TEMPLATES = \[([\s\S]*?)\] as const/);
if (!templateBlock) throw new Error('Missing canonical scaffold inventory');
const templates = [...templateBlock[1].matchAll(/"([^"]+)"/g)].map(m=>m[1]);
if (new Set(templates).size !== 19) throw new Error('Expected 19 canonical scaffolds');
const manifests = new Set([...packages, ...templates.map(n=>`packages/create-aura3d/templates/${n}/package.json`)]);
// Include only root templates actually selected for publication, not archived compatibility surfaces.
const selectedRootFiles=new Set();
for (const pattern of read('package.json').files ?? []) {
 const exclude=pattern.startsWith('!'), normalized=exclude?pattern.slice(1):pattern;
 for(const match of globSync(normalized,{cwd:root})) {
  const candidates=statSync(resolve(root,match)).isDirectory()?globSync(`${match}/**/package.json`,{cwd:root}):[match];
  for(const path of candidates) if(path.startsWith('templates/') && path.endsWith('/package.json')) {if(exclude)selectedRootFiles.delete(path);else selectedRootFiles.add(path);}
 }
}
for(const path of selectedRootFiles)manifests.add(path);
manifests.add('marketing/package.json');
const changed=[];
for (const path of manifests) {
 const original=readFileSync(resolve(root,path),'utf8'); const manifest=JSON.parse(original);
 if (packages.includes(path)) manifest.version=version;
 for (const field of ['dependencies','devDependencies','peerDependencies','optionalDependencies']) for (const [name, constraint] of Object.entries(manifest[field]??{})) {
  if (!names.has(name) || constraint.startsWith('workspace:')) continue;
  // Preserve peer range semantics and optional-peer metadata. Rewrite only exact/current-major pins.
  if (/^[~^]?3\.0\.\d+$/.test(constraint)) manifest[field][name]=constraint.replace(/3\.0\.\d+$/,version);
 }
 for(const [key,command] of Object.entries(manifest.scripts??{})) {
  manifest.scripts[key]=command.replace(/(@aura3d\/[a-z0-9-]+)@3\.0\.\d+/g,(match,name)=>names.has(name)?`${name}@${version}`:match);
 }
 const updated=JSON.stringify(manifest,null,2)+'\n';
 if(updated!==original){changed.push(path); if(!check)writeFileSync(resolve(root,path),updated);}
}
const updatedGenerator=generator.replace(/options\.packageVersion \?\? "\d+\.\d+\.\d+"/g,`options.packageVersion ?? "${version}"`);
if(updatedGenerator!==generator){changed.push(generatorPath);if(!check)writeFileSync(resolve(root,generatorPath),updatedGenerator);}
console.log(JSON.stringify({version,publicPackages:packages.length,scaffolds:templates.length,changed,mode:check?'check':'prepare'},null,2));
if(check && changed.length)process.exitCode=1;
