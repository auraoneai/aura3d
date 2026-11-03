// This suite verifies lowering of valid, explicitly chosen authored values.
// Compile-only results are not rendered or visual evidence.
import "@aura3d/engine";
import { describe, expect, it } from "vitest";
import { compileScene, asRuntimeCompiled } from "@aura3d/engine/contracts";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { scene } from "../../../../packages/engine/src/agent-api/nodes/scene";
import { primitives } from "../../../../packages/engine/src/agent-api/nodes/primitives";
import { OPTION_COVERAGE_ROWS } from "../../../../packages/engine/src/agent-api/compiler/optionCoverage";
import type { MountSceneCompileContext } from "../../../../packages/engine/src/agent-api/compiler/compileScene";

const mountCtx = (): MountSceneCompileContext => ({
  renderer: undefined,
  assets: undefined,
  quality: { tier: "high" } as MountSceneCompileContext["quality"],
  strict: false,
  flags: resolveQrFlags({ options: ["compiler"] }),
  degrade: () => {},
  canvas: { width: 800, height: 600 } as unknown as HTMLCanvasElement,
  environmentLighting: () => ({ color: [0, 0, 0], intensity: 0 }),
  collectedLights: [],
  runtimeWarnings: new Set<string>()
});

describe("option coverage: compiler lowering only", () => {
  it("carries the authored plane size to its runtime primitive entry", async () => {
    const row = OPTION_COVERAGE_ROWS.find((candidate) => candidate.builder === "primitives.plane" && candidate.field === "size")!;
    expect(row.observation).toBe("primitive.size");
    const lower = async (size: unknown) => {
      const compiled = await compileScene(scene().add(primitives.plane({ size: size as [number, number, number] })).toJSON(), mountCtx());
      try {
        const runtime = asRuntimeCompiled(compiled);
        if (!runtime) throw new Error("real compiler did not provide runtime state");
        const entry = runtime.primitiveEntries[0] as { readonly node: { readonly size?: unknown } } | undefined;
        return entry?.node.size;
      } finally {
        compiled.dispose();
      }
    };
    expect(await lower(row.probeValueA)).toEqual([1, 1, 1]);
    expect(await lower(row.probeValueB)).toEqual([2, 1, 3]);
  });

  it("turns an unread option into an actionable compiler degradation", async () => {
    const degradations: { code: string; message: string }[] = [];
    const ctx = { ...mountCtx(), degrade: (entry: { code: string; message: string }) => degradations.push(entry) };
    const compiled = await compileScene(scene().add(primitives.plane({ segments: 8 } as never)).toJSON(), ctx);
    try {
      expect(degradations).toHaveLength(1);
      expect(degradations[0]?.code).toBe("option-ignored");
      expect(degradations[0]?.message).toMatch(/OPTION_IGNORED primitives\.plane.*"segments".*Valid options:/);
    } finally {
      compiled.dispose();
    }
  });
});
