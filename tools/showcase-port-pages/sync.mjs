#!/usr/bin/env node
// Rebuild apps/showcase-<slug>-port/index.html from examples/<port>/index.html (see lib.mjs).
//   node tools/showcase-port-pages/sync.mjs                      write every page
//   node tools/showcase-port-pages/sync.mjs --check              exit 1 if any page is out of date
//   node tools/showcase-port-pages/sync.mjs strange-orbit ...    only the named slugs
import { writeFileSync } from "node:fs";
import { PORT_PAGES, appPagePath, composePortPage, examplePagePath, readFileText, readNeutralLabels } from "./lib.mjs";

const check = process.argv.includes("--check");
const only = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
let stale = 0;
for (const [slug, folder] of PORT_PAGES) {
  if (only.length > 0 && !only.includes(slug)) continue;
  const appHtml = readFileText(appPagePath(slug));
  const composed = composePortPage({ exampleHtml: readFileText(examplePagePath(folder)), appHtml, labels: readNeutralLabels(slug) });
  if (composed === appHtml) { console.log(`ok       ${slug}`); continue; }
  stale += 1;
  if (check) console.log(`STALE    ${slug}`);
  else { writeFileSync(appPagePath(slug), composed); console.log(`wrote    ${slug}`); }
}
if (check && stale > 0) process.exit(1);
