import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const files = [];
(function walk(d) { for (const e of readdirSync(d)) { const p = join(d, e); const s = statSync(p); if (s.isDirectory()) walk(p); else if (e === "transcript.json") files.push(p); } })("/tmp/a3d515/ev");
const mode = process.argv[2];
const cnt = {}; let shown = 0;
const add = (k) => { cnt[k] = (cnt[k] || 0) + 1; };
for (const f of files) {
  if (!/aura/.test(f)) continue;
  let t; try { t = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }
  const uses = {};
  for (const m of t) {
    if (!Array.isArray(m.content)) continue;
    for (const c of m.content) {
      if (c.type === "tool_use") {
        uses[c.id] = c;
        if (mode === "search" && c.name === "search") add(JSON.stringify(c.input.pattern ?? c.input.query ?? c.input));
        if (mode === "lookup" && c.name === "aura_lookup") add(JSON.stringify(c.input));
      }
      if (c.type === "tool_result" && mode === "tcsample") {
        const u = uses[c.tool_use_id];
        if (u && u.name === "typecheck" && shown < 6) {
          const txt = typeof c.content === "string" ? c.content : JSON.stringify(c.content);
          if (!/^(ok|OK)/.test(txt) && txt.length > 40) { console.log(txt.slice(0, 700)); console.log("-----"); shown++; }
        }
      }
    }
  }
}
if (mode !== "tcsample") for (const [k, v] of Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, +process.argv[3] || 80)) console.log(v, k);
