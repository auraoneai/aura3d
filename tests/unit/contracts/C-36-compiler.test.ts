import { describe, expect, it } from "vitest";
// Engine root import binds lane barrels (lanes/prd15.ts → compilerSlot.provide).
import "@aura3d/engine";
import { DIAGNOSTIC_ONLY_FIELDS, compileScene, updateCompiledScene } from "@aura3d/engine/contracts";
import type { MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { asRuntimeCompiled } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { createProductionRuntimeRendererInput } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { registerNodeHandler } from "../../../packages/engine/src/contracts/compiler";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { primitive } from "../../../packages/engine/src/agent-api/nodes/primitives";
import type { AuraSceneSnapshot, AuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/nodes/types";
import type { CollectedLight, EnvironmentLightingOptions } from "@aura3d/rendering";

const stubCanvas = () => ({ width: 800, height: 600 }) as unknown as HTMLCanvasElement;
const stubLighting = () => ({}) as EnvironmentLightingOptions;
const stubQuality = { tier: "high" } as MountSceneCompileContext["quality"];

function mountCtx(flags: ReturnType<typeof resolveQrFlags>, extra: Partial<MountSceneCompileContext> = {}): MountSceneCompileContext {
  const runtimeWarnings = new Set<string>();
  return {
    renderer: undefined,
    assets: undefined,
    quality: stubQuality,
    strict: flags.on("A3D_QR_STRICT"),
    flags,
    degrade: (d) => { runtimeWarnings.add(`${d.code}:${d.nodeId ?? ""}`); },
    canvas: stubCanvas(),
    environmentLighting: stubLighting,
    collectedLights: [] as readonly CollectedLight[],
    runtimeWarnings,
    ...extra
  };
}

const litScene = (): AuraSceneSnapshot =>
  scene().add(primitive("box", { name: "box-1", position: [0, 0.5, 0], size: 1 })).toJSON() as AuraSceneSnapshot;

describe("C-36 compiler", () => {
  it("compileScene stub resolves a compilable shape", async () => {
    const scene = await compileScene({} as never, {} as never);
    expect(typeof scene.snapshotVersion).toBe("number");
    expect(Array.isArray(scene.actors)).toBe(true);
    expect(typeof scene.dispose).toBe("function");
  });

  it("DIAGNOSTIC_ONLY_FIELDS is seeded with known-unconsumed fields", () => {
    expect(Object.keys(DIAGNOSTIC_ONLY_FIELDS).length).toBeGreaterThanOrEqual(15);
  });

  it("flag off: contract stub returns source:null and no real compiled", async () => {
    const compiled = await compileScene(litScene(), mountCtx(resolveQrFlags({})));
    expect(compiled.source).toBeNull();
    expect(compiled.actors).toEqual([]);
    expect(compiled.degradations[0]?.code).toBe("capability-degraded");
    expect(asRuntimeCompiled(compiled)).toBeNull();
  });

  it("flag on: real impl compiles entries and produces a RenderSource", async () => {
    const flags = resolveQrFlags({ options: ["compiler"] });
    const compiled = await compileScene(litScene(), mountCtx(flags));
    const impl = asRuntimeCompiled(compiled);
    expect(impl).not.toBeNull();
    expect(impl!.primitiveEntries.length).toBe(1);
    expect(compiled.source).toBeTruthy();
    expect(compiled.degradations).toEqual([]);
    // per-frame update returns a RenderSource carrying items
    const source = updateCompiledScene(compiled, litScene(), undefined as never, 0.5) as { renderItems?: unknown[]; collectRenderItems?: () => Iterable<unknown> };
    expect(source).toBeTruthy();
    const items = source.collectRenderItems ? [...source.collectRenderItems()] : (source.renderItems ?? []);
    expect([...items].length).toBeGreaterThan(0);
    expect(compiled.lastInput).not.toBeNull();
    compiled.dispose();
  });

  it("real update is a no-op on stub-compiled scenes (mixed flag states)", async () => {
    const stubCompiled = await compileScene({} as never, {} as never);
    const out = updateCompiledScene(stubCompiled, {} as never, {} as never, 1);
    expect(out).toBe(stubCompiled.source);
  });

  it("unknown node kind degrades (non-strict) and throws (strict)", async () => {
    const snapshot = litScene();
    const mutated = { ...snapshot, nodes: [...snapshot.nodes, { kind: "hologram", name: "holo-1" }] } as AuraSceneSnapshot;

    const flagsCompiler = resolveQrFlags({ options: ["compiler"] });
    const compiled = await compileScene(mutated, mountCtx(flagsCompiler));
    expect(compiled.degradations.some((d) => d.code === "option-ignored")).toBe(true);
    compiled.dispose();

    const flagsStrict = resolveQrFlags({ options: ["compiler", "strict"] });
    await expect(compileScene(mutated, mountCtx(flagsStrict))).rejects.toMatchObject({
      name: "AuraRuntimeError",
      code: "unknown-node-kind"
    });
  });

  it("a registered lane handler runs compile/update and contributes to the source", async () => {
    const calls: string[] = [];
    const unregister = registerNodeHandler({
      kind: "primitive",
      owner: "prd04",
      flag: "A3D_QR_MATERIALS",
      compile(node, _ctx, out) {
        calls.push(`compile:${node.kind}`);
        out.feature("materials.test");
      },
      update(node, _handle, _ctx, out, t) {
        calls.push(`update:${node.kind}:${t}`);
        out.set("postprocess", { override: "handler-set" } as never);
      }
    });
    try {
      const flags = resolveQrFlags({ options: ["compiler", "materials"] });
      const compiled = await compileScene(litScene(), mountCtx(flags));
      expect(compiled.features.has("materials.test" as never)).toBe(true);
      expect(calls).toContain("compile:primitive");
      const source = updateCompiledScene(compiled, litScene(), undefined as never, 1) as Record<string, unknown>;
      expect(calls).toContain("update:primitive:1");
      expect(source.postprocess).toEqual({ override: "handler-set" });
      compiled.dispose();
    } finally {
      unregister();
    }
  });

  it("real update output deep-equals the legacy frame builder on the same scene", async () => {
    const snapshot = litScene();
    const flags = resolveQrFlags({ options: ["compiler"] });
    const warnings = new Set<string>();
    const compiled = await compileScene(snapshot, mountCtx(flags, { runtimeWarnings: warnings }));
    const impl = asRuntimeCompiled(compiled)!;
    updateCompiledScene(compiled, snapshot, undefined as never, 0);

    const legacyWarnings = new Set<string>();
    const legacy = createProductionRuntimeRendererInput(
      snapshot,
      stubCanvas(),
      impl.actorEntries,
      impl.primitiveEntries,
      0,
      undefined as unknown as AuraRuntimeNodeRegistry,
      legacyWarnings,
      stubLighting(),
      []
    );
    const a = JSON.parse(JSON.stringify({ source: impl.lastInput!.source, camera: impl.lastInput!.camera }));
    const b = JSON.parse(JSON.stringify({ source: legacy.source, camera: legacy.camera }));
    expect(a).toEqual(b);
    compiled.dispose();
  });
});
