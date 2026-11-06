#!/usr/bin/env node
// Banner every older GitHub release as superseded (idempotent) and mark them pre-release.
//   node tools/release/banner-releases.mjs --version 5.0.2 --url <migration url> [--skip-prefix v5.] [--dry-run]
// Run from inside the repo checkout so `gh` resolves the repository.
import { execFileSync } from "node:child_process";
import { bannerBody, bannerTargets } from "./release-helpers.mjs";

const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const [version, url] = [arg("--version"), arg("--url")];
if (!version || !url) { console.error("usage: banner-releases.mjs --version V --url U [--skip-prefix P]... [--dry-run]"); process.exit(2); }
const skip = args.flatMap((a, i) => (a === "--skip-prefix" ? [args[i + 1]] : []));
const gh = (...a) => execFileSync("gh", a, { encoding: "utf8", maxBuffer: 1 << 26 });
const tags = JSON.parse(gh("release", "list", "--limit", "300", "--json", "tagName")).map((r) => r.tagName);
let n = 0, failed = 0;
for (const tag of bannerTargets(tags, version, skip)) {
  try {
    const body = gh("release", "view", tag, "--json", "body", "-q", ".body");
    const next = bannerBody(body, version, url);
    if (args.includes("--dry-run")) { console.log("DRY", tag, next !== body ? "bannered" : "already current"); continue; }
    if (next !== body) gh("release", "edit", tag, "--notes", next, "--prerelease", "--latest=false");
    else gh("release", "edit", tag, "--prerelease", "--latest=false");
    n++; console.log(tag, next !== body ? "bannered" : "already current");
  } catch { failed++; console.log("FAILED", tag); }
}
console.log(`${n} older releases processed, ${failed} failed`);
process.exit(failed ? 1 : 0);
