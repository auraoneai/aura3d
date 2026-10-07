import { describe, expect, it } from "vitest";
import {
  collectGeneratedCodeWarnings,
  defineAuraAssets,
  effects,
  environments,
  lights,
  lookLint,
  primitive,
  resolveQrFlags
} from "../../../packages/engine/src";
import type {
  AuraLookLintContext,
  AuraLookLintFinding,
  AuraSceneNode,
  AuraSceneSnapshot,
  AppliedLookReport
} from "../../../packages/engine/src";

// T1.4 — lookLint rule bodies (C-34 §6.2). One positive + one negative fixture
// per rule; the ambient-kills-ibl suppression path uses
// `capabilities.ambientAdditive` (§6.2 suppression clause).

const CTX: AuraLookLintContext = {
  devicePixelRatio: 2,
  tierCap: 2,
  production: false,
  capabilities: { ambientAdditive: false, effectsPixelBacked: [] }
};

const snap = (nodes: readonly AuraSceneNode[], background = "#0a0e14", diagnostics = false): AuraSceneSnapshot => ({
  schema: "aura3d-scene-snapshot/1.0",
  background,
  camera: { mode: "orbit", position: [3, 2, 3], target: [0, 0, 0] },
  nodes,
  diagnostics: { enabled: diagnostics }
});

const textures = defineAuraAssets({
  probeHdr: { type: "texture", format: "hdr", url: "/hdri/studio_small_08_1k.hdr" }
});

const dir = (shadow = true) => lights.directional({ name: "key", shadow, intensity: 2 }).toJSON();
const amb = (intensity: number) => lights.ambient({ name: "amb", intensity }).toJSON();
const env = () => environments.hdri({ name: "env", intensity: 1, texture: textures.probeHdr }).toJSON();
const fog = () => effects.fog({ name: "fog", color: "#0a0e14", density: 0.05 }).toJSON();
const prim = (name: string, color = "#8899aa", textured = false) =>
  primitive("box", { name, material: { color, ...(textured ? { texture: textures.probeHdr } : {}) } }).toJSON();
const lookGroup = (id: string): AuraSceneNode => ({ kind: "group", name: `aura-look:${id}`, children: [] }) as AuraSceneNode;
const lookNode = (id: string): AuraSceneNode => ({ kind: "look", look: id } as unknown as AuraSceneNode);

const codes = (s: AuraSceneSnapshot, c: AuraLookLintContext = CTX): Set<string> =>
  new Set(lookLint(s, c).map((f: AuraLookLintFinding) => f.code));

const appliedLook = (overrides: Partial<AppliedLookReport> = {}): AppliedLookReport => ({
  exposure: 1,
  toneMapping: "aces-filmic",
  environment: { specularIntensity: 1, diffuseIntensity: 1, background: "hdri" },
  shadows: { mapRendered: true, mapSampled: true, mapSize: 1024, strength: 0.9, casterName: "key" },
  fallbackLightsActive: false,
  renderPath: "production",
  pixelRatio: 2,
  ...overrides
});

describe("lookLint §6.2 rules (T1.4)", () => {
  it("look/no-lights fires without light nodes, quiet with one", () => {
    expect(codes(snap([prim("a")]))).toContain("look/no-lights");
    expect(codes(snap([dir()]))).not.toContain("look/no-lights");
  });

  it("look/ambient-kills-ibl fires on ambient without env, suppressed by ambientAdditive", () => {
    expect(codes(snap([amb(0.5)]))).toContain("look/ambient-kills-ibl");
    expect(
      codes(snap([amb(0.5)]), { ...CTX, capabilities: { ambientAdditive: true, effectsPixelBacked: [] } })
    ).not.toContain("look/ambient-kills-ibl");
    // an env node present → ambient is decorative fill, not an IBL killer
    expect(codes(snap([env(), amb(0.5)]))).not.toContain("look/ambient-kills-ibl");
  });

  it("look/ambient-flattens fires on ambient > 1 with an env node", () => {
    expect(codes(snap([env(), amb(1.6)]))).toContain("look/ambient-flattens");
    expect(codes(snap([env(), amb(0.6)]))).not.toContain("look/ambient-flattens");
    expect(codes(snap([amb(1.6)]))).not.toContain("look/ambient-flattens");
  });

  it("look/no-ibl fires with no environment node, quiet with one", () => {
    expect(codes(snap([dir()]))).toContain("look/no-ibl");
    expect(codes(snap([dir(), env()]))).not.toContain("look/no-ibl");
    // appliedLook specularIntensity 0 still reports no-ibl (C-31 path).
    expect(codes(snap([dir(), env()]), { ...CTX, appliedLook: appliedLook({ environment: { specularIntensity: 0, diffuseIntensity: 0, background: "color" } }) })).toContain("look/no-ibl");
  });

  it("look/weak-shadow fires without a shadow caster, quiet with shadow:true", () => {
    expect(codes(snap([dir(false), env()]))).toContain("look/weak-shadow");
    expect(codes(snap([dir(true), env()]))).not.toContain("look/weak-shadow");
    const weak = appliedLook({ shadows: { mapRendered: true, mapSampled: true, mapSize: 1024, strength: 0.4, casterName: "key" } });
    expect(codes(snap([dir(true), env()]), { ...CTX, appliedLook: weak })).toContain("look/weak-shadow");
  });

  it("look/low-dpr fires when appliedLook renders below the device/tier cap", () => {
    const low = { ...CTX, appliedLook: appliedLook({ pixelRatio: 1 }) };
    expect(codes(snap([dir(), env()]), low)).toContain("look/low-dpr");
    const ok = { ...CTX, appliedLook: appliedLook({ pixelRatio: 2 }) };
    expect(codes(snap([dir(), env()]), ok)).not.toContain("look/low-dpr");
    // Without an appliedLook there is nothing to measure → no finding.
    expect(codes(snap([dir(), env()]))).not.toContain("look/low-dpr");
  });

  it("look/solid-void fires on a dark background without fog; exempt looks stay quiet", () => {
    expect(codes(snap([dir(), env()]))).toContain("look/solid-void");
    // fog exempts
    expect(codes(snap([dir(), env(), fog()]))).not.toContain("look/solid-void");
    // exception look (space) exempts
    expect(codes(snap([lookGroup("space"), dir()]))).not.toContain("look/solid-void");
    // bright background exempts
    expect(codes(snap([dir(), env()], "#9db8cf"))).not.toContain("look/solid-void");
  });

  it("look/primitive-subject fires over the 60% untextured share or a subject-named primitive", () => {
    const mostly = snap([dir(), env(), prim("a"), prim("b"), prim("c"), prim("d", "#8899aa", true)]);
    expect(codes(mostly)).toContain("look/primitive-subject");
    const textured = snap([dir(), env(), prim("a", "#8899aa", true), prim("b", "#8899aa", true), prim("c")]);
    expect(codes(textured)).not.toContain("look/primitive-subject");
    const subject = snap([dir(), env(), prim("hero", "#8899aa", true), prim("b", "#8899aa", true), prim("c", "#8899aa", true), prim("d", "#8899aa", true)]);
    expect(codes(subject)).toContain("look/primitive-subject");
  });

  it("look/flat-palette fires on >= 3 pure-primary primitives", () => {
    const flat = snap([dir(), env(), prim("r", "#ff0000"), prim("g", "#00ff00"), prim("b", "#0000ff")]);
    expect(codes(flat)).toContain("look/flat-palette");
    const mixed = snap([dir(), env(), prim("r", "#ff0000"), prim("g", "#00ff00"), prim("c", "#8899aa")]);
    expect(codes(mixed)).not.toContain("look/flat-palette");
  });

  it("look/double-aa fires on fxaa alongside another anti-alias node", () => {
    const aa = (mode: string) => ({ kind: "effect", effect: "anti-alias", mode } as unknown as AuraSceneNode);
    expect(codes(snap([dir(), env(), aa("fxaa"), aa("fxaa")]))).toContain("look/double-aa");
    expect(codes(snap([dir(), env(), aa("fxaa")]))).not.toContain("look/double-aa");
  });

  it("look/debug-overlay fires only in a production build with diagnostics on", () => {
    const prod = { ...CTX, production: true };
    expect(codes(snap([dir(), env()], "#9db8cf", true), prod)).toContain("look/debug-overlay");
    expect(codes(snap([dir(), env()], "#9db8cf", true))).not.toContain("look/debug-overlay");
  });

  it("look/fake-effect-names fires on §4.4 names, quiet on real nodes", () => {
    const fake = { kind: "group", name: "wet reflection card", children: [] } as AuraSceneNode;
    expect(codes(snap([dir(), env(), fake]))).toContain("look/fake-effect-names");
    expect(codes(snap([dir(), env(), prim("mountain")]))).not.toContain("look/fake-effect-names");
  });

  it("look/multiple-looks fires on two authored looks with the last winning", () => {
    const s = snap([lookGroup("outdoor-day"), lookGroup("night-city"), dir(), env()]);
    const findings = lookLint(s, CTX);
    const finding = findings.find((f: AuraLookLintFinding) => f.code === "look/multiple-looks");
    expect(finding?.message).toContain("night-city");
    expect(codes(snap([lookGroup("outdoor-day"), dir(), env()]))).not.toContain("look/multiple-looks");
  });

  it("look/expansion-mismatch fires when a v1 node has no applied look or coexists with v0", () => {
    const mixed = snap([lookNode("outdoor-day"), lookGroup("night-city"), dir(), env()]);
    expect(codes(mixed)).toContain("look/expansion-mismatch");
    const orphanV1 = snap([lookNode("outdoor-day"), dir(), env()]);
    expect(codes(orphanV1)).toContain("look/expansion-mismatch");
    const withApplied = { ...CTX, appliedLook: appliedLook() };
    expect(codes(snap([lookNode("outdoor-day"), dir(), env()]), withApplied)).not.toContain("look/expansion-mismatch");
    expect(codes(snap([lookGroup("outdoor-day"), dir(), env()]))).not.toContain("look/expansion-mismatch");
  });

  it("never emits look/evidence-only-feel or look/capture-branch findings by default", () => {
    const s = snap([lookNode("outdoor-day"), lookGroup("night-city"), dir(false), amb(2), prim("a"), prim("b")], "#000000", true);
    const found = codes(s, { ...CTX, production: true });
    expect(found.has("look/evidence-only-feel")).toBe(false);
    expect(found.has("look/capture-branch")).toBe(false);
  });
});

describe("collectGeneratedCodeWarnings flag gating (T1.6)", () => {
  const unlit = snap([prim("a")]);

  it("flag off keeps the legacy no-lights sentence byte-identical", () => {
    const warnings = collectGeneratedCodeWarnings(unlit, resolveQrFlags({ options: [] }));
    expect(warnings[0]).toBe(
      "Scene has no lights. Suggested fix: add lights.studio() or lights.ambient()."
    );
    // Legacy lines stay alongside: interactions warning still emitted.
    expect(warnings.some((w) => w.startsWith("Scene has no interactions."))).toBe(true);
  });

  it("flag on emits lookLint messages instead of the 1.0 lines", () => {
    const warnings = collectGeneratedCodeWarnings(unlit, resolveQrFlags({ options: ["looks"] }));
    expect(warnings[0]).toContain("looks.preset");
    expect(warnings).not.toContain("Scene has no lights. Suggested fix: add lights.studio() or lights.ambient().");
    // ambient-authored scenes get the §6.2 ambient-kills-ibl text.
    const ambientWarnings = collectGeneratedCodeWarnings(
      snap([amb(0.6)]),
      resolveQrFlags({ options: ["looks"] })
    );
    expect(ambientWarnings.some((w) => w.includes("lights.ambient` disables"))).toBe(true);
  });
});
