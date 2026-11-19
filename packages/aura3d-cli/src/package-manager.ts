/**
 * Package-manager detection for verbs that run a project's own scripts or
 * binaries (`look capture --runner local`, `animation plan|…|scene`).
 *
 * The project's lockfile decides (nearest one walking up from cwd, so a
 * workspace package uses its workspace root's manager); with no lockfile the
 * manager that launched the CLI (`npm_config_user_agent` / `npm_execpath`)
 * decides; npm is the fallback.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

const LOCKFILES: readonly (readonly [string, PackageManager])[] = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
  ["npm-shrinkwrap.json", "npm"]
];

export interface PackageManagerDetection {
  readonly manager: PackageManager;
  readonly reason: string;
}

export function detectPackageManager(cwd: string, env: NodeJS.ProcessEnv = process.env): PackageManagerDetection {
  let dir = resolve(cwd);
  for (;;) {
    for (const [file, manager] of LOCKFILES) {
      if (existsSync(join(dir, file))) return { manager, reason: `lockfile ${join(dir, file)}` };
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const agent = env.npm_config_user_agent ?? "";
  for (const manager of ["pnpm", "yarn", "bun", "npm"] as const) {
    if (agent.startsWith(`${manager}/`)) return { manager, reason: `npm_config_user_agent ${agent.split(" ")[0]}` };
  }
  const execPath = env.npm_execpath ?? "";
  for (const manager of ["pnpm", "yarn", "bun"] as const) {
    if (execPath.includes(manager)) return { manager, reason: `npm_execpath ${execPath}` };
  }
  return { manager: "npm", reason: "no lockfile found; defaulting to npm" };
}

/** argv to run a project binary: `npx`/`pnpm exec`/`yarn`/`bunx` + bin + args. */
export function execBinaryCommand(manager: PackageManager, bin: string, args: readonly string[]): { readonly command: string; readonly args: readonly string[] } {
  switch (manager) {
    case "pnpm": return { command: "pnpm", args: ["exec", bin, ...args] };
    case "yarn": return { command: "yarn", args: [bin, ...args] };
    case "bun": return { command: "bunx", args: [bin, ...args] };
    default: return { command: "npx", args: ["--no-install", bin, ...args] };
  }
}

/** argv to run a package.json script with forwarded args. */
export function runScriptCommand(manager: PackageManager, script: string, forwarded: readonly string[]): { readonly command: string; readonly args: readonly string[] } {
  const extra = forwarded.length ? (manager === "yarn" || manager === "bun" ? [...forwarded] : ["--", ...forwarded]) : [];
  return { command: manager, args: ["run", script, ...extra] };
}

/** The project's npm scripts (empty when there is no readable package.json). */
export function readPackageScripts(cwd: string): Readonly<Record<string, string>> | undefined {
  const file = join(resolve(cwd), "package.json");
  if (!existsSync(file)) return undefined;
  try {
    const pkg = JSON.parse(readFileSync(file, "utf8")) as { scripts?: Record<string, string> };
    return pkg.scripts ?? {};
  } catch {
    return undefined;
  }
}
