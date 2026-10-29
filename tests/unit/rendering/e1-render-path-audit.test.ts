import { afterEach, describe, expect, it } from "vitest";
import { effects, lights, material, primitives, scene } from "@aura3d/engine";
import { directPathItemBlockers, resolveRenderPath } from "@aura3d/rendering";
import type { QrFlags } from "@aura3d/rendering/contracts";
import {
  decodedModelDirectPathBlockers,
  directPathVetoReasons,
  nodeDirectPathBlockers,
  recordDecodedDirectPathBlockers,
  renderPathBlockers,
  resolveAppRenderPath,
  setDirectRenderPath,
  takeDecodedDirectPathBlockers,
  vetoDirectPath
} from "../../../packages/engine/src/agent-api/app/renderPath";
import { parseQualityRendererOptions, rendererQualityWarnings, resetRendererOptionDeprecationsForTests } from "../../../packages/engine/src/agent-api/app/rendererOptions";
import { createFrameRateMeter } from "../../../packages/engine/src/agent-api/app/frameLoop";
import { resolveMountQuality } from "../../../packages/engine/src/agent-api/compiler/renderer";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { bindRuntimeCompiled } from "../../../packages/engine/src/contracts/compiler";
import type { AuraApp, AuraSceneNode, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";

const coreOn = (): QrFlags => resolveQrFlags({});
const plain = () => scene().add(primitives.box({ material: material.pbr({ color: "#ffffff" }) })).add(lights.studio()).toJSON();
/** A model node whose typed asset carries manifest material facts (as `assets typegen` writes them). */
const modelWith = (materialMetadata: readonly Record<string, unknown>[], extra: Record<string, unknown> = {}): AuraSceneSnapshot => {
  const base = plain();
  const model = {
    kind: "model", castShadow: true, receiveShadow: true, visible: true,
    asset: { kind: "aura-asset-ref", id: "glass", type: "model", format: "glb", url: "/aura-assets/glass.glb", metadata: { materials: materialMetadata.map((m) => m.name), materialMetadata } },
    ...extra
  } as unknown as AuraSceneNode;
  return { ...base, nodes: [...base.nodes, model] };
};

afterEach(() => resetRendererOptionDeprecationsForTests());

describe("RP-01: transparent and transmissive GLB materials keep the HDR target", () => {
  it("a BLEND material in the asset manifest blocks the direct path; OPAQUE with a base alpha below 1 does not", () => {
    const blend = modelWith([{ name: "Glass", alphaMode: "BLEND", opacity: 0.4 }]);
    expect(renderPathBlockers(blend, { scene: blend })).toContain("model asset has a transparent (BLEND) material");
    expect(resolveAppRenderPath(blend, { scene: blend }, coreOn(), { search: "" }).report.path).toBe("hdr-msaa");
    const opaque = modelWith([{ name: "Body", alphaMode: "OPAQUE", opacity: 0.5 }]);
    expect(renderPathBlockers(opaque, { scene: opaque })).toEqual([]);
    const noMode = modelWith([{ name: "Panel", opacity: 0.5 }]);
    expect(renderPathBlockers(noMode, { scene: noMode })).toContain("model asset has a transparent (BLEND) material");
  });

  it("a materialOverrides opacity below 1 blocks the direct path", () => {
    const tinted = modelWith([{ name: "Body", alphaMode: "OPAQUE", opacity: 1 }], { materialOverrides: [{ opacity: 0.5 }] });
    expect(renderPathBlockers(tinted, { scene: tinted })).toContain("transparent material override");
  });

  it("decoded render items with blending or a transmission lobe are reported once each", () => {
    const param = (values: Record<string, number>) => ({ getParameter: (name: string) => values[name], renderState: {} });
    const items = [
      { material: { renderState: { blend: { src: "src-alpha" } } } },
      { material: { baseMaterial: { renderState: { blend: true } } } },
      { material: param({ u_transmissionFactor: 0.9 }) },
      { material: param({ u_transmissionFactor: 0 }) },
      { material: undefined }
    ];
    expect(directPathItemBlockers(items)).toEqual(["decoded GLB has a transparent (BLEND) material", "decoded GLB has a transmission material"]);
    expect(directPathItemBlockers([{ material: param({ u_volumeThicknessFactor: 0.2 }) }])).toEqual(["decoded GLB has a transmission material"]);
    expect(directPathItemBlockers([{ material: param({}) }])).toEqual([]);
  });

  it("the mount hands decoded blockers to the frame loop once, and they re-decide the path", () => {
    const canvas = {};
    const actor = { collectRenderItems: () => [{ material: { renderState: { blend: true } } }] };
    const blockers = decodedModelDirectPathBlockers([{ actor }]);
    recordDecodedDirectPathBlockers(canvas, blockers);
    expect(takeDecodedDirectPathBlockers(canvas)).toEqual(["decoded GLB has a transparent (BLEND) material"]);
    expect(takeDecodedDirectPathBlockers(canvas)).toEqual([]);
    const s = plain();
    expect(resolveAppRenderPath(s, { scene: s }, coreOn(), { search: "" }).report.path).toBe("direct");
    const redecided = resolveAppRenderPath(s, { scene: s }, coreOn(), { search: "", extraBlockers: blockers });
    expect(redecided.report.path).toBe("hdr-msaa");
    expect(redecided.report.reason).toContain("decoded GLB has a transparent (BLEND) material");
  });

  it("an actor that throws while collecting is skipped", () => {
    expect(decodedModelDirectPathBlockers([{ actor: { collectRenderItems: () => { throw new Error("not ready"); } } }])).toEqual([]);
  });
});

describe("RP-02: a background image keeps the HDR target", () => {
  it("lists the background image as a blocker", () => {
    const s = { ...plain(), backgroundImage: { texture: "/sky.png" } } as unknown as AuraSceneSnapshot;
    expect(renderPathBlockers(s, { scene: s })).toContain("background image");
    expect(resolveAppRenderPath(s, { scene: s }, coreOn(), { search: "" }).report.path).toBe("hdr-msaa");
  });
});

describe("RP-03: blockers that appear after mount", () => {
  it("vetoes are reference counted per reason and feed the next mount", () => {
    const canvas = {};
    const releaseA = vetoDirectPath(canvas, 'custom post pass "invert"');
    const releaseB = vetoDirectPath(canvas, 'custom post pass "invert"');
    expect(directPathVetoReasons(canvas)).toEqual(['custom post pass "invert"']);
    releaseA();
    releaseA();
    expect(directPathVetoReasons(canvas)).toEqual(['custom post pass "invert"']);
    releaseB();
    expect(directPathVetoReasons(canvas)).toEqual([]);
    expect(directPathVetoReasons(undefined)).toEqual([]);
  });

  it("node-level blockers cover runtime-added effects and materials", () => {
    expect(nodeDirectPathBlockers([effects.bloom({ intensity: 0.4 }).toJSON() as AuraSceneNode])).toEqual(['effect "bloom"']);
    expect(nodeDirectPathBlockers([primitives.box().toJSON() as AuraSceneNode])).toEqual([]);
    expect(nodeDirectPathBlockers([primitives.box({ material: material.pbr({ color: "#fff", opacity: 0.5 }) }).toJSON() as AuraSceneNode])).toEqual(["transparent material"]);
  });

  const registryHarness = (direct: boolean) => {
    const canvas = {};
    setDirectRenderPath(canvas, direct);
    let current = plain();
    const remounts: AuraSceneSnapshot[] = [];
    const subtrees: AuraSceneNode[] = [];
    const warnings: string[] = [];
    const registry = createAuraRuntimeNodeRegistry(current);
    registry.configure({
      flags: coreOn(),
      app: { canvas } as unknown as AuraApp,
      getScene: () => current,
      setScene: (next) => { current = next; remounts.push(next); registry.reset(next); },
      diagnostic: (message) => warnings.push(message)
    });
    // A compiled scene stand-in: the subtree path is taken only when attached and the compiler flag is on (default-on).
    const compiled = {};
    bindRuntimeCompiled(compiled as never, { addSubtree: (node: AuraSceneNode) => { subtrees.push(node); }, removeSubtree: () => true } as never);
    registry.attachCompiled(compiled as never);
    return { registry, remounts, subtrees, warnings, scene: () => current };
  };

  it("on the direct path an effect added at runtime remounts the scene with it, keeping earlier runtime additions", () => {
    const h = registryHarness(true);
    h.registry.add(primitives.box({ name: "crate" }).runtime({ id: "crate" }));
    expect(h.subtrees.length).toBe(1);
    expect(h.remounts.length).toBe(0);
    h.registry.add(effects.bloom({ intensity: 0.5 }).toJSON() as AuraSceneNode);
    expect(h.remounts.length).toBe(1);
    const names = h.scene().nodes.map((node) => node.kind === "effect" ? `effect:${node.effect}` : (node as { name?: string }).name ?? node.kind);
    expect(names).toContain("effect:bloom");
    expect(names).toContain("crate");
    expect(h.registry.has("crate")).toBe(true);
    expect(h.warnings.some((w) => w.startsWith('DIRECT_PATH_REMOUNT: runtime node "runtime-add-'))).toBe(true);
    // The remounted scene now carries the blocker, so the next mount takes the HDR target.
    expect(resolveAppRenderPath(h.scene(), { scene: h.scene() }, coreOn(), { search: "" }).report.path).toBe("hdr-msaa");
  });

  it("off the direct path the same addition does not remount", () => {
    const h = registryHarness(false);
    h.registry.add(effects.bloom({ intensity: 0.5 }).toJSON() as AuraSceneNode);
    expect(h.warnings.some((w) => w.startsWith("DIRECT_PATH_REMOUNT"))).toBe(false);
    expect(h.remounts.length).toBe(0);
    expect(h.subtrees.length).toBe(1);
  });
});

describe("RP-04: debug URL typos warn and fall back", () => {
  it("?aura3d-render= typo keeps the code option and reports QUALITY_URL_IGNORED", () => {
    const s = plain();
    const chosen = resolveAppRenderPath(s, { scene: s, quality: "production" }, coreOn(), { search: "?aura3d-render=prodution" });
    expect(chosen.report.quality).toBe("production");
    expect(chosen.warnings).toContain('QUALITY_URL_IGNORED: ?aura3d-render=prodution (expected auto|production|safe-basic|cinematic); using "production"');
    expect(resolveAppRenderPath(s, { scene: s }, coreOn(), { search: "?aura3d-render=prodution" }).report.quality).toBe("auto");
    expect(resolveAppRenderPath(s, { scene: s }, coreOn(), { search: "?aura3d-render=production" }).report.quality).toBe("production");
  });

  it("?aura3d-bloom-fusion= typo falls back to the option on a bloom scene", () => {
    const s = scene().add(primitives.box()).add(effects.bloom({ intensity: 0.4 })).toJSON();
    const chosen = resolveAppRenderPath(s, { scene: s }, coreOn(), { search: "?aura3d-bloom-fusion=fused" });
    expect(chosen.report.bloomFusion).toBe("separable");
    expect(chosen.warnings.some((w) => w.startsWith("QUALITY_URL_IGNORED: ?aura3d-bloom-fusion=fused"))).toBe(true);
  });

  it("strict apps and invalid code options still throw", () => {
    const s = plain();
    expect(() => resolveAppRenderPath(s, { scene: s, strict: true }, coreOn(), { search: "?aura3d-render=bogus" })).toThrow("QUALITY_OPTION_INVALID:?aura3d-render=bogus");
    expect(() => resolveAppRenderPath(s, { scene: s, quality: "ultra" as never }, coreOn(), { search: "" })).toThrow(/QUALITY_OPTION_INVALID:quality=ultra/);
  });

  it("?aura3d-quality= and ?aura3d-adaptive= typos warn and keep the options", () => {
    const parsed = parseQualityRendererOptions({ quality: "medium", adaptive: false }, "?aura3d-quality=hgih&aura3d-adaptive=yes");
    expect(parsed.requested).toBe("medium");
    expect(parsed.requestedSource).toBe("options");
    expect(parsed.adaptive).toBe(false);
    expect(parsed.warnings.filter((w) => w.startsWith("QUALITY_URL_IGNORED"))).toHaveLength(2);
    expect(() => parseQualityRendererOptions(undefined, "?aura3d-quality=hgih", {}, { strict: true })).toThrow("QUALITY_OPTION_INVALID:?aura3d-quality=hgih");
  });
});

describe("RP-06: safe-basic names what it does not render", () => {
  it("warns with the blockers and lists them in the reason", () => {
    const s = scene().add(primitives.box()).add(effects.bloom({ intensity: 0.4 })).toJSON();
    const chosen = resolveAppRenderPath(s, { scene: s, quality: "safe-basic" }, coreOn(), { search: "" });
    expect(chosen.report.path).toBe("direct");
    expect(chosen.report.reason).toContain('not rendered on this path: effect "bloom"');
    expect(chosen.warnings.some((w) => w.startsWith('SAFE_BASIC_DROPS: quality "safe-basic"') && w.includes('effect "bloom"'))).toBe(true);
    const clean = resolveAppRenderPath(plain(), { scene: plain(), quality: "safe-basic" }, coreOn(), { search: "" });
    expect(clean.warnings).toEqual([]);
    expect(resolveRenderPath({ quality: "safe-basic", blockers: [] }).reason).toBe('quality "safe-basic" always uses the direct path');
  });
});

describe("ENG-FPS: windowed frame rate", () => {
  // The meter counts one frame per task (a canvas presents once per task), so each sample here runs in its own microtask turn.
  const frames = async (meter: ReturnType<typeof createFrameRateMeter>, times: readonly number[]) => {
    for (const time of times) { meter.sample(time); await Promise.resolve(); }
  };

  it("averages the frames of the last second", async () => {
    const meter = createFrameRateMeter();
    expect(meter.fps()).toBe(0);
    await frames(meter, Array.from({ length: 121 }, (_, i) => i * (1000 / 60)));
    expect(meter.fps()).toBeCloseTo(60, 0);
  });

  it("reports a loop slower than one frame per second at its real rate, not 60", async () => {
    const meter = createFrameRateMeter();
    await frames(meter, [1000, 3500]);
    expect(meter.fps()).toBe(0.4);
    await frames(meter, [4676]);
    expect(meter.fps()).toBe(0.9);
  });

  it("smooths one long frame instead of reporting it alone", async () => {
    const meter = createFrameRateMeter();
    await frames(meter, [...Array.from({ length: 30 }, (_, i) => i * 33.3), 29 * 33.3 + 100]);
    expect(meter.fps()).toBeGreaterThan(25);
    expect(meter.fps()).toBeLessThan(31);
  });

  it("ignores repeated and non-finite timestamps", async () => {
    const meter = createFrameRateMeter();
    await frames(meter, [0, 0, Number.NaN, 500]);
    expect(meter.fps()).toBe(2);
  });

  it("counts several renders in one task (a loop of app.step() calls) as one presented frame", async () => {
    const meter = createFrameRateMeter();
    meter.sample(0); meter.sample(10); meter.sample(20);
    await Promise.resolve();
    meter.sample(1000); meter.sample(1010);
    await Promise.resolve();
    expect(meter.fps()).toBe(1);
  });
});

describe("top-tennis C11 engine part: renderer.quality", () => {
  it("the mount honours the string form", () => {
    expect(resolveMountQuality({ quality: "low" } as never).tier).toBe("low");
    expect(resolveMountQuality({ quality: { tier: "medium" } } as never).tier).toBe("medium");
    expect(resolveMountQuality({ quality: "high" } as never).tier).toBe("high");
    expect(resolveMountQuality({ quality: "auto" } as never).tier).toBe("high");
    expect(resolveMountQuality(undefined).tier).toBe("high");
  });

  it("warns that a string tier is fixed on every device, and on an unknown tier", () => {
    expect(rendererQualityWarnings({ quality: "high" } as never)[0]).toMatch(/^RENDERER_QUALITY_STRING: renderer.quality "high" is a fixed tier/);
    expect(rendererQualityWarnings({ quality: "hgih" } as never)[0]).toMatch(/^RENDERER_QUALITY_INVALID: renderer.quality=hgih/);
    expect(rendererQualityWarnings({ quality: { tier: "nope" } } as never)[0]).toMatch(/^RENDERER_QUALITY_INVALID: renderer.quality.tier=nope/);
    expect(rendererQualityWarnings({ quality: "auto" } as never)).toEqual([]);
    expect(rendererQualityWarnings({ quality: { tier: "high" } } as never)).toEqual([]);
    expect(rendererQualityWarnings(undefined)).toEqual([]);
  });
});
