// Test double with the same surface the scaffold tool uses from the real create-aura3d.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
export const CREATE_AURA3D_TEMPLATES = ["mini-game", "product-viewer"];
export function resolveTemplateAlias(name) {
  return CREATE_AURA3D_TEMPLATES.includes(name) ? { template: name } : null;
}
export function createA3DProject({ targetDir, template }) {
  mkdirSync(join(targetDir, "src"), { recursive: true });
  writeFileSync(join(targetDir, "package.json"), JSON.stringify({ name: "fixture", template }));
  writeFileSync(join(targetDir, "src", "main.ts"), "// scene\n");
  return { files: ["package.json", "src/main.ts"], missingAssets: [] };
}
