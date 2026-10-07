// PRD-07 P4-T3 — LiveAtmosphere live state: last *visible* fog node in scene
// order wins; all-hidden → no fog; transitions lerp density linearly and the
// colour in linear RGB; `transitionSeconds` midpoint at t = seconds/2.

import { describe, expect, it } from "vitest";
import { LiveAtmosphere } from "../../../../packages/engine/src/production-runtime/effects/LiveAtmosphere";
import type { EffectNodeLike } from "../../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";

function fogNode(id: string, spec: Record<string, unknown>): EffectNodeLike {
  return {
    kind: "effect",
    effect: "fog",
    ...spec,
    runtime: { id }
  } as unknown as EffectNodeLike;
}

/** App stub whose node registry reports handle visibility. */
function appWithVisibility(visible: Record<string, boolean>): { nodes: { get(id: string): { visible?: boolean } | undefined } } {
  return {
    nodes: {
      get: (id: string) => (id in visible ? { visible: visible[id] } : undefined)
    }
  };
}

describe("P4-T3 LiveAtmosphere fog state", () => {
  it("last visible fog node in scene order wins; all-hidden → no fog", () => {
    const atmosphere = new LiveAtmosphere();
    const nodes = [
      fogNode("a", { density: 0.1 }),
      fogNode("b", { density: 0.2 }),
      fogNode("c", { density: 0.3 }),
      fogNode("d", { density: 0.4 }),
      fogNode("e", { density: 0.5 })
    ];
    atmosphere.trackFogNodes(nodes);

    const visibility = { a: true, b: true, c: false, d: true, e: false };
    atmosphere.updateFogVisibility(appWithVisibility(visibility));
    // d is the last visible in scene order (e hidden).
    expect(atmosphere.resolveFog(0)?.density).toBe(0.4);

    visibility.d = false;
    visibility.c = true;
    atmosphere.updateFogVisibility(appWithVisibility(visibility));
    expect(atmosphere.resolveFog(0)?.density).toBe(0.3);

    for (const k of Object.keys(visibility)) visibility[k as keyof typeof visibility] = false;
    atmosphere.updateFogVisibility(appWithVisibility(visibility));
    expect(atmosphere.resolveFog(0)).toBeNull();
  });

  it("transitionSeconds lerps density linearly — midpoint at t = seconds/2", () => {
    const atmosphere = new LiveAtmosphere();
    const from = fogNode("from", { density: 0.1 });
    const to = fogNode("to", { density: 0.3, transitionSeconds: 1 });
    atmosphere.trackFogNodes([from, to]);
    atmosphere.updateFogVisibility(appWithVisibility({ from: true, to: false }));
    expect(atmosphere.resolveFog(0)?.density).toBe(0.1);

    atmosphere.updateFogVisibility(appWithVisibility({ from: false, to: true }));
    atmosphere.resolveFog(0); // anchor: the first resolve after the flip starts t0 = 0
    const mid = atmosphere.resolveFog(0.5);
    expect(mid?.density).toBeCloseTo(0.2, 2); // within 2%
    const end = atmosphere.resolveFog(1.0);
    expect(end?.density).toBeCloseTo(0.3, 5);
  });

  it("colour transitions in linear RGB (not sRGB)", () => {
    const atmosphere = new LiveAtmosphere();
    // Mid-tone endpoints are where sRGB vs linear lerps diverge measurably:
    // sRGB 0.5 → linear ≈ 0.214. Linear midpoint ≈ 0.107; a naive
    // sRGB-lerp-then-linearize midpoint would be ≈ 0.051.
    const from = fogNode("red", { color: "#800000" });
    const to = fogNode("green", { color: "#008000", transitionSeconds: 1 });
    atmosphere.trackFogNodes([from, to]);
    atmosphere.updateFogVisibility(appWithVisibility({ red: true, green: false }));
    atmosphere.resolveFog(0); // settle on the red spec before the flip
    atmosphere.updateFogVisibility(appWithVisibility({ red: false, green: true }));
    atmosphere.resolveFog(0); // anchor t0
    const mid = atmosphere.resolveFog(0.5);
    const color = mid?.color as readonly number[];
    expect(Array.isArray(color)).toBe(true);
    expect(color[0]).toBeCloseTo(0.107, 1); // mean of linear endpoints
    expect(color[1]).toBeCloseTo(0.107, 1);
    expect(color[0]).toBeGreaterThan(0.08); // rules out the sRGB-space lerp (≈0.051)
  });

  it("setFog handle extension + app-level fallback when the scene has no nodes", () => {
    const atmosphere = new LiveAtmosphere();
    atmosphere.setFog({ mode: "exp", density: 0.05 });
    expect(atmosphere.state().fog?.mode).toBe("exp");
    // A tracked node overrides the app-level spec while visible.
    const node = fogNode("n", { density: 0.7 });
    atmosphere.trackFogNodes([node]);
    atmosphere.updateFogVisibility(appWithVisibility({ n: true }));
    expect(atmosphere.resolveFog(0)?.density).toBe(0.7);
    // …and §6.6: once a scene tracks fog nodes, ALL-hidden means NO fog
    // (the app-level setFog spec does not take over).
    atmosphere.updateFogVisibility(appWithVisibility({ n: false }));
    expect(atmosphere.resolveFog(0)).toBeNull();
  });
});
