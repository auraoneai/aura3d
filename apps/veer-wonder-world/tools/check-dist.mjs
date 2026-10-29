#!/usr/bin/env node
// Checks a built dist/ before it is served (DEPLOYMENT.md section 2). The preview deploy's build runs it on the deploy
// host after the Vite build (tools/deploy-build.sh), so a build that fails it is never deployed:
// - index.html exists and keeps its noindex meta tag (the app is an unlisted prototype);
// - no source map is built;
// - no served text file carries the child's name, bare or in the working folder form `<name>-wonder-world`, but for
//   the owner's welcome (07 O8): one string literal of the name in the bundle, from src/personal.ts;
// - no served text file carries the deploy host's own variables (VITE_VERCEL_*: the deployment's URLs and IDs),
//   which Vite inlines when they reach the build (tools/deploy-build.sh keeps them out).
// The name is not written here: it is the prefix of the app's working folder name, as in
// tests/browser/wonder-world-build.spec.ts, which runs the same scan on the remote runner.
// Usage: node apps/veer-wonder-world/tools/check-dist.mjs [dist]   (default: the app's dist/)
// Prints file names, counts and up to three short contexts per file with the name masked as <name>, never the
// name itself; exits 1 on any problem.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(process.argv[2] ?? join(app, "dist"));
const WORKING_SUFFIX = "-wonder-world";
const TEXT_FILE = /\.(?:html|js|mjs|css|json|md|txt|svg)$/i;

function filesUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(path));
    else out.push(path);
  }
  return out;
}

const folder = basename(app);
const name = folder.endsWith(WORKING_SUFFIX) ? folder.slice(0, -WORKING_SUFFIX.length) : "";
const problems = [];
if (!name) problems.push(`the app folder is not named <name>${WORKING_SUFFIX}, so the name to scan for is unknown`);
const indexHtml = join(dist, "index.html");
if (!existsSync(indexHtml)) problems.push(`no index.html in ${relative(process.cwd(), dist) || "."}`);
else if (!/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(readFileSync(indexHtml, "utf8"))) {
  problems.push("index.html has no robots noindex meta tag");
}

const files = existsSync(dist) ? filesUnder(dist) : [];
const maps = files.filter((file) => file.endsWith(".map"));
if (maps.length > 0) problems.push(`${maps.length} source map(s): ${maps.map((file) => relative(dist, file)).join(", ")}`);

const textFiles = files.filter((file) => TEXT_FILE.test(file));
// 07 O8: the owner's welcome. src/personal.ts puts the name into the bundle as one string literal ("<name>"), and
// that single literal is allowed; any other hit, or a second literal, fails.
let welcomeLiterals = 0;
if (name) {
  const pattern = new RegExp(`(?<![a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`, "gi");
  const isLiteral = (text, hit) => {
    const before = text[hit.index - 1];
    return /["'`]/.test(before ?? "") && text[hit.index + hit[0].length] === before;
  };
  for (const file of textFiles) {
    const text = readFileSync(file, "utf8");
    const hits = [...text.matchAll(pattern)].filter((hit) => {
      if (welcomeLiterals === 0 && file.endsWith(".js") && isLiteral(text, hit)) {
        welcomeLiterals += 1;
        return false;
      }
      return true;
    });
    if (hits.length === 0) continue;
    // Up to three hits with 40 characters either side, the name itself masked, so a hit can be traced safely.
    const contexts = hits
      .slice(0, 3)
      .map((hit) => text.slice(Math.max(0, hit.index - 40), hit.index + hit[0].length + 40).replace(pattern, "<name>").replace(/\s+/g, " "));
    problems.push(`the child's name appears ${hits.length} time(s) in ${relative(dist, file)}: ${contexts.map((context) => `"${context}"`).join(", ")}`);
  }
}

for (const file of textFiles) {
  const hostVariables = [...new Set(readFileSync(file, "utf8").match(/\bVITE_VERCEL_[A-Z0-9_]+/g) ?? [])];
  if (hostVariables.length > 0) {
    problems.push(`deploy-host variables inlined in ${relative(dist, file)}: ${hostVariables.slice(0, 5).join(", ")}${hostVariables.length > 5 ? ", ..." : ""}`);
  }
}

if (problems.length > 0) {
  console.error(`check-dist: ${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `check-dist: OK (${files.length} files, ${textFiles.length} text files scanned, 0 source maps, 0 name hits besides ${welcomeLiterals} welcome literal (07 O8), 0 host variables, noindex kept)`
);
