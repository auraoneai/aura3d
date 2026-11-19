// Loads the @aura3d/cli generate implementation for the tools/idol wrappers: the TypeScript source through tsx (always
// current in this checkout), falling back to the built packages/aura3d-cli/dist.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export async function loadGenerateImpl() {
  const source = join(root, "packages/aura3d-cli/src/commands/generate/index.ts");
  const built = join(root, "packages/aura3d-cli/dist/commands/generate/index.js");
  if (existsSync(source)) {
    try {
      const { tsImport } = await import("tsx/esm/api");
      const noDeprecation = process.noDeprecation;
      process.noDeprecation = true; // tsx registers through module.register(), deprecated on Node 26
      try {
        // tsconfig.base.json maps every @aura3d/* specifier to its src/ (the package exports point at dist/).
        return await tsImport(pathToFileURL(source).href, { parentURL: import.meta.url, tsconfig: join(root, "tsconfig.base.json") });
      } finally {
        process.noDeprecation = noDeprecation;
      }
    } catch (error) {
      if (!existsSync(built)) throw error;
    }
  }
  if (existsSync(built)) return import(pathToFileURL(built).href);
  throw new Error("Cannot load the @aura3d/cli generate implementation: install dependencies (pnpm install) or build the CLI (pnpm build).");
}
