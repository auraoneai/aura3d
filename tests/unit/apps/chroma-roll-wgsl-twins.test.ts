import { describe, expect, it } from "vitest";
import type { AuraCustomMaterialSpec } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { webgpuCustomShaderGap } from "../../../packages/engine/src/agent-api/compiler/webgpuCustomShaderGap.js";
import { texture } from "../../../packages/engine/src/index.js";
import { allProgramSpecs, carnivalToonSpec, shadowSpec } from "../../../examples/splat-rush-port/world.js";
import { LOOKS } from "../../../examples/splat-rush-port/look.js";
import { GATE_SHADOW_FRAGMENT, SHADOW_VERTEX } from "../../../examples/splat-rush-port/shaders.js";
import { GATE_SHADOW_FRAGMENT_WGSL, SHADOW_VERTEX_WGSL } from "../../../examples/splat-rush-port/shaders-wgsl.js";
import { checkGlslUnchanged, checkWgslTwin } from "./wgslTwinChecks.js";

const map = texture.data({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) });
/** Every distinct program Chroma Roll (examples/splat-rush-port) draws: the app's list plus the deck mirror and the gate shadow. */
const specs: readonly (readonly [string, AuraCustomMaterialSpec, boolean])[] = [
  ...allProgramSpecs().map(({ name, spec }) => [name, spec as AuraCustomMaterialSpec, false] as const),
  ["carnival-deck-mirror", carnivalToonSpec(LOOKS.carnival, [0.5, 0.5, 0.5], { map: map as never, canvas: [0.05, 0.06], mirror: true, gloss: 0.4, env: 0.3 }) as AuraCustomMaterialSpec, false],
  ["carnival-tone-map", carnivalToonSpec(LOOKS.carnival, [1, 1, 1], { map: map as never, tone: true }) as AuraCustomMaterialSpec, false],
  ["gate-shadow", { ...shadowSpec(), glsl: { vertex: SHADOW_VERTEX, fragment: GATE_SHADOW_FRAGMENT }, wgsl: { vertex: SHADOW_VERTEX_WGSL, fragment: GATE_SHADOW_FRAGMENT_WGSL } } as AuraCustomMaterialSpec, false]
];

describe("Chroma Roll WGSL twins (A3/W6: toon, flat, shadows, sky, carnival toon, deck mirror, clouds, sunset dome, cloud sea)", () => {
  it.each(specs)("%s: the WGSL twin matches the GLSL program's inputs and bindings", checkWgslTwin);
  it("keeps the GLSL stages the WebGL2 backend draws byte for byte", () => checkGlslUnchanged(specs));
  it("leaves no program without a twin, so ?backend=webgpu passes the engine's custom-shader pre-check", () => {
    expect(specs.filter(([, spec]) => !spec.wgsl).map(([name]) => name)).toEqual([]);
    const nodes = specs.map(([name, spec]) => ({ kind: "primitive", name, material: { kind: "custom", custom: spec } }));
    expect(webgpuCustomShaderGap({ nodes })).toBeUndefined();
  });
  it("the deck mirror twin reads the nearest-gate columns and the ball", () => {
    const deck = specs.find(([name]) => name === "carnival-deck-mirror")![1];
    expect(deck.wgsl!.fragment).toMatch(/aura\.u_crGateP1\[3\]/);
    expect(deck.wgsl!.fragment).toMatch(/aura\.u_crBallTone/);
  });
});
