import {describe,it,expect} from 'vitest';
import {validateCleanup,type CleanupAcceptance} from '../../../tools/muse3jsparity-readiness/cleanup';
const now=Date.parse('2026-09-05T12:00:00Z');
function fixture(state='terminated'){
 const refs=Object.fromEntries(['inventory','create','observe'].map(path=>[path,{path,sha256:path}]));
 const docs:Record<string,string>={inventory:JSON.stringify({schema:'muse301-cleanup-inventory/v1',task:'muse3jsparity-3.0.1',resources:[{kind:'ec2',id:'i-owned',startedAt:'2026-09-05T10:00:00Z',creationProof:refs.create}]}),create:JSON.stringify({Instances:[{InstanceId:'i-owned',LaunchTime:'2026-09-05T10:00:00Z'}]}),observe:JSON.stringify({Reservations:[{Instances:[{InstanceId:'i-owned',State:{Name:state}}]}]})};
 const acceptance:CleanupAcceptance={schema:'muse301-cleanup/v1',inventory:refs.inventory,observations:[{kind:'ec2',command:['aws','ec2','describe-instances'],exitCode:0,observedAt:'2026-09-05T11:59:00Z',output:refs.observe}]};
 return {refs,docs,acceptance,check:()=>validateCleanup(acceptance,r=>!!r&&r.path in docs,p=>docs[p],now)};
}
describe('owned-resource cleanup',()=>{
 it('requires actual terminated state for exact registered instance',()=>{expect(fixture().check()).toEqual([]);expect(fixture('running').check()).toHaveLength(1);expect(fixture('stopped').check()).toHaveLength(1);});
 it('does not treat an omitted/aged-out instance as terminated',()=>{const f=fixture();f.docs.observe='{"Reservations":[]}';expect(f.check()).toHaveLength(1);});
 it('rejects empty inventory, missing launch proof and failed observation',()=>{const f=fixture();f.docs.inventory=JSON.stringify({schema:'muse301-cleanup-inventory/v1',task:'muse3jsparity-3.0.1',resources:[]});expect(f.check()).toHaveLength(1);const g=fixture();delete g.docs.create;expect(g.check()).toHaveLength(1);const h=fixture();h.acceptance.observations[0].exitCode=1;expect(h.check()).toHaveLength(1);});
 it('requires a recent real process listing and respects PID reuse',()=>{
 const f=fixture();f.docs.inventory=JSON.stringify({schema:'muse301-cleanup-inventory/v1',task:'muse3jsparity-3.0.1',resources:[{kind:'process',id:'123',processStart:'Fri Sep  5 10:00:00 2026',startedAt:'2026-09-05T10:00:00Z',creationProof:f.refs.create}]});
 f.docs.create=JSON.stringify({pid:123,processStart:'Fri Sep  5 10:00:00 2026',startedAt:'2026-09-05T10:00:00Z'});
 f.acceptance.observations=[{kind:'process',command:['ps','-axo','pid=,lstart=,command='],exitCode:0,observedAt:'2026-09-05T11:59:59Z',output:f.refs.observe}];
 f.docs.observe='123 Fri Sep  5 10:00:00 2026 owned-server';expect(f.check()).toHaveLength(1);
 f.docs.observe='123 Fri Sep  5 11:59:30 2026 unrelated-process';expect(f.check()).toEqual([]);
 f.docs.observe='';expect(f.check()).toHaveLength(1);
 f.docs.observe='456 Fri Sep  5 11:59:30 2026 ps';expect(f.check()).toEqual([]);
 f.acceptance.observations[0].observedAt='2026-09-05T11:58:00Z';expect(f.check()).toHaveLength(1);
 });
});

it('rejects unknown resource kinds and unrelated launch receipts',()=>{
 const f=fixture();const inventory=JSON.parse(f.docs.inventory);inventory.resources[0].kind='unknown';f.docs.inventory=JSON.stringify(inventory);expect(f.check()).toHaveLength(1);
 const g=fixture();g.docs.create=JSON.stringify({Instances:[{InstanceId:'i-unrelated',LaunchTime:'2026-09-05T10:00:00Z'}]});expect(g.check()).toHaveLength(1);
});
