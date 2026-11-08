// N3 plain look path: the neutral output and the no-stacked-fill rule apply only to lit scenes whose author chose no
// look, output or post effect (or to `looks.preset("plain")`); everything authored comes back untouched.
import { describe, expect, it } from "vitest";
import { camera, effects, environments, group, lights, looks, material, primitives, scene, sky } from "../../../packages/engine/src/agent-api/index.js";
import { createPlainOutput, isPlainDefaultOutput, plainLookForNextScene, plainLookOptionsApply, resolvePlainLook, withPlainFillYield } from "../../../packages/engine/src/agent-api/looks/plainLook.js";
import { explicitEnvironmentResolution, prd02ProbeBindIntensities } from "../../../packages/engine/src/agent-api/compiler/environment.js";
import { renderPathBlockers } from "../../../packages/engine/src/agent-api/app/renderPath.js";
import type { AuraSceneNode } from "../../../packages/engine/src/agent-api/nodes/types.js";

const cube = () => primitives.box({ name: "cube", material: material.pbr({ color: "#3a2a24", roughness: 0.55 }) });
const key = () => lights.directional({ name: "key", position: [5, 10, 6], target: [0, 0, 0], intensity: 2.6, shadow: true });
const flat = (nodes: readonly AuraSceneNode[]): AuraSceneNode[] =>
  nodes.flatMap((n) => [n, ...flat(((n as { children?: AuraSceneNode[] }).children) ?? [])]);
const env = (nodes: readonly AuraSceneNode[]) => flat(nodes).find((n) => n.kind === "environment") as unknown as Record<string, unknown>;

describe("resolvePlainLook", () => {
  it("gives a lit scene with nothing authored the neutral output", () => {
    const snap = scene().add(cube()).add(key()).toJSON();
    const plain = resolvePlainLook(snap, {});
    expect(plain?.source).toBe("default");
    expect(plain?.output).toEqual({ toneMapping: "neutral", exposure: 1 });
    expect(isPlainDefaultOutput(plain?.output)).toBe(true);
    expect(isPlainDefaultOutput({ toneMapping: "neutral", exposure: 1 })).toBe(false);
    // Nothing to un-stack: same snapshot object.
    expect(plain?.snapshot).toBe(snap);
  });

  it("makes a neutral room next to a hemisphere light yield its diffuse fill (benchmark spider stack)", () => {
    const snap = scene()
      .add(environments.neutral({ intensity: 0.55, background: false }))
      .add(lights.hemisphere({ skyColor: "#ffffff", groundColor: "#9a9ea6", intensity: 0.9 }))
      .add(key()).add(cube()).toJSON();
    const plain = resolvePlainLook(snap, {})!;
    expect(plain.snapshot).not.toBe(snap);
    expect(env(plain.snapshot.nodes).plainDiffuseYield).toBe(true);
    expect(env(snap.nodes).plainDiffuseYield).toBeUndefined();
    const resolution = explicitEnvironmentResolution(env(plain.snapshot.nodes) as never, null)!;
    expect(resolution.diffuseIntensity).toBe(0);
    expect(resolution.specularIntensity).toBe(0.55);
    // The single-knob bind keeps the reflections and drops only the diffuse term.
    expect(prd02ProbeBindIntensities({ color: [1, 1, 1], intensity: 0.55, environmentMapIntensity: 0.55 }, resolution, true)).toEqual({ diffuseIntensity: 0, specularIntensity: 0.55 });
    const authored = explicitEnvironmentResolution(env(snap.nodes) as never, null)!;
    expect(prd02ProbeBindIntensities({ color: [1, 1, 1], intensity: 0.55, environmentMapIntensity: 0.55 }, authored, true)).toEqual({ diffuseIntensity: 0.55, specularIntensity: 0.55 });
  });

  it("keeps an explicit diffuseIntensity and a neutral room without hemisphere/ambient lights", () => {
    const explicit = scene().add(environments.neutral({ intensity: 1, diffuseIntensity: 0.4 })).add(lights.ambient({ intensity: 0.3 })).add(cube()).toJSON();
    expect(env(resolvePlainLook(explicit, {})!.snapshot.nodes).plainDiffuseYield).toBeUndefined();
    const alone = scene().add(environments.neutral({ intensity: 1 })).add(key()).add(cube()).toJSON();
    expect(resolvePlainLook(alone, {})!.snapshot).toBe(alone);
  });

  it("allows fog and sky in a plain scene", () => {
    const snap = scene().add(sky.gradient({ zenith: "#8fb9e3", horizon: "#e6f0f7" } as never)).add(effects.fog({ mode: "exp", color: "#999999", density: 0.01 })).add(key()).add(cube()).toJSON();
    expect(resolvePlainLook(snap, {})?.source).toBe("default");
  });

  const authored: Record<string, () => ReturnType<typeof scene>> = {
    "no light at all (cold-start look territory)": () => scene().add(cube()),
    "a look preset": () => scene().add(cube()).add(looks.preset("outdoor-day")),
    "a hero rig": () => scene().add(cube()).add(looks.heroRig()),
    "a hero stage": () => scene().add(cube()).add(looks.heroStage()),
    "a bloom effect": () => scene().add(cube()).add(key()).add(effects.bloom({})),
    "a colour grade": () => scene().add(cube()).add(key()).add(effects.colorGrade({ saturation: 1.1 })),
    "an hdri environment": () => scene().add(cube()).add(key()).add(environments.hdri({ texture: "/hdri/x.hdr" } as never)),
    "a nested look": () => scene().add(group("g", [cube(), key(), looks.preset("product-studio")]))
  };
  for (const [label, build] of Object.entries(authored)) {
    it(`does nothing for a scene with ${label}`, () => {
      expect(resolvePlainLook(build().toJSON(), {})).toBeNull();
    });
  }

  it("does nothing when the app authors output, quality or a renderer profile", () => {
    const snap = scene().add(cube()).add(key()).toJSON();
    expect(resolvePlainLook(snap, { output: { toneMapping: "aces" } })).toBeNull();
    expect(resolvePlainLook(snap, { renderer: { output: { exposure: 1.2 } } })).toBeNull();
    expect(resolvePlainLook(snap, { quality: "production" })).toBeNull();
    expect(resolvePlainLook(snap, { renderer: { qualityProfile: "production" } })).toBeNull();
    expect(resolvePlainLook(snap, { renderer: { backend: "webgpu" } })).toBeNull();
    expect(resolvePlainLook(snap, { worker: {} })).toBeNull();
    expect(resolvePlainLook(snap, { plainLook: false })).toBeNull();
    expect(resolvePlainLook(snap, { lighting: {} })).toBeNull();
    expect(resolvePlainLook(scene().add(cube()).add(looks.preset("plain")).toJSON(), { plainLook: false })).toBeNull();
    expect(plainLookOptionsApply({ quality: "auto", renderer: { backend: "webgl2" } })).toBe(true);
  });

  it("does nothing for a background image or an untone-mapped background", () => {
    const base = scene().add(cube()).add(key()).toJSON();
    expect(resolvePlainLook({ ...base, backgroundToneMapped: false }, {})).toBeNull();
    expect(resolvePlainLook({ ...base, backgroundImage: { url: "/bg.png" } } as never, {})).toBeNull();
  });
});

describe('looks.preset("plain")', () => {
  it("emits a key, a hemisphere fill and a reflections-only neutral room, and resolves to the plain output", () => {
    const look = looks.preset("plain").toJSON() as unknown as { name: string; children: AuraSceneNode[] };
    expect(look.name).toBe("aura-look:plain");
    const kinds = look.children.map((c) => `${c.kind}:${(c as { light?: string; environment?: string }).light ?? (c as { environment?: string }).environment}`);
    expect(kinds).toEqual(["environment:neutral", "light:hemisphere", "light:directional"]);
    const snap = scene().add(cube()).add(looks.preset("plain")).add(effects.bloom({})).toJSON();
    const plain = resolvePlainLook(snap, {})!;
    // Explicit: applies next to a post effect too, and the room yields to the look's own hemisphere.
    expect(plain.source).toBe("preset");
    expect(env(plain.snapshot.nodes).plainDiffuseYield).toBe(true);
    // An authored output still wins.
    expect(resolvePlainLook(snap, { output: { toneMapping: "aces" } })).toBeNull();
  });

  it("honours sun, key, reflection and background overrides", () => {
    const look = looks.preset("plain", { key: { intensity: 4, color: "#ffeedd" }, environmentIntensity: 0, background: "#102030" }).toJSON() as unknown as { background?: string; children: Record<string, unknown>[] };
    expect(look.background).toBe("#102030");
    const keyLight = look.children.find((c) => c.light === "directional")!;
    expect(keyLight.intensity).toBe(4);
    expect(keyLight.color).toBe("#ffeedd");
    expect(look.children.find((c) => c.kind === "environment")!.intensity).toBe(0);
  });

  it("does not join the 15 named looks", () => {
    expect(looks.list()).not.toContain("plain");
  });
});

describe("plain output on the render path", () => {
  it("reports the plain output as its own HDR-target reason", () => {
    const snap = scene().add(cube()).add(key()).toJSON();
    expect(renderPathBlockers(snap, { scene: snap, output: createPlainOutput() } as never)).toContain("plain look: neutral tone mapping (no look or output authored)");
    expect(renderPathBlockers(snap, { scene: snap, output: { toneMapping: "neutral" } } as never)).toContain("output options (tone mapping, exposure, dithering) are authored");
  });

  it("withPlainFillYield applies the no-stack rule to a later scene", () => {
    const next = scene().add(environments.neutral({ intensity: 1 })).add(lights.hemisphere({ intensity: 1 })).add(cube()).toJSON();
    expect(env(withPlainFillYield(next).nodes).plainDiffuseYield).toBe(true);
    const plainNext = scene().add(cube()).add(key()).toJSON();
    expect(withPlainFillYield(plainNext)).toBe(plainNext);
  });

  it("setScene on a plain-booted app: a look scene drops the neutral output, a plain scene keeps it", () => {
    const lookNext = scene().add(looks.preset("outdoor-day")).add(cube()).toJSON();
    const dropped = plainLookForNextScene(lookNext, {});
    expect(dropped.output).toBeUndefined();
    expect(dropped.snapshot).toBe(lookNext);
    const bloomNext = scene().add(cube()).add(key()).add(effects.bloom({ intensity: 0.3 })).toJSON();
    expect(plainLookForNextScene(bloomNext, {}).output).toBeUndefined();
    const plainNext = scene().add(environments.neutral({ intensity: 1 })).add(lights.hemisphere({ intensity: 1 })).add(cube()).toJSON();
    const kept = plainLookForNextScene(plainNext, {});
    expect(isPlainDefaultOutput(kept.output)).toBe(true);
    expect(env(kept.snapshot.nodes).plainDiffuseYield).toBe(true);
  });
});
