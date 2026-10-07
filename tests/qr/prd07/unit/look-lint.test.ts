// PRD-07 P1-T18 — look/fake-effect-names: 3 hits on fixture scenes, 0 false
// positives on prd07-* style scenes (real effect nodes backed by pixels).

import { beforeAll, describe, expect, it } from "vitest";
import { lookLint, type AuraLookLintContext } from "../../../../packages/engine/src/contracts/looks";
import { registerPrd07LookLintRules } from "../../../../packages/engine/src/agent-api/vfx/lookLint";

const ctx = (pixelBacked: readonly string[] = []): AuraLookLintContext => ({
  devicePixelRatio: 2,
  tierCap: 1,
  production: true,
  capabilities: { ambientAdditive: true, effectsPixelBacked: pixelBacked }
});

const sceneWith = (nodes: readonly Record<string, unknown>[]) => ({ nodes: nodes as never }) as never;

describe("P1-T18 look/fake-effect-names", () => {
  beforeAll(() => registerPrd07LookLintRules());

  it("flags primitives named like effects and unbacked effect nodes (3 hits)", () => {
    const findings = lookLint(
      sceneWith([
        { kind: "primitive", name: "explosion-flash" },   // hit 1: fake explosion
        { kind: "primitive", name: "rain-field" },         // hit 2: fake rain
        { kind: "effect", effect: "particles", name: "fx-sparks" }, // hit 3: effect kind never drew
        { kind: "primitive", name: "wooden-crate" }        // no hit
      ]),
      ctx([])
    );
    const hits = findings.filter((f) => f.code === "look/fake-effect-names");
    expect(hits.length).toBe(3);
    expect(hits.map((h) => h.nodes?.[0])).toEqual(["explosion-flash", "rain-field", "fx-sparks"]);
  });

  it("reports nothing on pixel-backed prd07 scenes (0 false positives)", () => {
    const findings = lookLint(
      sceneWith([
        { kind: "effect", effect: "particles", name: "fx-fountain" },
        { kind: "effect", effect: "rain", name: "fx-rain" },
        { kind: "sky", name: "sky-dome" },
        { kind: "primitive", name: "fountain-base" },   // 'fountain' is not in the regex
        { kind: "mesh", name: "fire-truck" }            // non-primitive kinds are not the smell
      ]),
      ctx(["particles", "rain"])
    );
    expect(findings.filter((f) => f.code === "look/fake-effect-names")).toEqual([]);
  });
});
