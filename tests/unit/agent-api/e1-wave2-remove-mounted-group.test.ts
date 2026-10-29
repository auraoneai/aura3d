// Lane E1 wave 2 (handoff from E2): under A3D_QR_COMPILER, app.nodes.remove(id) on a mounted group or look removes the
// flattened descendants and what their handlers contributed at compile time (Cross Hop swapLook kept theme-0 lighting live).
import { describe, expect, it } from "vitest";
import "@aura3d/engine";
import { compileScene, updateCompiledScene, registerNodeHandler } from "../../../packages/engine/src/contracts/compiler";
import type { MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { asRuntimeImpl } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { primitive } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { groups } from "../../../packages/engine/src/agent-api/nodes/groups";
import type { AuraSceneNode, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import type { CollectedLight, RenderItem } from "@aura3d/rendering";

const mountCtx = (flags: ReturnType<typeof resolveQrFlags>, runtimeNodes?: unknown): MountSceneCompileContext =>
  ({
    renderer: undefined,
    assets: undefined,
    quality: { tier: "high" } as MountSceneCompileContext["quality"],
    strict: false,
    flags,
    degrade: () => undefined,
    canvas: { width: 800, height: 600 } as never,
    environmentLighting: () => ({}),
    collectedLights: [] as readonly CollectedLight[],
    runtimeWarnings: new Set<string>(),
    ...(runtimeNodes ? { runtimeNodes } : {})
  }) as unknown as MountSceneCompileContext;

const labelsOf = (source: unknown): string[] => {
  const s = source as { collectRenderItems?: () => Iterable<RenderItem>; renderItems?: RenderItem[] };
  return [...(s.collectRenderItems ? s.collectRenderItems() : s.renderItems ?? [])].map((item) => item.label ?? "");
};

const lookScene = (): AuraSceneSnapshot =>
  scene()
    .add(primitive("box", { name: "floor", position: [0, 0, 0], size: 1 }).runtime({ id: "floor" }))
    .add(
      groups.create("look-group", [
        primitive("box", { name: "look-a", position: [1, 0, 0], size: 1 }),
        groups.create("inner", [primitive("box", { name: "look-b", position: [2, 0, 0], size: 1 })])
      ]).runtime({ id: "look" })
    )
    .toJSON() as AuraSceneSnapshot;

describe("E1 wave 2: remove a mounted group under A3D_QR_COMPILER", () => {
  it("removes every flattened descendant of the group, keeps the rest", async () => {
    const snapshot = lookScene();
    const registry = createAuraRuntimeNodeRegistry(snapshot);
    const flags = resolveQrFlags({ options: ["compiler"] });
    const compiled = await compileScene(snapshot, mountCtx(flags, registry));
    registry.attachCompiled(compiled);
    registry.configure({ flags, getScene: () => snapshot, setScene: () => undefined });
    const impl = asRuntimeImpl(compiled)!;

    const before = labelsOf(updateCompiledScene(compiled, snapshot, registry, 0));
    expect(before.some((l) => l.includes("look-a"))).toBe(true);
    expect(before.some((l) => l.includes("look-b"))).toBe(true);
    const liveBefore = impl.liveNodes.length;

    expect(registry.remove("look")).toBe(true);
    expect(impl.liveNodes.length).toBe(liveBefore - 2);
    const after = labelsOf(updateCompiledScene(compiled, snapshot, registry, 0));
    expect(after.some((l) => l.includes("look-a"))).toBe(false);
    expect(after.some((l) => l.includes("look-b"))).toBe(false);
    expect(after.some((l) => l.includes("floor"))).toBe(true);
    compiled.dispose();
  });

  it("the per-root flatten equals the whole-list flatten (same node count and order of names)", async () => {
    const snapshot = lookScene();
    const flags = resolveQrFlags({ options: ["compiler"] });
    const compiled = await compileScene(snapshot, mountCtx(flags));
    const impl = asRuntimeImpl(compiled)!;
    const names = (nodes: readonly AuraSceneNode[]) => nodes.map((n) => (n as { name?: string }).name);
    expect(names(impl.liveNodes)).toEqual(names(groups.flatten(snapshot.nodes)));
    compiled.dispose();
  });

  it("takes back the compile-time items, lights and overrides of the removed nodes only", async () => {
    const lightOf = new Map<string, CollectedLight>();
    const itemOf = new Map<string, RenderItem>();
    const unregister = registerNodeHandler({
      kind: "primitive",
      owner: "prd02",
      flag: "A3D_QR_LIGHTING",
      compile(node, _ctx, out) {
        const name = String((node as { name?: string }).name);
        const item = { label: `contrib:${name}`, draw: () => undefined } as unknown as RenderItem;
        const light = { kind: "point", position: [0, 0, 0], name } as unknown as CollectedLight;
        itemOf.set(name, item);
        lightOf.set(name, light);
        out.addItems([item]);
        out.addLights([light]);
        if (name === "look-a") out.set("lookMarker", "theme-0" as never);
      }
    });
    try {
      const snapshot = lookScene();
      const registry = createAuraRuntimeNodeRegistry(snapshot);
      const flags = resolveQrFlags({ options: ["compiler", "lighting"] });
      const compiled = await compileScene(snapshot, mountCtx(flags, registry));
      registry.attachCompiled(compiled);
      registry.configure({ flags, getScene: () => snapshot, setScene: () => undefined });
      type Src = { collectRenderItems?: () => Iterable<RenderItem>; collectedLights?: CollectedLight[]; lookMarker?: unknown };
      const s0 = compiled.source as Src;
      expect([...(s0.collectRenderItems?.() ?? [])]).toContain(itemOf.get("look-a"));
      expect(s0.lookMarker).toBe("theme-0");

      registry.remove("look");
      const s1 = updateCompiledScene(compiled, snapshot, registry, 1) as Src;
      const items = [...(s1.collectRenderItems?.() ?? [])];
      expect(items).not.toContain(itemOf.get("look-a"));
      expect(items).not.toContain(itemOf.get("look-b"));
      expect(items).toContain(itemOf.get("floor"));
      expect(s1.collectedLights ?? []).not.toContain(lightOf.get("look-a"));
      expect(s1.collectedLights ?? []).toContain(lightOf.get("floor"));
      expect(s1.lookMarker).toBeUndefined();
      compiled.dispose();
    } finally {
      unregister();
    }
  });

  it("a remount after the removal does not bring the removed mounted group back", async () => {
    const snapshot = lookScene();
    const registry = createAuraRuntimeNodeRegistry(snapshot);
    const flags = resolveQrFlags({ options: ["compiler"] });
    const compiled = await compileScene(snapshot, mountCtx(flags, registry));
    registry.attachCompiled(compiled);
    registry.configure({ flags, getScene: () => snapshot, setScene: () => undefined });
    registry.remove("look");
    registry.add(primitive("box", { name: "look-new", position: [3, 0, 0], size: 1 }).runtime({ id: "look" }));
    const next = registry.sceneWithRuntimeAdditions()!;
    const ids = next.nodes.map((n) => ("runtime" in n ? n.runtime?.id : undefined));
    expect(ids.filter((id) => id === "look")).toHaveLength(1);
    expect((next.nodes.find((n) => "runtime" in n && n.runtime?.id === "look") as { name?: string }).name).toBe("look-new");
    compiled.dispose();
  });
});
