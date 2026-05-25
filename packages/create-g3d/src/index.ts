import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type CreateG3DTemplate =
  | "external-parity-product-viewer"
  | "external-parity-material-studio"
  | "external-parity-asset-gallery"
  | "external-parity-interactive-scene"
  | "production-product-viewer"
  | "production-product-configurator"
  | "production-asset-inspector"
  | "production-material-studio"
  | "production-architecture-viewer"
  | "production-webgpu-starter";

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
  const template = options.template ?? "external-parity-product-viewer";
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
    existsSync(resolve(current, "templates", "external-parity-product-viewer")) &&
    existsSync(resolve(current, "templates", "external-parity-material-studio")) &&
    existsSync(resolve(current, "templates", "external-parity-asset-gallery")) &&
    existsSync(resolve(current, "templates", "external-parity-interactive-scene")) &&
    existsSync(resolve(current, "templates", "production-product-viewer")) &&
    existsSync(resolve(current, "templates", "production-product-configurator")) &&
    existsSync(resolve(current, "templates", "production-asset-inspector")) &&
    existsSync(resolve(current, "templates", "production-material-studio")) &&
    existsSync(resolve(current, "templates", "production-architecture-viewer")) &&
    existsSync(resolve(current, "templates", "production-webgpu-starter"))
  ) return current;
    const next = dirname(current);
    if (next === current) break;
    current = next;
  }
  return process.cwd();
}
