// GU47 WP-6 (E-F) item 1: emitter `sprite` names sample the baked VFX atlas
// (packages/engine/assets/vfx/aura-vfx-2k.png, 1k twin on low/medium tiers).

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ParticleBatchDescriptor, ParticleBatchHandle, ParticleRenderHook } from "../../../../packages/rendering/src/contracts/particles";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { ParticleBatchPass } from "../../../../packages/rendering/src/vfx/ParticleBatchPass";
import type { FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import { TextureBinding } from "../../../../packages/rendering/src";
import { AURA_VFX_BUILTIN_SEQUENCES } from "../../../../packages/engine/src/agent-api/vfx/atlas";
import { effects } from "../../../../packages/engine/src";
import { lowerEffectNode, lowerSprite, type EffectNodeLike } from "../../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";
import {
  VFX_SPRITE_LAYOUT,
  defaultVfxSpritePageUrl,
  vfxSpriteFrame,
  vfxSpritePageSize,
  vfxSpriteRect,
  type VfxSpriteLoader
} from "../../../../packages/engine/src/production-runtime/effects/FlipbookAtlas";
import { ProductionEffectSystem, type AppLike } from "../../../../packages/engine/src/production-runtime/effects/ProductionEffectSystem";

type Rect = readonly [number, number, number, number];
const MANIFEST_PATH = fileURLToPath(new URL("../../../../packages/engine/assets/vfx/manifest.json", import.meta.url));
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as { sequences: Record<string, { rect: Rect; columns: number; rows: number; frames: number; fps?: number; loop?: boolean }> };

function overlaps(a: Rect, b: Rect): boolean {
  return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
}

function fakeApp(nodes: EffectNodeLike[]): { app: AppLike; step(dt: number): void } {
  const callbacks: ((frame: { dt: number }) => void)[] = [];
  return {
    app: { scene: { nodes }, onFrame: (cb) => { callbacks.push(cb); return () => undefined; } },
    step: (dt) => { for (const cb of callbacks) cb({ dt }); }
  };
}

function recordingHook(): ParticleRenderHook & { descs: ParticleBatchDescriptor[]; data: Map<string, { data: Float32Array; live: number }> } {
  const descs: ParticleBatchDescriptor[] = [];
  const data = new Map<string, { data: Float32Array; live: number }>();
  return {
    descs,
    data,
    upsertBatch: (desc) => { descs.push(desc); return { key: desc.key } as unknown as ParticleBatchHandle; },
    writeInstances: (handle, values, live) => { data.set((handle as unknown as { key: string }).key, { data: values.slice(0, live * 16), live }); },
    removeBatch: () => undefined
  };
}

/** Loader that returns a flat RGBA block of the rect size and records every call. */
function dataLoader(calls: { url: string; rect: Rect | null }[], fail = false): VfxSpriteLoader {
  return async (url, rect) => {
    calls.push({ url, rect });
    if (fail) throw new Error("HTTP 404");
    const [, , w, h] = rect ?? [0, 0, 8, 8];
    return { width: w, height: h, data: new Uint8Array(w * h * 4).fill(200) };
  };
}

const smokeNode = (sprite: unknown, extra: Record<string, unknown> = {}): EffectNodeLike =>
  ({ ...(effects.particles({ name: "smoke", particleCount: 32, emissionRate: 40, sprite: sprite as never }).toJSON() as object), ...extra }) as unknown as EffectNodeLike;

describe("GU47 E-F item 1: atlas sprite lowering", () => {
  it("a built-in sprite gets its own batch key, its frame grid and frame blend; the default stays byte-identical", () => {
    const plain = lowerEffectNode(effects.particles({ name: "p", particleCount: 16 }).toJSON() as EffectNodeLike);
    const softDot = lowerEffectNode(effects.particles({ name: "p", particleCount: 16, sprite: "soft-dot" }).toJSON() as EffectNodeLike);
    const smoke = lowerEffectNode(effects.particles({ name: "p", particleCount: 16, sprite: "smoke-a" }).toJSON() as EffectNodeLike);
    expect(plain.type).toBe("emitter");
    if (plain.type !== "emitter" || smoke.type !== "emitter" || softDot.type !== "emitter") throw new Error("expected emitters");
    expect(plain.sprite).toBeUndefined();
    expect(plain.batch.atlasKey).toBe("soft-dot");
    expect(plain.emitter.key).toBe("eff.alpha.soft-dot.true.false.0");
    expect(softDot).toEqual(plain);
    expect(smoke.sprite).toEqual({ kind: "builtin", name: "smoke-a", columns: 2, rows: 1, frames: 2, fps: 6, loop: true });
    expect(smoke.batch.atlasKey).toBe("vfx:smoke-a");
    expect(smoke.batch.frameBlend).toBe(true);
    expect(smoke.emitter.key).toContain(".vfx:smoke-a.");
    expect(smoke.emitter.key).not.toBe(plain.emitter.key);
  });

  it("every built-in name resolves; unknown names and atlas objects without a url keep the soft-dot", () => {
    for (const name of AURA_VFX_BUILTIN_SEQUENCES) {
      const sprite = lowerSprite({ sprite: name });
      if (name === "soft-dot") expect(sprite).toBeUndefined();
      else expect(sprite).toMatchObject({ kind: "builtin", name });
    }
    expect(lowerSprite({ sprite: "not-a-sprite" })).toBeUndefined();
    expect(lowerSprite({ sprite: { atlas: {} } })).toBeUndefined();
  });

  it("a texture-asset sheet samples one fixed cell of the emitter's sprite grid", () => {
    const sheet = { kind: "aura-asset-ref", type: "texture", id: "sparks", url: "/assets/sparks-4x2.png" };
    expect(lowerSprite({ sprite: { atlas: sheet, frame: 5 }, spriteColumns: 4, spriteRows: 2 })).toEqual({ kind: "texture", url: "/assets/sparks-4x2.png", columns: 4, rows: 2, frames: 8, frame: 5 });
    expect(lowerSprite({ sprite: { atlas: "/a.png", frame: 99 } })).toEqual({ kind: "texture", url: "/a.png", columns: 1, rows: 1, frames: 1, frame: 0 });
  });
});

describe("GU47 E-F item 1: built-in layout against the baked atlas", () => {
  const adjusted = new Set(["smoke-a", "fireball", "flame-loop"]);

  it("mirrors manifest.json; the three overlapping two-row sequences use their clean top row", () => {
    for (const name of AURA_VFX_BUILTIN_SEQUENCES) {
      const baked = manifest.sequences[name];
      const layout = VFX_SPRITE_LAYOUT[name];
      expect(baked, name).toBeDefined();
      if (!adjusted.has(name)) {
        expect(layout, name).toEqual({ rect: baked.rect, columns: baked.columns, rows: baked.rows, frames: baked.frames, ...(baked.fps ? { fps: baked.fps } : {}), ...(baked.loop ? { loop: true } : {}) });
        continue;
      }
      // Top row of the baked rect: same origin and width, one cell row, same cycle time when looping.
      expect(layout.rect).toEqual([baked.rect[0], baked.rect[1], baked.rect[2], baked.rect[3] / baked.rows]);
      expect(layout.rows).toBe(1);
      expect(layout.columns).toBe(baked.columns);
      expect(layout.frames).toBe(baked.columns);
      if (baked.loop) expect(layout.frames / layout.fps!).toBeCloseTo(baked.frames / baked.fps!, 6);
    }
  });

  it("the baked manifest overlaps exactly where the bake advanced one row per two-row sequence; the runtime layout does not", () => {
    const names = Object.keys(manifest.sequences);
    const bakedPairs: string[] = [];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        if (overlaps(manifest.sequences[names[i]].rect, manifest.sequences[names[j]].rect)) bakedPairs.push([names[i], names[j]].sort().join("|"));
      }
    }
    // If the atlas is re-baked without overlaps this list empties: restore the manifest rows in VFX_SPRITE_LAYOUT then.
    expect(bakedPairs.sort()).toEqual(["debris-chips|flame-loop", "electric|flame-loop", "fireball|flame-loop", "fireball|smoke-a"].sort());
    const layoutNames = Object.keys(VFX_SPRITE_LAYOUT) as (keyof typeof VFX_SPRITE_LAYOUT)[];
    for (let i = 0; i < layoutNames.length; i++) {
      const a = VFX_SPRITE_LAYOUT[layoutNames[i]];
      expect(a.rect[0] + a.rect[2]).toBeLessThanOrEqual(2048);
      expect(a.rect[1] + a.rect[3]).toBeLessThanOrEqual(2048);
      expect(a.rect[2] % a.columns).toBe(0);
      expect(a.rect[3] % a.rows).toBe(0);
      for (let j = i + 1; j < layoutNames.length; j++) {
        expect(overlaps(a.rect, VFX_SPRITE_LAYOUT[layoutNames[j]].rect), `${layoutNames[i]} vs ${layoutNames[j]}`).toBe(false);
      }
    }
  });

  it("the 1k twin uses a 132 px cell pitch (128 px cells, same 4 px gutter)", () => {
    expect(vfxSpriteRect(VFX_SPRITE_LAYOUT["dust-mote"], 1024)).toEqual([4 + 6 * 132, 4, 128, 128]);
    expect(vfxSpriteRect(VFX_SPRITE_LAYOUT.splash, 1024)).toEqual([4 + 5 * 132, 4 + 3 * 132, 256, 256]);
    expect(vfxSpriteRect(VFX_SPRITE_LAYOUT.splash, 2048)).toEqual([1304, 784, 512, 512]);
    expect(vfxSpritePageSize("low")).toBe(1024);
    expect(vfxSpritePageSize("medium")).toBe(1024);
    expect(vfxSpritePageSize("high")).toBe(2048);
    expect(vfxSpritePageSize("ultra")).toBe(2048);
  });

  it("decoded pages: each runtime rect holds its own sprite on both pages (premultiplied, alpha centroid at the same place)", async () => {
    const sharp = (await import("sharp")).default;
    const decode = async (size: 1024 | 2048) => {
      const { data, info } = await sharp(fileURLToPath(defaultVfxSpritePageUrl(size))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return { data, width: info.width };
    };
    const [big, small] = await Promise.all([decode(2048), decode(1024)]);
    const stats = (page: { data: Buffer; width: number }, rect: Rect) => {
      let sum = 0, cx = 0, cy = 0, premulViolations = 0;
      for (let y = rect[1]; y < rect[1] + rect[3]; y++) {
        for (let x = rect[0]; x < rect[0] + rect[2]; x++) {
          const i = (y * page.width + x) * 4;
          const a = page.data[i + 3];
          if (page.data[i] > a || page.data[i + 1] > a || page.data[i + 2] > a) premulViolations++;
          sum += a; cx += a * (x - rect[0]) / rect[2]; cy += a * (y - rect[1]) / rect[3];
        }
      }
      return { mean: sum / (rect[2] * rect[3]), cx: sum > 0 ? cx / sum : 0.5, cy: sum > 0 ? cy / sum : 0.5, premulViolations };
    };
    for (const name of AURA_VFX_BUILTIN_SEQUENCES) {
      const a = stats(big, vfxSpriteRect(VFX_SPRITE_LAYOUT[name], 2048));
      const b = stats(small, vfxSpriteRect(VFX_SPRITE_LAYOUT[name], 1024));
      expect(a.mean, `${name} 2k has content`).toBeGreaterThan(0.2);
      expect(a.premulViolations, `${name} premultiplied`).toBe(0);
      expect(Math.abs(a.cx - b.cx), `${name} centroid x`).toBeLessThan(0.03);
      expect(Math.abs(a.cy - b.cy), `${name} centroid y`).toBeLessThan(0.03);
      expect(Math.abs(a.mean - b.mean) / Math.max(a.mean, 1), `${name} mean alpha`).toBeLessThan(0.15);
    }
  });

  it("the default page URLs resolve to the committed PNGs", () => {
    for (const size of [1024, 2048] as const) {
      const url = defaultVfxSpritePageUrl(size);
      expect(url).toMatch(size === 2048 ? /\/assets\/vfx\/aura-vfx-2k\.png$/ : /\/assets\/vfx\/aura-vfx-1k\.png$/);
      expect(existsSync(fileURLToPath(url))).toBe(true);
    }
  });
});

describe("GU47 E-F item 1: frames", () => {
  it("looping sequences run at their fps, play-once sequences span the life, sheets hold their cell", () => {
    expect(vfxSpriteFrame({ frames: 4, fps: 12, loop: true }, 0.25, 1)).toBeCloseTo(3, 6);
    expect(vfxSpriteFrame({ frames: 4, fps: 12, loop: true }, 0.5, 1)).toBeCloseTo(2, 6);
    expect(vfxSpriteFrame({ frames: 4, fps: 10 }, 0, 0.8)).toBe(0);
    expect(vfxSpriteFrame({ frames: 4, fps: 10 }, 0.4, 0.8)).toBeCloseTo(1.5, 6);
    expect(vfxSpriteFrame({ frames: 4, fps: 10 }, 2, 0.8)).toBe(3);
    expect(vfxSpriteFrame({ frames: 1 }, 3, 1)).toBe(0);
    expect(vfxSpriteFrame({ frames: 8, frame: 5 }, 0.3, 1)).toBe(5);
  });
});

describe("GU47 E-F item 1: ProductionEffectSystem samples the sprite once loaded", () => {
  it("high tier crops the 2k page; the batch keeps the soft-dot until the texture is ready, then samples it with its grid", async () => {
    const calls: { url: string; rect: Rect | null }[] = [];
    const { app, step } = fakeApp([smokeNode("dust-mote")]);
    const system = new ProductionEffectSystem(app, { tier: "high", spriteLoader: dataLoader(calls), spritePageUrl: (size) => `/vfx/page-${size}.png` });
    step(0.5);
    const hook = recordingHook();
    system.feed(hook);
    expect(hook.descs[0].atlas.width).toBe(1); // analytic soft-dot while the page loads
    expect(system.spriteStatus()).toEqual({ "vfx:dust-mote": "pending" });
    await system.spritesSettled();
    expect(calls).toEqual([{ url: "/vfx/page-2048.png", rect: [1564, 4, 256, 256] }]);
    system.feed(hook);
    const desc = hook.descs[hook.descs.length - 1];
    expect(desc.atlas.width).toBe(256);
    expect(desc.atlas.colorSpace).toBe("srgb");
    expect(desc.atlasGrid).toEqual([1, 1]);
    expect(desc.atlasStraightAlpha).toBeUndefined(); // the baked page is premultiplied
    expect(system.spriteStatus()).toEqual({ "vfx:dust-mote": "ready" });
    system.dispose();
  });

  it("low tier crops the 1k twin", async () => {
    const calls: { url: string; rect: Rect | null }[] = [];
    const { app, step } = fakeApp([smokeNode("splash")]);
    const system = new ProductionEffectSystem(app, { tier: "low", spriteLoader: dataLoader(calls), spritePageUrl: (size) => `/vfx/page-${size}.png` });
    step(0.2);
    system.feed(recordingHook());
    await system.spritesSettled();
    expect(calls).toEqual([{ url: "/vfx/page-1024.png", rect: [4 + 5 * 132, 4 + 3 * 132, 256, 256] }]);
    system.dispose();
  });

  it("smoke-a writes animated frames into the instance frame slot and keeps rotation", async () => {
    const { app, step } = fakeApp([smokeNode("smoke-a")]);
    const system = new ProductionEffectSystem(app, { tier: "high", spriteLoader: dataLoader([]) });
    step(1);
    const hook = recordingHook();
    system.feed(hook);
    await system.spritesSettled();
    system.feed(hook);
    const written = [...hook.data.values()][0];
    expect(written.live).toBeGreaterThan(4);
    const frames = new Set<number>();
    let rotated = 0;
    for (let i = 0; i < written.live; i++) {
      const frame = written.data[i * 16 + 13];
      expect(frame).toBeGreaterThanOrEqual(0);
      expect(frame).toBeLessThan(2);
      frames.add(Math.round(frame * 100));
      if (written.data[i * 16 + 12] !== 0) rotated++;
    }
    expect(frames.size).toBeGreaterThan(1);
    expect(rotated).toBeGreaterThan(0);
    system.dispose();
  });

  it("a failed load is reported once and the batch stays on the soft-dot", async () => {
    const { app, step } = fakeApp([smokeNode("smoke-b")]);
    const system = new ProductionEffectSystem(app, { tier: "high", spriteLoader: dataLoader([], true) });
    step(0.3);
    const hook = recordingHook();
    system.feed(hook);
    await system.spritesSettled();
    system.feed(hook);
    expect(hook.descs[hook.descs.length - 1].atlas.width).toBe(1);
    expect(system.spriteStatus()).toEqual({ "vfx:smoke-b": "failed" });
    const errors = system.diagnostics.report().errors.filter((error) => error.code === "VFX_SPRITE_UNAVAILABLE");
    expect(errors).toHaveLength(1);
    expect(errors[0].nodeId).toBe("vfx:smoke-b");
    system.dispose();
  });

  it("mock device: the particle pass binds the sprite texture and its grid (no procedural soft-dot)", async () => {
    const { app, step } = fakeApp([smokeNode("smoke-b")]);
    const system = new ProductionEffectSystem(app, { tier: "high", spriteLoader: dataLoader([]) });
    step(0.6);
    const device = new MockRenderDevice();
    const pass = new ParticleBatchPass(device);
    system.feed(pass);
    await system.spritesSettled();
    system.feed(pass);
    const ctx = { device: null, camera: null, sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 1000, orthographic: false } }, blackboard: new Map() } as never as FrameContributorContext;
    const queue = pass.transparentItems(ctx);
    device.beginFrame(320, 200);
    for (const item of queue) item.draw(ctx);
    device.endFrame();
    const particleDraw = device.drawCommands.find((call) => String(call.label ?? "").startsWith("prd07.particles."));
    expect(particleDraw).toBeDefined();
    const atlas = particleDraw!.uniforms?.get("u_atlas");
    expect(atlas).toBeInstanceOf(TextureBinding);
    expect((atlas as TextureBinding).texture?.width).toBe(512);
    expect(particleDraw!.uniforms?.get("u_grid")).toEqual([2, 2]);
    system.dispose();
  });
});
