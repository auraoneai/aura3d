import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@aura3d/engine";
import { Renderer } from "@aura3d/rendering";
import { compileScene } from "../../../packages/engine/src/contracts/compiler";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { CompiledSceneImpl, type MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { createProductionRuntimeSceneRenderer } from "../../../packages/engine/src/agent-api/compiler/renderer";
import { flattenAuraSceneNodes } from "../../../packages/engine/src/agent-api/compiler/sceneGraph";
import { assertFramePivotSupported } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import { groups } from "../../../packages/engine/src/agent-api/nodes/groups";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import type { AuraModelNode, AuraSceneNode, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";

const createActor = vi.hoisted(() => vi.fn());
vi.mock("../../../packages/engine/src/production-runtime/TypedGLBActor", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../packages/engine/src/production-runtime/TypedGLBActor")>(),
  createTypedGLBActor: createActor
}));

const flags = resolveQrFlags({ options: ["compiler", "core"], env: {} });
// An empty options list leaves promoted defaults enabled. Explicitly disable
// the compiler so the legacy tests reach the pre-device actor-loading path.
const legacyFlags = resolveQrFlags({ options: { A3D_QR_COMPILER: false }, env: {} });
const canvas = (): HTMLCanvasElement => ({ width: 64, height: 64 } as HTMLCanvasElement);
const snapshot = (nodes: readonly AuraSceneNode[]): AuraSceneSnapshot => ({ ...scene().toJSON(), nodes });
const modelNode = (id: string, overrides: Partial<AuraModelNode> = {}): AuraModelNode => ({
  kind: "model", name: id, runtime: { id },
  asset: { kind: "aura-asset-ref", id, type: "model", format: "glb", url: `/${id}.glb`, hash: `sha256-${"1".repeat(64)}` } as unknown as AuraModelNode["asset"],
  scaleMode: "world", visible: true, castShadow: true, receiveShadow: true,
  ...overrides
});
const fakeActor = (id: string, skinned: boolean) => ({
  id, dispose: vi.fn(), pipeline: { asset: { skins: skinned ? [{}] : [] } }
});
const residency = () => ({
  trackActor: vi.fn(),
  retireActor: vi.fn((actor: ReturnType<typeof fakeActor>) => actor.dispose())
});
const context = (textureResidency = residency()): MountSceneCompileContext => ({
  renderer: undefined, assets: undefined, quality: { tier: "high" }, strict: true,
  flags, degrade: vi.fn(), canvas: canvas(), environmentLighting: () => ({}),
  collectedLights: [], runtimeWarnings: new Set<string>(), textureResidency
} as unknown as MountSceneCompileContext);
const dynamicScene = (ctx: MountSceneCompileContext): CompiledSceneImpl =>
  new CompiledSceneImpl(0, null, [], new Set(), [], [], [], [], ctx, [], []);

beforeEach(() => { createActor.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("pivoted model admission before actor publication", () => {
  it.each([
    ["lookAt on the legacy model matrix", { pivot: [1, 0, 0], lookAt: [0, 0, 0] }, /PIVOT_UNSUPPORTED_LOOK_AT/],
    ["model LOD", { pivot: [1, 0, 0], lod: true }, /PIVOT_UNSUPPORTED_LOD/],
    ["instance LOD", { instances: [{ pivot: [1, 0, 0] }], instanceLod: { levels: [] } }, /PIVOT_UNSUPPORTED_LOD/],
    ["invalid pivot", { pivot: [1, Number.NaN, 0] }, /PIVOT_INVALID/]
  ])("rejects %s before actor acquisition in compiled and legacy mounts", async (_name, overrides, failure) => {
    const value = snapshot([modelNode("bad", overrides as Partial<AuraModelNode>)]);
    const createRenderer = vi.spyOn(Renderer, "create");
    await expect(compileScene(value, context())).rejects.toThrow(failure as RegExp);
    await expect(createProductionRuntimeSceneRenderer(canvas(), value, undefined, undefined, legacyFlags)).rejects.toThrow(failure as RegExp);
    expect(createActor).not.toHaveBeenCalled();
    expect(createRenderer).not.toHaveBeenCalled();
  });

  it("admits an own pivot with lookAt on the C-06 model matrix and keeps legacy/instanced rejections", () => {
    const aimed = modelNode("aimed", { pivot: [1, 0, 0], lookAt: [0, 0, 5] });
    expect(assertFramePivotSupported(aimed, undefined, false)).toBe(true);
    expect(() => assertFramePivotSupported(aimed, undefined, true)).toThrow(/PIVOT_UNSUPPORTED_LOOK_AT/);
    expect(() => assertFramePivotSupported(modelNode("batch", { lookAt: [0, 0, 5], instances: [{ pivot: [1, 0, 0] }] }), undefined, false))
      .toThrow(/PIVOT_UNSUPPORTED_LOOK_AT/);
  });

  it("rejects an inherited pivot on an LOD-tagged model before loading", async () => {
    const child = modelNode("lod-child");
    const lod = groups.lod({ pivot: [1, 0, 0], levels: [{ children: [child] }] }).toJSON();
    // This is the flattened descriptor form passed by the app's hierarchical path.
    const flattened = flattenAuraSceneNodes([lod], true);
    await expect(compileScene(snapshot(flattened), context())).rejects.toThrow(/PIVOT_UNSUPPORTED_LOD/);
    await expect(createProductionRuntimeSceneRenderer(canvas(), snapshot(flattened), undefined, undefined, legacyFlags))
      .rejects.toThrow(/PIVOT_UNSUPPORTED_LOD/);
    expect(createActor).not.toHaveBeenCalled();
  });

  it("retires every compiled actor before residency tracking if one is a pivoted skinned instance", async () => {
    const good = fakeActor("good", false), bad = fakeActor("bad", true), textures = residency();
    createActor.mockImplementation(async ({ id }: { id: string }) => id === "bad" ? bad : good);
    const value = snapshot([modelNode("good"), modelNode("bad", { pivot: [1, 0, 0], instances: [{}] })]);
    await expect(compileScene(value, context(textures))).rejects.toThrow(/PIVOT_UNSUPPORTED_SKIN/);
    expect(textures.trackActor).not.toHaveBeenCalled();
    expect(textures.retireActor).toHaveBeenCalledTimes(2);
    expect(good.dispose).toHaveBeenCalledTimes(1);
    expect(bad.dispose).toHaveBeenCalledTimes(1);
  });

  it("cleans up a rejected skinned actor and loaded peers on the legacy mount", async () => {
    const good = fakeActor("good", false), bad = fakeActor("bad", true);
    const createRenderer = vi.spyOn(Renderer, "create");
    expect(legacyFlags.on("A3D_QR_COMPILER")).toBe(false);
    createActor.mockImplementation(async ({ id }: { id: string }) => id === "bad" ? bad : good);
    const value = snapshot([modelNode("good"), modelNode("bad", { pivot: [1, 0, 0], instances: [{}] })]);
    await expect(createProductionRuntimeSceneRenderer(canvas(), value, undefined, undefined, legacyFlags))
      .rejects.toThrow(/PIVOT_UNSUPPORTED_SKIN/);
    expect(createActor).toHaveBeenCalledTimes(2);
    expect(good.dispose).toHaveBeenCalledTimes(1);
    expect(bad.dispose).toHaveBeenCalledTimes(1);
    expect(createRenderer).not.toHaveBeenCalled();
  });

  it("retires a legacy peer that finishes after another actor rejects the mount", async () => {
    const late = fakeActor("late", false), bad = fakeActor("bad", true);
    expect(legacyFlags.on("A3D_QR_COMPILER")).toBe(false);
    let finish!: (actor: ReturnType<typeof fakeActor>) => void;
    createActor.mockImplementation(({ id }: { id: string }) => id === "bad"
      ? Promise.resolve(bad)
      : new Promise((resolve) => { finish = resolve; }));
    const value = snapshot([modelNode("late"), modelNode("bad", { pivot: [1, 0, 0], instances: [{}] })]);
    await expect(createProductionRuntimeSceneRenderer(canvas(), value, undefined, undefined, legacyFlags))
      .rejects.toThrow(/PIVOT_UNSUPPORTED_SKIN/);
    expect(createActor).toHaveBeenCalledTimes(2);
    expect(bad.dispose).toHaveBeenCalledTimes(1);
    finish(late);
    await vi.waitFor(() => expect(late.dispose).toHaveBeenCalledTimes(1));
  });

  it("rejects a replacement descriptor before staging or publishing its sibling resources", () => {
    const added = vi.fn(), ctx = context();
    Object.assign(ctx, { onPrimitiveEntriesAdded: added });
    const impl = dynamicScene(ctx);
    try {
      const old = primitives.box({ name: "old" }).runtime({ id: "root" }).toJSON();
      impl.addSubtree(old);
      const oldResource = impl.primitiveEntries[0]!.resources[0]!;
      added.mockClear();
      const bad = modelNode("bad", { pivot: [1, 0, 0], lookAt: [0, 0, 0] });
      const replacement = groups.create("replacement", [primitives.box({ name: "staged" }), bad]).runtime({ id: "root" }).toJSON();
      expect(() => impl.addSubtree(replacement)).toThrow(/PIVOT_UNSUPPORTED_LOOK_AT/);
      expect(impl.dynamicRoots.get("root")).toBe(old);
      expect(impl.primitiveEntries).toHaveLength(1);
      expect(oldResource.material.disposed).toBe(false);
      expect(added).not.toHaveBeenCalled();
      expect(createActor).not.toHaveBeenCalled();
    } finally { impl.dispose(); }
  });

  it("checks a prospective model against the live pivot of its parent before publication", () => {
    const parent = groups.create("parent", []).runtime({ id: "parent" }).toJSON();
    const authored = snapshot([parent]);
    const registry = createAuraRuntimeNodeRegistry(authored, { flags });
    const ctx = context();
    Object.assign(ctx, { runtimeNodes: registry });
    const impl = dynamicScene(ctx);
    try {
      impl.addSubtree(parent);
      registry.require("parent").setPivot(1, 0, 0);
      const bad = modelNode("lod-child", { lod: "auto" });
      expect(() => impl.addSubtree(bad, "parent")).toThrow(/PIVOT_UNSUPPORTED_LOD/);
      expect(impl.liveNodes).not.toContain(bad);
      expect(createActor).not.toHaveBeenCalled();
    } finally { impl.dispose(); registry.dispose(); }
  });

  it("retires a late unsupported actor without publishing it after the synchronous subtree commit", async () => {
    const textures = residency(), ctx = context(textures), impl = dynamicScene(ctx);
    let finish!: (actor: ReturnType<typeof fakeActor>) => void;
    createActor.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const bad = modelNode("bad", { pivot: [1, 0, 0], instances: [{}] });
    const actor = fakeActor("bad", true);
    try {
      impl.addSubtree(bad);
      // addSubtree is synchronous: the descriptor is live while its skin is unknown.
      expect(impl.liveNodes).toContain(bad);
      expect(impl.actorEntries).toHaveLength(0);
      await vi.waitFor(() => expect(createActor).toHaveBeenCalledTimes(1));
      finish(actor);
      await vi.waitFor(() => expect(textures.retireActor).toHaveBeenCalledWith(actor));
      await vi.waitFor(() => expect([...ctx.runtimeWarnings].some((warning) => warning.includes("PIVOT_UNSUPPORTED_SKIN"))).toBe(true));
      expect(textures.trackActor).not.toHaveBeenCalled();
      expect(impl.actorEntries).toHaveLength(0);
      expect(actor.dispose).toHaveBeenCalledTimes(1);
    } finally { impl.dispose(); }
  });

  it("retires a removed generation's late actor without tracking or reporting a failure", async () => {
    const textures = residency(), ctx = context(textures), impl = dynamicScene(ctx);
    let finish!: (actor: ReturnType<typeof fakeActor>) => void;
    createActor.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const actor = fakeActor("removed", true);
    try {
      impl.addSubtree(modelNode("removed", { pivot: [1, 0, 0], instances: [{}] }));
      await vi.waitFor(() => expect(createActor).toHaveBeenCalledTimes(1));
      expect(impl.removeSubtree("removed")).toBe(true);
      finish(actor);
      await vi.waitFor(() => expect(actor.dispose).toHaveBeenCalledTimes(1));
      expect(textures.trackActor).not.toHaveBeenCalled();
      expect(impl.actorEntries).toHaveLength(0);
      expect(ctx.runtimeWarnings.size).toBe(0);
    } finally { impl.dispose(); }
  });

  it("still publishes and retires a supported unskinned zero-pivot model", async () => {
    const textures = residency(), ctx = context(textures), impl = dynamicScene(ctx);
    const actor = fakeActor("supported", false);
    createActor.mockResolvedValue(actor);
    try {
      impl.addSubtree(modelNode("supported", { pivot: [0, 0, 0], instances: [{}] }));
      await vi.waitFor(() => expect(impl.actorEntries).toHaveLength(1));
      expect(textures.trackActor).toHaveBeenCalledWith(actor);
      expect(impl.removeSubtree("supported")).toBe(true);
      expect(actor.dispose).toHaveBeenCalledTimes(1);
    } finally { impl.dispose(); }
  });
});
