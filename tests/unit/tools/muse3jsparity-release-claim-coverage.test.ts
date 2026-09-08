import {describe,it,expect} from 'vitest';
import {validateReleaseClaimCoverage} from '../../../tools/muse3jsparity-docs-audit/release-claim-coverage';
import type {FinalClaim} from '../../../tools/muse3jsparity-docs-audit/claims';
const files=['CHANGELOG.md','README.md','docs/project/aura3d-301-release-notes.md'];
const claims=files.flatMap(file=>['Measured win: 12 ms','Measured loss: 12 ms'].map((text,i):FinalClaim=>({file,line:i+1,text,sourceSha256:'hash',kind:'performance',surface:'rendering package',requirements:['A1.task.1'],receipts:[{path:'receipt.json',sha256:'hash',gate:'r01',requirements:['A1.task.1']}],assertions:[{receipt:'receipt.json',artifact:'measurement.json',pointer:'/ms',equals:12}]})));
const read=()=> 'receipt.json three@0.185.1 MIGRATION explicit non-goals';
describe('release measured-claim coverage',()=>{
 it('requires explicit source-backed wins and losses in each current release surface',()=>expect(validateReleaseClaimCoverage(claims,read)).toEqual([]));
 it('rejects promising later measurement instead of reporting outcomes',()=>expect(validateReleaseClaimCoverage([],read)).toHaveLength(6));
 it('rejects an asserted number absent from prose and absent receipt citations',()=>{const changed=structuredClone(claims);changed[0]!.assertions[0]!.equals=13;expect(validateReleaseClaimCoverage(changed,()=> 'three@0.185.1 MIGRATION non-goals')).toEqual(expect.arrayContaining(['measured claim lacks exact stated value:CHANGELOG.md:1','measured claim receipt path absent from document:CHANGELOG.md:1']));});
});
