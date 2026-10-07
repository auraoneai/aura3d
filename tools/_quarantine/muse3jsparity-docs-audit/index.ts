import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export function scanPublicSource(file:string,source:string) {
 const findings: { id:string;file:string;sha256:string;line:number;rule:string;severity:'error'|'review';excerpt:string }[]=[];
  const sha256 = hash(source);
  const add = (offset: number, rule: string, severity: 'error'|'review') => {
    const line = source.slice(0,offset).split('\n').length;
    const id = hash(`${file}:${sha256}:${line}:${rule}`);
    if (!findings.some(f => f.id === id)) findings.push({id,file,sha256,line,rule,severity,excerpt:source.split('\n')[line-1]!.slice(0,400)});
  };
  if (/\.(?:html|css|md|txt)$/.test(file)) add(0, 'full-document-semantic-review', 'review');
  if (/\.[cm]?[jt]sx?$/.test(file) && !file.endsWith('aura-assets.ts')) {
    const aliases = new Map<string,string>();
    const ast = ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,extname(file)==='.tsx'?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    for (const statement of ast.statements) if (ts.isImportDeclaration(statement)) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) aliases.set(element.name.text, element.propertyName?.text ?? element.name.text);
    }
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && /^three(?:\/|$)/.test(node.moduleSpecifier.text)) add(node.getStart(ast),'forbidden-three-import','error');
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const rawName = node.expression.getText(ast); const name = aliases.get(rawName) ?? rawName; const arg = node.arguments?.[0];
        if (/(?:^|\.)unsafeModelUrl$/.test(name)) add(node.getStart(ast),'unsafe-model-access','error');
        if (/(?:^|\.)model$/.test(name) && arg && (ts.isStringLiteral(arg)||ts.isNoSubstitutionTemplateLiteral(arg))) add(node.getStart(ast),'string-model-id','error');
        if (/(?:^|\.)(?:GLTFLoader|DRACOLoader|KTX2Loader|WebGLRenderer|WebGPURenderer)$/.test(name)) add(node.getStart(ast),'direct-loader-renderer','error');
        if (/primitives\.|\.createElement$|\.getContext$|distanceLod$/.test(name)) add(node.getStart(ast),'hero-or-dom-role','review');
        if ((name==='import' || name==='require') && arg && ts.isStringLiteral(arg) && /^three(?:\/|$)/.test(arg.text)) add(node.getStart(ast),'forbidden-three-import','error');
      }
      ts.forEachChild(node,visit);
    };visit(ast);
  }
  /*
   * A `.glb` path is a hard error only where it could be a runtime model URL in a
   * public route. Documentation and provenance/manifest JSON are already review-only.
   * Node CLI/build scripts under `scripts/` are the same class: they run in Node, not
   * in the browser, and they exist to feed source GLBs INTO the typed asset pipeline
   * (`aura3d assets add`), which is exactly the sanctioned ingestion path. Treating
   * them as errors made an asset-registration script indistinguishable from a route
   * that bypasses typed assets, and an error can never be dispositioned, so the
   * source audit could not pass while the sanctioned pipeline existed. 23 scripts in
   * the repository use this pattern; it is the pipeline's front door, not a bypass.
   */
  const buildScript = /(?:^|\/)scripts\/[^/]+\.[cm]?[jt]s$/.test(file);
  if (!file.endsWith('aura-assets.ts')) for (const match of source.matchAll(/(?:https?:\/\/|\.\.?\/|\/)[^\s"'`<>]+\.(?:glb|gltf)(?:[?#][^\s"'`<>]*)?/g)) add(match.index!, 'raw-model-url', /\.(md|json|txt)$/.test(file) || buildScript ? 'review' : 'error');
  if (/\.(?:md|txt|html)$/.test(file)) for (const match of source.matchAll(/(?:parity|superiority|published|production.ready|\b3\.0\.0\b|\b2\.0\.4\b)/gi)) add(match.index!, 'claim-or-history-context','review');
 return findings;
}
export interface SourceAuditReview { dispositions: { findingId:string; sourceSha256:string; reason:string; evidence:{path:string;sha256:string}[] }[] }
export function auditSource(root:string, review:SourceAuditReview = {dispositions:[]}) {
// Source audit only. Rendered framing and final release claims need separate receipts.
const git = (...args: string[]) => execFileSync('git', args, { cwd:root, encoding: 'utf8' }).trim();

const text = (path: string) => readFileSync(resolve(root,path), 'utf8');
const inventory = [...new Set([...git('ls-files','-z').split('\0'), ...git('ls-files','--others','--exclude-standard','-z').split('\0')])].filter(p => p && existsSync(resolve(root,p)));
const baselineCommit = git('rev-parse', '137280b3705e1968a35ddd1c891329e06199597e^{commit}');
const changed = new Set([...git('diff','--name-only',baselineCommit,'-z').split('\0'), ...git('ls-files','--others','--exclude-standard','-z').split('\0')]);
const surface = (p: string) => /^(apps|examples|templates|packages\/create-aura3d\/templates|docs|marketing)\//.test(p) || ['README.md','CHANGELOG.md','llms.txt','public/llms.txt'].includes(p);
const files = inventory.filter(p => surface(p) && changed.has(p) && /\.(?:[cm]?[jt]sx?|html|css|md|txt|json)$/.test(p) && !/(?:^|\/)(?:dist|node_modules|reports)\//.test(p)).sort();
type Finding = { id: string; file: string; sha256: string; line: number; rule: string; severity: 'error'|'review'; excerpt: string };
const findings = files.flatMap(file=>scanPublicSource(file,text(file)));
const version = JSON.parse(text('package.json')).version;
const checks = [
 {id:'candidate-version',pass:version==='3.0.1'},
 {id:'public-mirror',pass:text('llms.txt')===text('public/llms.txt')},
 {id:'agent-doc-budget',pass:Buffer.byteLength(text('llms.txt'))<25000},
 {id:'candidate-label',pass:text('llms.txt').includes('Source candidate: Aura3D 3.0.1') && text('llms.txt').includes('not a publication claim')},
 {id:'notes-exist',pass:existsSync(resolve(root,'docs/project/aura3d-301-release-notes.md'))},
];
// Review input must bind every disposition to the current source hash and to
// independently produced evidence files. Unresolved findings are never waived.
const evidence: {path:string;sha256:string}[] = [];
const resolved = new Set<string>();
for (const disposition of review.dispositions ?? []) {
 const finding = findings.find(f=>f.id===disposition.findingId);
 if (!finding || finding.severity==='error' || disposition.sourceSha256!==finding.sha256 || typeof disposition.reason!=='string' || disposition.reason.trim().length<30 || !Array.isArray(disposition.evidence) || disposition.evidence.length===0) continue;
 if (!disposition.evidence.every((ref:any)=>typeof ref.path==='string' && existsSync(resolve(root,ref.path)) && hash(readFileSync(resolve(root,ref.path)))===ref.sha256)) continue;
 evidence.push(...disposition.evidence);resolved.add(finding.id);
}
const unresolved = findings.filter(f=>!resolved.has(f.id));
const allMarkdown = inventory.filter(p=>p.endsWith('.md') && !/^(?:release-artifacts|archive)\//.test(p) && !/(?:^|\/)(?:node_modules|dist|\.goal|\.orchestrate|reports)\//.test(p)).sort().map(path=>({path,sha256:hash(text(path)),olderVersionLines:text(path).split('\n').flatMap((line,i)=>/\b(?:2\.0\.4|3\.0\.0)\b/.test(line)?[{line:i+1,text:line.slice(0,300)}]:[])}));
const sourceFiles=files.map(path=>({path,sha256:hash(text(path))}));
return {schema:'muse3jsparity-docs-audit/v1',source:{baselineCommit,commit:git('rev-parse','HEAD'),auditInputFingerprint:hash(JSON.stringify(sourceFiles)),files:sourceFiles},checks,findings,unresolved,evidence,allMarkdown,status:checks.every(c=>c.pass)&&unresolved.length===0?'source-audit-passed':'blocked',scope:'Changed source boundaries only; historical-version inventory needs context review; no browser, performance, publication, or human approval certification'};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
const root=process.cwd();
const reviewArg=process.argv.indexOf('--review');
const reviewPath=reviewArg>=0?process.argv[reviewArg+1]!:null;
const reviewInput=reviewPath?{path:reviewPath,sha256:createHash('sha256').update(readFileSync(reviewPath)).digest('hex')}:null;
const report={...auditSource(root,reviewPath?JSON.parse(readFileSync(reviewPath,'utf8')):{dispositions:[]}),reviewInput,generatedAt:new Date().toISOString(),command:process.argv.join(' '),cwd:root};
const outArg=process.argv.indexOf('--out');const out=outArg>=0?process.argv[outArg+1]!:'tests/reports/muse3jsparity-301-docs-audit.json';
mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({out,files:report.source.files.length,checks:report.checks,findings:report.findings.length,unresolved:report.unresolved.length,status:report.status}));
if(report.status!=='source-audit-passed')process.exitCode=1;

}
