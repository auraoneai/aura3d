/**
 * Meshy-generated model layer (text prompts only; prompts and task ids in assets/ATTRIBUTION.md).
 * Replaces the procedural cottages, trees, traveller, wisp and boat when the matching GLB is present.
 */
import { instances, model, type AuraApp, type scene } from "@aura3d/engine";
import { createLocomotion } from "@aura3d/engine/game";

type Scene = ReturnType<typeof scene>;
import { MODEL_ASSETS, hasModel } from "./model-assets";
import { CLIP_SECONDS, HERO_GAITS, STRIDE_SPEED, type Gait } from "./locomotion";
import type { ModelPlacement, Scenery } from "./scenery";

export interface ModelSet { letter: boolean; bell: boolean; cottage: boolean; trees: boolean; hero: boolean; wisp: boolean; boat: boolean; stones: boolean; shrubs: boolean }

export function availableModels(): ModelSet {
  return {
    letter: hasModel("letter"),
    bell: hasModel("belltower"),
    cottage: hasModel("cottage"),
    trees: hasModel("pine") && hasModel("oak"),
    hero: hasModel("hero"),
    wisp: hasModel("wisp"),
    boat: hasModel("boat"),
    stones: hasModel("stones"),
    shrubs: hasModel("shrub")
  };
}

const xf = (p: ModelPlacement, scale: number, yawOffset = 0, lift = 0) => ({ position: [p.x, p.y + lift, p.z] as [number, number, number], rotation: [0, p.yaw + yawOffset, 0] as [number, number, number], scale: [scale, scale, scale] as [number, number, number] });

/** Static dressing: cottages, trees, shrubs, stones. The animated pieces (hero, wisp, boat) are added by `addAnimatedModels`. */
export function addStaticModels(builder: Scene, sc: Scenery, set: ModelSet): void {
  if (set.cottage) {
    sc.placements.cottages.forEach((p, i) => builder.add(model(MODEL_ASSETS.cottage, { name: `cottage-${i}`, targetHeight: p.h ?? 8, position: [p.x, p.y, p.z], rotation: [0, p.yaw, 0], castShadow: true, receiveShadow: true, collider: false })));
  }
  if (set.bell) sc.placements.bell.forEach((p) => builder.add(model(MODEL_ASSETS.belltower, { name: "belltower", targetHeight: p.h ?? 4.6, position: [p.x, p.y, p.z], rotation: [0, 0, 0], castShadow: true, receiveShadow: true, collider: false })));
  if (set.trees) {
    if (sc.placements.pines.length > 0) builder.add(instances.model(MODEL_ASSETS.pine, { name: "pines", targetHeight: 6, transforms: sc.placements.pines.map((p) => xf(p, (p.h ?? 6) / 6)), castShadow: false, receiveShadow: false, collider: false }));
    if (sc.placements.oaks.length > 0) builder.add(instances.model(MODEL_ASSETS.oak, { name: "oaks", targetHeight: 6, transforms: sc.placements.oaks.map((p) => xf(p, (p.h ?? 6) / 6)), castShadow: false, receiveShadow: false, collider: false }));
  }
  if (set.shrubs && sc.placements.shrubs.length > 0) builder.add(instances.model(MODEL_ASSETS.shrub, { name: "shrubs", targetHeight: 1.2, transforms: sc.placements.shrubs.map((p) => xf(p, p.s)), castShadow: false, collider: false }));
  if (set.stones && sc.placements.stones.length > 0) sc.placements.stones.forEach((p, i) => builder.add(model(MODEL_ASSETS.stones, { name: `stones-${i}`, targetHeight: 3.2 * p.s, position: [p.x, p.y, p.z], rotation: [0, p.yaw, 0], castShadow: false, collider: false })));
}

export function addAnimatedModels(builder: Scene, set: ModelSet, letterCount: number): void {
  if (set.letter) for (let i = 0; i < letterCount; i++) builder.add(model(MODEL_ASSETS.letter, { name: `letter-${i}`, targetMaxDimension: 0.95, castShadow: false, collider: false }).runtime({ id: `letter-${i}` }));
  if (set.hero) builder.add(model(MODEL_ASSETS.hero, { name: "hero", targetHeight: 2.9, castShadow: false, receiveShadow: false, collider: false }).runtime({ id: "hero" }));
  if (set.wisp) builder.add(model(MODEL_ASSETS.wisp, { name: "wisp", targetHeight: 0.9, castShadow: false, receiveShadow: false, collider: false }).runtime({ id: "wisp" }));
  if (set.boat) builder.add(model(MODEL_ASSETS.boat, { name: "boat", targetLength: 5.4, castShadow: false, collider: false }).runtime({ id: "boat" }));
}

export interface HeroDrive { x: number; z: number; airborne: boolean; onBoat: boolean; time: number }
export interface HeroAnimator { update(drive: HeroDrive): Gait; reset(x: number, z: number, time?: number): void; readonly gait: Gait }
/**
 * Drives the traveller's walk, run and idle clips with the library's `createLocomotion`, fed the real ground speed once
 * per sim step (the stepped QA path calls `update` twice per step, so a zero time delta is skipped). The dominant gait's
 * stride phase is pinned each frame (`loop: false` plus `captureTime`), so a planted foot moves at ground speed whatever
 * the frame rate. `play` only gets a crossfade on a gait change: re-issuing a fresh crossfade on every frame restarts
 * the blend, and a looped clip with a moving `captureTime` also runs on the engine's own clock.
 */
export function createHeroAnimator(app: AuraApp): HeroAnimator {
  const hero = app.nodes.require("hero");
  const loco = createLocomotion({ gaits: HERO_GAITS, minRate: 0.6, maxRate: 1.7 });
  let gait: Gait = "Idle", issued: Gait | "" = "", lastX = 0, lastZ = 0, lastTime = 0, phaseSeconds = 0, primed = false;
  return {
    get gait() { return gait; },
    reset(x, z, time) { loco.reset(); gait = "Idle"; issued = ""; lastX = x; lastZ = z; if (time !== undefined) lastTime = time; phaseSeconds = 0; primed = true; },
    update({ x, z, airborne, onBoat, time }) {
      if (!primed) { lastX = x; lastZ = z; lastTime = time; primed = true; }
      const dt = time - lastTime;
      if (dt > 0) {
        const speed = airborne ? STRIDE_SPEED.Run : onBoat ? 0 : Math.hypot(x - lastX, z - lastZ) / dt;
        const frame = loco.update(speed, dt);
        gait = frame.dominant as Gait;
        phaseSeconds = gait === "Idle" ? time % CLIP_SECONDS.Idle : frame.phase * CLIP_SECONDS[gait];
        lastTime = time;
        lastX = x; lastZ = z;
      }
      hero.play(gait, { loop: false, captureTime: phaseSeconds, crossFade: issued !== gait ? 0.15 : false });
      issued = gait;
      return gait;
    }
  };
}
