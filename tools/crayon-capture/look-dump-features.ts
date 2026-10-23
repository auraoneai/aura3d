#!/usr/bin/env tsx
/**
 * tools/crayon-capture/look-dump-features — static feature map per captured Crayon game bundle.
 *
 *   pnpm exec tsx tools/crayon-capture/look-dump-features.ts [--only id,id] [--extra-dir /path] [--out evidence/look-specs]
 *
 * Reads captured bundles as inert text (never executed), writes `<out>/<game>.features.json` with the feature
 * inventory (screens, inputs, audio, storage, shaders, data tables, post-fx, particles) and an `unported` list
 * that compares it with the port's source and its PORTING-NOTES "Not ported" bullets.
 */
import fs from "node:fs";
import path from "node:path";
import { analyzeSource, compareWithPort, parseNotPorted, type FeatureMap } from "./look-dump-features-lib.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const only = (arg("--only") ?? "").split(",").filter(Boolean);
const outDir = path.resolve(ROOT, arg("--out") ?? "evidence/look-specs");
const extraDirs = process.argv.flatMap((a, i, all) => (a === "--extra-dir" ? [all[i + 1] as string] : []));

const FIXTURE_DIR: Record<string, string> = { "last-train-to-the-sea": "last-train" };
const PORT_DIR: Record<string, string> = { "last-train-to-the-sea": "last-train-port" };
const RAW_BUNDLES = "/tmp/crayon-raw-bundles";
const SKIP = /formatted|extract-map|demangle\.mjs$|^extract\.mjs$/;

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(m?js)$/.test(e.name) && !SKIP.test(e.name) && !p.includes(`${path.sep}formatted${path.sep}`)) out.push(p);
  }
  return out;
}

function inlineScripts(htmlPath: string): { file: string; text: string }[] {
  if (!fs.existsSync(htmlPath)) return [];
  const html = fs.readFileSync(htmlPath, "utf8");
  const out: { file: string; text: string }[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(html)) !== null) {
    const body = m[2] as string;
    if (body.trim().length > 200 && !/type=["']importmap/.test(m[1] as string)) out.push({ file: `${path.relative(ROOT, htmlPath)}#script${n++}`, text: body });
  }
  return out;
}

function sourcesFor(id: string): { file: string; text: string }[] {
  const dirs = [path.join(ROOT, "tests/fixtures/crayon", FIXTURE_DIR[id] ?? id), path.join(RAW_BUNDLES, id), ...extraDirs.map((d) => path.join(d, id))];
  const seen = new Set<string>();
  const files: { file: string; text: string }[] = [];
  for (const d of dirs) {
    for (const f of walk(d)) {
      const text = fs.readFileSync(f, "utf8");
      const key = `${path.basename(f)}:${text.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      files.push({ file: f.startsWith(ROOT) ? path.relative(ROOT, f) : f.replace(/^\/tmp\//, "tmp/"), text });
    }
  }
  for (const s of inlineScripts(path.join(ROOT, "evidence/crayon-runtime", id, "srcdoc.html"))) {
    const key = `inline:${s.text.length}`;
    if (!seen.has(key)) { seen.add(key); files.push(s); }
  }
  const modjs = path.join(ROOT, "evidence/crayon-runtime", id, "module.js");
  if (fs.existsSync(modjs)) {
    const text = fs.readFileSync(modjs, "utf8");
    if (!seen.has(`module.js:${text.length}`)) files.push({ file: path.relative(ROOT, modjs), text });
  }
  return files;
}

function portText(id: string): { code: string; notes: string } {
  const dir = path.join(ROOT, "examples", PORT_DIR[id] ?? `${id}-port`);
  let code = "";
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (/\.(ts|html)$/.test(f)) code += fs.readFileSync(path.join(dir, f), "utf8") + "\n";
  const notesPath = path.join(dir, "PORTING-NOTES.md");
  return { code, notes: fs.existsSync(notesPath) ? fs.readFileSync(notesPath, "utf8") : "" };
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/crayon-probe/games.json"), "utf8")) as { games: { id: string }[] };
fs.mkdirSync(outDir, { recursive: true });
const summary: { id: string; status: "MAPPED" | "NO-SOURCE"; sources: number; bytes: number; absent: number; notPortedListed: number }[] = [];

for (const { id } of manifest.games) {
  if (only.length > 0 && !only.includes(id)) continue;
  const files = sourcesFor(id);
  const { code, notes } = portText(id);
  if (files.length === 0) {
    fs.writeFileSync(path.join(outDir, `${id}.features.json`), `${JSON.stringify({ schema: "a3d-look-features/1", game: id, status: "NO-SOURCE", note: "No captured bundle is available locally; re-capture with tools/crayon-probe/capture-module.ts on ACR." }, null, 2)}\n`);
    summary.push({ id, status: "NO-SOURCE", sources: 0, bytes: 0, absent: 0, notPortedListed: 0 });
    continue;
  }
  const map: FeatureMap = analyzeSource(id, files);
  const compared = compareWithPort(map, code);
  const notPorted = parseNotPorted(notes);
  const doc = {
    ...map,
    status: "MAPPED",
    unported: { absentInPort: compared.filter((c) => c.port === "absent"), presentInPort: compared.filter((c) => c.port === "present"), declaredNotPorted: notPorted },
    note: "Inventory only: names, counts, numbers, hashes and file:line:col locations. No third-party source text is stored."
  };
  fs.writeFileSync(path.join(outDir, `${id}.features.json`), `${JSON.stringify(doc, null, 2)}\n`);
  summary.push({ id, status: "MAPPED", sources: files.length, bytes: map.sources.reduce((a, s) => a + s.bytes, 0), absent: doc.unported.absentInPort.length, notPortedListed: notPorted.length });
}
for (const s of summary) process.stdout.write(`${s.id.padEnd(28)} ${s.status.padEnd(10)} files=${s.sources} bytes=${s.bytes} absentInPort=${s.absent} declared=${s.notPortedListed}\n`);
