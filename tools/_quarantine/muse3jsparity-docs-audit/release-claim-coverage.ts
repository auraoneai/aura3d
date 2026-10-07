import type { FinalClaim } from './claims';
/** The notes must disclose measured outcomes, not merely promise later evidence. */
export function validateReleaseClaimCoverage(claims:readonly FinalClaim[],read:(path:string)=>string):string[]{
 const errors:string[]=[];
 for(const file of ['CHANGELOG.md','README.md','docs/project/aura3d-301-release-notes.md']){
  const text=read(file);
  const rows=claims.filter(c=>c.file===file&&c.kind==='performance');
  if(!rows.some(c=>/\b(?:win|faster|improv|reduc|lower|less)/i.test(c.text)))errors.push(`missing measured win:${file}`);
  if(!rows.some(c=>/\b(?:loss|slower|regress|higher|larger|worse)/i.test(c.text)))errors.push(`missing measured loss:${file}`);
  for(const row of rows){
   if(!row.assertions.some(a=>typeof a.equals==='number'&&Number.isFinite(a.equals)&&row.text.includes(String(a.equals))))errors.push(`measured claim lacks exact stated value:${file}:${row.line}`);
   if(!row.receipts.length||row.receipts.some(r=>!text.includes(r.path)))errors.push(`measured claim receipt path absent from document:${file}:${row.line}`);
  }
 }
 const readme=read('README.md');
 if(!/(?:three@0\.185\.1|three\.js[^\n]*r185)/i.test(readme)||!/MIGRATION|upgrade/i.test(readme))errors.push('README missing locked comparison or upgrade reference');
 for(const file of ['docs/project/aura3d-300-release-notes.md','docs/project/aura3d-301-release-notes.md']){
  const text=read(file);if(!/non.claim|not claim|does not establish|not claimed|non.goals/i.test(text))errors.push(`release notes lack explicit non-claims:${file}`);
 }
 return errors;
}
