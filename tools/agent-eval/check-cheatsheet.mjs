#!/usr/bin/env node
// Typecheck every ```ts block of docs/agents/first-screen-cheatsheet.md against the installed @aura3d/engine
// (the same node_modules the cold-start agents get), one project per block, and report the o200k-ish token size.
//   node tools/agent-eval/check-cheatsheet.mjs [file] [--base /tmp/agent-eval-base/aura]
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const baseIdx = argv.indexOf("--base");
const base = baseIdx >= 0 ? argv.splice(baseIdx, 2)[1] : process.env.AGENT_EVAL_BASE_ROOT ? join(process.env.AGENT_EVAL_BASE_ROOT, "aura") : "/tmp/agent-eval-base/aura";
const file = resolve(argv[0] ?? join(import.meta.dirname, "../../docs/agents/first-screen-cheatsheet.md"));
const text = readFileSync(file, "utf8");
const blocks = [...text.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]);
const work = join(process.env.TMPDIR ?? "/tmp", "a3d-cheatsheet-check");
rmSync(work, { recursive: true, force: true });
let failed = 0;
const skeleton = blocks[0];
const assemble = (i) => {
  if (i === 0) return skeleton;
  const [top, frame = ""] = blocks[i].split(/^\/\/ per frame\n/m);
  return skeleton.replace("// <blocks: top level>", () => top).replace("// <blocks: per frame>", () => frame);
};
blocks.forEach((raw, i) => {
  const code = assemble(i);
  const dir = join(work, `block${i + 1}`);
  mkdirSync(join(dir, "src"), { recursive: true });
  cpSync(join(import.meta.dirname, "scaffold/tsconfig.json"), join(dir, "tsconfig.json"));
  symlinkSync(join(base, "node_modules"), join(dir, "node_modules"), "dir");
  writeFileSync(join(dir, "src/main.ts"), code);
  try {
    execFileSync(join(dir, "node_modules/.bin/tsc"), ["--noEmit", "-p", "tsconfig.json", "--pretty", "false"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    console.log(`block ${i + 1}: typecheck ok (${code.split("\n").length} lines)`);
  } catch (error) {
    failed += 1;
    console.log(`block ${i + 1}: FAIL\n${String(error.stdout ?? error.message).slice(0, 1500)}`);
  }
});
console.log(`${blocks.length} blocks, ${failed} failed; ${text.length} chars, ~${Math.round(text.length / 3.6)} tokens (chars/3.6 estimate)`);
process.exit(failed ? 1 : 0);
