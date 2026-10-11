// Look HDRIs for scaffolded projects. Every look preset references
// `/hdri/<file>.hdr` (packages/engine/src/agent-api/looks/looks.ts HDRI_ASSET),
// so a template that authors a look must ship those files under public/hdri/
// or its IBL/sky 404s. The single source is packages/create-aura3d/hdri/
// (Poly Haven CC0 originals, see hdri/ATTRIBUTION.md).

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Directory name of the HDRI set inside the create-aura3d package root. */
export const TEMPLATE_HDRI_DIR = "hdri";
export const TEMPLATE_HDRI_ATTRIBUTION = "ATTRIBUTION.md";

const LOOK_AUTHORING = /\blooks\.(preset|nodes)\(/;
const SOURCE_FILE = /\.(ts|tsx|js|mjs)$/;

/** True when any source file under `<projectDir>/src` calls `looks.preset(` or `looks.nodes(`. */
export function templateAuthorsLook(projectDir: string): boolean {
  const src = join(projectDir, "src");
  if (!existsSync(src)) return false;
  const stack = [src];
  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const file = join(current, entry.name);
      if (entry.isDirectory()) stack.push(file);
      else if (SOURCE_FILE.test(entry.name) && LOOK_AUTHORING.test(readFileSync(file, "utf8"))) return true;
    }
  }
  return false;
}

/**
 * Copy every `.hdr` in `hdriDir` plus ATTRIBUTION.md into `<projectDir>/public/hdri/`.
 * Returns the copied paths relative to `projectDir`. Throws when the source set is
 * missing or empty: a look-authoring scaffold without its HDRIs is broken.
 */
export function copyTemplateHdris(hdriDir: string, projectDir: string): string[] {
  const hdrs = existsSync(hdriDir) ? readdirSync(hdriDir).filter((name) => name.endsWith(".hdr")).sort() : [];
  if (hdrs.length === 0) throw new Error(`create-aura3d: no look HDRIs found in ${hdriDir}`);
  const target = join(projectDir, "public", "hdri");
  mkdirSync(target, { recursive: true });
  const copied: string[] = [];
  for (const file of [...hdrs, TEMPLATE_HDRI_ATTRIBUTION]) {
    cpSync(join(hdriDir, file), join(target, file));
    copied.push(`public/hdri/${file}`);
  }
  return copied;
}
