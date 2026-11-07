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

/** Repository-internal or process documents that must not be served as public Aura3D knowledge. */
const EXCLUDED_DOCS = new Set(["codebase-map.md", "trial-502-protocol.md", "agent-context.md", "game-showcase-build.md", "game-example-standards.md", "benchmark-recipes.md", "turn-gap-findings.md"]);

export function buildDocsBundle(repoRoot: string): DocsBundle {
  const version = (JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { version: string }).version;
  const files: BundleFile[] = [];
  const llms = join(repoRoot, "llms.txt");
  if (existsSync(llms)) files.push({ path: "llms.txt", kind: "llms", text: readFileSync(llms, "utf8") });
  const docsDir = join(repoRoot, "docs", "agents");
  for (const name of readdirSync(docsDir).filter((n) => n.endsWith(".md")).sort()) {
    if (EXCLUDED_DOCS.has(name)) continue;
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
