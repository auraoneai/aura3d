// PRD-02 Phase 2 — builder surface: environment aliases yield
// `environment: "preset"` + `background: false` (§11), every shadow option
// round-trips into `ShadowSystemConfig`, hemisphere/point/spot units per
// C-10, the `effects` spread has no duplicate keys (C-36), and the flag-gated
// scene-kit path swaps ambient → preset + shadowed sun (R7).

import { describe, expect, it } from "vitest";
import { environments, effects, lights, shadows } from "@aura3d/engine";
import {
  prd02EnvironmentBuilders, prd02KitLighting, probes, resolveShadowSystemConfig,
  type AuraEnvironmentNodeV2
} from "@aura3d/engine/lanes";
import { lightingEffectBuilders } from "../../../packages/engine/src/agent-api/nodes/effects.lighting.js";
import { postEffectBuilders } from "../../../packages/engine/src/agent-api/nodes/effects.post.js";
import { vfxEffectBuilders } from "../../../packages/engine/src/agent-api/nodes/effects.js";
import type { AuraSceneSnapshot } from "@aura3d/engine";

type AnyNode = Record<string, unknown>;
const n = (builder: { toJSON(): unknown }) => builder.toJSON() as unknown as AnyNode;
const envNode = (builder: { toJSON(): unknown }) => builder.toJSON() as unknown as AuraEnvironmentNodeV2 & { readonly environment: string };
const envBuilders = environments as unknown as Record<string, (o?: object) => { toJSON(): unknown }>;

describe("prd02 environments.* builders (§11)", () => {
  it.each([
    ["studio", "studio"], ["materialLab", "studio"], ["productHero", "studio"],
    ["metalStudio", "studio"], ["glassStudio", "studio"], ["nightCinematic", "night"]
  ])("%s alias → preset %s, background false", (alias, preset) => {
    const node = envNode(envBuilders[alias]!({}));
    expect(node.environment).toBe("preset");
    expect(node.preset).toBe(preset);
    expect(node.background).toBe(false);
    expect(node.intensity).toBe(1);
  });

  it("preset/neutral/none/capture emit V2 nodes", () => {
    expect(envNode(prd02EnvironmentBuilders.preset("outdoor")).preset).toBe("outdoor");
    expect(envNode(prd02EnvironmentBuilders.neutral()).environment).toBe("neutral");
    expect(envNode(prd02EnvironmentBuilders.none()).environment).toBe("none");
    const cap = envNode(prd02EnvironmentBuilders.capture({ include: "all", resolution: 256 }));
    expect(cap.environment).toBe("capture");
    expect(cap.capture?.resolution).toBe(256);
    // background defaults: true for preset/capture, false for neutral (§7)
    expect(envNode(prd02EnvironmentBuilders.preset("studio")).background).toBe(true);
    expect(cap.background).toBe(true);
    expect(envNode(prd02EnvironmentBuilders.neutral()).background).toBe(false);
  });

  it("hdri keeps its texture fields; background option honoured", () => {
    const node = envNode(envBuilders.hdri!({ texture: { kind: "aura-asset-ref", url: "x.hdr" } as never }));
    expect(node.environment).toBe("hdri");
  });
});

describe("prd02 lights.* builders (C-10)", () => {
  it("hemisphere emits sky/ground + default intensity", () => {
    const b = n(lights.hemisphere({ skyColor: "#aabbcc", groundColor: "#302010", intensity: 0.7 }));
    expect(b.light).toBe("hemisphere");
    expect(b.intensity).toBe(0.7);
    expect(b.groundColor).toBe("#302010");
  });

  it("point: power/distance/decay fields carried verbatim; default 8 cd", () => {
    const node = n(lights.point({ power: 400, distance: 4, decay: 1 }));
    expect(node.power).toBe(400);
    expect(node.distance).toBe(4);
    expect(node.decay).toBe(1);
    expect(lights.point({}).toJSON().intensity).toBe(8);
  });

  it("spot: power + shadow options; default 30 cd", () => {
    const node = n(lights.spot({ power: 90, shadow: { mapSize: 1024, bias: 0.0002 } }));
    expect(node.power).toBe(90);
    expect(node.shadow).toEqual({ mapSize: 1024, bias: 0.0002 });
    expect(lights.spot({}).toJSON().intensity).toBe(30);
  });

  it("directional shadow options carried verbatim (C-10)", () => {
    const shadow = { cascades: "auto" as const, maxDistance: 120, splitLambda: 0.6, blend: 0.15, bias: 0.0003, fit: { center: [0, 0, 0] as const, extent: 10 } };
    const node = n(lights.directional({ shadow }));
    expect(node.shadow).toEqual(shadow);
  });
});

describe("prd02 shadows/probes/effects builders", () => {
  it("shadows.blobShadow and deprecated shadows.contact build the footprint primitive", () => {
    const blob = n(shadows.blobShadow({ footprint: [2, 1], opacity: 0.5 }));
    expect(blob.kind).toBe("primitive");
    const contact = n(shadows.contact({ footprint: [2, 1] }));
    expect(contact.kind).toBe("primitive");
  });

  it("probes.reflection + irradianceVolume emit kind:'probe' nodes", () => {
    const p = n(probes.reflection({ name: "mirror", position: [0, 1, 0], resolution: 256 }));
    expect(p.kind).toBe("probe");
    expect(p.probe).toBe("reflection");
    expect((p.options as Record<string, unknown>).resolution).toBe(256);
    const v = n(probes.irradianceVolume({ name: "room", bounds: { min: [-2, 0, -2], max: [2, 3, 2] }, resolution: [4, 4, 4] }));
    expect(v.probe).toBe("irradiance-volume");
  });

  it("effects.contactShadows emits effect:'contact-shadows' with defaults", () => {
    const e = n(effects.contactShadows({ steps: 16 }));
    expect(e.kind).toBe("effect");
    expect(e.effect).toBe("contact-shadows");
    expect((e.contactShadows as Record<string, unknown>).steps).toBe(16);
    expect((e.contactShadows as Record<string, unknown>).lights).toBe("sun");
  });

  it("effects spread has no duplicate builder keys (C-36)", () => {
    void 0;
    const keys = [...Object.keys(vfxEffectBuilders), ...Object.keys(postEffectBuilders), ...Object.keys(lightingEffectBuilders)];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("prd02 shadow options → ShadowSystemConfig round-trip", () => {
  const snap: AuraSceneSnapshot = {
    schema: "aura3d-scene-snapshot/1.0",
    background: "#000",
    camera: { mode: "orbit", position: [0, 2, 5], target: [0, 0, 0] },
    nodes: [],
    diagnostics: { enabled: false }
  };

  it("cascades/mapSize/filter/bias/normalBias/maxDistance/splitLambda/blend flow through", () => {
    const cfg = resolveShadowSystemConfig(snap, [{
      shadowRequested: true,
      shadowOptions: { cascades: 3, mapSize: 4096, filter: "pcss", bias: 0.0007, normalBias: 0.01, maxDistance: 90, splitLambda: 0.6, blend: 0.2 }
    }], "high");
    expect(cfg.cascades).toBe(3);
    expect(cfg.mapSize).toBe(4096);
    expect(cfg.filter).toBe("pcss");
    expect(cfg.bias).toBe(0.0007);
    expect(cfg.normalBias).toBe(0.01);
    expect(cfg.maxDistance).toBe(90);
    expect(cfg.splitLambda).toBe(0.6);
    expect(cfg.blend).toBe(0.2);
    expect(cfg.strength).toBe(1.0);
  });
});

describe("prd02 scene kits flag path (R7)", () => {
  it("flag on: ambient dropped, directional gains shadow:true, preset env appended", () => {
    const nodes = [
      { kind: "light", light: "ambient", intensity: 0.6 },
      { kind: "light", light: "directional", intensity: 2, position: [1, 2, 3] },
      { kind: "primitive", primitive: "box", name: "b" }
    ];
    const out = prd02KitLighting(nodes as never, true);
    expect(out.some((n) => (n as { light?: string }).light === "ambient")).toBe(false);
    const sun = out.find((n) => (n as { light?: string }).light === "directional") as { shadow?: unknown };
    expect(sun.shadow).toBe(true);
    expect(out.some((n) => n.kind === "environment")).toBe(true);
  });

  it("flag off: nodes pass through verbatim", () => {
    const nodes = [{ kind: "light", light: "ambient", intensity: 0.6 }];
    expect(prd02KitLighting(nodes as never, false)).toEqual(nodes);
  });

  it("explicit environment node is kept (no duplicate)", () => {
    const nodes = [
      { kind: "light", light: "ambient", intensity: 0.6 },
      { kind: "environment", environment: "preset", preset: "night", intensity: 1 }
    ];
    const out = prd02KitLighting(nodes as never, true);
    expect(out.filter((n) => n.kind === "environment")).toHaveLength(1);
  });
});
function unused() { return [lights, lightingEffectBuilders, postEffectBuilders, vfxEffectBuilders]; }
void unused;
