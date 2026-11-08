import { describe, it } from "vitest";
import type { AuraCustomMaterialSpec } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { skySpec } from "../../../apps/showcase-roadster-rush/src/art/sky.js";
import { groundSpec } from "../../../apps/showcase-roadster-rush/src/art/ground.js";
import { shieldSpec } from "../../../apps/showcase-roadster-rush/src/art/shield.js";
import { APEX_PLUMES, plumeSpec } from "../../../apps/showcase-roadster-rush/src/art/plume.js";
import { TOWER_VARIANTS, towerGlassSpec } from "../../../apps/showcase-roadster-rush/src/render/towers.js";
import { decalSpec } from "../../../apps/showcase-roadster-rush/src/render/decals.js";
import { wakeSpec } from "../../../apps/showcase-roadster-rush/src/render/wakes.js";
import { checkGlslUnchanged, checkWgslTwin } from "./wgslTwinChecks.js";

const specs: readonly (readonly [string, AuraCustomMaterialSpec, boolean])[] = [
  ["sky", skySpec() as AuraCustomMaterialSpec, false],
  ["ground", groundSpec() as AuraCustomMaterialSpec, false],
  ["shield", shieldSpec() as AuraCustomMaterialSpec, false],
  ["plume", plumeSpec(APEX_PLUMES.rear, false) as AuraCustomMaterialSpec, false],
  ["plume-instanced", plumeSpec(APEX_PLUMES.sky, false, true) as AuraCustomMaterialSpec, true],
  ...TOWER_VARIANTS.map((variant) => [`tower-${variant}`, towerGlassSpec(variant) as AuraCustomMaterialSpec, true] as const),
  ["decal", decalSpec() as AuraCustomMaterialSpec, true],
  ["wake", wakeSpec("#4df0ff", 0.2, [40, 90]) as AuraCustomMaterialSpec, true]
];

describe("Roadster Rush WGSL twins (A3/W6)", () => {
  it.each(specs)("%s: every custom shader carries a WGSL twin that matches the GLSL program's inputs and bindings", checkWgslTwin);
  it("keeps the GLSL stages the WebGL2 backend draws byte for byte (the twin is WebGPU-only)", () => checkGlslUnchanged(specs));
});
