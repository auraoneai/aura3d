import { describe, expect, it } from "vitest";
import {
  lights,
  lookLint,
  lookLintRegisteredCodes,
  registerLookLintRule,
  environments,
  defineAuraAssets
} from "../../../../packages/engine/src";
import type {
  AuraLookLintContext,
  AuraLookLintFinding,
  AuraSceneNode,
  AuraSceneSnapshot
} from "../../../../packages/engine/src";

// T1.5 — lazy default rule installation (PRD §6.2). Default rules for
// lane-owned codes (ambient-flattens → prd02, fake-effect-names → prd07,
// capture-branch → prd09) install lazily so a lane that registers first —
// before any diagnostics run — always wins its code without a throw, and a
// lane that registers after still replaces the default.
//
// NOTE: the registry is process-wide and has no unregister; these tests keep
// themselves order-independent by only registering codes no other test owns,
// using unique `look/test-*` codes for throw/replace checks.

const CTX: AuraLookLintContext = {
  devicePixelRatio: 2,
  tierCap: 2,
  production: false,
  capabilities: { ambientAdditive: false, effectsPixelBacked: [] }
};

const snap = (nodes: readonly AuraSceneNode[]): AuraSceneSnapshot => ({
  schema: "aura3d-scene-snapshot/1.0",
  background: "#0a0e14",
  camera: { mode: "orbit", position: [3, 2, 3], target: [0, 0, 0] },
  nodes,
  diagnostics: { enabled: false }
});

const findings = (s: AuraSceneSnapshot, c: AuraLookLintContext = CTX): readonly AuraLookLintFinding[] =>
  lookLint(s, c);

describe("C-34 lookLint registry (T1.5)", () => {
  it("installs defaults lazily: a first lookLint call sees PRD-13 + default rules", () => {
    const found = new Set(findings(snap([lights.directional({ shadow: true, intensity: 2 }).toJSON()])).map((f) => f.code));
    // no-ibl fires (no env) — proves prd13 rules installed through the provider.
    expect(found.has("look/no-ibl")).toBe(true);
    // The three lane-code defaults are registered even though they find nothing here.
    const registered = lookLintRegisteredCodes();
    for (const code of ["look/ambient-flattens", "look/fake-effect-names", "look/capture-branch"]) {
      expect(registered, code).toContain(code);
    }
    // Reserved for prd08: no default ever registers it.
    expect(registered).not.toContain("look/evidence-only-feel");
  });

  it("a test-registered rule's findings appear in diagnostics lint output", () => {
    registerLookLintRule({
      code: "look/test-ambient-sentry",
      owner: "prd13",
      run: (s) =>
        s.nodes.some((n: AuraSceneNode) => n.kind === "light" && (n as { light?: string }).light === "ambient")
          ? [{ code: "look/test-ambient-sentry", severity: "warning", message: "test rule saw ambient" }]
          : []
    });
    const found = findings(snap([lights.ambient({ intensity: 0.4 }).toJSON()]));
    expect(found.some((f) => f.code === "look/test-ambient-sentry" && f.message === "test rule saw ambient")).toBe(true);
  });

  it("registerLookLintRule throws on a duplicate non-default code", () => {
    registerLookLintRule({
      code: "look/test-dup-guard",
      owner: "prd13",
      run: () => []
    });
    expect(() =>
      registerLookLintRule({ code: "look/test-dup-guard", owner: "prd13", run: () => [] })
    ).toThrow(/duplicate|already/i);
  });

  it("a lane registration replaces a lane-code default without throwing", () => {
    // prd02's job later; here a stand-in proves replacement semantics: no throw,
    // and the lane's run() wins (its marker text surfaces, not the default's).
    registerLookLintRule({
      code: "look/ambient-flattens",
      owner: "prd02",
      run: () => [{ code: "look/ambient-flattens", severity: "warning", message: "lane-owned ambient rule" }]
    });
    const textures = defineAuraAssets({ probe: { type: "texture", format: "hdr", url: "/hdri/x.hdr" } });
    const s = snap([
      environments.hdri({ intensity: 1, texture: textures.probe }).toJSON(),
      lights.ambient({ intensity: 2 }).toJSON()
    ]);
    const found = findings(s);
    const hit = found.find((f) => f.code === "look/ambient-flattens");
    expect(hit?.message).toBe("lane-owned ambient rule");
  });
});

// T1.13 — C-31 "look" diagnostics section + C-36 "look" NodeHandler
// (registered by the prd13 lane barrel's provide() at import).

describe("C-31 look diagnostics section (T1.13)", () => {
  it("is registered by the lane barrel and returns the flag-off empty value", async () => {
    const prev = process.env.A3D_QR_LOOKS;
    delete process.env.A3D_QR_LOOKS;
    try {
      const lane = await import("../../../../packages/engine/src/lanes/prd13.js");
      lane.providePrd13Contracts(); // idempotent
      const { diagnosticsSectionsAll } = await import("../../../../packages/engine/src/contracts/diagnostics.js");
      const section = diagnosticsSectionsAll().find((entry) => entry.key === "look");
      expect(section).toBeDefined();
      const { createAuraApp, scene } = await import("../../../../packages/engine/src");
      const app = createAuraApp(null, { scene: scene().add(lights.ambient({ intensity: 0.4 })) });
      try {
        const result = section!.collect(app);
        expect(result).toEqual({ id: null, expansion: "none", missingContracts: [], lint: [] });
      } finally {
        app.dispose?.();
      }
    } finally {
      if (prev === undefined) delete process.env.A3D_QR_LOOKS;
      else process.env.A3D_QR_LOOKS = prev;
    }
  });
});

describe("C-36 look NodeHandler (T1.13)", () => {
  it("compiles a look node: feature tag + v0 children dispatch + degrade on stubs", async () => {
    const prev = process.env.A3D_QR_LOOKS;
    process.env.A3D_QR_LOOKS = "1";
    try {
      const { lookNodeHandler } = await import("../../../../packages/engine/src/agent-api/looks/lookNodeHandler.js");
      const { resolveQrFlags } = await import("../../../../packages/engine/src/contracts/flags.js");
      const flags = resolveQrFlags({ env: { A3D_QR_LOOKS: "1" } });
      const degradations: { code: string; message: string }[] = [];
      const features: string[] = [];
      const sets: [string, unknown][] = [];
      const ctx = {
        renderer: null,
        assets: null,
        quality: { tier: "high" },
        strict: false,
        flags,
        degrade: (d: { code: string; message: string }) => degradations.push(d)
      } as never;
      const out = {
        addItems: () => undefined,
        addLights: () => undefined,
        set: (field: string, value: unknown) => sets.push([field, value]),
        feature: (f: string) => features.push(f)
      } as never;
      const node = { kind: "look", look: "product-studio" } as const;
      await lookNodeHandler.compile(node as never, ctx, out);
      expect(features).toContain("look.product-studio");
      // every required v1 contract is stubbed in this process → capability-degraded
      expect(degradations.some((d) => d.code === "capability-degraded")).toBe(true);
      expect(sets.some(([field]) => field === "look")).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.A3D_QR_LOOKS;
      else process.env.A3D_QR_LOOKS = prev;
    }
  });

  it("the lane barrel registers the look handler once", async () => {
    const lane = await import("../../../../packages/engine/src/lanes/prd13.js");
    lane.providePrd13Contracts();
    const { nodeHandlerFor } = await import("../../../../packages/engine/src/contracts/compiler.js");
    expect(nodeHandlerFor("look")?.owner).toBe("prd13");
    // second provide is a no-op, not a NODE_HANDLER_DUPLICATE
    expect(() => lane.providePrd13Contracts()).not.toThrow();
  });
});
