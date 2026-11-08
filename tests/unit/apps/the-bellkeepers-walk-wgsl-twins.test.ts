import { describe, expect, it } from "vitest";
import type { AuraCustomMaterialSpec } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { webgpuCustomShaderGap } from "../../../packages/engine/src/agent-api/compiler/webgpuCustomShaderGap.js";
import {
  blobSpec, glowSpec, hazeSpec, moteSpec, paintSpec, propSpec, seaSpec, shaftSpec, skySpec, streamSpec, travellerSpec, windSpec
} from "../../../examples/where-the-wind-wanders-port/world.js";
import { paperPass } from "../../../examples/where-the-wind-wanders-port/paper-pass.js";
import { checkGlslUnchanged, checkWgslTwin } from "./wgslTwinChecks.js";

/** Every distinct program The Bellkeeper's Walk (examples/where-the-wind-wanders-port) draws, with and without its receive defines. */
const specs: readonly (readonly [string, AuraCustomMaterialSpec, boolean])[] = ([
  ["foliage", windSpec(true)], ["foliage-no-receive", windSpec(false)],
  ["terrain", paintSpec(true)], ["terrain-no-receive", paintSpec(false)],
  ["sea", seaSpec(true)], ["sea-no-shore", seaSpec(false)],
  ["sky", skySpec()],
  ["scenery", propSpec(true, true)], ["scenery-no-receive", propSpec(false, false)],
  ["traveller", travellerSpec()],
  ["glow", glowSpec([1, 0.9, 0.6], 1.5, 2.1)], ["pollen", moteSpec()], ["haze", hazeSpec(0.4)], ["stream", streamSpec()],
  ["shaft", shaftSpec(3.7, 0.2)], ["blob", blobSpec()]
] as const).map(([name, spec]) => [name, spec as AuraCustomMaterialSpec, false] as const);

describe("The Bellkeeper's Walk WGSL twins (A3/W6: foliage, terrain, sea, sky, scenery, traveller, glows, pollen, haze, stream, shafts, blob)", () => {
  it.each(specs)("%s: the WGSL twin matches the GLSL program's inputs and bindings", checkWgslTwin);
  it("keeps the GLSL stages the WebGL2 backend draws byte for byte", () => checkGlslUnchanged(specs));
  it("leaves no program without a twin, so ?backend=webgpu passes the engine's custom-shader pre-check", () => {
    expect(specs.filter(([, spec]) => !spec.wgsl).map(([name]) => name)).toEqual([]);
    const nodes = specs.map(([name, spec]) => ({ kind: "primitive", name, material: { kind: "custom", custom: spec } }));
    expect(webgpuCustomShaderGap({ nodes })).toBeUndefined();
  });
  it("the receive defines select the twin: sun shadow and traced hero shadow only where the GLSL enables them", () => {
    const fragment = (name: string): string => specs.find(([n]) => n === name)![1].wgsl!.fragment!;
    expect(fragment("foliage")).toMatch(/a3dSunShadowAuto\(world, n\)/);
    expect(fragment("foliage")).toMatch(/heroContact\(vWorld\)/);
    expect(fragment("foliage-no-receive")).not.toMatch(/a3dSunShadowAuto|heroShadow/);
    expect(fragment("scenery")).toMatch(/a3dSunShadowAuto/);
    expect(fragment("scenery")).not.toMatch(/heroShadow/);
    expect(fragment("traveller")).not.toMatch(/a3dSunShadowAuto/);
    expect(fragment("sea")).toMatch(/treeTop/);
    expect(fragment("sea-no-shore")).not.toMatch(/treeTop/);
  });
  it("the gouache paper pass carries a WebGPU stage reading u_paper / u_paperScale from the custom-pass uniform slots", () => {
    const pass = paperPass(1280, 720);
    expect(pass.fragment.wgsl).toMatch(/@fragment fn fs_main/);
    expect(Object.keys(pass.uniforms ?? {})).toEqual(["u_paper", "u_paperScale"]);
    expect(pass.fragment.wgsl).toMatch(/paper\.values\[1\]\.x/);
    expect(pass.fragment.wgsl).toMatch(/paper\.values\[2\]\.xy/);
  });
});
