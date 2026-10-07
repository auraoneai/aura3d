import { describe, expect, it } from "vitest";
import {
  physicalLightDescriptor,
  selectShadowedLights,
  resolveShadowSystemConfig,
  resolveLightingTier,
  sceneShadowRadius,
  type PhysicalLightDescriptor
} from "@aura3d/engine/lanes";
import type { AuraLightNode, AuraSceneSnapshot } from "@aura3d/engine";

const FOUR_PI = 4 * Math.PI;

function lightNode(over: Partial<AuraLightNode> & { light: AuraLightNode["light"] }): AuraLightNode {
  return { kind: "light", intensity: 1, ...over } as AuraLightNode;
}

describe("prd02 physical light units (PRD-02 §6.3)", () => {
  it("point: power → cd = lm/4π; distance/decay pass through", () => {
    const d = physicalLightDescriptor(lightNode({ light: "point", intensity: 1, distance: 4, decay: 1, power: 400 }), "p")!;
    expect(d.kind).toBe("point");
    expect(d.range).toBe(4);
    expect(d.decay).toBe(1);
    expect(Math.abs(d.intensity - 400 / FOUR_PI)).toBeLessThan(1e-9);
  });

  it("point defaults: 8 cd, decay 2, range 0", () => {
    const d = physicalLightDescriptor(lightNode({ light: "point", intensity: undefined as never }), "p")!;
    expect(d.intensity).toBe(8);
    expect(d.decay).toBe(2);
    expect(d.range).toBe(0);
  });

  it("spot: power → cd = lm/π (PRD-02 spec), defaults 30 cd", () => {
    const powered = physicalLightDescriptor(lightNode({ light: "spot", intensity: 1, power: Math.PI * 30 }), "s")!;
    expect(powered.intensity).toBeCloseTo(30, 9);
    const unpowered = physicalLightDescriptor(lightNode({ light: "spot", intensity: undefined as never }), "s")!;
    expect(unpowered.intensity).toBe(30);
  });

  it("rect/softbox: kind rect-area with authored size", () => {
    const d = physicalLightDescriptor(lightNode({ light: "rect", intensity: 2, width: 4, height: 2 }), "r")!;
    expect(d.kind).toBe("rect-area");
    expect(d.authoredWidth).toBe(4);
    expect(d.authoredHeight).toBe(2);
  });

  it("ambient/hemisphere are non-punctual (environment path)", () => {
    expect(physicalLightDescriptor(lightNode({ light: "ambient", intensity: 2 }), "a")).toBeNull();
    expect(physicalLightDescriptor(lightNode({ light: "hemisphere", intensity: 1 }), "h")).toBeNull();
  });

  it("shadow:true requests a caster; shadow:false disables", () => {
    const on = physicalLightDescriptor(lightNode({ light: "spot", intensity: 1, shadow: true }), "s")!;
    expect(on.shadowRequested).toBe(true);
    expect(on.shadowDisabled).toBe(false);
    const off = physicalLightDescriptor(lightNode({ light: "spot", intensity: 1, shadow: false }), "s")!;
    expect(off.shadowRequested).toBe(false);
    expect(off.shadowDisabled).toBe(true);
  });
});

describe("prd02 caster selection (PRD-02 §6.4)", () => {
  const d = (over: Partial<PhysicalLightDescriptor>): PhysicalLightDescriptor => ({
    kind: "point", name: "x", color: [1, 1, 1], intensity: 1, position: [0, 0, 0],
    direction: [0, -1, 0], range: 0, spotAngle: 0, penumbra: 0, decay: 2,
    shadowPriority: 1, shadowRequested: false, authoredLight: "point", ...over
  });

  it("ambient + 10 point lights → zero casters (no implicit promotion)", () => {
    const pts = Array.from({ length: 10 }, (_, i) => d({ name: `p${i}`, kind: "point" }));
    const sel = selectShadowedLights(pts, { autoSunShadow: true });
    expect(sel.casters).toHaveLength(0);
    expect(sel.droppedNames).toHaveLength(0);
  });

  it("sun + spot both shadow:true → 2 casters", () => {
    const sel = selectShadowedLights([
      d({ name: "sun", kind: "directional", shadowRequested: true, shadowPriority: 3 }),
      d({ name: "key", kind: "spot", shadowRequested: true, shadowPriority: 2 })
    ]);
    expect(sel.casters.map((c) => c.name).sort()).toEqual(["key", "sun"]);
  });

  it("autoSunShadow promotes brightest directional only when no explicit setting", () => {
    const sel = selectShadowedLights([
      d({ name: "sunA", kind: "directional", intensity: 5, shadowPriority: 3 }),
      d({ name: "sunB", kind: "directional", intensity: 8, shadowPriority: 3 }),
      d({ name: "fill", kind: "point", intensity: 100 })
    ]);
    expect(sel.casters).toHaveLength(1);
    expect(sel.casters[0]!.name).toBe("sunB");
    // explicit directional shadow:false suppresses autoSun entirely
    const sel2 = selectShadowedLights([
      d({ name: "sunA", kind: "directional", intensity: 5, shadowDisabled: true }),
      d({ name: "sunB", kind: "directional", intensity: 8 })
    ]);
    expect(sel2.casters).toHaveLength(0);
  });

  it("point/spot are never promoted implicitly", () => {
    const sel = selectShadowedLights([d({ name: "p", kind: "point" }), d({ name: "s", kind: "spot" })]);
    expect(sel.casters).toHaveLength(0);
  });

  it("tier cap drops excess requesters and names them", () => {
    const sel = selectShadowedLights([
      d({ name: "sun", kind: "directional", shadowRequested: true, shadowPriority: 3 }),
      d({ name: "a", kind: "spot", shadowRequested: true, shadowPriority: 2 }),
      d({ name: "b", kind: "spot", shadowRequested: true, shadowPriority: 2 }),
      d({ name: "c", kind: "point", shadowRequested: true, shadowPriority: 1 })
    ], { max: 2 });
    expect(sel.casters).toHaveLength(2);
    expect(sel.droppedNames).toEqual(["b", "c"]);
  });
});

describe("prd02 shadow system config (PRD-02 §6.4/§6.8)", () => {
  const snapshot = (nodes: unknown[]): AuraSceneSnapshot => ({
    schema: "aura3d-scene-snapshot/1.0",
    background: "#000000",
    camera: { mode: "orbit", position: [0, 2, 5], target: [0, 0, 0] },
    nodes: nodes as never,
    diagnostics: { enabled: false }
  });

  it("strength is 1.0 for every category (full shadow removal)", () => {
    const cfg = resolveShadowSystemConfig(snapshot([]), [{ shadowRequested: true }], "medium");
    expect(cfg.strength).toBe(1.0);
  });

  it("mapSize/cascades follow the C-27 tier; cascades 'auto' → 1 when radius ≤ 15 m", () => {
    const small = snapshot([{ kind: "box", name: "a", position: [1, 0, 1], scale: 1 }]);
    const cfgSmall = resolveShadowSystemConfig(small, [{ shadowRequested: true }], "high");
    expect(cfgSmall.mapSize).toBe(2048);
    expect(cfgSmall.cascades).toBe(1); // radius ~2.4 ≤ 15
    const big = snapshot([{ kind: "box", name: "a", position: [60, 0, 0], scale: 1 }]);
    const cfgBig = resolveShadowSystemConfig(big, [{ shadowRequested: true }], "high");
    expect(cfgBig.cascades).toBe(3); // high tier
  });

  it("size is independent of nodes parked at y=-70", () => {
    const parked = snapshot([
      { kind: "box", name: "a", position: [1, 0, 1], scale: 1 },
      { kind: "box", name: "parked", position: [0, -70, 0], scale: 1000 }
    ]);
    const without = snapshot([{ kind: "box", name: "a", position: [1, 0, 1], scale: 1 }]);
    expect(sceneShadowRadius(parked)).toBe(sceneShadowRadius(without));
  });

  it("maxDistance = min(camera.far, 150); lambda 0.75; blend 0.1; bias 0", () => {
    const cfg = resolveShadowSystemConfig(snapshot([]), [{ shadowRequested: true }], "medium", { cameraFar: 80 });
    expect(cfg.maxDistance).toBe(80);
    expect(cfg.splitLambda).toBe(0.75);
    expect(cfg.blend).toBe(0.1);
    expect(cfg.bias).toBe(0);
  });

  it("resolveLightingTier: 'auto' follows the context tier", () => {
    expect(resolveLightingTier("auto", { quality: { tier: "high" } })).toBe("high");
    expect(resolveLightingTier(undefined, { quality: { tier: "low" } })).toBe("low");
    expect(resolveLightingTier("ultra", { quality: { tier: "low" } })).toBe("ultra");
  });
});
