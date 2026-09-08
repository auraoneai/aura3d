#!/usr/bin/env node
/** Lightweight snapshot input closure: stat assets, never silently omit by size.
 * Supply the cumulative inventory of base + overlays + hydration archives.
 * A delta inventory alone is intentionally insufficient to prove completeness.
 */
import { existsSync, readFileSync, statSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routePrimaryProbeExpectedRouteIds } from '../showcase-library/route-primary-probes.mjs';
import { listShowcaseRouteGates } from '../showcase-library/route-gates.mjs';
const external=value=>/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value);
export function enumerateManifestAssets(root,manifestPaths){
 root=realpathSync(root);
 const files=new Map(),errors=[];
 const add=(path,manifest,kind,expected={})=>{
  if(!path)return;
  const absolute=resolve(root,path),local=relative(root,absolute);
  if(isAbsolute(path)||local==='..'||local.startsWith('../')){errors.push(`Escaping asset path ${path} in ${manifest}`);return;}
  let row=files.get(local);if(!row){row={path:local,bytes:null,manifestHashes:[],references:[]};files.set(local,row);}
  row.references.push({manifest,kind});
  if(expected.hash?.startsWith('sha256-'))row.manifestHashes.push(expected.hash.slice(7));
  try{
   const real=realpathSync(absolute);if(relative(root,real).startsWith('../'))throw Error('symlink escapes checkout');
   const stat=statSync(absolute);if(!stat.isFile())throw Error('not a regular file');row.bytes=stat.size;
   if(Number.isFinite(expected.sizeBytes)&&stat.size!==expected.sizeBytes)errors.push(`Asset byte size mismatch ${local}: expected ${expected.sizeBytes}, found ${stat.size}`);
  }catch(error){errors.push(`Missing local dependency ${local} (${kind}, ${manifest}): ${error.message}`);}
 };
 for(const path of [...new Set(manifestPaths)].sort()){
  add(path,path,'manifest');
  let manifest;try{manifest=JSON.parse(readFileSync(resolve(root,path),'utf8'));}catch{continue;}
  const base=dirname(path),local=value=>relative(root,resolve(root,base,value));
  if(!Array.isArray(manifest.assets)){errors.push(`Invalid asset manifest ${path}`);continue;}
  if(manifest.typegen)add(local(manifest.typegen),path,'typegen');
  for(const asset of manifest.assets){
   if(asset.outputPath)add(local(asset.outputPath),path,`${asset.id}:output`,asset);
   if(typeof asset.source==='string'&&!external(asset.source)&&!asset.source.startsWith('/')&&/[/.]/.test(asset.source))add(local(asset.source),path,`${asset.id}:source`);
   const visit=(value,key='')=>{
    if(Array.isArray(value)){for(const item of value)visit(item,key);return;}
    if(value&&typeof value==='object'){for(const [childKey,child]of Object.entries(value))visit(child,childKey);return;}
    if(typeof value!=='string'||external(value)||!value.startsWith('/')||!/(?:url|uri|path)$/i.test(key))return;
    const publicPath=value.split(/[?#]/)[0];if(publicPath.includes('..')){errors.push(`Unsafe asset URL ${value}`);return;}
    add(local(`public${decodeURIComponent(publicPath)}`),path,`${asset.id}:${key}`);
   };
   visit(asset);
  }
 }
 return {files:[...files.values()].map(row=>({...row,manifestHashes:[...new Set(row.manifestHashes)]})).sort((a,b)=>a.path.localeCompare(b.path)),errors};
}
export function discoverSnapshotManifests(root){
 const source=readFileSync(resolve(root,'packages/create-aura3d/src/index.ts'),'utf8');
 const list=/export const CREATE_AURA3D_TEMPLATES\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(source);
 if(!list)throw Error('Cannot discover canonical template inventory');
 const templates=[...list[1].matchAll(/"([^"\n]+)"/g)].map(m=>m[1]);
 if(templates.length!==19||new Set(templates).size!==19)throw Error('Expected all19 canonical templates');
 const registered=listShowcaseRouteGates(root),expected=new Set(routePrimaryProbeExpectedRouteIds(registered));
 const routes=registered.filter(r=>expected.has(r.id));
 const manifests=new Set(['aura.assets.json']);
 for(const name of templates){const path=`packages/create-aura3d/templates/${name}/aura.assets.json`;if(existsSync(resolve(root,path)))manifests.add(path);}
 for(const route of routes){const path=`${route.path.replace(/^\//,'').replace(/\/$/,'')}/aura.assets.json`;if(existsSync(resolve(root,path)))manifests.add(path);}
 return {templates,routes:routes.map(r=>r.id),manifests:[...manifests]};
}
export function checkSnapshotAssetClosure(root,inventory){
 const scope=discoverSnapshotManifests(root),closure=enumerateManifestAssets(root,scope.manifests),errors=[...closure.errors];
 errors.push(...validateSnapshotAssetInventory(closure.files,inventory));
 return {schema:'aura3d-snapshot-asset-closure/v1',scope,...closure,errors,transportVerified:!!inventory&&errors.length===0,filesOver5MB:closure.files.filter(f=>f.bytes>5_000_000).map(f=>f.path)};
}
export function validateSnapshotAssetInventory(files,inventory){
 const errors=[],entries=new Map();
 if(inventory){
  if(inventory.schema!=='aura3d-snapshot-file-inventory/v1'||inventory.scope!=='cumulative')errors.push('Snapshot inventory must represent cumulative base, overlays and hydration');
  for(const file of inventory.files??[]){if(!file?.path||!Number.isFinite(file.bytes)||file.bytes<0)errors.push('Invalid snapshot file inventory row');else entries.set(file.path.replace(/^\.\//,''),file);}
  for(const file of files){const transported=entries.get(file.path);if(!transported){errors.push(`Snapshot omitted required asset dependency: ${file.path} (${file.bytes??'missing'} bytes)`);continue;}if(transported.bytes!==file.bytes)errors.push(`Snapshot byte size differs: ${file.path}`);if(transported.sha256&&file.manifestHashes.some(hash=>hash!==transported.sha256))errors.push(`Snapshot asset hash differs from manifest: ${file.path}`);}
 }
 return errors;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const option=key=>{const i=process.argv.indexOf(key);return i<0?undefined:process.argv[i+1];};
 const inventoryPath=option('--inventory'),output=option('--output'),root=resolve(option('--root')??process.cwd());
 const report=checkSnapshotAssetClosure(root,inventoryPath?JSON.parse(readFileSync(inventoryPath,'utf8')):undefined);
 if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({templates:report.scope.templates.length,routes:report.scope.routes.length,manifests:report.scope.manifests.length,dependencies:report.files.length,over5MB:report.filesOver5MB.length,transportVerified:report.transportVerified,errors:report.errors},null,2));
 if(report.errors.length)process.exitCode=1;
}
