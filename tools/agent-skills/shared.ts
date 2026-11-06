import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export const CANONICAL_SKILLS_DIR = "packages/aura3d-cli/skills";
/** Generated mirrors of the canonical tree (repo-local agent clients + create-aura3d npm bundle). */
export const SKILL_MIRRORS = [".cursor/skills", ".claude/skills", ".agents/skills", "packages/create-aura3d/skills"] as const;
/** Files that exist only in the canonical source (authoring notes), never mirrored or shipped to users. */
export const CANONICAL_ONLY = new Set(["AUTHORING.md"]);
/** llms.txt is bundled into the skills tree so scaffolded projects get a real ./llms.txt. */
export const BUNDLED_LLMS = "llms.txt";
/** docs/agents pages bundled with the skills (and written to <project>/docs/agents/ by create-aura3d) so a new project has the three.js table, the recipes and the signatures offline. */
export const BUNDLED_DOCS_DIR = "agent-docs";
export const BUNDLED_DOCS = ["threejs-to-aura3d.md", "recipes.md", "api-signatures.md"] as const;

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
    if (CANONICAL_ONLY.has(file) || file === BUNDLED_LLMS || file.startsWith(`${BUNDLED_DOCS_DIR}/`)) continue;
    files.set(file, readFileSync(join(root, file), "utf8"));
  }
  files.set(BUNDLED_LLMS, readFileSync(resolve(repoRoot, "llms.txt"), "utf8"));
  for (const doc of BUNDLED_DOCS) files.set(`${BUNDLED_DOCS_DIR}/${doc}`, readFileSync(resolve(repoRoot, "docs/agents", doc), "utf8"));
  return files;
}

export function skillNames(repoRoot: string): string[] {
  const root = resolve(repoRoot, CANONICAL_SKILLS_DIR);
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
}
