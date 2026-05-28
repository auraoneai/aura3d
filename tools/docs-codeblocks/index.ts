import { existsSync, readFileSync } from "node:fs";
import { writeReport, type ReleaseCheck } from "../check-common";

const docs = [
  "README.md",
  ...list("docs/agents/README.md", "docs/agents/agent-quickstart.md", "docs/agents/api-surface.md", "docs/agents/asset-workflow.md", "docs/agents/build-playbook.md", "docs/agents/deployment.md", "docs/agents/verification.md"),
  "docs/api/readme.md",
  "docs/api/app-api.md",
  "docs/templates/create-aura3d-templates.md"
].filter((path) => existsSync(path));
const knownPackages = new Set(["@aura3d/engine", "@aura3d/react", "@aura3d/cli", "create-aura3d"]);
const knownTemplates = new Set(["product-viewer", "cinematic-scene", "mini-game"]);
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
