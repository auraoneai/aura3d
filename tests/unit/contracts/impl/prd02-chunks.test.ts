import { describe, expect, it } from "vitest";
import { shaderChunk } from "@aura3d/rendering/contracts";
import { lookLint } from "@aura3d/engine/contracts";
import "@aura3d/rendering/lanes"; // registers the six C-02 chunks
import "@aura3d/engine/lanes";    // registers look/ambient-flattens
import { buildChunkHarnessProgram } from "../../../../packages/rendering/src/contracts/testing/ChunkHarness";
import type { AuraSceneSnapshot } from "@aura3d/engine";

const CHUNK_NAMES = [
  "a3d_prd02_lighting_ibl",
  "a3d_prd02_lighting_punctual",
  "a3d_prd02_shadow_lookup",
  "a3d_prd02_shadow_caster",
  "a3d_prd02_sh9",
  "a3d_prd02_contact_shadow"
];

describe("prd02 C-02 chunk registration (PRD-02 §8)", () => {
  it("all six chunks register under their §8 names", () => {
    for (const name of CHUNK_NAMES) {
      const c = shaderChunk(name);
      expect(c, name).toBeDefined();
      expect(c!.owner).toBe("prd02");
      expect(c!.glsl.length).toBeGreaterThan(50);
    }
  });

  it("chunks assemble into the harness program without dangling braces", () => {
    const chunks = CHUNK_NAMES.map((n) => shaderChunk(n)!);
    const { vertex, fragment } = buildChunkHarnessProgram(chunks);
    for (const src of [vertex, fragment]) {
      expect(src).toContain("#version 300 es");
      const open = (src.match(/\{/g) ?? []).length;
      const close = (src.match(/\}/g) ?? []).length;
      expect(open).toBe(close);
    }
    // white-Lambert sentinel: albedo/π must appear in the lighting path
    expect(fragment + vertex).toMatch(/a3d_punctualRadiance|a3d_sh9Irradiance/);
  });

  it("Frostbite window is only applied when range > 0", () => {
    const punctual = shaderChunk("a3d_prd02_lighting_punctual")!.glsl;
    expect(punctual).toContain("range <= 0.0");
  });
});

describe("prd02 look/ambient-flattens (C-34)", () => {
  const snapshot = (nodes: unknown[]): AuraSceneSnapshot => ({
    schema: "aura3d-scene-snapshot/1.0",
    background: "#000000",
    camera: { mode: "orbit", position: [0, 2, 5], target: [0, 0, 0] },
    nodes: nodes as never,
    diagnostics: { enabled: false }
  });
  const ctx = { devicePixelRatio: 1, tierCap: 3, production: false, capabilities: { ambientAdditive: true, effectsPixelBacked: [] } };

  it("fires when ambient intensity > 1 while an environment is present", () => {
    const s = snapshot([
      { kind: "environment", environment: "studio", intensity: 1 },
      { kind: "light", light: "ambient", intensity: 1.5, name: "amb" }
    ]);
    const findings = lookLint(s, ctx as never);
    expect(findings.some((f) => f.code === "look/ambient-flattens")).toBe(true);
    expect(findings.find((f) => f.code === "look/ambient-flattens")!.nodes).toContain("amb");
  });

  it("is silent without an environment node", () => {
    const s = snapshot([{ kind: "light", light: "ambient", intensity: 3 }]);
    const findings = lookLint(s, ctx as never);
    expect(findings.some((f) => f.code === "look/ambient-flattens")).toBe(false);
  });

  it("is silent for ambient ≤ 1 even with an environment", () => {
    const s = snapshot([
      { kind: "environment", environment: "studio", intensity: 1 },
      { kind: "light", light: "ambient", intensity: 0.8 }
    ]);
    expect(lookLint(s, ctx as never).some((f) => f.code === "look/ambient-flattens")).toBe(false);
  });
});
