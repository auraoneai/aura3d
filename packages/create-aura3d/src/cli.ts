#!/usr/bin/env node
import { CREATE_AURA3D_TEMPLATES, createA3DProject, type CreateA3DTemplate } from "./index.js";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`create-aura3d

Usage:
  create-aura3d demo --template product-viewer

Templates:
  ${CREATE_AURA3D_TEMPLATES.join("\n  ")}
`);
  process.exit(0);
}
const targetDir = args.find((arg) => !arg.startsWith("-")) ?? "aura3d-app";
const template = readOption("--template") ?? "product-viewer";
if (!CREATE_AURA3D_TEMPLATES.includes(template as CreateA3DTemplate)) {
  console.error(`Unknown template "${template}". Available templates: ${CREATE_AURA3D_TEMPLATES.join(", ")}`);
  process.exit(1);
}
const result = createA3DProject({ targetDir, template: template as CreateA3DTemplate });
console.log(JSON.stringify(result, null, 2));

function readOption(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
