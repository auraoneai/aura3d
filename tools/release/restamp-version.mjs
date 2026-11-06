#!/usr/bin/env node
// Replace the previous release version with the new one in the files the previous release commit changed.
//   node tools/release/restamp-version.mjs --from 5.0.1 --to 5.0.2 --since-commit <prev-release-commit> [--dry-run]
//   node tools/release/restamp-version.mjs --from 5.0.1 --to 5.0.2 --files a.md,b.json
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isRestampable, restampContent } from "./release-helpers.mjs";

const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? undefined : process.argv[i + 1]; };
const root = resolve(import.meta.dirname, "../..");
const [from, to, since, files] = [arg("--from"), arg("--to"), arg("--since-commit"), arg("--files")];
const dry = process.argv.includes("--dry-run");
if (!from || !to || (!since && !files)) { console.error("usage: restamp-version.mjs --from X --to Y (--since-commit SHA | --files a,b) [--dry-run]"); process.exit(2); }
const list = files ? files.split(",") : execFileSync("git", ["diff", "--name-only", `${since}^`, since], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
let total = 0;
for (const path of list.filter(isRestampable)) {
  const abs = resolve(root, path);
  if (!existsSync(abs)) continue;
  const { text, count } = restampContent(readFileSync(abs, "utf8"), from, to);
  if (!count) continue;
  total += count;
  console.log(`${dry ? "would restamp" : "restamped"} ${path} (${count})`);
  if (!dry) writeFileSync(abs, text);
}
console.log(`${total} occurrence(s) of ${from} -> ${to}`);
