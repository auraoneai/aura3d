import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Always controlled, including when unchanged since the audit baseline. */
export const CONTROLLED_CLAIM_DOCUMENTS = [
 'README.md','CHANGELOG.md','llms.txt','public/llms.txt',
 'docs/agents/claims-and-boundaries.md','docs/project/aura3d-300-release-notes.md',
 'docs/project/aura3d-301-release-notes.md','docs/project/release/release-checklist.md',
 'docs/project/status/current-state.md','docs/project/status/known-limits.md',
 'marketing/index.html','marketing/docs/index.html',
] as const;
const PREVIOUS_RELEASE = 'c71aff6e9a82948d5474c424e79182a37fe428c2';

/** Formatting is not a claim. Descriptive headings and code still require review. */
export function isStructuralDocumentLine(line:string):boolean {
 const s=line.trim();
 return !s || /^(`{3,}|~{3,})[\w-]*$/.test(s) || /^\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(s)
  || /^(?:---+|\*\*\*+|___+)$/.test(s)
  || /^#{1,6}\s+(?:Overview|Contents|Installation|Usage|Examples|References|Notes|Limitations|Evidence|History|Requirements|Verification|Release checklist)$/i.test(s)
  || /^<\/(?:div|section|main|article|nav|header|footer|ul|ol|li|p|span|body|html)>$/.test(s);
}
/**
 * Document-aware structural classification.
 *
 * `isStructuralDocumentLine` is stateless, so it cannot recognise the interior of a
 * fenced example. A line like `const app = await createAuraApp();` is illustrative
 * code, not a release claim, and `pnpm check:docs-codeblocks` already compiles every
 * fenced block against the real public surface. Markup and labels are likewise not
 * claims on their own: an opening tag carries no assertion, a heading names the
 * section whose prose beneath it still requires a receipt-bound row, and a bare link
 * is navigation. Prose, tables and list items are deliberately NOT covered here, so
 * every sentence that states a product fact still needs an explicit claim row.
 */
export function structuralDocumentLineNumbers(text:string):Set<number> {
 const structural=new Set<number>();
 let fence:string|null=null;
 text.split('\n').forEach((line,index)=>{
  const s=line.trim();
  const number=index+1;
  const delimiter=/^(`{3,}|~{3,})/.exec(s)?.[1];
  if(fence){structural.add(number);if(delimiter&&s.startsWith(fence))fence=null;return;}
  if(delimiter){structural.add(number);fence=delimiter;return;}
  if(!s)return;
  if(isStructuralDocumentLine(line)){structural.add(number);return;}
  // A line that is exactly one markup tag asserts nothing.
  if(/^<[^>]+>$/.test(s)){structural.add(number);return;}
  // A heading is a label; the claim lives in the prose beneath it.
  if(/^#{1,6}\s+\S/.test(s)){structural.add(number);return;}
  // A bare link or image reference is navigation, not a behavioural claim.
  if(/^[-*]?\s*!?\[[^\]]*\]\([^)]*\)[.,]?$/.test(s)){structural.add(number);return;}
 });
 return structural;
}
/**
 * A line that provably carries no claim.
 *
 * The claim contract demands an exact receipt-bound value comparison for every
 * claim row. That is the correct bar for a sentence asserting a product fact, but
 * a purely descriptive sentence states no measurable value, so pointing it at a
 * measurement would invent an evidence relationship rather than prove one.
 *
 * This predicate is therefore a NEGATIVE test, not a classifier of intent: it
 * returns true only when the line contains no digit, no claim verb, no
 * comparative or measurement word, and no capability noun. Anything that could
 * be read as an assertion falls through and still requires a bound claim row, so
 * a real claim cannot become exempt by being phrased as prose.
 */
const CLAIM_BEARING = [
 /\d/,
 /\b(?:support|provide|enable|deliver|guarantee|ensure|prove|proven|pass|passes|passed|verified|validate[sd]?|certif\w*|achiev\w*|meet[s]?|exceed\w*|comply|compliant|complete[sd]?|implement\w*|ship[sp]?\w*|available|production[- ]ready|stable|parity|equivalent|identical|matches?)\b/i,
 /\b(?:faster|slower|improv\w*|reduc\w*|increas\w*|lower|higher|better|worse|best|fastest|regress\w*|win|loss|gain|budget|threshold|measured|benchmark\w*)\b/i,
 /\b(?:all|every|none|no|zero|any|always|never|only|fully|entirely|guaranteed)\b/i,
 // A finite verb asserts something about the product. A wrapped continuation
 // fragment that still carries one belongs to a sentence that asserts, so it
 // stays a claim rather than being exempted as description.
 /\b(?:is|are|was|were|be|been|being|has|have|had|can|cannot|will|wo|would|does|do|did|must|should|may|might|uses?|used|runs?|ran|works?|handles?|renders?|loads?|owns?|requires?|remains?|stays?|treats?|reads?|writes?|emits?|binds?|blocks?|allows?|prevents?|adds?|removes?|replaces?|keeps?|makes?|takes?|gives?|shows?|reports?|records?|carries|carry|covers?|names?|holds?|fails?|stops?)\b/i,
] as const;
export function isDescriptiveDocumentLine(line:string):boolean {
 const s=line.trim();
 if(!s)return false;
 return !CLAIM_BEARING.some(pattern=>pattern.test(s));
}
function historyTail(text:string):string|null {
 const match=/^## 2\.0\.4\b.*$/m.exec(text);
 return match ? text.slice(match.index) : null;
}
export function checkDocumentInvariants(read:(path:string)=>string, historicalRead:(path:string)=>string):string[] {
 const errors:string[]=[];
 const get=(path:string)=>{try{return read(path);}catch{errors.push(`missing controlled document:${path}`);return '';}};
 const documents=new Map(CONTROLLED_CLAIM_DOCUMENTS.map(path=>[path,get(path)]));
 if(documents.get('llms.txt')!==documents.get('public/llms.txt'))errors.push('llms mirror differs byte-for-byte');
 const changelog=documents.get('CHANGELOG.md')!;
 try {
  const before=historyTail(historicalRead('CHANGELOG.md')),after=historyTail(changelog);
  if(!before||!after||before!==after)errors.push('CHANGELOG 2.0.4 and older history changed');
 }catch{errors.push('previous release CHANGELOG unavailable');}
 if(!/^## 3\.0\.0\b/m.test(changelog)||!/^## 3\.0\.1\b/m.test(changelog))errors.push('missing preserved 3.0.0 or current 3.0.1 CHANGELOG entry');
 const candidate=/^## 3\.0\.1[^\n]*(?:unreleased|candidate)/im.test(changelog);
 const publishedVersion=candidate?'3.0.0':'3.0.1';
 const readme=documents.get('README.md')!;
 if(!/^#{1,3} .*3\.0\.1/m.test(readme))errors.push('README lacks current 3.0.1 release section');
 if(!/^#{1,6} .*2\.0\.4.*history/im.test(readme))errors.push('README lost explicit 2.0.4 history section');
 if(!/3\.0\.1/.test(documents.get('llms.txt')!))errors.push('llms source version is not 3.0.1');
 for(const [label,pattern] of [['effects nodes',/effects/],['camera rigs',/camera.*rig|rig.*camera/i],['game feel',/game.?feel/i],['SDF text',/SDF|sdf/],['decal',/decal/i],['rigid bodies',/rigid.?bod/i]] as const)if(!pattern.test(documents.get('llms.txt')!))errors.push(`llms missing scoped API topic:${label}`);
 const checklist=documents.get('docs/project/release/release-checklist.md')!;
 if(!/^Version: 3\.0\.1$/m.test(checklist))errors.push('release checklist targets wrong version');
 if(!checklist.includes('aura3d-301-release-notes.md'))errors.push('release checklist lacks current notes reference');
 // A retained old check cannot become current evidence merely by changing a stamp.
 if(/^\s*- \[[xX]\]/m.test(checklist)&&/retained checks.*previous 3\.0\.0/i.test(checklist))errors.push('release checklist carries checked previous-release conditions');
 for(const path of ['marketing/index.html','marketing/docs/index.html'] as const){
  const html=documents.get(path)!;
  if(candidate&&!/3\.0\.1[\s\S]{0,120}(?:candidate|verification pending)/i.test(html))errors.push(`candidate status missing:${path}`);
  if(candidate&&/3\.0\.1(?:\s|<[^>]+>)*(?:live|published)/i.test(html))errors.push(`candidate falsely claimed published:${path}`);
  if(!html.includes(`/releases/tag/v${publishedVersion}`))errors.push(`current release link missing:${path}`);
  const pins=[...html.matchAll(/(?:@aura3d\/[\w-]+|create-aura3d)@(\d+\.\d+\.\d+)/g)];
  // Historical sections are retained but installation examples outside them must be current.
  const current=html.replace(/<section\b[^>]*id=["']release-204["'][\s\S]*?<\/section>/gi,'');
  if(pins.length&&!new RegExp(`(?:@aura3d/[\\w-]+|create-aura3d)@${publishedVersion.replaceAll('.', '\\.')}`).test(current))errors.push(`current install pin missing:${path}`);
  if([...current.matchAll(/(?:@aura3d\/[\w-]+|create-aura3d)@(\d+\.\d+\.\d+)/g)].some(match=>match[1]!==publishedVersion))errors.push(`stale live install pin:${path}`);
  if(/"softwareVersion"\s*:/.test(html)&&!new RegExp(`"softwareVersion"\\s*:\\s*"${publishedVersion.replaceAll('.', '\\.') }"`).test(html))errors.push(`stale softwareVersion:${path}`);
 }
 if(!/<section\b[^>]*id=["']release-204["'][\s\S]*?history/i.test(documents.get('marketing/index.html')!))errors.push('marketing lost 2.0.4 history section');
 return errors;
}
export function validateDocumentInvariants(root:string){
 return {schema:'muse301-document-invariants/v1',historicalCommit:PREVIOUS_RELEASE,errors:checkDocumentInvariants(
  path=>readFileSync(resolve(root,path),'utf8'),
  path=>execFileSync('git',['show',`${PREVIOUS_RELEASE}:${path}`],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024}),
 )};
}
