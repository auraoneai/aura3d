/**
 * GU47 phase 2: the `world.water` scene-copy programs carried their device marker in the fragment stage only, so the
 * device threw SHADER_MARKER_MISSING ("prd10.sceneCopy.color") and refracting-water frames drew nothing
 * (aura-diamond-3d, slingshot-siege after-captures). The mock device below applies the device's marker rule.
 */
import { describe, expect, it } from "vitest";
import { FRAME_RESOURCES } from "../../../../packages/rendering/src/contracts/frameGraph";
import { sceneCopyFallbackPass, SCENE_COPY_COLOR_KEY, SCENE_COPY_DEPTH_KEY } from "../../../../packages/rendering/src/world/water/SceneCopyFallback";

interface ProgramSources { readonly label: string; readonly marker: string; readonly vertex: string; readonly fragment: string }

function markerCheckingDevice(programs: ProgramSources[]) {
  const target = (label: string) => ({ label, width: 64, height: 32, colorTexture: { label }, dispose() {} });
  return {
    createShaderProgram(sources: ProgramSources) {
      // Same rule as WebGL2Device.assertShaderMarker / RenderDevice.
      if (!sources.vertex.includes(sources.marker) || !sources.fragment.includes(sources.marker)) {
        throw new Error(`SHADER_MARKER_MISSING ${sources.label}`);
      }
      programs.push(sources);
      return { label: sources.label };
    },
    createBuffer: () => ({}),
    createRenderTarget: (desc: { label: string }) => target(desc.label),
    setRenderTarget() {},
    draw() {}
  };
}

describe("GU47 phase 2 world.water scene copy", () => {
  it("builds both copy programs with the marker in each stage and publishes the copies", () => {
    const programs: ProgramSources[] = [];
    const blackboard = new Map<string, unknown>([[FRAME_RESOURCES.sceneColor, { label: "scene-color" }]]);
    const ctx = { blackboard, sceneDepth: { available: true, texture: { label: "scene-depth" }, linearize: { near: 0.1, far: 300 } } };
    const pass = sceneCopyFallbackPass(ctx as unknown as Parameters<typeof sceneCopyFallbackPass>[0]);
    expect(() => pass.execute({ device: markerCheckingDevice(programs), width: 64, height: 32 } as never)).not.toThrow();
    expect(programs.map((p) => p.label)).toEqual(["prd10.sceneCopy.color", "prd10.sceneCopy.depth"]);
    expect(blackboard.has(SCENE_COPY_COLOR_KEY)).toBe(true);
    expect(blackboard.has(SCENE_COPY_DEPTH_KEY)).toBe(true);
  });
});
