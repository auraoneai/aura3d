/**
 * `aura3d assets optimize` (PRD-05 §6.3, Phase 2).
 *
 * Shells to the lane-owned `tools/asset-optimize` pipeline (gltf-transform +
 * ktx) so the CLI keeps zero new dependencies. The tool's pinned deps live in
 * `tools/asset-optimize/` (CONTRACTS §4.4); on CI `asset-optimize.yml` runs
 * `npm ci` there first.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export interface OptimizeVerbOptions {
  readonly projectDir: string;
  readonly argv: readonly string[];
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

function readFlag(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  const v = i >= 0 ? argv[i + 1] : undefined;
  return v && !v.startsWith("--") ? v : undefined;
}

export function optimizeAssetsVerb(opts: OptimizeVerbOptions): number {
  const { argv, stdout, stderr } = opts;
  const repoRoot = resolve(opts.projectDir);
  const toolEntry = join(repoRoot, "tools", "asset-optimize", "index.ts");
  if (!existsSync(toolEntry)) {
    stderr("tools/asset-optimize/index.ts missing — Phase 2 not installed in this checkout.");
    return 1;
  }

  const positional = argv.filter((a) => !a.startsWith("--") && !["--profile", "--geometry", "--ktx", "--report", "--remote", "--blender"].includes(argv[argv.indexOf(a) - 1] ?? ""));
  const ids = readFlag(argv, "--ids")?.split(",").filter(Boolean) ?? positional;
  const dryRun = argv.includes("--dry-run");
  const args = [
    "--tsconfig", join(repoRoot, "tsconfig.base.json"),
    toolEntry,
    ...(ids.length ? ["--ids", ids.join(",")] : []),
    ...(dryRun ? ["--dry-run"] : []),
    ...(argv.includes("--allow-local-small") ? ["--allow-local-small"] : []),
    ...(argv.includes("--from-generated") ? ["--from-generated"] : []),
    ...["--profile", "--geometry", "--ktx", "--report", "--remote", "--blender"].flatMap((f) => {
      const v = readFlag(argv, f);
      return v ? [f, v] : [];
    })
  ];

  const tsx = join(repoRoot, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  const toolDeps = join(repoRoot, "tools", "asset-optimize", "node_modules", "@gltf-transform");
  if (!existsSync(toolDeps)) {
    stderr("tools/asset-optimize deps not installed — run `npm ci --prefix tools/asset-optimize` (asset-optimize.yml does this on CI).");
    return 1;
  }
  const cmd = existsSync(tsx) ? tsx : "npx";
  const cmdArgs = existsSync(tsx) ? args : ["-y", "tsx", ...args];
  const r = spawnSync(cmd, cmdArgs, { cwd: repoRoot, stdio: "inherit" });
  if (r.error) {
    stderr(`optimize failed to start: ${String(r.error)}`);
    return 1;
  }
  return r.status ?? 1;
}
