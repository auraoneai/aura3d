#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { CREATE_AURA3D_TEMPLATES, createA3DProject, fetchMissingTemplateAssets, resolveTemplateAlias, templateAliasWarning, type AuraAgentTarget, type AuraSkillMode } from "./index.js";
import { compileShowcaseSpecFile } from "./showcase-spec-compiler.js";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`create-aura3d

Usage:
  create-aura3d demo --template product-viewer
  create-aura3d apps/showcase-demo --spec showcase-spec.json
  create-aura3d demo --template fighting-game --agent all --skills core
  create-aura3d demo --no-agent

Agent files (default --agent all --skills core):
  --agent claude|cursor|copilot|generic|all   write Aura3D skills + llms.txt for these clients
  --skills core|all|none                      core = shared skills + template-specific skills
  --no-agent                                  skip agent skills and llms.txt

Templates:
  ${CREATE_AURA3D_TEMPLATES.join("\n  ")}
`);
  process.exit(0);
}
const targetDir = args.find((arg) => !arg.startsWith("-")) ?? "aura3d-app";
const specPath = readOption("--spec");
if (specPath) {
  const result = compileShowcaseSpecFile({ outputDir: targetDir, specPath });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
  process.exit();
}
const templateArg = readOption("--template") ?? "product-viewer";
const resolvedTemplate = resolveTemplateAlias(templateArg);
if (!resolvedTemplate) {
  console.error(`Unknown template "${templateArg}". Available templates: ${CREATE_AURA3D_TEMPLATES.join(", ")}`);
  process.exit(1);
}
const aliasWarning = templateAliasWarning(resolvedTemplate);
if (aliasWarning) console.error(aliasWarning);
const template = resolvedTemplate.template;
const agentOption = args.includes("--no-agent") ? undefined : (readOption("--agent") ?? "all");
if (agentOption && !["claude", "cursor", "copilot", "generic", "all"].includes(agentOption)) {
  console.error(`Unsupported --agent "${agentOption}". Use claude, cursor, copilot, generic, or all.`);
  process.exit(1);
}
const skillsOption = readOption("--skills") ?? "core";
if (!["core", "all", "none"].includes(skillsOption)) {
  console.error(`Unsupported --skills "${skillsOption}". Use core, all, or none.`);
  process.exit(1);
}
const result = createA3DProject({
  targetDir,
  template,
  agent: agentOption as AuraAgentTarget | undefined,
  skills: skillsOption as AuraSkillMode
});
// No top-level await (lessons-learned B8, pnpm verify:no-tla): the download runs in a promise chain.
if (result.missingAssets.length > 0) {
  // Large template binaries are not in the npm package; fetch them from this version's tagged source tree.
  const version = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;
  const mb = result.missingAssets.reduce((sum, entry) => sum + entry.bytes, 0) / 1048576;
  console.error(`create-aura3d: downloading ${result.missingAssets.length} template asset(s), ${mb.toFixed(1)} MB, for ${template} ${version}`);
  void fetchMissingTemplateAssets(result, { version, log: (line) => console.error(`  ${line}`) }).then((assets) => {
    if (assets.failed.length > 0) {
      console.error(`create-aura3d: ${assets.failed.length} template asset(s) could not be downloaded and verified:`);
      for (const failure of assets.failed) console.error(`  ${failure.path}\n    ${failure.reasons.join("\n    ")}`);
      console.error("Run the same command again when online, or set AURA3D_TEMPLATE_ASSET_BASE to a mirror of packages/create-aura3d.");
      process.exitCode = 1;
    }
    console.log(JSON.stringify({ ...result, missingAssets: assets.failed.map((f) => f.path), fetchedAssets: assets.fetched.map((f) => f.path) }, null, 2));
  });
} else {
  console.log(JSON.stringify(result, null, 2));
}

function readOption(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
