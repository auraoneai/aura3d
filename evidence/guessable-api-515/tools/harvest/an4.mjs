import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const files = []; (function w(d) { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) w(p); else if (e === "transcript.json") files.push(p); } })("/tmp/a3d515/ev");
const pat = new RegExp(process.argv[2]);
let shown = 0;
for (const f of files) {
  if (!/aura/.test(f)) continue; let t; try { t = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }
  const uses = {}; let lastWrite = "";
  for (const m of t) { if (!Array.isArray(m.content)) continue; for (const c of m.content) {
    if (c.type === "tool_use") { uses[c.id] = c; if (c.name === "write_file" && /main\.ts$/.test(c.input.path || "")) lastWrite = c.input.content || ""; }
    if (c.type === "tool_result" && uses[c.tool_use_id]?.name === "typecheck") {
      const txt = typeof c.content === "string" ? c.content : "";
      const mm = txt.match(new RegExp("src/main.ts\\((\\d+),\\d+\\): error TS" + process.argv[2] + "[^\\n]*"));
      if (mm && shown < +process.argv[3]) { shown++; const line = lastWrite.split("\n")[+mm[1] - 1]; console.log(mm[0].slice(0, 120)); console.log("   >>", (line || "(line not in last write)").slice(0, 200)); }
    } } }
}
