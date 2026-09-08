import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {hostname} from 'node:os';
import {sourceIdentity} from '../release/source-identity.mjs';
// Observation only: does not publish, alias, deploy, or edit marketing source.
const [inputPath,outPath]=process.argv.slice(2);
if(!inputPath||!outPath)throw Error('Usage: marketing-origin-producer.mjs <build-acceptance-input.json> <tests/reports/origin-run>');
const root=process.cwd(),out=relative(root,resolve(root,outPath));
if(!out.startsWith('tests/reports/')||out.includes('..'))throw Error('Use task-scoped tests/reports output');
const input=JSON.parse(readFileSync(resolve(root,inputPath),'utf8')),source=sourceIdentity(root);
if(Object.keys(source).some(k=>source[k]!==input.source?.[k]))throw Error('Origin observation source differs from build');
const hash=b=>createHash('sha256').update(b).digest('hex');
const save=(path,bytes)=>{writeFileSync(resolve(root,path),bytes,{flag:'wx'});return {path,sha256:hash(bytes)};};
const json=(path,data)=>save(path,Buffer.from(JSON.stringify(data,null,2)+'\n'));
mkdirSync(resolve(root,out),{recursive:true});
const startedAt=new Date().toISOString(),pages=[],artifacts=[],events=[];let failed=false;
for(const built of input.outputFiles.filter(a=>a.path.endsWith('.html')||a.path===input.sitemap.path)){
 const builtBytes=readFileSync(resolve(root,built.path));if(hash(builtBytes)!==built.sha256)throw Error('Build output changed before origin observation');
 const pathname=built.path.slice('marketing/dist'.length),url='https://aura3d.auraone.ai'+pathname;
 try{
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000),headers:{'cache-control':'no-cache'}});
  const content=save(`${out}/body-${pages.length}.bin`,Buffer.from(await response.arrayBuffer()));artifacts.push(content);
  pages.push({url,status:response.status,content,built});events.push({url,status:response.status,observedAt:new Date().toISOString(),headers:Object.fromEntries(response.headers)});
  if(response.status!==200||content.sha256!==built.sha256)failed=true;
 }catch(error){events.push({url,error:String(error),observedAt:new Date().toISOString()});failed=true;}
}
const endedAt=new Date().toISOString();
const finalSource=sourceIdentity(root);if(Object.keys(source).some(k=>source[k]!==finalSource[k]))failed=true;
artifacts.push(json(`${out}/responses.json`,events));artifacts.push(save(`${out}/origin.log`,Buffer.from(events.map(x=>JSON.stringify(x)).join('\n')+'\n')));
const receipt=json(`${out}/receipt.json`,{schema:'muse3jsparity-producer/v1',runId:randomUUID(),gate:'marketing-origin-command',tasks:[],command:['node','tools/muse3jsparity-readiness/marketing-origin-producer.mjs',inputPath,outPath],cwd:root,exitCode:failed?1:0,startedAt,endedAt,source,claimSurface:'release tooling',environment:{browser:'HTTP fetch',backend:'production origin',hardware:hostname()},artifacts,packages:[],tarballs:[]});
json(`${out}/deployment.json`,{origin:'https://aura3d.auraone.ai',source,receipt,pages});
console.log(JSON.stringify({pages:pages.length,failed,receipt}));if(failed)process.exitCode=1;
