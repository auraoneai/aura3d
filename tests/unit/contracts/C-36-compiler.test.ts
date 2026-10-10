import { describe, expect, it } from "vitest";
// Engine root import binds lane barrels (lanes/prd15.ts → compilerSlot.provide).
import "@aura3d/engine";
import { DIAGNOSTIC_ONLY_FIELDS, compileScene, updateCompiledScene } from "@aura3d/engine/contracts";
import type { MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { asRuntimeImpl } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { createProductionRuntimeCollectedLights } from "../../../packages/engine/src/agent-api/compiler/observations";
import { createProductionRuntimeRendererInput } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { registerNodeHandler } from "../../../packages/engine/src/contracts/compiler";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { primitive } from "../../../packages/engine/src/agent-api/nodes/primitives";
import type { AuraSceneSnapshot, AuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/nodes/types";
import { LightUniforms } from "@aura3d/rendering";
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
    expect(asRuntimeImpl(compiled)).toBeNull();
  });

  it("flag on: real impl compiles entries and produces a RenderSource", async () => {
    const flags = resolveQrFlags({ options: ["compiler"] });
    const compiled = await compileScene(litScene(), mountCtx(flags));
    const impl = asRuntimeImpl(compiled);
    expect(impl).not.toBeNull();
    expect(impl!.primitiveEntries.length).toBe(1);
    expect(compiled.source).toBeTruthy();
    expect(compiled.degradations).toEqual([]);
    // per-frame update returns a RenderSource carrying items
    const source = updateCompiledScene(compiled, litScene(), undefined as never, 0.5) as { renderItems?: unknown[]; collectRenderItems?: () => Iterable<unknown> };
    expect(source).toBeTruthy();
    const items = source.collectRenderItems ? [...source.collectRenderItems()] : (source.renderItems ?? []);
    expect([...items].length).toBeGreaterThan(0);
    expect(asRuntimeImpl(compiled)!.lastInput).not.toBeNull();
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
        out.feature("world.materials-test");
      },
      update(node, _handle, _ctx, out, t) {
        calls.push(`update:${node.kind}:${t}`);
        out.set("postprocess", { override: "handler-set" } as never);
      }
    });
    try {
      const flags = resolveQrFlags({ options: ["compiler", "materials"] });
      const compiled = await compileScene(litScene(), mountCtx(flags));
      expect(compiled.features.has("world.materials-test")).toBe(true);
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
    const impl = asRuntimeImpl(compiled)!;
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
    const lastInput = asRuntimeImpl(compiled)!.lastInput!;
    const a = JSON.parse(JSON.stringify({ source: lastInput.source, camera: lastInput.camera }));
    const b = JSON.parse(JSON.stringify({ source: legacy.source, camera: legacy.camera }));
    expect(a).toEqual(b);
    compiled.dispose();
  });

  it("T0-09: authored lights are collected once — finite layerMask, no NaN in u_lightData", async () => {
    const snapshot = litScene();
    const lit = {
      ...snapshot,
      nodes: [
        ...snapshot.nodes,
        { kind: "light", light: "directional", name: "key", intensity: 2, position: [3, 4, 3], shadow: true },
        { kind: "light", light: "point", name: "fill", intensity: 10, position: [0, 3, 0] }
      ]
    } as AuraSceneSnapshot;
    // Mirror the production mount: the mount's ctx carries the legacy
    // collection (createProductionRuntimeCollectedLights); the C-36 handler
    // must not add the same lights again.
    const flags = resolveQrFlags({ options: ["compiler", "lighting"] });
    const compiled = await compileScene(lit, mountCtx(flags, { collectedLights: createProductionRuntimeCollectedLights(lit) }));
    const lights = [...(compiled.source?.collectedLights ?? [])];
    expect(lights).toHaveLength(2);
    for (const light of lights) {
      expect(Number.isFinite(light.layerMask)).toBe(true);
    }
    const packed = LightUniforms.pack(lights);
    expect([...packed.data].every(Number.isFinite)).toBe(true);
    compiled.dispose();
  });


  it("binds the C-09 neutral probe on an ambient-only scene under compiler+lighting (T0-24)", async () => {
    const { MockRenderDevice } = await import("../../../packages/rendering/src/RenderDevice");
    const flags = resolveQrFlags({ options: ["compiler", "lighting"] });
    const snapshot = {
      schema: "aura3d-scene-snapshot/1.0",
      background: "#000000",
      camera: { mode: "orbit", position: [0, 2, 5], target: [0, 0, 0] },
      diagnostics: { enabled: false },
      nodes: [
        { kind: "primitive", primitive: "box", name: "b", size: 1 },
        { kind: "light", light: "ambient", name: "amb", intensity: 0.5, color: "#ffffff" }
      ]
    } as unknown as AuraSceneSnapshot;
    const compiled = await compileScene(
      snapshot,
      mountCtx(flags, { renderer: { device: new MockRenderDevice() } as MountSceneCompileContext["renderer"] })
    );
    const source = compiled.source as unknown as {
      environmentProbe?: { source?: string } | null;
      environmentProbeDiffuseIntensity?: number;
      environmentProbeSpecularIntensity?: number;
      environmentProbeAmbient?: { color: readonly number[]; intensity: number } | null;
      environmentLighting?: unknown;
    };
    expect(source.environmentProbe?.source).toBe("neutral");
    expect(source.environmentProbeDiffuseIntensity).toBe(1);
    expect(source.environmentProbeSpecularIntensity).toBe(1);
    expect(source.environmentProbeAmbient?.intensity).toBe(0.5);
    expect(source.environmentLighting).toBeUndefined();
    compiled.dispose();
  });

});
