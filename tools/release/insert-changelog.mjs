#!/usr/bin/env node
// Insert a release section into CHANGELOG.md:
//   node tools/release/insert-changelog.mjs --version 5.0.2 --date 2026-11-07 --notes-file notes.md [--replace]
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { insertChangelog } from "./release-helpers.mjs";

const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? undefined : process.argv[i + 1]; };
const root = resolve(import.meta.dirname, "../..");
const [version, date, notesFile] = [arg("--version"), arg("--date"), arg("--notes-file")];
if (!version || !date || !notesFile) { console.error("usage: insert-changelog.mjs --version X --date YYYY-MM-DD --notes-file FILE [--changelog PATH] [--replace]"); process.exit(2); }
const path = resolve(arg("--changelog") ?? `${root}/CHANGELOG.md`);
writeFileSync(path, insertChangelog(readFileSync(path, "utf8"), version, date, readFileSync(notesFile, "utf8"), { replace: process.argv.includes("--replace") }));
console.log(`inserted ${version} into ${path}`);
