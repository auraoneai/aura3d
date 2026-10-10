#!/usr/bin/env node
import { CREATE_AURA3D_TEMPLATES, createA3DProject, resolveTemplateAlias, type AuraAgentTarget, type AuraSkillMode } from "./index.js";
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
const resolved = resolveTemplateAlias(templateArg);
if (!resolved) {
  console.error(`Unknown template "${templateArg}". Available templates: ${CREATE_AURA3D_TEMPLATES.join(", ")}`);
  process.exit(1);
}
if (resolved.deprecated) {
  console.error(`Template "${resolved.deprecated}" renamed; "${resolved.deprecated}" alias removed in the next minor — use "${resolved.template}".`);
}
const template = resolved.template;
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
console.log(JSON.stringify(result, null, 2));

function readOption(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
