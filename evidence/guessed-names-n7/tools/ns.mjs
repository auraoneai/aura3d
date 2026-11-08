import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const files = [];
for (const r of process.argv.slice(2)) (function walk(d) { for (const e of readdirSync(d)) { const p = join(d, e); const s = statSync(p); if (s.isDirectory()) walk(p); else if (e === "transcript.json") files.push(p); } })(r);
const m = Object.create(null);
const NS = "primitives|material|lights|effects|camera|cameras|sky|environments|interactions|instances|looks|particles|world|game|text3D|prefabs|sceneKits|geometry|post|postPresets|helpers|physics|ui|shadows|atmosphere|renderer|textures|surfaces|lines|points|sprites|tsl|weather|water|terrain";
const imports = Object.create(null);
for (const f of files) {
  const run = f.split("/").slice(-2, -1)[0]; if (!/aura/.test(run)) continue;
  const t = JSON.parse(readFileSync(f, "utf8"));
  for (const msg of (Array.isArray(t) ? t : t.messages ?? [])) if (Array.isArray(msg.content)) for (const c of msg.content) {
    if (c.type !== "tool_use" || !/write_file|edit_file/.test(c.name)) continue;
    const text = c.input.content ?? c.input.new_string ?? ""; if (typeof text !== "string") continue;
    for (const mm of text.matchAll(new RegExp(`(?<![\\w.])(${NS})\\.([a-zA-Z_]\\w*)(?:\\.([a-zA-Z_]\\w*))?\\s*\\(`, "g"))) (m[mm[1] + "." + mm[2] + (mm[3] ? "." + mm[3] : "")] ??= new Set()).add(f);
    for (const mm of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']@aura3d\/engine["']/g)) for (const name of mm[1].split(",").map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]).filter(Boolean)) (imports[name] ??= new Set()).add(f);
  }
}
const rows = Object.entries(m).map(([k, v]) => ({ k, runs: v.size }));
const imp = Object.entries(imports).map(([k, v]) => ({ k, runs: v.size }));
const out = [`import * as A from "@aura3d/engine";`];
rows.forEach((r, i) => { const [a, b, c] = r.k.split("."); out.push(`export type N${i} = "${b}" extends keyof typeof A.${a} ? ${c ? `"${c}" extends keyof (typeof A.${a})["${b}" & keyof typeof A.${a}] ? "yes" : "no"` : `"yes"`} : "no";`); });
imp.forEach((r, i) => out.push(`export type I${i} = "${r.k}" extends keyof typeof A ? "yes" : ("${r.k}" extends keyof A.AuraApp ? "yes" : "maybe-type");`));
writeFileSync("/Users/gurbakshchahal/platforms/aura3d-u-n7-names/.n7tmp/check.ts", out.join("\n"));
writeFileSync("/tmp/n7names/nsrows.json", JSON.stringify({ rows, imp }));
console.log(rows.length, imp.length);
