import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createA3DProject, type CreateA3DTemplate } from "../../packages/create-aura3d/src/index";
import { existsCheck, fileIncludes, noFileMatches, writeReport, type ReleaseCheck } from "../check-common";

const docs = [
  "llms.txt",
  "docs/agents/README.md",
  "docs/agents/agent-quickstart.md",
  "docs/agents/api-surface.md",
  "docs/agents/asset-workflow.md",
  "docs/agents/templates.md",
  "docs/agents/deployment.md",
  "docs/agents/troubleshooting.md",
  "docs/agents/anti-hallucination-rules.md",
  "AGENTS.md",
  ".claude/CLAUDE.md",
  ".cursor/rules/aura3d.mdc",
  ".github/copilot-instructions.md"
];
const pathBTerms = [
  "AuraScene" + "IR",
  "Mock" + "Provider",
  "@aura3d/" + "ai-scene",
  ["provider", "runtime"].join("-"),
  ["prompt", "to", "scene"].join("-")
].map((term) => new RegExp(escapeRegExp(term)));
const docsText = docs.map((path) => `${path}\n${readFileSync(path, "utf8")}`).join("\n\n");
const llmsText = readFileSync("llms.txt", "utf8");
const templateSource = readFileSync("packages/create-aura3d/src/index.ts", "utf8");
const cliSource = readFileSync("packages/aura3d-cli/src/cli.ts", "utf8");
const tsconfig = JSON.parse(readFileSync("tsconfig.base.json", "utf8")) as {
  compilerOptions?: { paths?: Record<string, readonly string[]> };
};
const templates = Array.from(templateSource.matchAll(/"([^"]+)"/g), (match) => match[1] ?? "")
  .filter((value) => ["product-viewer", "cinematic-scene", "mini-game"].includes(value));
const uniqueTemplates = [...new Set(templates)].sort();
const createTemplateMentions = Array.from(docsText.matchAll(/create-aura3d@latest[^\n`]*--template\s+([a-z0-9-]+)/g), (match) => match[1] ?? "");
const cliCommands = Array.from(docsText.matchAll(/npx\s+@aura3d\/cli@latest\s+([^\n`]+)/g), (match) => normalizeCommand(match[1] ?? ""));
const versionCyclePattern = new RegExp([
  `\\b${"V"}[234]\\b`,
  ["Path", "A"].join(" "),
  ["Path", "B"].join(" ")
].join("|"));
const docsHaveNoVersionCycleFraming = !versionCyclePattern.test(docsText);
const snippetReport = compileTypeScriptSnippets();
const agentSimulation = runAgentSimulation();

const checks: ReleaseCheck[] = [
  ...docs.map((path) => existsCheck(path)),
  { id: "llms-size", pass: statSync("llms.txt").size < 25_000, detail: `llms.txt is ${statSync("llms.txt").size} bytes` },
  fileIncludes("llms.txt", ["npx create-aura3d@latest", "model(assets.robot)", "Do not invent asset paths"], "llms executable patterns"),
  fileIncludes("docs/agents/api-surface.md", ["createAuraApp", "@aura3d/react", "model(assets.robot)"], "api docs current"),
  noFileMatches(docs, pathBTerms, "agent docs no removed runtime copy"),
  {
    id: "agent-docs-no-version-cycle-framing",
    pass: docsHaveNoVersionCycleFraming,
    detail: docsHaveNoVersionCycleFraming ? "agent docs do not mention version-cycle framing" : "agent docs contain version-cycle framing"
  },
  {
    id: "agent-docs-template-freshness",
    pass:
      uniqueTemplates.length === 3 &&
      uniqueTemplates.every((template) => docsText.includes(template)) &&
      createTemplateMentions.every((template) => uniqueTemplates.includes(template)),
    detail: `templates=${uniqueTemplates.join(", ")}; create commands=${createTemplateMentions.join(", ")}`
  },
  {
    id: "agent-docs-cli-command-freshness",
    pass: cliCommands.every((command) => isSupportedCliCommand(command, cliSource)),
    detail: cliCommands.filter((command) => !isSupportedCliCommand(command, cliSource)).join(", ") || `${cliCommands.length} CLI command mentions are supported`
  },
  {
    id: "agent-docs-typescript-snippets-compile",
    pass: snippetReport.pass,
    detail: snippetReport.detail
  },
  {
    id: "llms-agent-simulation-builds-working-app",
    pass: agentSimulation.pass,
    detail: agentSimulation.detail
  }
];

writeReport("tests/reports/agent-docs.json", "aura3d-agent-docs", checks, {
  snippetFiles: snippetReport.files,
  agentSimulation
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

function isSupportedCliCommand(command: string, source: string): boolean {
  const [first, second] = command.split(" ");
  if (first === "assets") {
    return ["add", "scan", "validate", "list", "typegen", "thumbnail", "serve"].includes(second ?? "") && source.includes(`action === "${second}"`);
  }
  if (first === "doctor") return source.includes('command === "doctor"');
  if (first === "check-deploy") return source.includes('command === "check-deploy"');
  if (first === "init") return source.includes('command === "init"');
  return false;
}

function compileTypeScriptSnippets(): { readonly pass: boolean; readonly detail: string; readonly files: readonly string[] } {
  const snippets = docs.flatMap((path) => {
    const text = readFileSync(path, "utf8");
    return Array.from(text.matchAll(/```(?:ts|tsx)\n([\s\S]*?)```/g), (match, index) => ({
      path,
      index,
      code: match[1] ?? ""
    }));
  });
  const outDir = resolve("tests/reports/agent-doc-snippets");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "aura-assets.ts"), `import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  robot: { type: "model", format: "glb", url: "/aura-assets/robot.glb" },
  product: { type: "model", format: "glb", url: "/aura-assets/product.glb" },
  hero: { type: "model", format: "glb", url: "/aura-assets/hero.glb" }
} as const);
`);
  const files = snippets.map((snippet) => {
    const file = `${basename(snippet.path).replace(/[^a-z0-9]/gi, "-")}-${snippet.index}.ts`;
    writeFileSync(resolve(outDir, file), normalizeSnippet(snippet.code));
    return file;
  });
  writeFileSync(resolve(outDir, "tsconfig.json"), JSON.stringify({
    extends: "../../../tsconfig.base.json",
    compilerOptions: {
      noEmit: true,
      declaration: false,
      declarationMap: false,
      sourceMap: false
    },
    include: ["*.ts"]
  }, null, 2));

  try {
    execFileSync("pnpm", ["exec", "tsc", "-p", resolve(outDir, "tsconfig.json"), "--pretty", "false"], { encoding: "utf8", stdio: "pipe" });
    return { pass: true, detail: `${files.length} TypeScript snippets compile`, files };
  } catch (error) {
    const output = error instanceof Error && "stdout" in error
      ? `${String((error as { stdout?: unknown }).stdout ?? "")}${String((error as { stderr?: unknown }).stderr ?? "")}`
      : String(error);
    return { pass: false, detail: output.trim().slice(0, 2_000), files };
  }
}

function normalizeSnippet(code: string): string {
  const importsEngine = code.includes('from "@aura3d/engine"');
  const importsAssets = code.includes('from "./aura-assets"');
  const prelude = [
    'import * as AuraDocPrelude from "@aura3d/engine";',
    'import { assets as auraDocAssets } from "./aura-assets";',
    importsEngine ? "" : "const { createAuraApp, scene, model, camera, lights, material, effects, timeline, interactions, defineAuraAssets, unsafeModelUrl } = AuraDocPrelude;",
    importsAssets ? "" : "const assets = auraDocAssets;",
    "void [AuraDocPrelude, auraDocAssets];"
  ].filter(Boolean).join("\n");
  return `${prelude}\n\n${code}\n`;
}

function runAgentSimulation(): { readonly pass: boolean; readonly detail: string; readonly appDir?: string; readonly template?: string; readonly screenshotBytes?: number } {
  const scaffold = /npx\s+create-aura3d@latest\s+([^\s]+)\s+--template\s+([a-z0-9-]+)/.exec(llmsText);
  const helloWorld = /Hello world:[\s\S]*?```ts\n([\s\S]*?)```/.exec(llmsText);
  if (!scaffold || !helloWorld) {
    return { pass: false, detail: "llms.txt is missing scaffold command or hello-world TypeScript snippet" };
  }
  const template = scaffold[2] as CreateA3DTemplate;
  const appDir = resolve("tests/reports/agent-simulation-app");
  rmSync(appDir, { recursive: true, force: true });
  try {
    createA3DProject({
      targetDir: appDir,
      template,
      rootDir: resolve("packages/create-aura3d")
    });
    writeFileSync(resolve(appDir, "src/aura-assets.ts"), `import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  robot: {
    type: "model",
    format: "gltf",
    url: "/aura-assets/product-fixture.gltf"
  }
} as const);
`);
    writeFileSync(resolve(appDir, "src/main.ts"), `${helloWorld[1]?.trim()}\n`);
    writeWorkspaceViteConfig(appDir);
    run("pnpm", ["exec", "vite", "build", "--config", resolve(appDir, "vite.config.ts")], appDir);
    run("pnpm", ["exec", "playwright", "test", "tests/route-health.spec.ts", "tests/screenshot.spec.ts", "--config", resolve(appDir, "playwright.config.ts"), "--reporter=line"], appDir);
    const screenshotPath = resolve(appDir, "tests/reports/screenshot.png");
    const screenshotBytes = statSync(screenshotPath).size;
    return {
      pass: screenshotBytes > 1000,
      detail: `agent simulation scaffolded ${template}, built it, ran route health, and wrote ${screenshotBytes} screenshot bytes`,
      appDir,
      template,
      screenshotBytes
    };
  } catch (error) {
    return {
      pass: false,
      detail: error instanceof Error ? error.message : String(error),
      appDir,
      template
    };
  }
}

function writeWorkspaceViteConfig(targetDir: string): void {
  const aliasEntries = Object.entries(tsconfig.compilerOptions?.paths ?? {})
    .map(([specifier, paths]) => [specifier, paths[0]] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
    .sort((a, b) => b[0].length - a[0].length)
    .map(([specifier, path]) => {
      const replacement = specifier === "@aura3d/engine"
        ? resolve("packages/engine/src/agent-api/index.ts")
        : resolve(path);
      return `      { find: ${JSON.stringify(specifier)}, replacement: ${JSON.stringify(replacement)} }`;
    })
    .join(",\n");
  writeFileSync(resolve(targetDir, "vite.config.ts"), `import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: [
${aliasEntries}
    ]
  }
});
`);
}

function run(command: string, args: readonly string[], cwd: string): void {
  try {
    execFileSync(command, [...args], { cwd, encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    const output = error instanceof Error && "stdout" in error
      ? `${String((error as { stdout?: unknown }).stdout ?? "")}${String((error as { stderr?: unknown }).stderr ?? "")}`
      : String(error);
    const message = output.trim().split("\n").slice(-16).join("\n");
    throw new Error(message || `${command} ${args.join(" ")} failed`);
  }
}
