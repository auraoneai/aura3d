#!/usr/bin/env node
import { CREATE_AURA3D_TEMPLATES, createA3DProject, type AuraAgentTarget, type AuraSkillMode, type CreateA3DTemplate } from "./index.js";
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
const template = readOption("--template") ?? "product-viewer";
if (!CREATE_AURA3D_TEMPLATES.includes(template as CreateA3DTemplate)) {
  console.error(`Unknown template "${template}". Available templates: ${CREATE_AURA3D_TEMPLATES.join(", ")}`);
  process.exit(1);
}
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
  template: template as CreateA3DTemplate,
  agent: agentOption as AuraAgentTarget | undefined,
  skills: skillsOption as AuraSkillMode
});
console.log(JSON.stringify(result, null, 2));

function readOption(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
