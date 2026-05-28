import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CREATE_AURA3D_TEMPLATES = ["product-viewer", "cinematic-scene", "mini-game"] as const;
export type CreateA3DTemplate = (typeof CREATE_AURA3D_TEMPLATES)[number];

export interface CreateA3DProjectOptions {
  readonly targetDir: string;
  readonly template?: CreateA3DTemplate;
  readonly packageVersion?: string;
  readonly rootDir?: string;
}

export interface CreateA3DProjectResult {
  readonly targetDir: string;
  readonly template: CreateA3DTemplate;
  readonly files: readonly string[];
}

export function createA3DProject(options: CreateA3DProjectOptions): CreateA3DProjectResult {
  const template = options.template ?? "product-viewer";
  if (!CREATE_AURA3D_TEMPLATES.includes(template)) {
    throw new Error(`Unknown create-aura3d template: ${template}. Available templates: ${CREATE_AURA3D_TEMPLATES.join(", ")}`);
  }
  const rootDir = options.rootDir ?? findDefaultTemplateRoot();
  const templateDir = resolve(rootDir, "templates", template);
  if (!existsSync(templateDir)) throw new Error(`Unknown create-aura3d template: ${template}`);
  const targetDir = resolve(options.targetDir);
  mkdirSync(targetDir, { recursive: true });
  cpSync(templateDir, targetDir, {
    recursive: true,
    filter: (source) => !relative(templateDir, source).split(/[\\/]/).some((part) => part === "node_modules" || part === "dist")
  });
  const packagePath = resolve(targetDir, "package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  packageJson.dependencies = {
    ...(packageJson.dependencies ?? {}),
    "@aura3d/engine": options.packageVersion ?? "1.0.0"
  };
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  return {
    targetDir,
    template,
    files: listTemplateFiles(targetDir)
  };
}

export function writeCreateA3DReport(path: string, result: CreateA3DProjectResult): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(result, null, 2)}\n`);
}

function listTemplateFiles(targetDir: string): readonly string[] {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else files.push(path.replace(`${targetDir}/`, ""));
    }
  };
  visit(targetDir);
  return files.sort();
}

function findDefaultTemplateRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    if (CREATE_AURA3D_TEMPLATES.every((template) => existsSync(resolve(current, "templates", template)))) return current;
    const next = dirname(current);
    if (next === current) break;
    current = next;
  }
  return process.cwd();
}
