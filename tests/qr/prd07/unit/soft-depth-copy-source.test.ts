// #868 — 14-particles threw under `$ALL` (`TypeError: Cannot read properties
// of undefined (reading 'length') at getTextureHandle`) because lane 01's
// FrameGraph publishes `aura.scene.depth.copy` as the copy RenderTarget while
// the PRD 07 scene-depth adapter cast it to a Texture and bound it as
// `u_sceneDepth`. WebGL2 `getTextureHandle` then read `mipLevels.length` of a
// RenderTarget. The adapter now unwraps the target's `depthTexture` and fails
// closed (hard particles + C-36 note) for any unsampleable source.

import { beforeEach, describe, expect, it } from "vitest";
import { MockRenderDevice, type DrawCommand } from "../../../../packages/rendering/src/RenderDevice";
import { Texture } from "../../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../../packages/rendering/src/TextureBinding";
import { ParticleBatchPass } from "../../../../packages/rendering/src/vfx/ParticleBatchPass";
import { resetSceneDepthAdapterReports, resolveSceneDepth, sceneDepthCopyTexture } from "../../../../packages/rendering/src/vfx/SceneDepthAdapter";
import { ensureSceneDepthCopyTarget } from "../../../../packages/rendering/src/renderer/SceneDepthCopyPass";
import { FRAME_RESOURCES, type FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import { createAuraApp, effects, scene } from "../../../../packages/engine/src";
import { prd07SystemFor } from "../../../../packages/engine/src/agent-api/vfx/effects-api";

const ctxWith = (published?: unknown) => {
  const blackboard = new Map<string, unknown>();
  if (published !== undefined) blackboard.set(FRAME_RESOURCES.sceneDepthCopy, published);
  return {
    device: null,
    camera: null,
    sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 1000, orthographic: false } },
    blackboard
  } as never as FrameContributorContext;
};

/** Every TextureBinding source must be a real Texture — what getTextureHandle reads. */
function textureSources(command: DrawCommand): unknown[] {
  const out: unknown[] = [];
  for (const value of command.uniforms?.values() ?? []) {
    if (value instanceof TextureBinding && value.texture) out.push(value.texture);
  }
  return out;
}

beforeEach(() => resetSceneDepthAdapterReports());

describe("#868 scene-depth copy source", () => {
  it("unwraps the published copy RenderTarget to its depth Texture", () => {
    const device = new MockRenderDevice();
    const target = ensureSceneDepthCopyTarget(device, null, 64, 32);
    const texture = sceneDepthCopyTexture(target);
    expect(texture).toBeInstanceOf(Texture);
    expect(texture).toBe(target.depthTexture);
    const resolved = resolveSceneDepth(ctxWith(target));
    expect(resolved.available).toBe(true);
    expect(resolved.source.texture).toBe(target.depthTexture);
    expect(Array.isArray(resolved.source.texture!.mipLevels)).toBe(true);
  });

  it("still accepts a published Texture", () => {
    const tex = new Texture({ label: "depth-copy", width: 4, height: 4, format: "rgba8", data: new Uint8Array(64) });
    expect(resolveSceneDepth(ctxWith(tex)).source.texture).toBe(tex);
  });

  it("fails closed with a one-shot note for an unsampleable source", () => {
    const first = resolveSceneDepth(ctxWith({ width: 4, height: 4 }));
    expect(first.available).toBe(false);
    expect(first.pendingNote).toBe("SOFT_DEPTH_INVALID_SOURCE");
    expect(first.source.texture).toBeNull();
    expect(resolveSceneDepth(ctxWith({ width: 4, height: 4 })).pendingNote).toBeNull();
    const device = new MockRenderDevice();
    const disposed = ensureSceneDepthCopyTarget(device, null, 8, 8);
    disposed.dispose();
    expect(sceneDepthCopyTexture(disposed)).toBeNull();
  });

  it("particle batch draw binds only real Textures when the copy target is published", () => {
    const s = scene().add(effects.particles({ name: "smoke", materialMode: "soft-alpha" as never, particleCount: 64 }));
    const app = createAuraApp(null, { autoStart: false, scene: s, qualityRebuild: { flags: ["vfx"] } });
    const system = prd07SystemFor(app)!;
    const device = new MockRenderDevice();
    const pass = new ParticleBatchPass(device);
    for (let i = 0; i < 30; i++) app.step(1 / 60);
    system.feed(pass);
    const target = ensureSceneDepthCopyTarget(device, null, 320, 200);
    const ctx = ctxWith(target);
    const queue = pass.transparentItems(ctx);
    expect(queue.length).toBeGreaterThan(0);
    device.beginFrame(320, 200);
    for (const item of queue) item.draw(ctx);
    const draws = device.drawCommands.filter((d) => d.label?.startsWith("prd07.particles."));
    device.endFrame();
    expect(draws.length).toBeGreaterThan(0);
    let boundDepth = false;
    for (const draw of draws) {
      for (const source of textureSources(draw)) {
        expect(source).toBeInstanceOf(Texture);
        expect(Array.isArray((source as Texture).mipLevels)).toBe(true);
      }
      const depth = draw.uniforms?.get("u_sceneDepth");
      if (depth instanceof TextureBinding) {
        boundDepth = true;
        expect(depth.texture).toBe(target.depthTexture);
      }
    }
    expect(boundDepth).toBe(true);
    app.dispose();
  });
});
