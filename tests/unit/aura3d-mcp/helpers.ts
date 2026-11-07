import { chmodSync, cpSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createKnowledge, loadBundle } from "../../../packages/aura3d-mcp/src/docs.js";
import type { ToolContext } from "../../../packages/aura3d-mcp/src/tools.js";

export const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const fixtures = join(repoRoot, "tests", "fixtures", "aura3d-mcp");

/** A throwaway project whose node_modules holds the fixture engine, create-aura3d and aura3d CLI. */
export function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "aura3d-mcp-"));
  cpSync(join(fixtures, "engine"), join(dir, "node_modules", "@aura3d", "engine"), { recursive: true });
  cpSync(join(fixtures, "create-aura3d"), join(dir, "node_modules", "create-aura3d"), { recursive: true });
  mkdirSync(join(dir, "node_modules", ".bin"), { recursive: true });
  const cli = join(fixtures, "cli", "aura3d.mjs");
  chmodSync(cli, 0o755);
  symlinkSync(cli, join(dir, "node_modules", ".bin", "aura3d"));
  mkdirSync(join(dir, "dist"), { recursive: true });
  writeFileSync(join(dir, "dist", "index.html"), "<html></html>");
  writeFileSync(join(dir, "model.glb"), "glb");
  return dir;
}

let knowledge: ReturnType<typeof createKnowledge> | undefined;
export function context(projectDir: string): ToolContext {
  knowledge ??= createKnowledge(loadBundle());
  return { knowledge, defaultProjectDir: projectDir };
}

/** The conservative size check: characters / 3.6 estimates tokens. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 3.6);
