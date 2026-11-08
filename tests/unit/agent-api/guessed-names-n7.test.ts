/**
 * 5.4 N7 guessed names. Benchmark 505 Aura3D-arm sources and transcripts (see docs/agents/guessable-api.md, "5.4 N7"):
 * - `handle.setIntensity?.(v)` / `setColor` / `setOpacity` / `setEmissive` on node handles silently did nothing;
 * - `material.standard({ ... })` (three.js MeshStandardMaterial) did not exist;
 * - `toneMapping: "aces-filmic"` (copied from Aura3D's own AppliedLookReport type) is not an operator name.
 * Same-meaning names must equal the native call; different-meaning uses must throw and name the native call.
 */
import { describe, expect, it, vi } from "vitest";
import "@aura3d/engine";
import "../../../packages/engine/src/lanes/prd02";
import { compileScene, updateCompiledScene } from "@aura3d/engine-runtime/contracts";
import type { MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { createProductionRuntimeCollectedLights } from "../../../packages/engine/src/agent-api/compiler/observations";
import { createAuraRuntimeNodeRegistry, createRuntimeNodeHandle } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { material } from "../../../packages/engine/src/agent-api/nodes/material";
import { materialIgnoredOptions } from "../../../packages/engine/src/agent-api/nodes/optionDiagnostics";
import { normalizeAppToneMapping, normalizeOutputToneMapping, normalizeToneMappingName } from "../../../packages/engine/src/agent-api/app/toneMappingNames";
import { WORKER_PATCH_METHOD_SET } from "../../../packages/engine/src/agent-api/app/workerPatch";
import type { AuraMaterialSpec, AuraRuntimeNodeHandle, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import type { CollectedLight } from "@aura3d/rendering";

const FLAGS = resolveQrFlags({ options: ["compiler", "lighting"] });
const SUN = { kind: "light", light: "directional", name: "sun", position: [4, 8, 4], intensity: 2, color: "#ffffff", runtime: { id: "sun" } };

async function mountLights(nodes: readonly unknown[]) {
  const snapshot = {
    schema: "aura3d-scene-snapshot/1.0", background: "#000000",
    camera: { mode: "orbit", position: [0, 4, 9], target: [0, 0, 0] }, diagnostics: { enabled: false },
    nodes: [{ kind: "primitive", primitive: "box", name: "floor", size: 1 }, ...structuredClone(nodes)]
  } as unknown as AuraSceneSnapshot;
  const lights = createProductionRuntimeCollectedLights(snapshot, FLAGS, { hemisphereAsEnvironment: true });
  const registry = createAuraRuntimeNodeRegistry(snapshot, { flags: FLAGS });
  const { MockRenderDevice } = await import("../../../packages/rendering/src/RenderDevice");
  const ctx = {
    renderer: { device: new MockRenderDevice() }, assets: undefined, quality: { tier: "high" }, strict: false, flags: FLAGS,
    degrade: () => undefined, canvas: { width: 800, height: 600 },
    environmentLighting: () => ({ color: [1, 1, 1], intensity: 0, environmentMapIntensity: 0, environmentMapSpecularIntensity: 0 }),
    collectedLights: lights, runtimeWarnings: new Set<string>(), runtimeNodes: registry
  } as unknown as MountSceneCompileContext;
  const compiled = await compileScene(snapshot, ctx);
  const frame = (t: number): readonly CollectedLight[] =>
    [...((updateCompiledScene(compiled, snapshot, registry, t * 1000) as { collectedLights?: Iterable<CollectedLight> }).collectedLights ?? [])];
  return { registry, frame, dispose: () => compiled.dispose() };
}

const sunOf = (lights: readonly CollectedLight[]) => {
  const light = lights.find((candidate) => candidate.source?.name === "sun");
  if (!light) throw new Error("no sun");
  return { intensity: light.intensity, color: [...light.color] };
};

const nodes = new WeakMap<AuraRuntimeNodeHandle, { material?: AuraMaterialSpec }>();
function meshHandle(materialSpec?: AuraMaterialSpec, kind: "primitive" | "model" | "group" = "primitive"): AuraRuntimeNodeHandle {
  const node = { kind, primitive: "box", name: "crate", position: [0, 0, 0], ...(materialSpec ? { material: materialSpec } : {}) };
  const handle = createRuntimeNodeHandle(node as never, { id: "crate" });
  nodes.set(handle, node);
  return handle;
}
/** The material the handle's live scene node now carries. */
const materialOf = (handle: AuraRuntimeNodeHandle) => nodes.get(handle)?.material;

describe("N7 handle setters on light nodes equal setLight", () => {
  it("setIntensity(v) and setColor(c) shade the same as setLight({ intensity }) / setLight({ color })", async () => {
    const viaAlias = await mountLights([SUN]);
    const viaNative = await mountLights([SUN]);
    viaAlias.frame(0); viaNative.frame(0);
    viaAlias.registry.require("sun").setIntensity!(5).setColor!("#ff8800");
    viaNative.registry.require("sun").setLight!({ intensity: 5 });
    viaNative.registry.require("sun").setLight!({ color: "#ff8800" });
    const alias = sunOf(viaAlias.frame(1 / 60));
    expect(alias).toEqual(sunOf(viaNative.frame(1 / 60)));
    expect(alias.intensity).toBeCloseTo(5);
    viaAlias.dispose(); viaNative.dispose();
  });

  it("validates like setLight and refuses mesh-only setters with the native call named", async () => {
    const mounted = await mountLights([SUN]);
    const sun = mounted.registry.require("sun");
    expect(() => sun.setIntensity!(-1)).toThrow(RangeError);
    expect(() => sun.setColor!("not-a-colour")).toThrow();
    expect(() => sun.setOpacity!(0.5)).toThrow(/HANDLE_METHOD_UNSUPPORTED: setOpacity\(\).*"sun" \(light\).*setLight/);
    expect(() => sun.setEmissive!("#ff0000")).toThrow(/setLight\(\{ color, intensity \}\)/);
    mounted.dispose();
  });

  it("names the kill switch instead of doing nothing when runtime light control is off", () => {
    const light = createRuntimeNodeHandle({ kind: "light", light: "point", name: "lamp", position: [0, 0, 0] } as never, { id: "lamp" });
    expect(light.setLight).toBeUndefined();
    expect(() => light.setIntensity!(2)).toThrow(/A3D_QR_LIGHTING/);
  });
});

describe("N7 handle setters on mesh nodes equal setMaterial with the current material", () => {
  it("setColor / setOpacity / setEmissive merge into the current material through setMaterial", () => {
    const base = material.pbr({ color: "#336699", roughness: 0.3 });
    const alias = meshHandle(base);
    const native = meshHandle(base);
    const spy = vi.spyOn(alias, "setMaterial");
    expect(alias.setColor!("#ff8800")).toBe(alias);
    native.setMaterial({ ...base, color: "#ff8800" });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(materialOf(alias)).toEqual(materialOf(native));
    expect(materialOf(alias)).toMatchObject({ color: "#ff8800", roughness: 0.3 });

    alias.setOpacity!(0.4).setEmissive!("#00ffcc", 2.5);
    native.setMaterial({ ...base, color: "#ff8800", opacity: 0.4 });
    native.setMaterial({ ...base, color: "#ff8800", opacity: 0.4, emissive: "#00ffcc", emissiveIntensity: 2.5 });
    expect(materialOf(alias)).toEqual(materialOf(native));
    expect(alias.version).toBe(native.version);
  });

  it("works on a primitive with no authored material (the renderer default)", () => {
    const alias = meshHandle();
    const native = meshHandle();
    alias.setColor!("#123456");
    native.setMaterial({ color: "#123456" });
    expect(materialOf(alias)).toEqual(materialOf(native));
  });

  it("throws with the native call for intensity on meshes, models, groups, shader materials and bad values", () => {
    expect(() => meshHandle(material.pbr({})).setIntensity!(3)).toThrow(/HANDLE_METHOD_UNSUPPORTED: setIntensity\(\).*setEmissive\(color, intensity\)/);
    expect(() => meshHandle(undefined, "model").setColor!("#fff")).toThrow(/handle\.materials/);
    expect(() => meshHandle(undefined, "group").setOpacity!(0.5)).toThrow(/carry a material/);
    const shader = material.custom({ glsl: { vertex: "void main(){}", fragment: "void main(){}" } });
    expect(() => meshHandle(shader).setColor!("#fff")).toThrow(/setUniform/);
    expect(() => meshHandle(material.pbr({})).setOpacity!(1.5)).toThrow(RangeError);
    expect(() => meshHandle(material.pbr({})).setColor!("hsl(nope")).toThrow();
  });

  it("is replayed in a render worker (the setters are worker patch methods)", () => {
    for (const name of ["setColor", "setIntensity", "setOpacity", "setEmissive"]) expect(WORKER_PATCH_METHOD_SET.has(name)).toBe(true);
  });
});

describe("N7 material.standard is material.pbr", () => {
  it("returns the same spec as material.pbr for three.js MeshStandardMaterial options", () => {
    const options = { color: "#aa3322", roughness: 0.4, metalness: 0.6, emissive: "#110000" };
    expect(material.standard(options)).toEqual(material.pbr(options));
    expect(material.standard()).toEqual(material.pbr());
  });

  it("keeps the three.js option normalisation and OPTION_IGNORED notes", () => {
    expect(material.standard({ side: "double" } as never)).toEqual(material.pbr({ doubleSided: true }));
    const notes = materialIgnoredOptions(material.standard({ color: "#fff", wireframe: true } as never));
    expect(notes.join(" ")).toMatch(/"wireframe".*geometry\.wireframe/);
  });
});

describe("N7 tone-mapping names", () => {
  it("maps same-meaning spellings to the operator", () => {
    expect(normalizeToneMappingName("aces-filmic", "t")).toBe("aces");
    expect(normalizeToneMappingName("ACESFilmicToneMapping", "t")).toBe("aces");
    expect(normalizeToneMappingName("AgX", "t")).toBe("agx");
    expect(normalizeToneMappingName("NeutralToneMapping", "t")).toBe("neutral");
    expect(normalizeToneMappingName("NoToneMapping", "t")).toBe("none");
    for (const name of ["none", "linear", "reinhard", "aces", "agx", "neutral", "cineon"]) expect(normalizeToneMappingName(name, "t")).toBe(name);
    expect(normalizeToneMappingName(undefined, "t")).toBeUndefined();
  });

  it("throws for an unknown name and lists the operators", () => {
    expect(() => normalizeToneMappingName("uncharted2", "createAuraApp({ output })")).toThrow(
      /TONE_MAPPING_UNKNOWN: createAuraApp\(\{ output \}\) toneMapping "uncharted2".*"none", "linear", "reinhard", "aces", "agx", "neutral", "cineon"/
    );
    expect(() => normalizeToneMappingName(3, "t")).toThrow(RangeError);
    // Review: "filmic" is its own postprocess curve (LegacyPost / PostProcessPass), not ACES, so it must not alias to "aces".
    expect(() => normalizeToneMappingName("filmic", "t")).toThrow(/TONE_MAPPING_UNKNOWN.*postprocess toneMapping\.operator curve/);
  });

  it("leaves canonical options untouched (same object) and normalises output and renderer.output", () => {
    const canonical = { output: { toneMapping: "agx" as const, exposure: 1.1 } };
    expect(normalizeAppToneMapping(canonical)).toBe(canonical);
    const none: { readonly output?: { readonly toneMapping?: string }; readonly scene: number } = { scene: 1 };
    expect(normalizeAppToneMapping(none)).toBe(none);
    expect(normalizeAppToneMapping({ output: { toneMapping: "aces-filmic", exposure: 0.9 }, renderer: { quality: "production", output: { toneMapping: "ACESFilmic" } } }))
      .toEqual({ output: { toneMapping: "aces", exposure: 0.9 }, renderer: { quality: "production", output: { toneMapping: "aces" } } });
    expect(normalizeOutputToneMapping({ toneMapping: "Reinhard" }, "app.output.setOutput")).toEqual({ toneMapping: "reinhard" });
  });
});
