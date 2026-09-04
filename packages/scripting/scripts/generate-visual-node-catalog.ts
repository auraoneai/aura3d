// O2 node-catalog generator (muse3jsparity-PRD.md PART O, O2 docs box).
// Generates docs/api/visual-scripting-catalog.json FROM packages/scripting
// source via serializeVisualNodeCatalog(). Never hand-edit the JSON: rerun
// this script when the catalog changes. Fails closed: every node must carry a
// title, description, and at least one typed-backend evidence path.
// Usage: pnpm exec tsx --tsconfig tsconfig.base.json packages/scripting/scripts/generate-visual-node-catalog.ts (from the repo root)

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { serializeVisualNodeCatalog } from "../src/VisualScriptingRoot.js";

const ROOT = process.cwd();
const CATALOG_PATH = resolve(ROOT, "docs/api/visual-scripting-catalog.json");

const catalog = serializeVisualNodeCatalog();
const failures: string[] = [];
for (const group of catalog.categories) {
  for (const entry of group.kinds) {
    if (entry.title.length === 0) failures.push(`${entry.kind}: missing title`);
    if (entry.description.length === 0) failures.push(`${entry.kind}: missing description`);
    if (entry.evidence.length === 0) failures.push(`${entry.kind}: missing typed-backend evidence path`);
  }
}
if (catalog.nodeKindCount < 25) {
  failures.push(`catalog covers ${catalog.nodeKindCount} kinds, O2 requires 25+`);
}
if (failures.length > 0) {
  throw new Error(`Visual node catalog is not docs-ready:\n- ${failures.join("\n- ")}`);
}

const document = {
  schema: "aura3d.visual-scripting-catalog/1.0",
  generatedAt: new Date().toISOString(),
  ...catalog
};
writeFileSync(CATALOG_PATH, `${JSON.stringify(document, null, 2)}\n`);
console.log(`wrote ${CATALOG_PATH} (${catalog.nodeKindCount} kinds, ${catalog.categories.length} categories)`);
