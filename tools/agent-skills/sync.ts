// Regenerates skill mirrors from packages/aura3d-cli/skills (canonical). Run: pnpm skills:sync
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CANONICAL_SKILLS_DIR, SKILL_MIRRORS, expectedMirror, listTree } from "./shared";

const repoRoot = process.cwd();
const expected = expectedMirror(repoRoot);
// The canonical package also ships the bundled llms.txt so `aura3d init` can write it.
writeFileSync(resolve(repoRoot, CANONICAL_SKILLS_DIR, "llms.txt"), expected.get("llms.txt")!);
const report: Record<string, number> = {};
for (const mirror of SKILL_MIRRORS) {
  const root = resolve(repoRoot, mirror);
  for (const stale of listTree(root)) if (!expected.has(stale)) rmSync(join(root, stale));
  for (const [file, contents] of expected) {
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  report[mirror] = expected.size;
}
console.log(JSON.stringify({ ok: true, canonical: CANONICAL_SKILLS_DIR, mirrors: report }, null, 2));
