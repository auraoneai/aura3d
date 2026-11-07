// node mkbundle.mjs   builds /tmp/mcp-bundle-{M,N}.json with the shipped allow-list (public docs only).
// Env: MCP_WT = lane worktree (built dist), AE = harness checkout whose docs are bundled.
import { writeFileSync } from "node:fs";
const WT = process.env.MCP_WT ?? process.cwd();
const { buildDocsBundle } = await import(`${WT}/packages/aura3d-mcp/dist/bundle/build.js`);
for (const v of ["M", "N"]) {
  const b = buildDocsBundle(`/tmp/mcp-bundle-${v}`);
  writeFileSync(`/tmp/mcp-bundle-${v}.json`, JSON.stringify(b));
  console.log(v, b.docsVersion, b.files.length, "sheet:", b.files.some((f) => /cheatsheet/.test(f.path)), b.files.map((f) => f.path).join(" "));
}
