import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regression coverage for two per-frame GPU allocations that held an animating route at ~2 FPS.
 *
 * Both were found by counting WebGL calls per rendered frame on the Aura Clash playable route, which
 * renders 91 skinned/shadowed draw calls:
 *
 *  1. `ShadowPass` is constructed fresh by `Renderer` every frame, so `DepthPass`'s instance-field
 *     shader cache was discarded each frame and the depth shader was **recompiled and relinked every
 *     frame** (measured: 1 `compileShader` + 1 `linkProgram` + 1 `createProgram` per frame). WebGL
 *     shader compilation is a synchronous GPU stall.
 *  2. The shadow depth target and the postprocess forward-colour target were both allocated inside
 *     the frame and disposed at end of frame (measured: 3 `createTexture` + 3
 *     `checkFramebufferStatus` per frame).
 *
 * After both fixes the same route reported **0** per-frame shader compiles and **0** per-frame
 * texture/framebuffer allocations.
 */
function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("depth shader module is cached across DepthPass instances", () => {
  it("keys the depth shader cache by shader library rather than by pass instance", () => {
    const source = read("packages/rendering/src/DepthPass.ts");
    // A static, library-keyed cache survives the per-frame `new DepthPass(...)`.
    expect(source).toContain("private static readonly shaderModules = new WeakMap<ShaderLibrary, ShaderModule>()");
    expect(source).toContain("DepthPass.shaderModules.get(this.shaderLibrary)");
    expect(source).toContain("DepthPass.shaderModules.set(this.shaderLibrary, module)");
    // The old per-instance field must not come back.
    expect(source).not.toContain("private shaderModule: ShaderModule | null = null");
  });
});

describe("renderer reuses frame render targets", () => {
  it("reuses one shadow depth target instead of allocating per frame", () => {
    const source = read("packages/rendering/src/Renderer.ts");
    expect(source).toContain("private shadowDepthTarget: RenderTarget | null = null");
    expect(source).toContain("private ensureShadowDepthTarget(size: number): RenderTarget");
    // The per-frame ShadowPass must be handed the renderer-owned target.
    expect(source).toContain("renderTarget: this.ensureShadowDepthTarget(shadowMap.size)");
  });

  it("reuses one forward-colour target keyed by every allocation-affecting property", () => {
    const source = read("packages/rendering/src/Renderer.ts");
    expect(source).toContain("private forwardColorTarget:");
    expect(source).toContain("private ensureForwardColorTarget(");
    // Size, format, depth mode, and sample count all change the allocation, so all must be in the key.
    const keyLine = source.split("\n").find((line) => line.includes("const key = `${this.width}x${this.height}"));
    expect(keyLine, "forward-colour cache key line").toBeDefined();
    expect(keyLine).toContain("${format}");
    expect(keyLine).toContain("depth-texture");
    expect(keyLine).toContain("${sampleCount}");
  });

  it("excludes reused targets from end-of-frame disposal while keeping them discoverable", () => {
    const source = read("packages/rendering/src/Renderer.ts");
    // Downstream postprocess and diagnostics read the forward target from `ownedTargets[0]`, so the
    // reused target must still be pushed there.
    expect(source).toContain("ownedTargets.push(forwardTarget)");
    // ...but skipped when the frame disposes owned targets, or the allocation returns every frame.
    expect(source).toContain("if (this.isReusedTarget(target)) continue");
    expect(source).toContain("private isReusedTarget(target: RenderTarget): boolean");
    const guard = source.split("\n").find((line) => line.includes("return target === this.forwardColorTarget?.target"));
    expect(guard, "isReusedTarget must cover both reused targets").toContain("this.shadowDepthTarget");
  });

  it("releases both reused targets when the renderer is disposed", () => {
    const source = read("packages/rendering/src/Renderer.ts");
    const disposeStart = source.indexOf("  dispose(): void {");
    expect(disposeStart).toBeGreaterThan(-1);
    const disposeBody = source.slice(disposeStart, disposeStart + 600);
    expect(disposeBody).toContain("this.shadowDepthTarget?.dispose()");
    expect(disposeBody).toContain("this.forwardColorTarget?.target.dispose()");
  });
});

describe("shadow pass honours a caller-owned render target", () => {
  it("accepts an external target and does not dispose it", () => {
    const source = read("packages/rendering/src/ShadowPass.ts");
    expect(source).toContain("readonly renderTarget?: RenderTarget");
    // Reuse it when the size still matches.
    expect(source).toContain("const supplied = this.options.renderTarget");
    // A caller-supplied target outlives the pass, so `dispose()` must not free it.
    expect(source).toContain("if (!this.options.renderTarget) this.renderTarget?.dispose()");
  });
});
