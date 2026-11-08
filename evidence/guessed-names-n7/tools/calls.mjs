// Count method-call names (x.name( / x.name?.( ) and string literal values in Aura-arm write_file/edit_file sources, by runs.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const files = [];
for (const r of process.argv.slice(2)) (function walk(d) { for (const e of readdirSync(d)) { const p = join(d, e); const s = statSync(p); if (s.isDirectory()) walk(p); else if (e === "transcript.json") files.push(p); } })(r);
const calls = Object.create(null), strs = Object.create(null);
const add = (m, k, f) => (m[k] ??= new Set()).add(f);
for (const f of files) {
  const run = f.split("/").slice(-2, -1)[0]; if (!/aura/.test(run)) continue;
  const t = JSON.parse(readFileSync(f, "utf8"));
  for (const m of (Array.isArray(t) ? t : t.messages ?? [])) if (Array.isArray(m.content)) for (const c of m.content) {
    if (c.type !== "tool_use" || !/write_file|edit_file/.test(c.name)) continue;
    const text = c.input.content ?? c.input.new_string ?? ""; if (typeof text !== "string") continue;
    for (const mm of text.matchAll(/\.([a-zA-Z_]\w*)(\?\.)?\(/g)) add(calls, mm[1] + (mm[2] ? "?." : ""), f);
    for (const mm of text.matchAll(/(toneMapping|mode|side|blending|kind|type|preset)\s*:\s*["']([^"']+)["']/g)) add(strs, mm[1] + "=" + mm[2], f);
  }
}
const want = new RegExp(process.env.WANT ?? ".");
console.log("CALLS"); for (const [k, v] of Object.entries(calls).filter(([k]) => want.test(k)).sort((a, b) => b[1].size - a[1].size).slice(0, 120)) console.log(v.size, k);
console.log("STRS"); for (const [k, v] of Object.entries(strs).filter(([k]) => /toneMapping|side|blending|mode=/.test(k)).sort((a, b) => b[1].size - a[1].size).slice(0, 60)) console.log(v.size, k);
