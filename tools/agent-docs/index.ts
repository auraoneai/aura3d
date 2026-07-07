import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { CREATE_AURA3D_TEMPLATES } from "../../packages/create-aura3d/src/index";
import { existsCheck, fileIncludes, noFileMatches, writeReport, type ReleaseCheck } from "../check-common";
import { runAgentSimulation } from "./simulation";

const docs = [
  "llms.txt",
  "docs/agents/README.md",
  "docs/agents/agent-quickstart.md",
  "docs/agents/benchmark-recipes.md",
  "docs/agents/build-playbook.md",
  "docs/agents/verification.md",
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
const cliSource = readFileSync("packages/aura3d-cli/src/cli.ts", "utf8");
const sourceTemplates = [...CREATE_AURA3D_TEMPLATES].sort();
const sourceTemplateValues: readonly string[] = sourceTemplates;
const createTemplateMentions = Array.from(docsText.matchAll(/create-aura3d@latest[^\n`]*--template\s+([a-z0-9-]+)/g), (match) => match[1] ?? "");
const cliCommands = Array.from(docsText.matchAll(/npx\s+@aura3d\/cli@latest\s+([^\n`]+)/g), (match) => normalizeCommand(match[1] ?? ""));
const versionCyclePattern = new RegExp([
  `\\b${"V"}[234]\\b`,
  ["Path", "A"].join(" "),
  ["Path", "B"].join(" ")
].join("|"));
const docsHaveNoVersionCycleFraming = !versionCyclePattern.test(docsText);
const snippetReport = compileTypeScriptSnippets();
const agentSimulation = runAgentSimulation(llmsText);

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
      sourceTemplates.every((template) => docsText.includes(template)) &&
      createTemplateMentions.every((template) => sourceTemplateValues.includes(template)),
    detail: `templates=${sourceTemplates.join(", ")}; create commands=${createTemplateMentions.join(", ")}`
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
    return [
      "add",
      "scan",
      "inspect",
      "validate",
      "validate-game",
      "validate-animation-studio",
      "validate-animation",
      "assemble-character",
      "list",
      "typegen",
      "thumbnail",
      "serve",
      "search",
      "resolve"
    ].includes(second ?? "") && source.includes(`action === "${second}"`);
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
  hero: { type: "model", format: "glb", url: "/aura-assets/hero.glb" },
  sneaker: { type: "model", format: "glb", url: "/aura-assets/sneaker.glb" }
} as const);
`);
  writeFileSync(resolve(outDir, "global.d.ts"), `declare module "*.css";
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
    importsEngine ? "" : "const { createAuraApp, collectAuraSceneEvidence, scene, model, primitives, group, groups, shadows, prefabs, camera, lights, material, effects, timeline, interactions, physics, labels, environments, games, charts, character, city, ui, defineAuraAssets, definePromptPlan, promptPlanToScene, compilePromptPlan, unsafeModelUrl } = AuraDocPrelude;",
    importsAssets ? "" : "const assets = auraDocAssets;",
    "void [AuraDocPrelude, auraDocAssets];"
  ].filter(Boolean).join("\n");
  return `${prelude}\n\n${code}\n`;
}
