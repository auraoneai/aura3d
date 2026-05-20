import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type CreateG3DTemplate =
  | "v4-product-viewer"
  | "v4-material-studio"
  | "v4-asset-gallery"
  | "v4-interactive-scene"
  | "v6-product-viewer"
  | "v6-product-configurator"
  | "v6-asset-inspector"
  | "v6-material-studio"
  | "v6-architecture-viewer"
  | "v6-webgpu-starter";

export interface CreateG3DProjectOptions {
  readonly targetDir: string;
  readonly template?: CreateG3DTemplate;
  readonly packageVersion?: string;
  readonly rootDir?: string;
}

export interface CreateG3DProjectResult {
  readonly targetDir: string;
  readonly template: CreateG3DTemplate;
  readonly files: readonly string[];
}

export function createG3DProject(options: CreateG3DProjectOptions): CreateG3DProjectResult {
  const template = options.template ?? "v4-product-viewer";
  const rootDir = options.rootDir ?? findDefaultTemplateRoot();
  const templateDir = resolve(rootDir, "templates", template);
  if (!existsSync(templateDir)) throw new Error(`Unknown create-g3d template: ${template}`);
  const targetDir = resolve(options.targetDir);
  mkdirSync(targetDir, { recursive: true });
  cpSync(templateDir, targetDir, { recursive: true });
  const packagePath = resolve(targetDir, "package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  packageJson.dependencies = {
    ...(packageJson.dependencies ?? {}),
    "@galileo3d/engine": options.packageVersion ?? "0.1.0-alpha.0"
  };
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  return {
    targetDir,
    template,
    files: [
      "package.json",
      "index.html",
      "src/main.ts",
      "README.md"
    ]
  };
}

export function writeCreateG3DReport(path: string, result: CreateG3DProjectResult): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(result, null, 2)}\n`);
}

function findDefaultTemplateRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
  if (
    existsSync(resolve(current, "templates", "v4-product-viewer")) &&
    existsSync(resolve(current, "templates", "v4-material-studio")) &&
    existsSync(resolve(current, "templates", "v4-asset-gallery")) &&
    existsSync(resolve(current, "templates", "v4-interactive-scene")) &&
    existsSync(resolve(current, "templates", "v6-product-viewer")) &&
    existsSync(resolve(current, "templates", "v6-product-configurator")) &&
    existsSync(resolve(current, "templates", "v6-asset-inspector")) &&
    existsSync(resolve(current, "templates", "v6-material-studio")) &&
    existsSync(resolve(current, "templates", "v6-architecture-viewer")) &&
    existsSync(resolve(current, "templates", "v6-webgpu-starter"))
  ) return current;
    const next = dirname(current);
    if (next === current) break;
    current = next;
  }
  return process.cwd();
}
