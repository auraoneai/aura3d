import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const files = [];
(function walk(d) { for (const e of readdirSync(d)) { const p = join(d, e); const s = statSync(p); if (s.isDirectory()) walk(p); else if (e === "transcript.json") files.push(p); } })(process.argv[2]);
const msgs = {}; const runsBy = {}; const tools = {};
let aura = 0;
for (const f of files) {
  if (!/aura/.test(f.split("/").slice(-2,-1)[0])) continue;
  let t; try { t = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }
  aura++;
  const arr = Array.isArray(t) ? t : (t.messages ?? t.transcript ?? []);
  for (const m of arr) {
    if (!Array.isArray(m.content)) continue;
    for (const c of m.content) {
      if (c.type === "tool_use") tools[c.name] = (tools[c.name]||0)+1;
      if (c.type !== "tool_result") continue;
      const txt = typeof c.content === "string" ? c.content : JSON.stringify(c.content);
      for (const mm of txt.matchAll(/error TS(\d+): ((?:[^\n\\]|\\[^n])*)/g)) {
        if (!/^(2339|2353|2305|2724|2551|2561|2554|2345|2322|2304|2614|2694|2769|2741)$/.test(mm[1])) continue;
        let k = mm[1] + " " + mm[2].slice(0, 220);
        msgs[k] = (msgs[k]||0)+1; (runsBy[k] ??= new Set()).add(f);
      }
    }
  }
}
console.log({ aura, tools });
for (const [k, v] of Object.entries(msgs).sort((a,b)=>runsBy[b[0]].size-runsBy[a[0]].size).slice(0, +process.argv[3]||150)) console.log(v, runsBy[k].size, k);
