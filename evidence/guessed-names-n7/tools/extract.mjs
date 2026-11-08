// Usage: git archive the transcript dirs of origin/bench/505-*, origin/lane/503-trial, origin/exp/turn-gap-504 into /tmp dirs, then
// node extract.mjs <dirs...> (writes /tmp/n7names/pairs.json) ; node gen.mjs ; node eval.mjs (type-checks the pairs against the engine).

// Collect (callee, key) pairs from object-literal first/second args and app.<member> accesses in Aura-arm sources.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire("/Users/gurbakshchahal/platforms/aura3d-u-n7-names/package.json");
const ts = require("typescript");
const roots = process.argv.slice(2);
const sources = []; // {run, text}
for (const root of roots) (function walk(d) { for (const e of readdirSync(d)) { const p = join(d, e); const s = statSync(p); if (s.isDirectory()) walk(p); else if (e === "transcript.json") {
  const run = p.split("/").slice(-2, -1)[0]; if (!/aura/.test(run)) continue;
  let t; try { t = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }
  const arr = Array.isArray(t) ? t : (t.messages ?? []);
  for (const m of arr) if (Array.isArray(m.content)) for (const c of m.content) {
    if (c.type === "tool_use" && c.name === "write_file" && /\.(ts|js|tsx)$/.test(c.input?.path ?? "") && typeof c.input.content === "string") sources.push({ run: p, text: c.input.content });
    if (c.type === "tool_use" && c.name === "edit_file" && typeof c.input?.new_string === "string") sources.push({ run: p, text: c.input.new_string });
  }
} } })(root);
const NS = /^(primitives|material|lights|effects|camera|sky|environments|interactions|instances|looks|particles|water|weather|world|game|text3D|prefabs|sceneKits|geometry|post|textures|animation|physics|audio|ui|vfx)$/;
const pairs = new Map(); const members = new Map();
const add = (map, k, run) => { let e = map.get(k); if (!e) map.set(k, e = { occ: 0, runs: new Set() }); e.occ++; e.runs.add(run); };
function calleeName(expr) {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) { const l = calleeName(expr.expression); return l ? `${l}.${expr.name.text}` : undefined; }
  return undefined;
}
for (const { run, text } of sources) {
  const sf = ts.createSourceFile("x.ts", text, ts.ScriptTarget.Latest, true);
  const visit = (n) => {
    if (ts.isCallExpression(n)) {
      const name = calleeName(n.expression);
      if (name) {
        const head = name.split(".")[0];
        const interesting = NS.test(head) || /^(createAuraApp|model|group|scene)$/.test(name) || /\.(setLight|setMaterial|setPose|setTransform|play|setFog|use)$/.test(name);
        if (interesting) n.arguments.forEach((a, i) => { if (ts.isObjectLiteralExpression(a)) for (const p of a.properties) if (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) add(pairs, `${/\.(setLight|setMaterial|setPose|setTransform|play|setFog|use)$/.test(name) && !NS.test(head) ? "handle." + name.split(".").pop() : name}#${i}.${p.name.text}`, run); });
      }
    }
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "app") add(members, `app.${n.name.text}`, run);
    if (ts.isPropertyAccessExpression(n) && ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === "app") add(members, `app.${n.expression.name.text}.${n.name.text}`, run);
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
const dump = (m) => [...m].map(([k, v]) => ({ k, occ: v.occ, runs: v.runs.size })).sort((a, b) => b.runs - a.runs);
writeFileSync("/tmp/n7names/pairs.json", JSON.stringify({ sources: sources.length, pairs: dump(pairs), members: dump(members) }, null, 1));
console.log(sources.length, pairs.size, members.size);
