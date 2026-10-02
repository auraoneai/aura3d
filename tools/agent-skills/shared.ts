import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export const CANONICAL_SKILLS_DIR = "packages/aura3d-cli/skills";
/** Generated mirrors of the canonical tree (repo-local agent clients + create-aura3d npm bundle). */
export const SKILL_MIRRORS = [".cursor/skills", ".claude/skills", ".agents/skills", "packages/create-aura3d/skills"] as const;
/** Files that exist only in the canonical source (authoring notes), never mirrored or shipped to users. */
export const CANONICAL_ONLY = new Set(["AUTHORING.md"]);
/** llms.txt is bundled into the skills tree so scaffolded projects get a real ./llms.txt. */
export const BUNDLED_LLMS = "llms.txt";

export function listTree(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".DS_Store") continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else out.push(relative(root, path));
    }
  };
  visit(root);
  return out.sort();
}

/** Expected mirror contents: canonical files (minus canonical-only) + bundled llms.txt. */
export function expectedMirror(repoRoot: string): Map<string, string> {
  const root = resolve(repoRoot, CANONICAL_SKILLS_DIR);
  const files = new Map<string, string>();
  for (const file of listTree(root)) {
    if (CANONICAL_ONLY.has(file) || file === BUNDLED_LLMS) continue;
    files.set(file, readFileSync(join(root, file), "utf8"));
  }
  files.set(BUNDLED_LLMS, readFileSync(resolve(repoRoot, "llms.txt"), "utf8"));
  return files;
}

export function skillNames(repoRoot: string): string[] {
  const root = resolve(repoRoot, CANONICAL_SKILLS_DIR);
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
}
