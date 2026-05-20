import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const commands = [
  ["pnpm", ["--silent", "tsx", "--tsconfig", "tsconfig.base.json", "tools/v3-claim-gates/index.ts"]],
  ["pnpm", ["--silent", "tsx", "--tsconfig", "tsconfig.base.json", "tools/example-truth-audit/index.ts"]],
  ["pnpm", ["--silent", "tsx", "--tsconfig", "tsconfig.base.json", "tools/v3-current-capability/index.ts"]],
] as const;

export function runV3CodeGate(): number {
  let exitCode = 0;
  for (const [command, args] of commands) {
    const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
    if (result.status !== 0) exitCode = result.status ?? 1;
  }
  return exitCode;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = runV3CodeGate();
}
