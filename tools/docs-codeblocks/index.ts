import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { writeReport, type ReleaseCheck } from "../check-common";
import { CREATE_AURA3D_TEMPLATES } from "../../packages/create-aura3d/src/index";

const docs = [
  "README.md",
  ...list("docs/agents/README.md", "docs/agents/agent-quickstart.md", "docs/agents/api-surface.md", "docs/agents/asset-workflow.md", "docs/agents/build-playbook.md", "docs/agents/deployment.md", "docs/agents/verification.md"),
  "docs/api/readme.md",
  "docs/api/app-api.md",
  "docs/concepts/physics.md",
  "docs/templates/create-aura3d-templates.md"
].filter((path) => existsSync(path));
const knownPackages = new Set([
  "@aura3d/engine",
  "@aura3d/engine/lean",
  "@aura3d/engine/lean-product",
  "@aura3d/engine/lean-game",
  "@aura3d/react",
  "@aura3d/cli",
  "create-aura3d"
]);
const knownTemplates = new Set<string>(CREATE_AURA3D_TEMPLATES);
const blocks = docs.flatMap(extractBlocks);
const packageImportErrors: string[] = [];
const commandErrors: string[] = [];

for (const block of blocks) {
  if (["ts", "tsx", "js"].includes(block.lang)) {
    for (const match of block.code.matchAll(/from\s+["']([^"']+)["']/g)) {
      const specifier = match[1]!;
      if (specifier.startsWith("@aura3d/") && !knownPackages.has(specifier)) packageImportErrors.push(`${block.file}: unknown package import ${specifier}`);
    }
  }
  if (["bash", "sh"].includes(block.lang)) {
    for (const line of block.code.split("\n").map((entry) => entry.trim()).filter(Boolean)) {
      if (line.startsWith("npx create-aura3d")) {
        const template = line.match(/--template\s+(\S+)/)?.[1];
        if (!template || !knownTemplates.has(template)) commandErrors.push(`${block.file}: invalid create-aura3d template in ${line}`);
      }
      if (line.startsWith("npx @aura3d/cli") && !/(assets|doctor|check-deploy|init)/.test(line)) {
        commandErrors.push(`${block.file}: invalid @aura3d/cli command in ${line}`);
      }
    }
  }
}

/**
 * Typecheck the physics concept doc's snippets against the real public API.
 *
 * WS-1.9 asks for **runnable** snippets. The existing checks below only validate that import
 * specifiers name known packages, which a snippet calling a method that does not exist would
 * pass. Documentation that does not compile is worse than none: a developer copies it, it fails,
 * and they conclude the library is broken.
 *
 * Compiled as a single program against `@aura3d/engine`'s real declarations, so a rename in the
 * runtime breaks the docs in CI rather than silently in a reader's editor.
 */
const physicsSnippetErrors: string[] = [];
const physicsBlocks = blocks.filter((block) => block.file === "docs/concepts/physics.md" && block.lang === "ts");
if (physicsBlocks.length > 0) {
  const scratch = join("tests", "reports", "docs-codeblocks-typecheck");
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
  const written: string[] = [];
  physicsBlocks.forEach((block, index) => {
    const file = join(scratch, `snippet-${index}.ts`);
    // Each block is its own module. Snippets legitimately share identifier names across sections,
    // and concatenating them would produce redeclaration errors that say nothing about the docs.
    writeFileSync(file, `${block.code}\n`);
    written.push(file);
  });
  const program = ts.createProgram(written, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    paths: { "@aura3d/engine": ["./packages/engine/src/index.ts"] },
    baseUrl: "."
  });
  const snippetSuffixes = written.map((file) => file.split(/[\\/]/).join("/"));
  /*
   * Only diagnostics *in the snippet files* count.
   *
   * Pulling in `@aura3d/engine`'s declarations also pulls in its Node-facing modules, which
   * legitimately do not typecheck under a browser-only lib set. Reporting those would make this
   * gate fail for reasons that have nothing to do with the documentation, and the usual response
   * to a noisy gate is to delete it. Scoping to the snippets keeps it meaningful: it fails when a
   * documented call does not exist or is used wrongly.
   */
  for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
    const fileName = diagnostic.file?.fileName?.split(/[\\/]/).join("/");
    if (!fileName) continue;
    const matchedIndex = snippetSuffixes.findIndex((suffix) => fileName.endsWith(suffix));
    if (matchedIndex < 0) continue;
    // Unused locals are expected: a snippet that reads a value for illustration does not use it.
    if (diagnostic.code === 6133 || diagnostic.code === 6196) continue;
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
    physicsSnippetErrors.push(`docs/concepts/physics.md snippet ${matchedIndex + 1}: ${message}`);
  }
}

const checks: ReleaseCheck[] = [
  {
    id: "docs-codeblocks-discovered",
    pass: blocks.length > 0,
    detail: `${blocks.length} runnable-looking code blocks discovered`
  },
  {
    id: "docs-aura-imports-known",
    pass: packageImportErrors.length === 0,
    detail: packageImportErrors.length === 0 ? "all @aura3d imports use known public packages" : packageImportErrors.join("; ")
  },
  {
    id: "docs-cli-commands-known",
    pass: commandErrors.length === 0,
    detail: commandErrors.length === 0 ? "all documented CLI/scaffold commands use known commands/templates" : commandErrors.join("; ")
  },
  {
    id: "docs-physics-snippets-compile",
    pass: physicsSnippetErrors.length === 0,
    detail: physicsSnippetErrors.length === 0
      ? `${physicsBlocks.length} physics concept snippets compile against the public API`
      : physicsSnippetErrors.slice(0, 8).join("; ")
  },
  {
    id: "docs-public-scaffold-command-present",
    pass: blocks.some((block) => block.code.includes("npx create-aura3d@latest") && block.code.includes("--template product-viewer")),
    detail: "docs include product-viewer public scaffold command"
  }
];

writeReport("tests/reports/docs-codeblocks.json", "aura3d-docs-codeblocks", checks, { blocks });

function extractBlocks(file: string): Array<{ readonly file: string; readonly lang: string; readonly code: string }> {
  const text = readFileSync(file, "utf8");
  const blocks: Array<{ readonly file: string; readonly lang: string; readonly code: string }> = [];
  const regex = /```(ts|tsx|js|bash|sh)\n([\s\S]*?)```/g;
  for (const match of text.matchAll(regex)) {
    blocks.push({ file, lang: match[1]!, code: match[2]!.trim() });
  }
  return blocks;
}

function list(...paths: string[]): string[] {
  return paths;
}
