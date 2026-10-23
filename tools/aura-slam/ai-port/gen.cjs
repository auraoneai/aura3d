const ts = require('typescript');
const fs = require('fs');
const S = require('./sets.cjs');
const file = '' + process.cwd() + '/apps/showcase-top-tennis/public/toptennis/match-engine.js';
const text = fs.readFileSync(file, 'utf8');
const program = ts.createProgram([file], { allowJs: true, checkJs: false, noResolve: true, target: ts.ScriptTarget.ES2020, noLib: true });
const sf = program.getSourceFile(file); const checker = program.getTypeChecker();
let create, factory;
(function visit(n){ if (ts.isFunctionDeclaration(n) && n.name?.text==='create') create = n; ts.forEachChild(n, visit); })(sf);
// factory = the function expression passed to the UMD call: parent chain of create
factory = create.parent.parent; // Block -> FunctionExpression
const body = create.body;
const COPY = new Set(['SERVE_CPU','SERVE_RETURN','CPU_STYLES','PRO_POSITION']);
const fnDecls = new Map(), varStmts = new Map();
for (const st of body.statements) {
  if (ts.isFunctionDeclaration(st) && st.name) fnDecls.set(st.name.text, st);
  if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) varStmts.set(d.name.text, st);
}
function isPropName(n){const p=n.parent;if(!p)return false;if(ts.isPropertyAccessExpression(p)&&p.name===n)return true;if(ts.isPropertyAssignment(p)&&p.name===n)return true;if(ts.isMethodDeclaration(p)&&p.name===n)return true;if(ts.isBindingElement(p)&&p.propertyName===n)return true;if(ts.isPropertySignature(p)&&p.name===n)return true;return false;}
function topLevelIn(node, container){ let o=node; while(o && o.parent!==container) o=o.parent; return o; }
// top-level file statements by name
const fileLevel = new Map();
for (const st of sf.statements) ts.forEachChild(st, function v(n){}); // noop
// find factory-level declarations (inside factory body, outside create) and top-level consts
const factoryBody = factory.body;
const factoryLevel = new Map();
for (const st of factoryBody.statements) {
  if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) factoryLevel.set(d.name.text, st);
  if (ts.isFunctionDeclaration(st) && st.name) factoryLevel.set(st.name.text, st);
}
const factoryParams = new Set(factory.parameters.map(p => p.name.text));

function gen(names, varNames, label) {
  const owned = [...names, ...varNames];
  const ownedNodes = new Set(owned.map(n => fnDecls.get(n) || varStmts.get(n)));
  const envUsed = new Map(); // name -> kind
  const copyUsed = new Set();
  const pieces = [];
  for (const nm of owned) {
    const st = fnDecls.get(nm) || varStmts.get(nm);
    const start = st.getStart(), end = st.getEnd();
    const reps = []; // {pos,end,text}
    (function walk(n) {
      if (ts.isIdentifier(n) && !isPropName(n)) {
        const sym = checker.getSymbolAtLocation(n);
        const d = sym?.declarations?.[0];
        if (d) {
          // local to this statement?
          let o = d, inside = false; while (o) { if (o === st) { inside = true; break; } o = o.parent; }
          if (!inside) {
            let kind = null, name = n.text;
            const ct = topLevelIn(d, body);
            if (ct && ownedNodes.has(ct)) kind = null; // sibling owned
            else if (ct && ct.parent === body) kind = 'create';
            else if (factoryParams.has(name) && ts.isParameter(d)) kind = 'factory';
            else { const ft = topLevelIn(d, factoryBody); if (ft && ft.parent === factoryBody) kind = COPY.has(name) ? 'copy' : 'factory'; }
            if (kind === 'copy') copyUsed.add(name);
            else if (kind) {
              envUsed.set(name, kind);
              if (ts.isShorthandPropertyAssignment(n.parent) && n.parent.name === n) reps.push({ pos: n.getEnd(), end: n.getEnd(), text: ': env.' + name });
              else reps.push({ pos: n.getStart(), end: n.getEnd(), text: 'env.' + name });
            }
          }
        }
      }
      // param annotations for standalone function-likes
      if ((ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n))) {
        const bare = ts.isArrowFunction(n) && n.parameters.length === 1 && n.parameters[0].getStart() === n.getStart() && ts.isIdentifier(n.parameters[0].name);
        if (bare) { const p0 = n.parameters[0]; reps.push({ pos: p0.getStart(), end: p0.getEnd(), text: '(' + p0.name.text + ': any)' }); }
        else for (const p of n.parameters) if (!p.type && !p.initializer && !p.dotDotDotToken) reps.push({ pos: p.name.getEnd(), end: p.name.getEnd(), text: ': any' });
        if (!bare) for (const p of n.parameters) if (!p.type && p.dotDotDotToken) reps.push({ pos: p.name.getEnd(), end: p.name.getEnd(), text: ': any[]' });
      }
      if (ts.isVariableDeclaration(n) && !n.type && n.initializer && ts.isArrayLiteralExpression(n.initializer) && n.initializer.elements.length === 0 && ts.isIdentifier(n.name)) reps.push({ pos: n.name.getEnd(), end: n.name.getEnd(), text: ': any[]' });
      ts.forEachChild(n, walk);
    })(st);
    reps.sort((a, b) => b.pos - a.pos);
    let t = text.slice(start, end);
    for (const r of reps) t = t.slice(0, r.pos - start) + r.text + t.slice(r.end - start);
    pieces.push({ name: nm, text: t, line: sf.getLineAndCharacterOfPosition(start).line + 1 });
  }
  return { pieces, envUsed, copyUsed };
}
const ai = gen(S.AI, S.AIVARS, 'ai');
const sw = gen(S.SWIPE, [], 'swipe');
fs.writeFileSync(require('os').tmpdir() + '/slam-ai-gen-result.json', JSON.stringify({
  aiEnv: [...ai.envUsed], aiCopy: [...ai.copyUsed], swEnv: [...sw.envUsed], swCopy: [...sw.copyUsed],
  ai: ai.pieces, sw: sw.pieces }, null, 1));
console.log('AI env:', [...ai.envUsed].map(([k, v]) => k + ':' + v).join(' '));
console.log('AI copy:', [...ai.copyUsed].join(' '));
console.log('SW env:', [...sw.envUsed].map(([k, v]) => k + ':' + v).join(' '));
console.log('SW copy:', [...sw.copyUsed].join(' '));
// engine-used (non-owned) usage of COPY tables?
for (const c of COPY) { let used = false; for (const [k, st] of [...fnDecls, ...varStmts]) { if (S.AI.includes(k) || S.AIVARS.includes(k) || S.SWIPE.includes(k)) continue; if (text.slice(st.getStart(), st.getEnd()).includes(c)) { used = true; console.log('copy-table', c, 'also used by', k); } } }
