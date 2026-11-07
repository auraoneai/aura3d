import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const BACKEND = "@dimforge/rapier3d-compat";
export const PHYSICS_BACKEND_INSTALL_COMMAND = `npm install ${BACKEND}@0.20.0`;
const PHYSICS_USE = /\.physics\s*\(|\bapp\.physics\b|\bpreloadPhysics\b|\bPhysicsWorld\b|\bphysics\s*:\s*\{/u;

function sourceFiles(directory: string, depth = 0, found: string[] = []): string[] {
  if (depth > 6 || found.length > 400 || !existsSync(directory)) return found;
  for (const name of readdirSync(directory)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const path = join(directory, name);
    const stats = statSync(path);
    if (stats.isDirectory()) sourceFiles(path, depth + 1, found);
    else if (/\.(?:ts|tsx|mts|js|jsx|mjs)$/u.test(name) && !name.endsWith(".d.ts") && stats.size < 512 * 1024) found.push(path);
  }
  return found;
}

/**
 * Lint-time signal for the typed PHYSICS_BACKEND_MISSING runtime error: a project whose sources call `.physics(...)`,
 * `app.physics` or `PhysicsWorld` must be able to resolve the Rapier backend. Returns one failure line (with the exact
 * install command) or an empty list.
 */
export function physicsBackendFailures(projectDir: string): string[] {
  const root = resolve(projectDir);
  const used = sourceFiles(join(root, "src")).filter((file) => PHYSICS_USE.test(readFileSync(file, "utf8")));
  if (used.length === 0) return [];
  let resolvable = false;
  try {
    createRequire(join(root, "package.json")).resolve(`${BACKEND}/package.json`);
    resolvable = true;
  } catch { /* not installed */ }
  if (!resolvable) {
    // Some package exports maps hide package.json; fall back to the installed directory.
    resolvable = existsSync(join(root, "node_modules", BACKEND, "package.json"));
  }
  return resolvable ? [] : [`PHYSICS_BACKEND_MISSING: ${used.length} source file(s) use Aura3D physics (first: ${used[0]!.slice(root.length + 1)}) but ${BACKEND} is not installed. Run: ${PHYSICS_BACKEND_INSTALL_COMMAND}`];
}
