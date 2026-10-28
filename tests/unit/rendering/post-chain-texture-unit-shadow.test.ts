import { describe, expect, it } from "vitest";
import { WebGL2StateCache } from "../../../packages/rendering/src/WebGL2StateCache";
import { WebGL2SamplerRegistry } from "../../../packages/rendering/src/webgl2/Samplers";
import { WebGL2ContextLifecycle } from "../../../packages/rendering/src/webgl2/ContextLifecycle";
import { WebGL2LegacyPostPipeline, PRESENTATION_TEXTURE_UNITS } from "../../../packages/rendering/src/webgl2/LegacyPost";

/**
 * A post chain binds textures with raw GL. The sampler registry keeps its own shadow of which unit is active and which
 * texture each unit holds; if that shadow outlives the post chain, the next forward draw skips a bindTexture it needs and
 * samples whatever the post chain left on the unit. Before the fix `stateCache.invalidate()` (which every raw-GL site
 * calls) did not reset that shadow, and the presentation snapshot restored only units 0..2 while the fused bloom sum
 * binds 0..4.
 *
 * Real WebGL2StateCache, WebGL2SamplerRegistry, WebGL2ContextLifecycle and WebGL2LegacyPostPipeline over a small
 * stateful GL double that tracks the active unit and per-unit bindings.
 */
const TEXTURE0 = 33984;
const TEXTURE_2D = 3553;
const TEXTURE_BINDING_2D = 32873;
const SAMPLER_BINDING = 35097;
const ACTIVE_TEXTURE = 34016;

function statefulGl() {
  let active = 0;
  const units = new Map<number, unknown>();
  const samplers = new Map<number, unknown>();
  const calls: string[] = [];
  const known: Record<string, unknown> = {
    TEXTURE0, TEXTURE_2D, TEXTURE_BINDING_2D, SAMPLER_BINDING, ACTIVE_TEXTURE,
    FRAMEBUFFER: 36160, FRAMEBUFFER_BINDING: 36006, CURRENT_PROGRAM: 35725, VERTEX_ARRAY_BINDING: 34229, VIEWPORT: 2978,
    COLOR_WRITEMASK: 3107, DEPTH_WRITEMASK: 2930, DEPTH_TEST: 2929, CULL_FACE: 2884, BLEND: 3042, SCISSOR_TEST: 3089,
    STENCIL_TEST: 2960, POLYGON_OFFSET_FILL: 32823, NO_ERROR: 0, drawingBufferWidth: 64, drawingBufferHeight: 64,
    activeTexture: (unit: number) => { calls.push("activeTexture"); active = unit - TEXTURE0; },
    bindTexture: (_target: number, texture: unknown) => { calls.push("bindTexture"); units.set(active, texture); },
    bindSampler: (unit: number, sampler: unknown) => { samplers.set(unit, sampler); },
    getParameter: (name: number) => {
      if (name === ACTIVE_TEXTURE) return TEXTURE0 + active;
      if (name === TEXTURE_BINDING_2D) return units.get(active) ?? null;
      if (name === SAMPLER_BINDING) return samplers.get(active) ?? null;
      if (name === 2978) return [0, 0, 64, 64];
      if (name === 3107) return [true, true, true, true];
      return null;
    },
    isEnabled: () => false,
    getError: () => 0
  };
  const gl = new Proxy(known, { get: (target, property: string) => (property in target ? target[property] : () => null) });
  return { gl: gl as unknown as WebGL2RenderingContext, units, calls, activeUnit: () => active };
}

function makeHost() {
  const glState = statefulGl();
  const host: Record<string, unknown> = {
    gl: glState.gl,
    stateCache: new WebGL2StateCache({ label: "test" }),
    counters: { textureBindCount: 0, nativeEnvironmentBindings: 0, nativeShadowMapBindings: 0, drawCalls: 0, programCompiles: 0, shaderProgramCreateCount: 0, shadowRenderTargetsAllocated: 0, releasedTextureHandles: 0 },
    renderTargets: new Set(), buffers: new Set(), shaders: new Set(),
    activeRenderTarget: null, disposed: false, contextLost: false, errorCheckMode: "frame", device: {}
  };
  host.lifecycle = new WebGL2ContextLifecycle(host as never, { width: 64, height: 64 } as never);
  const samplers = new WebGL2SamplerRegistry(host as never);
  host.samplers = samplers;
  const post = new WebGL2LegacyPostPipeline(host as never);
  return { host, samplers, post, glState };
}

describe("texture-unit shadow after a post chain", () => {
  it("stateCache.invalidate() also resets the sampler registry's unit shadow", () => {
    const { host, samplers, glState } = makeHost();
    const scene = { id: "scene" };
    samplers.activateTextureUnit(1);
    samplers.bindTextureForUnit(1, TEXTURE_2D, scene as never);
    expect(samplers.textureUnitBindings.size).toBe(1);
    // A raw-GL post pass rebinds unit 1, then invalidates as every such site does.
    glState.gl.activeTexture(TEXTURE0 + 1);
    glState.gl.bindTexture(TEXTURE_2D, { id: "bloom" } as never);
    (host.stateCache as WebGL2StateCache).invalidate();
    expect(samplers.activeTextureUnitIndex).toBe(-1);
    expect(samplers.textureUnitBindings.size).toBe(0);
    // The next forward draw therefore re-issues its binding instead of trusting the stale shadow.
    glState.calls.length = 0;
    samplers.activateTextureUnit(1);
    samplers.bindTextureForUnit(1, TEXTURE_2D, scene as never);
    expect(glState.calls).toContain("bindTexture");
    expect(glState.units.get(1)).toBe(scene);
  });

  it("the presentation snapshot restores every unit a post pass may bind, and leaves no stale shadow", () => {
    const { samplers, post, glState } = makeHost();
    const sceneTextures = Array.from({ length: PRESENTATION_TEXTURE_UNITS }, (_, unit) => ({ id: `scene-${unit}` }));
    for (let unit = 0; unit < PRESENTATION_TEXTURE_UNITS; unit += 1) {
      samplers.activateTextureUnit(unit);
      samplers.bindTextureForUnit(unit, TEXTURE_2D, sceneTextures[unit] as never);
    }
    samplers.activateTextureUnit(0);
    const snapshot = post.prepareFullscreenPresentation(null, 64, 64);
    // The fused bloom mip sum binds units 0..4.
    for (let unit = 0; unit < PRESENTATION_TEXTURE_UNITS; unit += 1) post.bindFullscreenTexture(unit, { id: `mip-${unit}` } as never);
    post.restoreFullscreenPresentationState(snapshot, 64, 64);
    for (let unit = 0; unit < PRESENTATION_TEXTURE_UNITS; unit += 1) expect(glState.units.get(unit), `unit ${unit}`).toBe(sceneTextures[unit]);
    expect(glState.activeUnit()).toBe(0);
    expect(samplers.textureUnitBindings.size).toBe(0);
    expect(samplers.activeTextureUnitIndex).toBe(-1);
  });
});
