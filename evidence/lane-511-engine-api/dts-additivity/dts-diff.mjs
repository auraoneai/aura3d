// Declaration additivity check for lane 511 against the published @aura3d/engine@5.0.2 tarball.
// Inputs: <pub> = extracted tarball dist/ (dist/<pkg>/**/*.d.ts), <main> and <branch> = `tsc -p tsconfig.build.json
// --declaration --emitDeclarationOnly --outDir <dir>` trees (<dir>/packages/<pkg>/src/**/*.d.ts).
// Normalisation (what finalize-dist rewrites): module specifiers in from "..." / import("...") are replaced by a
// placeholder, sourceMappingURL comments and blank lines are dropped, whitespace is collapsed.
// For every .d.ts the published file has, lines present in 5.0.2 but missing on a tree are "removed" lines. A removal
// is attributed to the lane only when the branch removes it and main does not (main's removals since 5.0.2 belong to
// other lanes). Missing files likewise. Every lane-attributed removal is printed for manual review (a line can be
// "removed" because a member was appended to it, e.g. an import list or a union, which is additive).
// usage: node dts-diff.mjs <pub> <main> <branch> <out.json>
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
const [pub, mainDir, branchDir, outPath] = process.argv.slice(2);
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".d.ts") ? [p] : []; });
const norm = (text) => text
  .replace(/(from\s+|import\(\s*)"[^"]+"/g, '$1"MOD"')
  .split("\n").filter((l) => !l.startsWith("//# sourceMappingURL")).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
const counts = (lines) => { const m = new Map(); for (const l of lines) m.set(l, (m.get(l) ?? 0) + 1); return m; };
const removed = (a, b) => { const cb = counts(b); const out = []; for (const [l, n] of counts(a)) { const k = n - (cb.get(l) ?? 0); for (let i = 0; i < k; i++) out.push(l); } return out; };
const report = { files: 0, laneMissingFiles: [], laneRemovedLines: {}, laneAddedFiles: 0, mainOnlyRemovals: 0 };
for (const pkg of readdirSync(pub)) {
  const pdir = join(pub, pkg); if (!statSync(pdir).isDirectory()) continue;
  const mroot = join(mainDir, "packages", pkg, "src"), broot = join(branchDir, "packages", pkg, "src");
  if (!existsSync(broot)) continue;
  for (const f of walk(pdir)) {
    report.files++;
    const rel = relative(pdir, f); const mf = join(mroot, rel), bf = join(broot, rel);
    const p = norm(readFileSync(f, "utf8"));
    const m = existsSync(mf) ? norm(readFileSync(mf, "utf8")) : null;
    const b = existsSync(bf) ? norm(readFileSync(bf, "utf8")) : null;
    if (!b) { if (m) report.laneMissingFiles.push(`${pkg}/${rel}`); continue; }
    const rb = removed(p, b); const rm = m ? removed(p, m) : p;
    const rmc = counts(rm); const lane = [];
    for (const l of rb) { const k = rmc.get(l) ?? 0; if (k > 0) rmc.set(l, k - 1); else lane.push(l); }
    report.mainOnlyRemovals += [...rmc.values()].reduce((s, v) => s + v, 0);
    if (lane.length) report.laneRemovedLines[`${pkg}/${rel}`] = { removed: lane, addedOnBranchNotMain: removed(b, m ?? []).filter((l) => !(m ?? []).includes(l)) };
  }
}
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ files: report.files, laneMissingFiles: report.laneMissingFiles, laneFilesWithRemovedLines: Object.keys(report.laneRemovedLines) }, null, 2));
