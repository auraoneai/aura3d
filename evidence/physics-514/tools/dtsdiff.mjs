// usage: node dtsdiff.mjs <publishedDistRoot> <branchDistRoot> <subdir>...
// Compares every .d.ts under each subdir, after normalising import specifiers (.js suffix, quote style) and whitespace.
// Prints added/removed files and, for changed files, the removed (-) and added (+) normalised lines.
import fs from "node:fs";
import path from "node:path";
const [pub, br, ...subs] = process.argv.slice(2);
const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".d.ts") ? [path.join(d, e.name)] : [])) : []);
const norm = (t) => t.replace(/\/\/# sourceMappingURL=.*$/gm, "").replace(/(from |import\()(["'])([^"']+?)(\.js)?\2/g, (_m, a, _q, s) => `${a}"${s}"`).split("\n").map((l) => l.trim()).filter(Boolean);
for (const sub of subs) {
  const a = new Map(walk(path.join(pub, sub)).map((f) => [path.relative(pub, f), f]));
  const b = new Map(walk(path.join(br, sub)).map((f) => [path.relative(br, f), f]));
  for (const k of a.keys()) if (!b.has(k)) console.log(`REMOVED FILE ${k}`);
  for (const k of b.keys()) if (!a.has(k)) console.log(`ADDED FILE ${k}`);
  for (const [k, f] of a) {
    if (!b.has(k)) continue;
    const x = norm(fs.readFileSync(f, "utf8")), y = norm(fs.readFileSync(b.get(k), "utf8"));
    const xs = new Set(x), ys = new Set(y);
    const removed = x.filter((l) => !ys.has(l)), added = y.filter((l) => !xs.has(l));
    if (removed.length || added.length) { console.log(`CHANGED ${k}`); for (const l of removed) console.log(`  - ${l}`); for (const l of added) console.log(`  + ${l}`); }
  }
}
