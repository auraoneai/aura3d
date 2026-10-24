// Dead relative-link checker for tracked markdown. Run from the repo root: node docs/audit/scripts/links.mjs
import fs from "node:fs";
import { execSync } from "node:child_process";
const files = execSync("git ls-files '*.md'", { encoding: "utf8" }).trim().split("\n")
  .filter((p) => !/^(tests\/fixtures|evidence\/)/.test(p));
const resolveFrom = (base, t) => {
  const parts = base ? base.split("/") : [];
  for (const s of t.split("/")) { if (s === "..") parts.pop(); else if (s !== ".") parts.push(s); }
  return parts.join("/");
};
const dead = [];
for (const p of files) {
  const src = fs.readFileSync(p, "utf8").replace(/```[\s\S]*?```/g, "");
  const base = p.split("/").slice(0, -1).join("/");
  for (const m of src.matchAll(/\]\((?!https?:|mailto:|#)([^)\s#]+)(?:#[^)]*)?\)/g)) {
    const t = m[1];
    const abs = t.startsWith("/") ? t.slice(1) : resolveFrom(base, t);
    if (!fs.existsSync(abs)) dead.push({ file: p, link: t, absolutePath: t.startsWith("/Users/") });
  }
}
console.log(JSON.stringify({ files: files.length, dead: dead.length, absolutePaths: dead.filter((d) => d.absolutePath).length }));
for (const d of dead) console.log(`${d.file} -> ${d.link}`);
process.exitCode = dead.some((d) => !d.absolutePath) ? 1 : 0;
