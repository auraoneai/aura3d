import { describe, expect, it } from "vitest";
import type { AuraCustomMaterialSpec } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { tailTrailMaterial } from "../../../apps/showcase-teleoperator/src/tailTrails.js";
import { shadeSpec } from "../../../apps/showcase-cross-hop/src/game/shade.js";
import { lightPoolSpec } from "../../../apps/showcase-aura-fc-3d/src/game/scene.js";
import { chevronHeatMaterial, contactShadowMaterial, moltenMaterial, skylineFacadeMaterial } from "../../../apps/showcase-heatsink/src/shaders.js";
import { farCitySpec, shiftFarSpec, shiftSkySpec, skySpec } from "../../../examples/drift-and-deliver-port/sky.js";
import { waterSpec } from "../../../examples/drift-and-deliver-port/water.js";
import { beamSpec } from "../../../examples/drift-and-deliver-port/headlights.js";
import { skidSpec } from "../../../examples/drift-and-deliver-port/fx.js";
import { checkGlslUnchanged, checkWgslTwin } from "./wgslTwinChecks.js";

const inner = (spec: unknown): AuraCustomMaterialSpec => (spec as { custom: AuraCustomMaterialSpec }).custom;

const specs: readonly (readonly [string, AuraCustomMaterialSpec, boolean])[] = [
  ["teleoperator-tail-trails", tailTrailMaterial() as AuraCustomMaterialSpec, true],
  ["cross-hop-sun-shade", shadeSpec() as AuraCustomMaterialSpec, true],
  ["aura-fc-flood-pools", lightPoolSpec(0.3) as AuraCustomMaterialSpec, true],
  ["heatsink-molten", inner(moltenMaterial({ hot: "#ff6a1a", crust: "#2a1810", glow: 2.4 })), true],
  ["heatsink-chevron", inner(chevronHeatMaterial("#ff8a2a", 3)), true],
  ["heatsink-skyline", inner(skylineFacadeMaterial({ body: "#1a1214", foot: "#ff5a1a", window: "#ffb070", window2: "#ffd8a0", cell: [3, 3.6], lit: 0.4, glow: 2 })), true],
  ["heatsink-contact-shadow", inner(contactShadowMaterial(0.5, 0.8)), true],
  ["gridlock-sky", skySpec() as AuraCustomMaterialSpec, false],
  ["gridlock-shift-sky", shiftSkySpec({ sunDirection: [0.8, 0.3, 0.5], skyHorizon: [1, 0.8, 0.6], skyMid: [0.8, 0.7, 0.6], skyTop: [0.4, 0.5, 0.7], skyGlow: [1, 0.7, 0.4], skyClouds: 0.4, skyStars: 0.2, skyDrift: 0 }) as AuraCustomMaterialSpec, false],
  ["gridlock-far-city", farCitySpec(undefined) as AuraCustomMaterialSpec, false],
  ["gridlock-shift-far", shiftFarSpec(undefined, { farLight: 1, farFogColor: [0.6, 0.6, 0.7], farFogDensity: 0.001, farWindows: 0.5, farLitFraction: 0.3 }) as AuraCustomMaterialSpec, false],
  ["gridlock-water", waterSpec({ waterTime: 0, waterSun: [0.8, 0.3, 0.5], waterDeep: [0, 0.1, 0.2], waterHorizon: [0.6, 0.6, 0.7], waterTop: [0.3, 0.4, 0.6], waterGlow: [1, 0.8, 0.5], waterFoam: [0.9, 0.9, 0.9], waterGlitter: 1, waterFogColor: [0.6, 0.6, 0.7], waterFogDensity: 0.002 }) as AuraCustomMaterialSpec, false],
  ["gridlock-beam", beamSpec(0.1) as AuraCustomMaterialSpec, false],
  ["gridlock-skid", skidSpec() as AuraCustomMaterialSpec, false]
];

describe("WGSL twins: Teleoperator tail trails, Cross Hop sun shade, Aura FC flood pools, Thermal Drift, Gridlock Courier (A3/W6)", () => {
  it.each(specs)("%s: the WGSL twin matches the GLSL program's inputs and bindings", checkWgslTwin);
  it("keeps the GLSL stages the WebGL2 backend draws byte for byte", () => checkGlslUnchanged(specs));
});

describe("textured twins read the binding layout's texture names", () => {
  it("far-city samples u_farPaletteTexture / u_farPaletteSampler, which the bindings declare", async () => {
    const { createCustomShaderMaterial } = await import("../../../packages/engine/src/agent-api/compiler/customMaterial.js");
    const { globalShaderSource } = await import("../../../packages/rendering/src/index.js");
    for (const spec of [farCitySpec(undefined), shiftFarSpec(undefined, { farLight: 1, farFogColor: [0, 0, 0], farFogDensity: 0, farWindows: 0, farLitFraction: 0 })]) {
      const m = createCustomShaderMaterial(spec as AuraCustomMaterialSpec, "gc-far");
      try {
        const pair = globalShaderSource(m.shaderKey)!;
        expect((pair.portableBindings ?? []).map((b) => b.name)).toContain("u_farPalette");
      } finally {
        m.dispose();
      }
    }
  });
});
