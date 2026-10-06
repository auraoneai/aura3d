// PRD-07 P6-T1 — §6.9 merged decal batching: 100 decals on one atlas page
// emit one draw, the ring evicts oldest-first at the tier cap, the tag-on/off
// carve keeps the flag-off draw list identical (no contributor, no pass).

import { describe, expect, it } from "vitest";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { DecalBatch, DECAL_TIER_CAP, decalQuadGeometry } from "../../../../packages/rendering/src/vfx/DecalBatch";
import { DecalPass } from "../../../../packages/rendering/src/vfx/DecalPass";
import { decalsContributor } from "../../../../packages/rendering/src/vfx/contributors";
import { createAuraApp, scene } from "../../../../packages/engine/src";
import { prd07SystemFor } from "../../../../packages/engine/src/agent-api/vfx/effects-api";

const IDENTITY_QUAT = [0, 0, 0, 1] as const;

function quadGeom() {
  return decalQuadGeometry(IDENTITY_QUAT, [0, 0, 0], [1, 1], 0.012);
}

function ctxFor(device: MockRenderDevice) {
  return {
    device,
    camera: null,
    sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 1000, orthographic: false } },
    blackboard: new Map(),
    source: { vfx: {} },
    timeSeconds: 0
  } as never;
}

describe("P6-T1 merged decal batching", () => {
  it("100 decals on one page build into a single group and a single draw", () => {
    const batch = new DecalBatch(200);
    for (let i = 0; i < 100; i += 1) {
      batch.upsert({ id: `d${i}`, pageKey: "atlas:page0", blend: "alpha", geometry: quadGeom() }, 0);
    }
    const groups = batch.buildAll(0);
    expect(groups.length).toBe(1);
    expect(groups[0]!.pageKey).toBe("atlas:page0");
    expect(groups[0]!.vertexCount).toBe(400);
    expect(groups[0]!.triangleCount).toBe(200);

    const device = new MockRenderDevice();
    const pass = new DecalPass(device);
    device.beginFrame(320, 200);
    expect(pass.draw(batch, ctxFor(device) as never, 0)).toBe(1);
    device.endFrame();
    expect(device.drawCommands.length).toBe(1);
  });

  it("capacity evicts oldest-first; upsert keeps insertion order", () => {
    const batch = new DecalBatch(3);
    batch.upsert({ id: "a", pageKey: "p", geometry: quadGeom() }, 0);
    batch.upsert({ id: "b", pageKey: "p", geometry: quadGeom() }, 0);
    batch.upsert({ id: "c", pageKey: "p", geometry: quadGeom() }, 0);
    batch.upsert({ id: "d", pageKey: "p", geometry: quadGeom() }, 0);
    expect(batch.ids()).toEqual(["b", "c", "d"]);
    // Refreshing an existing slot keeps its insertion order (stays oldest),
    // so the next insert evicts it rather than the untouched "c".
    batch.upsert({ id: "b", pageKey: "p", geometry: quadGeom() }, 1);
    batch.upsert({ id: "e", pageKey: "p", geometry: quadGeom() }, 1);
    expect(batch.ids()).toEqual(["c", "d", "e"]);
  });

  it("C-27 tier caps: low 64 / medium 128 / high 256 / ultra 512", () => {
    expect(DECAL_TIER_CAP).toEqual({ low: 64, medium: 128, high: 256, ultra: 512 });
  });

  it("splits draws on page and blend keys", () => {
    const batch = new DecalBatch(10);
    batch.upsert({ id: "a", pageKey: "p0", blend: "alpha", geometry: quadGeom() }, 0);
    batch.upsert({ id: "b", pageKey: "p1", blend: "alpha", geometry: quadGeom() }, 0);
    batch.upsert({ id: "c", pageKey: "p0", blend: "multiply", geometry: quadGeom() }, 0);
    expect(batch.buildAll(0).length).toBe(3);
  });

  it("life/fadeOut expires slots from merged output", () => {
    const batch = new DecalBatch(10);
    batch.upsert({ id: "splash", pageKey: "p", geometry: quadGeom(), life: 0.5, fadeOut: 0.25 }, 1);
    expect(batch.buildAll(1.2).length).toBe(1);
    expect(batch.buildAll(1.8).length).toBe(0);
  });

  it("flag-off: the contributor is gated on A3D_QR_VFX_DECALS and yields no passes without a feed", () => {
    expect(decalsContributor.flag).toBe("A3D_QR_VFX_DECALS");
    expect(decalsContributor.phases).toContain("after-opaque");
    const passes = decalsContributor.passes!("after-opaque", ctxFor(new MockRenderDevice()) as never);
    expect(passes).toEqual([]);
  });

  it("P6 runtime decals: app.effects.decal lands in the merged ring; stop() evicts it", () => {
    const app = createAuraApp(null, { autoStart: false, scene: scene(), qualityRebuild: { flags: ["vfx", "vfx.decals"] } });
    const system = prd07SystemFor(app)!;
    const handle = app.effects!.decal(
      { position: [1, 0.5, -2], normal: [0, 1, 0] },
      { size: 0.8, color: "#c33b22", opacity: 0.9 }
    );
    expect(handle.alive).toBe(true);
    const batch = system.decalFeed();
    expect(batch.ids()).toContain(`runtime-decal.${handle.id}`);
    handle.setPosition([2, 0.5, -2]);
    system.decalFeed();
    handle.stop();
    expect(system.decalFeed().ids()).not.toContain(`runtime-decal.${handle.id}`);
    app.dispose();
  });
});
