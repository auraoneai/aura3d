import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const files = [];
(function walk(d) { for (const e of readdirSync(d)) { const p = join(d, e); const s = statSync(p); if (s.isDirectory()) walk(p); else if (e === "transcript.json") files.push(p); } })(process.argv[2]);
const empty = {}; const all = {}; let shown = 0;
for (const f of files) {
  if (!/aura/.test(f.split("/").slice(-2,-1)[0])) continue;
  const t = JSON.parse(readFileSync(f, "utf8"));
  const arr = Array.isArray(t) ? t : (t.messages ?? []);
  const uses = {};
  for (const m of arr) {
    if (!Array.isArray(m.content)) continue;
    for (const c of m.content) {
      if (c.type === "tool_use") uses[c.id] = c;
      if (c.type !== "tool_result") continue;
      const u = uses[c.tool_use_id]; if (!u || u.name !== "search") continue;
      const txt = typeof c.content === "string" ? c.content : JSON.stringify(c.content);
      const q = JSON.stringify(u.input.pattern ?? u.input.query ?? u.input);
      if (shown++ < 3) console.log("SAMPLE", JSON.stringify(u.input), txt.slice(0, 300));
      all[q] = (all[q]||0)+1;
      if (/no match|0 match|^\s*$|not found/i.test(txt.slice(0, 200)) || txt.length < 5) empty[q] = (empty[q]||0)+1;
    }
  }
}
console.log("EMPTY");
for (const [k,v] of Object.entries(empty).sort((a,b)=>b[1]-a[1]).slice(0,150)) console.log(v,k);
