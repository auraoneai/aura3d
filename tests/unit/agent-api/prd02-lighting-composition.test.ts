// PRD-02 Phase 2 — lighting composition (S1): flag-on, every combination of
// {none, ambient, hemisphere, env node, hdri, environments.none()} ×
// {no lights, sun, sun+spot} yields the expected terms and no term zeroes
// another; ambient is additive and never replaces IBL (F-02-01).

import { describe, expect, it } from "vitest";
import { resolveEnvironment, resolveQrFlags } from "@aura3d/engine/contracts";
import {
  collectPrd02Lights,
  prd02LightingOn,
  readLightingModelFromUrl,
  type PhysicalLightDescriptor
} from "@aura3d/engine/lanes";
// "@aura3d/engine/lanes" side-effect: registers the prd02 C-09 environment
// sources, C-36 node handlers, C-38 app extension and C-31 sections.
import type { AuraLightNode, AuraSceneNode, AuraSceneSnapshot } from "@aura3d/engine";

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
const FLAGS_OFF = resolveQrFlags({ options: {} });

const snapshot = (nodes: readonly (unknown | AuraSceneNode)[]): AuraSceneSnapshot => ({
  schema: "aura3d-scene-snapshot/1.0",
  background: "#000000",
  camera: { mode: "orbit", position: [0, 2, 5], target: [0, 0, 0] },
  nodes: nodes as never,
  diagnostics: { enabled: false }
});

const sun: AuraLightNode = { kind: "light", light: "directional", intensity: 2, position: [3, 4, 3], shadow: true } as AuraLightNode;
const spot: AuraLightNode = { kind: "light", light: "spot", intensity: 30, position: [0, 3, 0], angle: 0.5 } as AuraLightNode;
const ambient05: AuraLightNode = { kind: "light", light: "ambient", intensity: 0.5, color: "#ffffff" } as AuraLightNode;
const hemisphere: AuraLightNode = { kind: "light", light: "hemisphere", intensity: 0.8, color: "#bcd7ff", position: [0, 1, 0] } as AuraLightNode;
const envPreset = { kind: "environment", environment: "preset", preset: "studio", intensity: 1, name: "env" } as unknown as AuraSceneNode;
const envHdri = { kind: "environment", environment: "hdri", intensity: 1, texture: { kind: "aura-asset-ref", url: "studio.hdr" }, name: "hdri" } as unknown as AuraSceneNode;
const envNone = { kind: "environment", environment: "none", intensity: 1, name: "none" } as unknown as AuraSceneNode;

const lightSets: Record<string, AuraLightNode[]> = {
  "no lights": [],
  "sun": [sun],
  "sun+spot": [sun, spot]
};
const envSets: Record<string, AuraSceneNode[]> = {
  none: [],
  ambient: [ambient05],
  hemisphere: [hemisphere],
  "env node": [envPreset],
  hdri: [envHdri],
  "none()": [envNone]
};

describe("prd02 lighting composition — flag on (S1)", () => {
  it("flag resolution: lighting flag on via options", () => {
    expect(prd02LightingOn(FLAGS_ON)).toBe(true);
    expect(prd02LightingOn(FLAGS_OFF)).toBe(false);
  });

  it("?a3dLighting=0 kill switch wins over the flag", () => {
    expect(readLightingModelFromUrl("http://x/?a3dLighting=0").disabled).toBe(true);
    expect(readLightingModelFromUrl("http://x/?a3dLighting=off").disabled).toBe(true);
    expect(prd02LightingOn(FLAGS_ON, "http://x/?a3dLighting=0")).toBe(false);
    expect(readLightingModelFromUrl("http://x/?aura-lighting=legacy-3.0").model).toBe("legacy-3.0");
  });

  for (const [envName, envNodes] of Object.entries(envSets)) {
    for (const [lightName, lightNodes] of Object.entries(lightSets)) {
      it(`${envName} × ${lightName}`, () => {
        const snap = snapshot([...envNodes, ...lightNodes]);
        const resolution = resolveEnvironment(snap, "high", FLAGS_ON);
        const collected = collectPrd02Lights(snap);

        // IBL term: every env setting produces a probe resolution.
        expect(resolution.probe).toBeDefined();
        if (envName === "none()") {
          expect(resolution.intensity).toBe(0);
          expect(resolution.background).toBe(false);
        } else if (envName === "env node") {
          expect(resolution.probe).toEqual({ preset: "studio" });
        } else if (envName === "hdri") {
          expect(resolution.probe).toMatchObject({ hdri: "studio.hdr" });
        } else {
          // no explicit env → neutral room, priority 0
          expect(resolution.probe).toBe("neutral");
          expect(resolution.kind).toBe("neutral-room");
        }

        // Ambient term is additive, never zeroes the probe.
        if (envName === "ambient") {
          expect(resolution.ambient?.intensity).toBeCloseTo(0.5);
          expect(resolution.specularIntensity).toBeGreaterThan(0);
          expect(collected.ambientIntensity).toBeCloseTo(0.5);
        }
        if (envName === "hemisphere") {
          expect(collected.hemisphere).toHaveLength(1);
          expect(collected.hemisphere[0]!.intensity).toBeCloseTo(0.8);
        }

        // Punctual lights are always collected (no term zeroes them).
        const punctual: readonly PhysicalLightDescriptor[] = collected.descriptors;
        if (lightName === "no lights") expect(punctual).toHaveLength(0);
        if (lightName === "sun") expect(punctual.map((d) => d.kind)).toEqual(["directional"]);
        if (lightName === "sun+spot") expect(punctual.map((d) => d.kind)).toEqual(["directional", "spot"]);
      });
    }
  }

  it("lights.ambient(0.5) alone → neutral probe + ambient 0.5 + specular > 0", () => {
    const snap = snapshot([ambient05]);
    const resolution = resolveEnvironment(snap, "high", FLAGS_ON);
    expect(resolution.probe).toBe("neutral");
    expect(resolution.ambient?.intensity).toBeCloseTo(0.5);
    expect(resolution.specularIntensity).toBeGreaterThan(0);
  });
});

describe("prd02 lighting composition — flag off", () => {
  it("resolveEnvironment falls back to the LEGACY resolution (prd02 sources inactive)", () => {
    const resolution = resolveEnvironment(snapshot([envPreset, sun]), "high", FLAGS_OFF);
    expect(resolution.kind).toBe("legacy");
  });
});
