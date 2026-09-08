import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import ts from 'typescript';
export const BUDGET_BASELINE='137280b3705e1968a35ddd1c891329e06199597e';
export const BUDGET_SOURCE='tools/bundle-size/index.ts';
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
export function validateBudgetContinuity(root){
 const baseline=execFileSync('git',['show',`${BUDGET_BASELINE}:${BUDGET_SOURCE}`],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}),current=readFileSync(resolve(root,BUDGET_SOURCE),'utf8');
 const before=readBudgetTargets(baseline),after=readBudgetTargets(current),errors=compareBudgetTargets(before,after);if(errors.length)throw new Error(errors.join('; '));
 const hash=s=>createHash('sha256').update(s).digest('hex');
 return {schema:'muse301-budget-continuity/v1',baselineCommit:BUDGET_BASELINE,path:BUDGET_SOURCE,baselineSha256:hash(baseline),currentSha256:hash(current),baselineTargets:before,currentTargets:after};
}
