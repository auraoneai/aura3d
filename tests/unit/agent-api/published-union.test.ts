import { describe, expect, it } from "vitest";
import * as ts from "typescript";
import { join } from "node:path";

// PRD-15 T1.4: published "." (packages/engine/src/agent-api/index.ts) must be the
// union of every name the in-repo "." view (packages/engine/src/index.ts) exports.
// The in-repo index reaches the same decls via `export * from "./agent-api/index.js"`,
// ./agent-api/engineSurface.ts and ./agent-api/publishedUnion.ts; this test pins the
// equality so a drift between the two barrels fails immediately.

const root = join(__dirname, "..", "..", "..");
const ENGINE_INDEX = join(root, "packages/engine/src/index.ts");
const AGENT_API_INDEX = join(root, "packages/engine/src/agent-api/index.ts");

function exportNames(entry: string): string[] {
  const program = ts.createProgram({
    rootNames: [entry],
    options: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: false,
      noEmit: true,
      skipLibCheck: true,
      allowJs: true
    }
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entry);
  if (!source) throw new Error(`${entry} not in program`);
  const symbol = checker.getSymbolAtLocation(source);
  if (!symbol) throw new Error(`${entry} has no module symbol`);
  return checker.getExportsOfModule(symbol).map((e) => e.name).sort();
}

describe("published union (PRD-15 T1.4)", () => {
  it("in-repo and published \".\" export identical name sets", () => {
    const inRepo = exportNames(ENGINE_INDEX);
    const published = exportNames(AGENT_API_INDEX);
    const missing = inRepo.filter((name) => !published.includes(name));
    const extra = published.filter((name) => !inRepo.includes(name));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    expect(inRepo.length).toBeGreaterThan(0);
    expect(inRepo.length).toEqual(published.length);
  });
});
