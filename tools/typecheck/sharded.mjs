#!/usr/bin/env node
// Repo-wide source typecheck (tsconfig.check.json) in N sequential programs.
//
// One program over every root of tsconfig.check.json needs ~7 GB of live heap (2 M lines of TypeScript, the 7 MB
// generated src/aura-assets.ts and every game route the unit tests import); the ACR source pass container killed it
// (rc 137, run native-5-source-560-002). This runner parses the same config, takes exactly its root file list and
// compiler options, splits the sorted roots into contiguous shards and checks each shard in its own child process,
// so peak memory is one shard's program.
//
// Global scope is kept identical to the single program: a parse-only pass over the full program (no checker, in its
// own child) lists every program file that contributes global declarations (.d.ts files outside the default libs,
// `declare global` blocks and ambient `declare module "x"` declarations), and those files are roots of every shard.
// The parent asserts that the shards cover the full root list. Exit 1 on any diagnostic.
//
// Usage: node tools/typecheck/sharded.mjs [--project tsconfig.check.json] [--shards 3]
//        (TYPECHECK_SHARDS overrides the default; --shards 1 is the single-program check.)
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const self = fileURLToPath(import.meta.url);

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

const project = resolve(repo, arg("--project", "tsconfig.check.json"));
const shards = Number(arg("--shards", process.env.TYPECHECK_SHARDS ?? "3"));
if (!Number.isInteger(shards) || shards < 1 || shards > 16) {
  console.error(`typecheck: --shards must be an integer 1..16 (got ${shards})`);
  process.exit(2);
}

const host = { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n")); } };
const formatHost = { getCanonicalFileName: (f) => f, getCurrentDirectory: () => repo, getNewLine: () => "\n" };

function parse() {
  const parsed = ts.getParsedCommandLineOfConfigFile(project, { noEmit: true }, host);
  if (!parsed) throw new Error(`typecheck: cannot parse ${project}`);
  return parsed;
}

/** Sorted roots split into `count` contiguous slices of roughly equal source bytes (the tests of one game stay together). */
function partition(fileNames, count) {
  const roots = [...fileNames].sort();
  const sizes = roots.map((f) => statSync(f).size);
  const total = Math.max(1, sizes.reduce((a, b) => a + b, 0));
  const out = Array.from({ length: count }, () => []);
  let acc = 0;
  roots.forEach((file, i) => {
    out[Math.min(count - 1, Math.floor((acc / total) * count))].push(file);
    acc += sizes[i];
  });
  return out;
}

const AMBIENT = /^\s*(?:export\s+)?declare\s+(?:module\s+["']|global\b)/m;

if (process.argv.includes("--discover")) {
  // Child: parse-only full program; print the files that contribute global declarations.
  const parsed = parse();
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options, projectReferences: parsed.projectReferences });
  const globals = program.getSourceFiles()
    .filter((sf) => !program.isSourceFileDefaultLibrary(sf))
    .filter((sf) => sf.isDeclarationFile ? !ts.isExternalModule(sf) || AMBIENT.test(sf.text) : AMBIENT.test(sf.text))
    .map((sf) => sf.fileName)
    .sort();
  process.stdout.write(JSON.stringify(globals));
  process.exit(0);
}

const shardArg = arg("--shard", undefined);
if (shardArg !== undefined) {
  // Child: check one shard (its roots + every global-declaring file) with the config's exact options.
  const parsed = parse();
  const list = arg("--globals", undefined);
  const globals = list ? JSON.parse(readFileSync(list, "utf8")) : [];
  const roots = [...new Set([...globals, ...partition(parsed.fileNames, shards)[Number(shardArg)]])];
  const program = ts.createProgram({ rootNames: roots, options: parsed.options, projectReferences: parsed.projectReferences });
  const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
  if (diagnostics.length > 0) process.stdout.write(ts.formatDiagnostics(ts.sortAndDeduplicateDiagnostics(diagnostics), formatHost));
  process.exit(diagnostics.length > 0 ? 1 : 0);
}

const parsed = parse();
const parts = partition(parsed.fileNames, shards);
const covered = new Set(parts.flat());
if (covered.size !== new Set(parsed.fileNames).size || parsed.fileNames.some((f) => !covered.has(f))) {
  console.error("typecheck: shards do not cover the root file list");
  process.exit(2);
}
let globals = [];
if (shards > 1) {
  const discover = spawnSync(process.execPath, ["--max-old-space-size=8192", self, "--project", project, "--discover"], { cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"] });
  if (discover.status !== 0) {
    console.error(`typecheck: global-declaration discovery failed (rc=${discover.status}${discover.signal ? ` signal=${discover.signal}` : ""})`);
    process.exit(1);
  }
  globals = JSON.parse(discover.stdout);
}
const scratch = mkdtempSync(join(tmpdir(), "a3d-typecheck-"));
const globalsFile = join(scratch, "globals.json");
writeFileSync(globalsFile, JSON.stringify(globals));
let failed = 0;
for (let i = 0; i < parts.length; i += 1) {
  const started = Date.now();
  const first = relative(repo, parts[i][0] ?? ""), last = relative(repo, parts[i].at(-1) ?? "");
  const child = spawnSync(process.execPath, ["--max-old-space-size=8192", self, "--project", project, "--shards", String(shards), "--shard", String(i), "--globals", globalsFile], { stdio: "inherit", cwd: repo });
  const rc = child.status ?? (child.signal ? 128 : 1);
  console.log(`typecheck shard ${i + 1}/${parts.length}: ${parts[i].length} roots + ${globals.length} global-declaring files (${first} .. ${last}) rc=${rc}${child.signal ? ` signal=${child.signal}` : ""} ${((Date.now() - started) / 1000).toFixed(0)}s`);
  if (rc !== 0) failed += 1;
}
rmSync(scratch, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
