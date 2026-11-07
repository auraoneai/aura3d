import { writeFileSync } from "node:fs";
const { buildDocsBundle } = await import("/Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/wf_0a753117-9f6-4/packages/aura3d-mcp/dist/bundle/build.js");
for (const v of ["M", "N"]) {
  const b = buildDocsBundle(`/tmp/mcp-bundle-${v}`);
  writeFileSync(`/tmp/mcp-bundle-${v}.json`, JSON.stringify(b));
  console.log(v, b.docsVersion, b.files.length, b.files.some((f) => /cheatsheet/.test(f.path)));
}
