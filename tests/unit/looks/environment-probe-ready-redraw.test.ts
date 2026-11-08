/**
 * N2 review: a static scene draws on demand, so an environment probe that binds after the first frame must schedule a
 * frame (`onEnvironmentProbeReady`), or the uniform floor probe stays on screen (seen on real GPU with an explicit
 * `environments.neutral()` in examples/materials-glass-steel: steel stayed flat until any unrelated redraw).
 */
import { describe, expect, it } from "vitest";
import "@aura3d/engine";
import { environments } from "@aura3d/engine";
import { compileScene, updateCompiledScene } from "@aura3d/engine-runtime/contracts";
import type { MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import type { AuraSceneSnapshot, AuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/nodes/types";
import type { CollectedLight } from "@aura3d/rendering";

const SNAPSHOT = {
  schema: "aura3d-scene-snapshot/1.0",
  background: "#000000",
  camera: { mode: "orbit", position: [0, 2, 5], target: [0, 0, 0] },
  diagnostics: { enabled: false },
  nodes: [
    { kind: "primitive", primitive: "sphere", name: "s", size: 1 },
    environments.studio({ preset: "softbox" }).toJSON()
  ]
} as unknown as AuraSceneSnapshot;

describe("N2: an environment probe bound after mount schedules a frame", () => {
  it("calls onEnvironmentProbeReady once the embedded probe replaces the floor", async () => {
    const { MockRenderDevice } = await import("../../../packages/rendering/src/RenderDevice");
    let ready = 0;
    const ctx: MountSceneCompileContext = {
      renderer: { device: new MockRenderDevice() } as MountSceneCompileContext["renderer"],
      assets: undefined,
      quality: { tier: "low" } as MountSceneCompileContext["quality"],
      strict: false,
      flags: resolveQrFlags({ options: ["compiler", "lighting"] }),
      degrade: () => undefined,
      canvas: { width: 800, height: 600 } as unknown as HTMLCanvasElement,
      environmentLighting: () => ({ color: [1, 1, 1], intensity: 1 }),
      collectedLights: [] as readonly CollectedLight[],
      runtimeWarnings: new Set<string>(),
      onEnvironmentProbeReady: () => { ready += 1; }
    };
    const compiled = await compileScene(SNAPSHOT, ctx);
    const nodes = { get: () => undefined } as unknown as AuraRuntimeNodeRegistry;
    const first = updateCompiledScene(compiled, SNAPSHOT, nodes, 0) as { environmentProbe?: { source?: string } };
    expect(first.environmentProbe?.source).toBe("neutral");
    for (let i = 0; i < 300 && ready === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(ready).toBe(1);
    const next = updateCompiledScene(compiled, SNAPSHOT, nodes, 1 / 60) as { environmentProbe?: { source?: string } };
    expect(next.environmentProbe?.source).toBe("preset");
    compiled.dispose();
  }, 30_000);
});
