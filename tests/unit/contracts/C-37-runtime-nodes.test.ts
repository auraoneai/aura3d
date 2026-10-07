import { describe, expect, it } from "vitest";
import "@aura3d/engine";
import { compileScene, updateCompiledScene } from "@aura3d/engine/contracts";
import type { MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { asRuntimeImpl } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { primitive } from "../../../packages/engine/src/agent-api/nodes/primitives";
import type { AuraSceneSnapshot, AuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/nodes/types";
import type { CollectedLight, EnvironmentLightingOptions, RenderItem } from "@aura3d/rendering";

const stubCanvas = () => ({ width: 800, height: 600 }) as unknown as HTMLCanvasElement;
const stubLighting = () => ({}) as EnvironmentLightingOptions;

function mountCtx(flags: ReturnType<typeof resolveQrFlags>, runtimeNodes?: AuraRuntimeNodeRegistry): MountSceneCompileContext {
  const runtimeWarnings = new Set<string>();
  return {
    renderer: undefined,
    assets: undefined,
    quality: { tier: "high" } as MountSceneCompileContext["quality"],
    strict: flags.on("A3D_QR_STRICT"),
    flags,
    degrade: (d) => { runtimeWarnings.add(`${d.code}:${d.nodeId ?? ""}`); },
    canvas: stubCanvas(),
    environmentLighting: stubLighting,
    collectedLights: [] as readonly CollectedLight[],
    runtimeWarnings,
    ...(runtimeNodes ? { runtimeNodes } : {})
  };
}

const taggedPrimitive = (name: string, i: number) =>
  primitive("box", { name, position: [i, 0.5, 0], size: 1 })
    .runtime({ id: `rt-${name}` });

function bigScene(n: number): AuraSceneSnapshot {
  const s = scene();
  for (let i = 0; i < n; i++) s.add(taggedPrimitive(`node-${i}`, i));
  s.add(taggedPrimitive("mover", n));
  return s.toJSON() as AuraSceneSnapshot;
}

const itemsOf = (source: unknown): RenderItem[] => {
  const s = source as { collectRenderItems?: () => Iterable<RenderItem>; renderItems?: RenderItem[] };
  return [...(s.collectRenderItems ? s.collectRenderItems() : s.renderItems ?? [])];
};

describe("C-37 runtime nodes", () => {
  it("handle.version increments on every mutator", async () => {
    const snapshot = bigScene(1);
    const registry = createAuraRuntimeNodeRegistry(snapshot);
    const handle = registry.require("rt-node-0");
    expect(handle.version).toBe(0);
    handle.setPosition(1, 2, 3);
    handle.setRotation(0, 1, 0);
    handle.setScale(2);
    handle.setVisible(false);
    handle.setMaterial({} as never);
    expect(handle.version).toBe(5);
  });

  it("flag on: add/remove take the subtree path — no remount, no scene rewrite", async () => {
    const snapshot = bigScene(3);
    const registry = createAuraRuntimeNodeRegistry(snapshot);
    const flags = resolveQrFlags({ options: ["compiler"] });
    const compiled = await compileScene(snapshot, mountCtx(flags, registry));
    registry.attachCompiled(compiled);

    let setSceneCalls = 0;
    registry.configure({
      flags,
      getScene: () => snapshot,
      setScene: () => { setSceneCalls += 1; }
    });

    const impl = asRuntimeImpl(compiled)!;
    const before = impl.primitiveEntries.length;
    const handle = registry.add(primitive("box", { name: "spawned", position: [9, 0, 0], size: 1 }).runtime({ id: "rt-spawned" }));
    expect(handle.id).toBe("rt-spawned");
    expect(setSceneCalls).toBe(0);
    expect(impl.primitiveEntries.length).toBe(before + 1);
    expect(registry.version).toBeGreaterThan(0);

    const source = updateCompiledScene(compiled, snapshot, registry, 0);
    const labels = itemsOf(source).map((i) => i.label ?? "");
    expect(labels.some((l) => l.includes("spawned"))).toBe(true);

    expect(registry.remove("rt-spawned")).toBe(true);
    expect(impl.primitiveEntries.length).toBe(before);
    const source2 = updateCompiledScene(compiled, snapshot, registry, 0);
    expect(itemsOf(source2).map((i) => i.label ?? "").some((l) => l.includes("spawned"))).toBe(false);
    expect(registry.remove("rt-spawned")).toBe(false);
    registry.detachCompiled(compiled);
    compiled.dispose();
  });

  it("flag off: add appends to the snapshot and remounts (RUNTIME_ADD_REMOUNT)", async () => {
    const snapshot = bigScene(1);
    const registry = createAuraRuntimeNodeRegistry(snapshot);
    const flags = resolveQrFlags({});
    let remounts = 0;
    const warnings: string[] = [];
    registry.configure({
      flags,
      getScene: () => snapshot,
      setScene: (s) => { remounts += 1; registry.reset(s as never); },
      diagnostic: (m) => warnings.push(m)
    });
    registry.add(primitive("box", { name: "dyn", size: 1 }).runtime({ id: "rt-dyn" }));
    expect(remounts).toBe(1);
    expect(warnings.some((w) => w.includes("RUNTIME_ADD_REMOUNT"))).toBe(true);
  });

  it("500 static + 1 moving node → 499 identical RenderItem references across two frames", async () => {
    const snapshot = bigScene(500);
    const registry = createAuraRuntimeNodeRegistry(snapshot);
    const flags = resolveQrFlags({ options: ["compiler"] });
    const compiled = await compileScene(snapshot, mountCtx(flags, registry));
    registry.attachCompiled(compiled);

    const frame1 = itemsOf(updateCompiledScene(compiled, snapshot, registry, 0));
    registry.require("rt-mover").setPosition(999, 0.5, 0);
    const frame2 = itemsOf(updateCompiledScene(compiled, snapshot, registry, 0.016));

    expect(frame1.length).toBe(frame2.length);
    const byLabel = (items: RenderItem[]) => new Map(items.map((i) => [i.label ?? "", i]));
    const m1 = byLabel(frame1);
    let sameRefs = 0;
    for (const item of frame2) {
      const prev = m1.get(item.label ?? "");
      if (prev === item) sameRefs += 1;
    }
    // 501 items total (500 static + mover): every static item keeps its identity,
    // the moved node's item is rebuilt.
    expect(sameRefs).toBe(frame2.length - 1);
    const mover1 = frame1.find((i) => (i.label ?? "").includes("mover"));
    const mover2 = frame2.find((i) => (i.label ?? "").includes("mover"));
    expect(mover1).toBeTruthy();
    expect(mover2).not.toBe(mover1);
    registry.detachCompiled(compiled);
    compiled.dispose();
  });
});
