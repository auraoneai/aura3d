import { describe, expect, it } from "vitest";
import {
  clampLookOverrides,
  looks,
  resolveLookExpansion,
  resolveQrFlags,
  stubLookContractRequirements,
  lookPresets,
  lookPresetIds
} from "../../../packages/engine/src";
import type {
  AuraEffectNode,
  AuraEnvironmentNode,
  AuraGroupNode,
  AuraLightNode,
  AuraLookNode,
  AuraLookPreset,
  AuraBiomeId,
  AuraSceneNode,
  AuraSceneSnapshot,
  AuraStudioLookId
} from "../../../packages/engine/src";

// T1.1 — the 15 v0 look presets. §7.1 requires the id set to equal the C-26
// AuraBiomeId union (11) plus the C-34 AuraStudioLookId union (4); the
// satisfies Record<AuraLookId, AuraLookPreset> in lookPresets.ts is the
// compile-time half of this check.
const EXPECTED_BIOME_IDS: readonly AuraBiomeId[] = [
  "outdoor-day",
  "golden-hour",
  "overcast",
  "night-city",
  "polar-night",
  "alpine-snow",
  "interior-warm",
  "interior-neutral",
  "interior-industrial",
  "space",
  "underwater"
];
const EXPECTED_STUDIO_IDS: readonly AuraStudioLookId[] = [
  "product-studio",
  "character-showcase",
  "arena-fight",
  "neon-arcade"
];

// Same channel weights as agent-api/index.ts:3544 (linear sRGB luma).
function luma(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return Number.NaN;
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16) / 255);
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

describe("lookPresets (T1.1)", () => {
  it("exposes exactly the C-26 AuraBiomeId ∪ C-34 AuraStudioLookId union (15 ids)", () => {
    const expected = [...EXPECTED_BIOME_IDS, ...EXPECTED_STUDIO_IDS].sort();
    expect([...lookPresetIds].sort()).toEqual(expected);
    for (const id of EXPECTED_BIOME_IDS) {
      const preset = lookPresets[id] as AuraLookPreset;
      expect(preset.biome, `${id} is a biome pass-through`).toBe(id);
    }
  });

  it("never emits an ambient light in the v0 expansion", () => {
    for (const preset of Object.values(lookPresets)) {
      // The v0 interface has no ambient field; assert the data shape stays honest.
      expect(Object.keys(preset.v0)).not.toContain("ambient");
      expect((preset.v0.key as { type?: string }).type ?? "directional").not.toBe("ambient");
    }
  });

  it("gives every entry key.shadow === true", () => {
    for (const preset of Object.values(lookPresets)) {
      expect(preset.v0.key.shadow, `${preset.id} key.shadow`).toBe(true);
    }
  });

  it("keeps every non-exception background at luma >= 0.06", () => {
    for (const preset of Object.values(lookPresets)) {
      if (preset.backgroundException) continue;
      expect(luma(preset.v0.background), `${preset.id} background ${preset.v0.background}`).toBeGreaterThanOrEqual(0.06);
    }
  });

  it("honours the lane-chosen hdri mapping", () => {
    expect(lookPresets["outdoor-day"].v0.hdri).toBe("autumn_field_puresky_1k");
    expect(lookPresets["overcast"].v0.hdri).toBe("autumn_field_puresky_1k");
    expect(lookPresets["alpine-snow"].v0.hdri).toBe("autumn_field_puresky_1k");
    expect(lookPresets["golden-hour"].v0.hdri).toBe("kloppenheim_06_puresky_1k");
    for (const id of ["product-studio", "character-showcase", "arena-fight", "interior-warm", "interior-neutral", "interior-industrial"] as const) {
      expect(lookPresets[id].v0.hdri, id).toBe("studio_small_08_1k");
    }
    for (const id of ["night-city", "space", "underwater", "polar-night"] as const) {
      expect(lookPresets[id].v0.hdri, id).toBeNull();
      expect(lookPresets[id].backgroundException, id).toBe(true);
    }
  });

  it("freezes presets (frozen; agents can print them)", () => {
    for (const preset of Object.values(lookPresets)) {
      expect(Object.isFrozen(preset), preset.id).toBe(true);
      expect(Object.isFrozen(preset.v0)).toBe(true);
      expect(Object.isFrozen(preset.v0.key)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// T1.2/T1.3 — the `looks` authoring surface (PRD §7.1).
// ---------------------------------------------------------------------------

const snapshotOf = (nodes: readonly AuraSceneNode[]): AuraSceneSnapshot => ({
  schema: "aura3d-scene-snapshot/1.0",
  background: "#0a0e14",
  camera: { mode: "orbit", position: [3, 2, 3], target: [0, 0, 0] },
  nodes,
  diagnostics: { enabled: false }
});

/** Force the v0 expansion regardless of ambient env flags. */
const V0 = { expansion: "v0" as const };

function presetGroup(id: Parameters<typeof looks.preset>[0], overrides?: Parameters<typeof looks.preset>[1]): AuraGroupNode {
  const built = looks.preset(id, overrides, V0);
  expect(built, "v0 expansion returns a builder").toHaveProperty("toJSON");
  const node = (built as { toJSON(): AuraSceneNode }).toJSON();
  expect(node.kind).toBe("group");
  return node as AuraGroupNode;
}

describe("looks.preset v0 expansion (T1.2)", () => {
  it("expands outdoor-day into a aura-look:<id> group of today's builders", () => {
    const g = presetGroup("outdoor-day");
    expect(g.name).toBe("aura-look:outdoor-day");

    const envs = g.children.filter((n): n is AuraEnvironmentNode => n.kind === "environment");
    expect(envs).toHaveLength(1);
    expect(envs[0].environment).toBe("hdri");
    expect(envs[0].texture?.id).toBe("autumnFieldPuresky1k");

    const dirs = g.children.filter(
      (n): n is AuraLightNode => n.kind === "light" && n.light === "directional"
    );
    expect(dirs.length).toBeGreaterThanOrEqual(1);
    expect(dirs[0].shadow).toBe(true);

    const fx = g.children.filter((n): n is AuraEffectNode => n.kind === "effect").map((n) => n.effect);
    expect(fx).toEqual(expect.arrayContaining(["color-grade", "ambient-occlusion", "bloom"]));

    // Never emits an ambient light (§6.2 ambient-kills-ibl).
    expect(g.children.some((n) => n.kind === "light" && n.light === "ambient")).toBe(false);
    // background rides on the group for the handler/diagnostics to read.
    expect((g as { background?: string }).background).toBe(lookPresets["outdoor-day"].v0.background);
  });

  it("returns the flat node list through looks.nodes", () => {
    const nodes = looks.nodes("outdoor-day").map((b) => b.toJSON());
    const g = presetGroup("outdoor-day");
    expect(nodes.map((n) => n.kind)).toEqual(g.children.map((n) => n.kind));
  });

  it("omits env children for no-hdri looks and fog children for no-fog looks", () => {
    const night = presetGroup("night-city");
    expect(night.children.some((n) => n.kind === "environment")).toBe(false);
    const studio = presetGroup("product-studio");
    expect(studio.children.some((n) => n.kind === "effect" && n.effect === "fog")).toBe(false);
    expect(studio.children.some((n) => n.kind === "environment" && (n as AuraEnvironmentNode).environment === "hdri")).toBe(true);
  });

  it("lists and describes all 15 presets", () => {
    expect([...looks.list()].sort()).toEqual([...lookPresetIds].sort());
    expect(looks.describe("golden-hour").v0.hdri).toBe("kloppenheim_06_puresky_1k");
    expect(() => looks.describe("no-such-look" as never)).toThrow("LOOK_UNKNOWN:no-such-look");
  });

  it("appOptions returns the production profile + DPR cap (v0)", () => {
    const options = looks.appOptions("outdoor-day", V0);
    expect(options.renderer?.qualityProfile).toBe("production");
    expect(options.pixelRatio).toBe(1); // no devicePixelRatio under vitest
  });
});

describe("looks expansion resolution (T1.2)", () => {
  it("resolves v0-current-engine with all five contracts missing when nothing is provided", () => {
    const resolved = resolveLookExpansion({ flags: resolveQrFlags({ options: [] }) });
    expect(resolved.expansion).toBe("v0-current-engine");
    expect(resolved.missingContracts).toEqual([
      "environments.preset",
      "lights.hemisphere",
      "output.preset",
      "world.biome",
      "quality.auto"
    ]);
  });

  it("emits a single AuraLookNode under forced v1", () => {
    const node = looks.preset("outdoor-day", undefined, { expansion: "v1" });
    expect((node as AuraLookNode).kind).toBe("look");
    expect((node as AuraLookNode).look).toBe("outdoor-day");
  });

  it("auto → v1 when every contract is provided and its flag is on", () => {
    const restore = stubLookContractRequirements([
      "environments.preset",
      "lights.hemisphere",
      "output.preset",
      "world.biome",
      "quality.auto"
    ]);
    try {
      const flags = resolveQrFlags({ options: "all" });
      expect(resolveLookExpansion({ flags }).expansion).toBe("v1-contracts");
      const node = looks.preset("golden-hour", { exposureEv: 1 }, { flags });
      expect((node as AuraLookNode).kind).toBe("look");
      expect((node as AuraLookNode).overrides?.exposureEv).toBe(1);
    } finally {
      restore();
    }
  });

  it("auto → v0 when flags are off even though providers are present", () => {
    const restore = stubLookContractRequirements([
      "environments.preset",
      "lights.hemisphere",
      "output.preset",
      "world.biome",
      "quality.auto"
    ]);
    try {
      const resolved = resolveLookExpansion({ flags: resolveQrFlags({ options: [] }) });
      expect(resolved.expansion).toBe("v0-current-engine");
      expect(resolved.missingContracts).toHaveLength(5);
    } finally {
      restore();
    }
  });
});

describe("override clamps (T1.3)", () => {
  it("clamps exposureEv to [-2, 2] (5 → 2 → exposure ×4)", () => {
    const g = presetGroup("outdoor-day", { exposureEv: 5 });
    const grade = g.children.find(
      (n): n is AuraEffectNode => n.kind === "effect" && n.effect === "color-grade"
    );
    expect(grade?.exposure).toBeCloseTo(4);
    expect(clampLookOverrides({ exposureEv: -9 })?.exposureEv).toBe(-2);
  });

  it("wraps sun azimuth into [0, 360) and clamps elevation to [-90, 90]", () => {
    const clamped = clampLookOverrides({ sun: { azimuthDeg: -30, elevationDeg: 200 } });
    expect(clamped?.sun?.azimuthDeg).toBe(330);
    expect(clamped?.sun?.elevationDeg).toBe(90);
    const g = presetGroup("outdoor-day", { sun: { azimuthDeg: 90, elevationDeg: 90 } });
    const key = g.children.find(
      (n): n is AuraLightNode => n.kind === "light" && n.name === "look key light"
    );
    // Pole position: azimuth drops out, elevation 90 → straight above.
    // Pole position: azimuth drops out, elevation 90 → straight above.
    expect(key?.position?.[1]).toBeCloseTo(24);
    expect(key?.position?.[0]).toBeCloseTo(0);
    expect(key?.position?.[2]).toBeCloseTo(0);
  });

  it("clamps fogDensityScale to [0, 3]; 0 removes the fog node", () => {
    expect(clampLookOverrides({ fogDensityScale: 9 })?.fogDensityScale).toBe(3);
    const cleared = presetGroup("outdoor-day", { fogDensityScale: 0 });
    expect(cleared.children.some((n) => n.kind === "effect" && n.effect === "fog")).toBe(false);
  });

  it("background override replaces the group background", () => {
    const g = presetGroup("outdoor-day", { background: "#112233" });
    expect((g as { background?: string }).background).toBe("#112233");
    const keep = presetGroup("outdoor-day", { background: "look" });
    expect((keep as { background?: string }).background).toBe(lookPresets["outdoor-day"].v0.background);
  });

  it("resolveDefault: last authored look wins", () => {
    const a = presetGroup("outdoor-day");
    const b = presetGroup("night-city");
    const resolved = looks.resolveDefault(snapshotOf([a, b]));
    expect(resolved.source).toBe("authored");
    expect(resolved.id).toBe("night-city");
  });

  it("resolveDefault: no look nodes → engine-default / none", () => {
    const resolved = looks.resolveDefault(snapshotOf([]));
    expect(resolved).toEqual({ id: "engine-default", source: "none" });
  });
});
