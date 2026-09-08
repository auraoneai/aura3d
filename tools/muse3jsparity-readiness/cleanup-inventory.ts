import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import type {CleanupInventory} from './cleanup';
const root=process.cwd();
const args=process.argv.slice(2);const option=(name:string)=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const directories=(option('--records')??'').split(',').filter(Boolean).map(path=>resolve(path));
if(!directories.length)throw new Error('--records requires the complete task launch-record directories');
const output=resolve(root,option('--out')??'tests/reports/muse3jsparity/cleanup/inventory.json');
if(existsSync(output))throw new Error('Inventory output already exists; select a fresh run path');
const files:string[]=[];
const visit=(path:string)=>{for(const entry of readdirSync(path,{withFileTypes:true})){const file=resolve(path,entry.name);if(entry.isDirectory())visit(file);else if(entry.isFile()&&file.endsWith('.json')&&statSync(file).size<4*1024*1024)files.push(file);}};
for(const path of directories)visit(path);
const resources:CleanupInventory['resources']=[];const artifacts:{path:string;sha256:string}[]=[];
for(const file of files.sort()){
 let data:any;const bytes=readFileSync(file);try{data=JSON.parse(bytes.toString('utf8'));}catch{continue;}
 const candidates:Array<{kind:'ec2'|'process'|'github-actions';id:string;startedAt:string;processStart?:string}>=[];
 for(const instance of data.Instances??[])if(instance.InstanceId&&instance.LaunchTime)candidates.push({kind:'ec2',id:instance.InstanceId,startedAt:instance.LaunchTime});
 if(data.databaseId&&data.createdAt)candidates.push({kind:'github-actions',id:String(data.databaseId),startedAt:data.createdAt});
 if(data.schema==='muse301-owned-process/v1'&&data.pid&&data.startedAt&&data.processStart)candidates.push({kind:'process',id:String(data.pid),startedAt:data.startedAt,processStart:data.processStart});
 if(!candidates.length)continue;
 const sha256=createHash('sha256').update(bytes).digest('hex'),destination=resolve(dirname(output),'creation',`${sha256}.json`);
 mkdirSync(dirname(destination),{recursive:true});if(!existsSync(destination))writeFileSync(destination,bytes,{flag:'wx'});
 const proof={path:relative(root,destination),sha256};artifacts.push(proof);
 for(const candidate of candidates){const prior=resources.find(r=>r.kind===candidate.kind&&r.id===candidate.id);if(prior&&Date.parse(prior.startedAt)!==Date.parse(candidate.startedAt))throw new Error(`Conflicting launch identities: ${candidate.id}`);if(!prior)resources.push({...candidate,creationProof:proof});}
}
const expected=(option('--expect')??'').split(',').filter(Boolean);
for(const id of expected)if(!resources.some(r=>r.id===id))throw new Error(`Missing expected task launch record: ${id}`);
if(!resources.length)throw new Error('No actual task launch records found');
const inventory:CleanupInventory={schema:'muse301-cleanup-inventory/v1',task:'muse3jsparity-3.0.1',resources};
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify({...inventory,recordDirectories:directories,scannedJsonFiles:files.length,artifacts},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output:relative(root,output),resources:resources.map(r=>`${r.kind}:${r.id}`),scannedJsonFiles:files.length}));
