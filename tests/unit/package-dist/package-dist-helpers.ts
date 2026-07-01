import { execFileSync } from "node:child_process";

export function importEnginePackageViaNode(repoRoot: string): Record<string, unknown> {
  const script = [
    "const engine = await import('@aura3d/engine');",
    "const resolved = import.meta.resolve('@aura3d/engine');",
    "console.log(JSON.stringify({",
    "  createAuraApp: typeof engine.createAuraApp,",
    "  model: typeof engine.model,",
    "  resolved,",
    "}));",
  ].join("\n");
  return objectRecord(JSON.parse(execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })));
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected JSON object.");
  }
  return Object.fromEntries(Object.entries(value));
}
