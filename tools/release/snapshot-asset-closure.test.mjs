import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,truncateSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {enumerateManifestAssets,validateSnapshotAssetInventory} from './snapshot-asset-closure.mjs';
test('large manifested models survive closure enumeration and omitted transport fails',()=>{
 const root=mkdtempSync(join(tmpdir(),'asset-closure-'));
 try{mkdirSync(join(root,'public/aura-assets'),{recursive:true});writeFileSync(join(root,'public/aura-assets/robot.glb'),'');truncateSync(join(root,'public/aura-assets/robot.glb'),5500216);writeFileSync(join(root,'aura.assets.json'),JSON.stringify({assets:[{id:'robot',outputPath:'public/aura-assets/robot.glb',url:'/aura-assets/robot.glb',sizeBytes:5500216,hash:'sha256-'+'a'.repeat(64)}]}));
 const result=enumerateManifestAssets(root,['aura.assets.json']);assert.deepEqual(result.errors,[]);assert.equal(result.files.find(f=>f.path.endsWith('robot.glb')).bytes,5500216);
 const omitted=validateSnapshotAssetInventory(result.files,{schema:'aura3d-snapshot-file-inventory/v1',scope:'cumulative',files:result.files.filter(f=>f.bytes<5000000)});assert.match(omitted.join(),/Snapshot omitted.*robot.glb/);
 assert.deepEqual(validateSnapshotAssetInventory(result.files,{schema:'aura3d-snapshot-file-inventory/v1',scope:'cumulative',files:result.files}),[]);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('a small-only delta cannot be passed off as the cumulative snapshot',()=>assert.match(validateSnapshotAssetInventory([],{schema:'aura3d-snapshot-file-inventory/v1',scope:'delta',files:[]}).join(),/cumulative/));
test('wrong hydrated archive hash fails against manifest hash',()=>assert.match(validateSnapshotAssetInventory([{path:'robot.glb',bytes:5500216,manifestHashes:['a'.repeat(64)]}],{schema:'aura3d-snapshot-file-inventory/v1',scope:'cumulative',files:[{path:'robot.glb',bytes:5500216,sha256:'b'.repeat(64)}]}).join(),/hash differs/));
