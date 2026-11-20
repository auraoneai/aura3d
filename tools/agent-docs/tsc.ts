import { createRequire } from "node:module";
import { resolve } from "node:path";

/**
 * The TypeScript compiler's own bin script, resolved from the repo root's dependencies. The agent-docs check runs it
 * with the current Node instead of `pnpm exec tsc`: in a git worktree whose `node_modules` is a symlink, pnpm 11's
 * pre-run dependency check tries to reinstall, aborts ("Aborted removal of modules directory due to no TTY") and
 * the snippet compile reported that abort as a type error.
 */
export function tscBin(root: string = process.cwd()): string {
  return createRequire(resolve(root, "package.json")).resolve("typescript/bin/tsc");
}

/** `[command, args]` for `tsc <args>` that needs no package manager. */
export function tscInvocation(args: readonly string[], root: string = process.cwd()): readonly [string, readonly string[]] {
  return [process.execPath, [tscBin(root), ...args]];
}
