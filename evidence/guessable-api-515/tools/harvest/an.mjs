import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const files = [];
(function walk(d) { for (const e of readdirSync(d)) { const p = join(d, e); const s = statSync(p); if (s.isDirectory()) walk(p); else if (e === "transcript.json") files.push(p); } })("/tmp/a3d515/ev");
const toolNames = {}; const arms = {};
const tsErr = {}; const tsMsgs = {}; const props = {};
let runs = 0, aura = 0;
for (const f of files) {
  let t; try { t = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }
  runs++;
  const isAura = /aura/.test(f);
  if (isAura) aura++;
  const uses = {};
  for (const m of t) {
    if (!Array.isArray(m.content)) continue;
    for (const c of m.content) {
      if (c.type === "tool_use") { toolNames[c.name] = (toolNames[c.name] || 0) + 1; uses[c.id] = c; }
      if (c.type === "tool_result") {
        const u = uses[c.tool_use_id];
        const txt = typeof c.content === "string" ? c.content : JSON.stringify(c.content);
        if (!isAura) continue;
        for (const mm of txt.matchAll(/error TS(\d+): ([^\n]{0,300})/g)) {
          const k = mm[1] + " " + mm[2].replace(/'[^']*'/g, (s) => s).slice(0, 200);
          tsMsgs[k] = (tsMsgs[k] || 0) + 1;
        }
      }
    }
  }
}
console.log({ runs, aura }, toolNames);
const top = Object.entries(tsMsgs).sort((a, b) => b[1] - a[1]).slice(0, 120);
for (const [k, v] of top) console.log(v, k);
