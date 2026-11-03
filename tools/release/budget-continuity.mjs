import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import ts from 'typescript';
export const BUDGET_BASELINE='137280b3705e1968a35ddd1c891329e06199597e';
export const BUDGET_SOURCE='tools/bundle-size/index.ts';
// The 3.x lean package was retired. The checked-in 4.x baseline records the
// later public-root target and budget contract from e650a3a2f, including the
// restored PRD-15 caps. Prohibited external-engine exclusions were removed,
// making the contract stricter than that commit rather than an exact snapshot.
// Keep this literal so a staged source job does not need a .git directory.
export const NATIVE_BUDGET_BASELINE='e650a3a2fda8dd4f93e9d9de0e972722c05f1702';
const NATIVE_BASELINE_SOURCE=String.raw`const targets=[
 {id:"core-agent-api",budget:190000,entryPoint:"packages/engine/src/public/index.ts",external:["react"]},
 {id:"compatibility-root-observation",budget:80000,enforced:false,entryPoint:"packages/engine/src/agent-api/index.ts",external:["react"]},
 {id:"react-adapter",budget:15000,entryPoint:"packages/react/src/index.ts",external:["react","@aura3d/engine"]},
 {id:"devtools",budget:20000,stdin:[
   'export * from "./packages/engine/src/devtools/AuraDiagnosticsOverlay";',
   'export * from "./packages/engine/src/devtools/AuraAssetPanel";',
   'export * from "./packages/engine/src/devtools/AuraPerformancePanel";'
 ].join("\n"),external:["react","@aura3d/engine"]},
 {id:"presets-effects",budget:45000,entryPoint:"packages/rendering/src/cinematic/index.ts",external:[]},
 {id:"template-product-viewer",budget:250000,entryPoint:"packages/create-aura3d/templates/product-viewer/src/main.ts",external:["react"]},
 {id:"template-cinematic-scene",budget:400000,entryPoint:"packages/create-aura3d/templates/cinematic-scene/src/main.ts",external:["react"]},
 {id:"template-mini-game",budget:480000,entryPoint:"packages/create-aura3d/templates/mini-game/src/main.ts",external:["react"]}
];`;
export function readBudgetTargets(source){
 const ast=ts.createSourceFile(BUDGET_SOURCE,source,ts.ScriptTarget.Latest,true);let array;
 const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='targets'&&node.initializer&&ts.isArrayLiteralExpression(node.initializer))array=node.initializer;ts.forEachChild(node,visit);};visit(ast);
 if(!array||array.elements.length===0)throw new Error('Missing static bundle budget targets');
 const printer=ts.createPrinter({removeComments:true});
 const result=array.elements.map(node=>{
  if(!ts.isObjectLiteralExpression(node)||node.properties.some(p=>!ts.isPropertyAssignment(p)))throw new Error('Budget target is not statically auditable');
  const props=Object.fromEntries(node.properties.map(p=>[p.name.getText(ast),p.initializer]));
  if(!props.id||!ts.isStringLiteral(props.id)||!props.budget||!ts.isNumericLiteral(props.budget))throw new Error('Budget id/limit must be static');
  const external=props.external;
  if(external&&(!ts.isArrayLiteralExpression(external)||external.elements.some(e=>!ts.isStringLiteral(e))))throw new Error('Budget externals must be static');
  if(props.enforced&&![ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword].includes(props.enforced.kind))throw new Error('Budget enforcement must be static');
  return {id:props.id.text,budget:Number(props.budget.text),enforced:props.enforced?.kind!==ts.SyntaxKind.FalseKeyword,external:external?.elements.map(e=>e.text)??[],entry:printer.printNode(ts.EmitHint.Unspecified,props.entryPoint??props.stdin,ast)};
 });
 if(new Set(result.map(r=>r.id)).size!==result.length)throw new Error('Duplicate bundle target');return result;
}
export function compareBudgetTargets(baseline,current){
 const errors=[];
 for(const prior of baseline){const next=current.find(r=>r.id===prior.id);if(!next){errors.push(`Removed budget target: ${prior.id}`);continue;}
  if(!Number.isFinite(next.budget)||next.budget>prior.budget)errors.push(`Increased bundle budget: ${prior.id}`);
  if(prior.enforced&&!next.enforced)errors.push(`Disabled bundle enforcement: ${prior.id}`);
  if(next.entry!==prior.entry)errors.push(`Changed measured budget entry: ${prior.id}`);
  if(next.external.some(name=>!prior.external.includes(name)))errors.push(`Broadened bundle exclusions: ${prior.id}`);
 }return errors;
}
export function validateBudgetContinuity(root,version=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')).version){
 const match=/^(\d+)\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.exec(version??'');if(!match)throw new Error('Invalid candidate version for bundle budget continuity');
 const native=Number(match[1])>=4,baselineCommit=native?NATIVE_BUDGET_BASELINE:BUDGET_BASELINE;
 const baseline=native?NATIVE_BASELINE_SOURCE:execFileSync('git',['show',`${BUDGET_BASELINE}:${BUDGET_SOURCE}`],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}),current=readFileSync(resolve(root,BUDGET_SOURCE),'utf8');
 const before=readBudgetTargets(baseline),after=readBudgetTargets(current),errors=compareBudgetTargets(before,after);if(errors.length)throw new Error(errors.join('; '));
 const hash=s=>createHash('sha256').update(s).digest('hex');
 return {schema:'muse301-budget-continuity/v1',...(native?{derivedFromCommit:baselineCommit}:{baselineCommit}),baselineEncoding:native?'static-target-contract':'git-source',path:BUDGET_SOURCE,baselineSha256:hash(baseline),currentSha256:hash(current),baselineTargets:before,currentTargets:after};
}
