/**
 * T0-12 (PRD-16 §2): mount-phase timing marks exist end-to-end — the engine
 * marks each mount phase and the bench harness copies them into
 * payload.extra.mountTiming so one remote run names the ~90 s slow phase.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../../..");
const createAuraApp = readFileSync(join(root, "packages/engine/src/agent-api/app/createAuraApp.ts"), "utf8");
const frameLoop = readFileSync(join(root, "packages/engine/src/agent-api/app/frameLoop.ts"), "utf8");
const compilerRenderer = readFileSync(join(root, "packages/engine/src/agent-api/compiler/renderer.ts"), "utf8");
const platform = readFileSync(join(root, "packages/engine/src/agent-api/platform.ts"), "utf8");
const common = readFileSync(join(root, "benchmarks/quality-rebuild/aura3d/common.ts"), "utf8");

describe("T0-12 mount timing marks", () => {
  it("platform exports a no-op-safe markTiming helper", () => {
    expect(platform).toContain("export function markTiming(name: string): void");
    expect(platform).toContain("globalThis.performance?.mark?.(name)");
  });

  it("createAuraApp marks start, mount start, resolved and catch", () => {
    for (const mark of ["a3d:mount:create-app-start", "a3d:mount:start", "a3d:mount:renderer-resolved", "a3d:mount:catch"]) {
      expect(createAuraApp).toContain(`markTiming("${mark}")`);
    }
  });

  it("compiler/renderer marks Renderer.create and compileScene resolution", () => {
    for (const mark of ["a3d:mount:renderer-create:start", "a3d:mount:renderer-create:resolved", "a3d:mount:compile-scene:start", "a3d:mount:compile-scene:resolved"]) {
      expect(compilerRenderer).toContain(`markTiming("${mark}")`);
    }
  });

  it("frameLoop marks the first renderFrame", () => {
    expect(frameLoop).toContain('markTiming("a3d:mount:first-renderFrame")');
  });

  it("the harness copies a3d: marks into payload.extra.mountTiming", () => {
    expect(common).toContain("mountTiming:");
    expect(common).toContain('performance.getEntriesByType("mark")');
    expect(common).toContain('mark.name.startsWith("a3d:")');
  });
});
