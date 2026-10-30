import { describe, expect, it } from "vitest";
import { lights, primitives, type AuraSceneNode } from "@aura3d/engine";
import type { CollectedLight } from "@aura3d/rendering";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { CompiledSceneImpl, type MountSceneCompileContext } from "../../../../packages/engine/src/agent-api/compiler/compileScene";
import { createRuntimeAddedCollectedLights } from "../../../../packages/engine/src/agent-api/compiler/observations";
import { runtimeLightBinding, updateRuntimeLight } from "../../../../packages/engine/src/agent-api/compiler/lights";
import { resolveMountQuality } from "../../../../packages/engine/src/agent-api/compiler/renderer";

/**
 * GU47 eint EB-4 (E-B handoff, `compileScene.ts addSubtree/removeSubtree`): a light node added at runtime
 * (`app.nodes.add(lights.*)` on the compiled path) gets a collected light bound to its node, joins the frame's light
 * list (`mountCtx.collectedLights`, which the renderer input and the light handler's per-frame update read) and leaves
 * it with its subtree. Runtime-added lights never cast shadows; ambient / hemisphere nodes add none.
 */

const PHYSICAL = resolveQrFlags({ options: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true } });
const LEGACY = resolveQrFlags({ options: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: false } });

const node = (builder: { toJSON(): unknown }) => builder.toJSON() as AuraSceneNode;

function compiledWith(flags: ReturnType<typeof resolveQrFlags>, mountLights: readonly CollectedLight[]) {
  const ctx = {
    renderer: undefined,
    assets: undefined,
    quality: resolveMountQuality(undefined),
    strict: false,
    flags,
    degrade: () => undefined,
    canvas: { width: 64, height: 64 } as HTMLCanvasElement,
    environmentLighting: () => ({ color: [1, 1, 1], intensity: 0 }),
    collectedLights: mountLights,
    runtimeWarnings: new Set<string>()
  } as unknown as MountSceneCompileContext;
  const compiled = new CompiledSceneImpl(1, null, [], new Set(), [], [], [], [], ctx, [], []);
  return { compiled, ctx };
}

describe("GU47 eint EB-4: runtime-added light nodes", () => {
  const mountLight = { kind: "directional", castsShadow: true } as unknown as CollectedLight;

  it("a point light added at runtime joins the frame's light list, bound to its node, and leaves with its subtree", () => {
    const { compiled, ctx } = compiledWith(PHYSICAL, [mountLight]);
    compiled.addSubtree(node(lights.point({ name: "torch", position: [1, 2, 3], intensity: 4, shadow: true }).runtime({ id: "torch" })));
    expect(ctx.collectedLights).toHaveLength(2);
    expect(ctx.collectedLights[0]).toBe(mountLight);
    const torch = ctx.collectedLights[1]!;
    expect(torch.kind).toBe("point");
    expect(torch.castsShadow).toBe(false);
    expect(torch.position).toEqual([1, 2, 3]);
    expect(runtimeLightBinding(torch)?.runtimeId).toBe("torch");

    expect(compiled.removeSubtree("torch")).toBe(true);
    expect(ctx.collectedLights).toEqual([mountLight]);
  });

  it("the light handler's per-frame update drives the added light from its handle (setVisible(false) zeroes it)", () => {
    const { compiled, ctx } = compiledWith(PHYSICAL, []);
    const lamp = node(lights.spot({ name: "lamp", position: [0, 4, 0], intensity: 6 }).runtime({ id: "lamp" }));
    compiled.addSubtree(lamp);
    const [light] = ctx.collectedLights;
    expect(light).toBeDefined();
    const handle = { id: "lamp", version: 2, visible: false, position: [0, 4, 0] as [number, number, number], setPosition: () => undefined };
    updateRuntimeLight(lamp as never, handle, ctx.collectedLights, 0);
    expect(light!.intensity).toBe(0);
  });

  it("ambient and hemisphere nodes, and non-light subtrees, leave the light list untouched", () => {
    const { compiled, ctx } = compiledWith(PHYSICAL, [mountLight]);
    const before = ctx.collectedLights;
    compiled.addSubtree(node(lights.ambient({ intensity: 0.3 }).runtime({ id: "amb" })));
    compiled.addSubtree(node(primitives.box({ name: "crate" }).runtime({ id: "crate" })));
    expect(ctx.collectedLights).toBe(before);
    expect(compiled.removeSubtree("crate")).toBe(true);
    expect(ctx.collectedLights).toBe(before);
  });

  it("the legacy descriptor path (lighting lane off) builds the added light the same way", () => {
    const added = createRuntimeAddedCollectedLights([node(lights.point({ name: "bulb", position: [0, 1, 0] }).runtime({ id: "bulb" }))], LEGACY, { hemisphereAsEnvironment: true });
    expect(added).toHaveLength(1);
    expect(added[0]!.lights[0]!.kind).toBe("point");
    expect(added[0]!.lights.every((light) => light.castsShadow === false)).toBe(true);
    expect(runtimeLightBinding(added[0]!.lights[0]!)?.runtimeId).toBe("bulb");
  });
});
