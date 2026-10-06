// PRD-02 Phase 2 — legacy golden (S1): with the flag off, the CPU RenderSource
// terms (environment lighting bundle, collected lights, shadow options) for
// the base scene 01 shape are deep-equal to the golden captured from the
// `85aafcd0` lineage (legacy code paths moved verbatim by PR 0b-1, and the
// PRD-02 flag paths must not alter them). CPU snapshot; the pixel-level
// flag-off proof is the IC-0 ΔE2000 gate in lane 15.

import { describe, expect, it } from "vitest";
import { createProductionRuntimeEnvironment } from "../../../packages/engine/src/agent-api/compiler/environment.js";
import { createProductionRuntimeCollectedLights, type AuraSceneSnapshot } from "@aura3d/engine";
import { createProductionRuntimeShadowOptions } from "../../../packages/engine/src/agent-api/compiler/shadows.js";
import "@aura3d/engine/lanes"; // lane registrations must not perturb flag-off paths

const baseScene01Nodes = [
  { kind: "primitive", primitive: "box", name: "floor", position: [0, 0, 0], scale: [6, 0.1, 6] },
  { kind: "primitive", primitive: "sphere", name: "hero", position: [0, 1, 0], scale: 1 },
  { kind: "environment", environment: "studio", intensity: 1, name: "env" },
  { kind: "light", light: "ambient", intensity: 0.4, color: "#ffffff" },
  { kind: "light", light: "directional", name: "sun", intensity: 2, position: [3, 4, 3], shadow: true },
  { kind: "light", light: "spot", name: "key", intensity: 20, position: [0, 3, 2], angle: 0.5, shadow: true }
];

const snapshot: AuraSceneSnapshot = {
  schema: "aura3d-scene-snapshot/1.0",
  background: "#101418",
  camera: { mode: "orbit", position: [0, 2, 5], target: [0, 1, 0] },
  nodes: baseScene01Nodes as never,
  diagnostics: { enabled: false }
};

const round = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(round);
  if (typeof v === "number") return Math.round(v * 1e6) / 1e6;
  return v;
};

/** Golden captured from the flag-off legacy path (85aafcd0 lineage). */
const GOLDEN = {"env":{"preset":"studio","intensity":1,"evidence":"production bridge submitted the authored studio environment through generated HDR studio lighting","lighting":{"color":[0.44,0.48,0.54],"intensity":0.18,"environmentMapIntensity":0.44,"environmentMapSpecularIntensity":0.92,"environmentMapRotation":0.06},"hdriUrl":null},"lights":[{"kind":"directional","color":[1,1,1],"intensity":2,"position":[3,4,3],"direction":[-0.514496,-0.685994,-0.514496],"range":0,"spotAngle":0,"penumbra":0,"castsShadow":true},{"kind":"spot","color":[1,1,1],"intensity":20,"position":[0,3,2],"direction":[0,-0.747409,-0.664364],"range":12,"spotAngle":0.5,"penumbra":0.4,"castsShadow":false}],"shadows":{"enabled":true,"size":1024,"bias":0.004,"strength":0.32,"pcfRadius":1.2,"pcfSamples":9,"filter":"pcf","label":"aura3d-root-production-neon-1024px-shadow-map"}} as const;

function flagOffCpuSnapshot() {
  const env = createProductionRuntimeEnvironment(snapshot);
  const lights = createProductionRuntimeCollectedLights(snapshot);
  const shadows = createProductionRuntimeShadowOptions(snapshot, lights);
  return {
    env: {
      preset: env.preset,
      intensity: env.intensity,
      evidence: env.evidence,
      lighting: {
        color: round([...env.lighting.color]),
        intensity: env.lighting.intensity,
        environmentMapIntensity: env.lighting.environmentMapIntensity,
        environmentMapSpecularIntensity: env.lighting.environmentMapSpecularIntensity,
        environmentMapRotation: env.lighting.environmentMapRotation
      },
      hdriUrl: env.hdriUrl ?? null
    },
    lights: lights.map((l) => ({
      kind: l.kind, color: round([...l.color]), intensity: round(l.intensity),
      position: round([...l.position]), direction: round([...l.direction]),
      range: l.range, spotAngle: round(l.spotAngle), penumbra: l.penumbra, castsShadow: l.castsShadow
    })),
    shadows: round(shadows)
  };
}

describe("prd02 legacy golden — flag off (85aafcd0 lineage)", () => {
  it("CPU RenderSource terms are deep-equal to the golden", () => {
    expect(flagOffCpuSnapshot()).toEqual(GOLDEN);
  });

  it("fallback light rig is unchanged flag-off (3 directionals)", () => {
    const empty: AuraSceneSnapshot = { ...snapshot, nodes: [] };
    const lights = createProductionRuntimeCollectedLights(empty);
    expect(lights).toHaveLength(3);
    expect(lights.every((l) => l.kind === "directional")).toBe(true);
  });
});
