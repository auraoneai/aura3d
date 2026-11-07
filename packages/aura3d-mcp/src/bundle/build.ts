// Build-time docs bundle: the public agent docs, the recipe sources and llms.txt, stamped with the engine version.
// The bundle is a plain JSON file (data/docs-bundle.json) so the installed server never needs the repository.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface BundleFile {
  readonly path: string;
  readonly kind: "llms" | "doc" | "recipe-source";
  readonly text: string;
}

export interface DocsBundle {
  readonly schema: "aura3d-mcp-docs/1";
  readonly docsVersion: string;
  readonly files: readonly BundleFile[];
}

/**
 * ALLOW-list of public agent docs. Anything not named here is never bundled, so a new repository-internal doc
 * cannot leak into the shipped package by default. Add a file only when it is written for users of the SDK.
 */
export const PUBLIC_AGENT_DOCS: readonly string[] = [
  "agent-quickstart.md",
  "api-signatures.md",
  "error-codes.md",
  "first-screen-cheatsheet.md",
  "procedural-humanoid.md",
  "recipes.md",
  "threejs-to-aura3d.md"
];

/** True for every bundle path that is allowed: llms.txt, the allow-listed docs and the recipe scene sources. */
export function isPublicBundlePath(path: string): boolean {
  if (path === "llms.txt") return true;
  if (/^docs\/agents\/recipes-src\/[A-Za-z0-9_-]+\/main\.ts$/.test(path)) return true;
  const m = /^docs\/agents\/([^/]+\.md)$/.exec(path);
  return Boolean(m && PUBLIC_AGENT_DOCS.includes(m[1]!));
}

export function buildDocsBundle(repoRoot: string): DocsBundle {
  const version = (JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { version: string }).version;
  const files: BundleFile[] = [];
  const llms = join(repoRoot, "llms.txt");
  if (existsSync(llms)) files.push({ path: "llms.txt", kind: "llms", text: readFileSync(llms, "utf8") });
  const docsDir = join(repoRoot, "docs", "agents");
  for (const name of readdirSync(docsDir).filter((n) => PUBLIC_AGENT_DOCS.includes(n)).sort()) {
    files.push({ path: `docs/agents/${name}`, kind: "doc", text: readFileSync(join(docsDir, name), "utf8") });
  }
  const recipes = join(docsDir, "recipes-src");
  if (existsSync(recipes)) {
    for (const entry of readdirSync(recipes, { withFileTypes: true }).filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const main = join(recipes, entry.name, "main.ts");
      if (existsSync(main)) files.push({ path: `docs/agents/recipes-src/${entry.name}/main.ts`, kind: "recipe-source", text: readFileSync(main, "utf8") });
    }
  }
  return { schema: "aura3d-mcp-docs/1", docsVersion: version, files };
}
