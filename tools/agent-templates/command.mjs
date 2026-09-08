import { withNpmTransport } from '../release/npm-transport.mjs';
import { spawnSync } from 'node:child_process';
import { openSync,closeSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
export function runTemplateCommand(command,args,cwd,options={}) {
 args=command==='npm'?withNpmTransport(args):args;
 const stage=args.includes('install')?'install':args.some(arg=>arg==='playwright'||/[\\/]@playwright[\\/]test[\\/]cli\.js$/.test(arg))?'browser':'build';
 const timeoutMs=options.timeoutMs??(stage==='install'?180000:stage==='browser'?480000:180000);
 if(!Number.isInteger(timeoutMs)||timeoutMs<=0||timeoutMs>3600000)throw new Error('Invalid template command timeout');
 const directory=resolve(cwd,'tests/reports/lifecycle-commands');mkdirSync(directory,{recursive:true});
 const id=`${Date.now()}-${stage}`,log=resolve(directory,`${id}.log`),metadata=resolve(directory,`${id}.json`);
 const record={stage,command:[command,...args],cwd,startedAt:new Date().toISOString(),timeoutMs,log,status:'running'};
 writeFileSync(metadata,JSON.stringify(record,null,2)+'\n');console.log(`[template ${cwd.split('/').at(-1)}] ${stage} started; log=${log}`);
 const fd=openSync(log,'w');let result;
 try{result=spawnSync(command,args,{cwd,env:process.env,stdio:['ignore',fd,fd],timeout:timeoutMs,killSignal:'SIGKILL',detached:process.platform!=='win32'});}finally{closeSync(fd);}
 if(result.pid&&process.platform!=='win32'){try{process.kill(-result.pid,'SIGKILL');}catch{}}
 const completed={...record,status:result.status===0&&!result.error?'passed':'failed',endedAt:new Date().toISOString(),exitCode:result.status,signal:result.signal,error:result.error?.message};
 writeFileSync(metadata,JSON.stringify(completed,null,2)+'\n');console.log(`[template ${cwd.split('/').at(-1)}] ${stage} ${completed.status}; exit=${result.status}; signal=${result.signal??'none'}`);
 if(completed.status!=='passed'){const tail=readFileSync(log,'utf8').split('\n').slice(-24).join('\n');throw new Error(`${stage} failed: ${result.error?.message??`exit ${result.status}, signal ${result.signal}`}; retained ${metadata}\n${tail}`);}
 return completed;
}
