/**
 * Meshy-generated model layer (text prompts only; prompts and task ids in assets/ATTRIBUTION.md).
 * Replaces the procedural cottages, trees, traveller, wisp and boat when the matching GLB is present.
 */
import { instances, model, type AuraApp, type scene } from "@aura3d/engine";

type Scene = ReturnType<typeof scene>;
import { MODEL_ASSETS, hasModel } from "./model-assets";
import { CLIP_SECONDS, STRIDE_SPEED, pickGait, type Gait } from "./locomotion";
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
export interface HeroAnimator { update(drive: HeroDrive): Gait; reset(x: number, z: number, time?: number): void; readonly gait: Gait; readonly groundSpeed: number }
/**
 * Drives the traveller's walk, run and idle clips from the distance travelled. The clip phase advances by
 * distance / planted-foot speed, so a foot on the ground moves exactly as fast as the ground whatever the frame rate or
 * how often `update` is called (the stepped QA path calls it twice per sim step). The phase is pinned each frame
 * (`loop: false` plus `captureTime`), and `play` only gets a crossfade on a gait change: re-issuing a fresh crossfade
 * on every frame restarts the blend, and a looped clip with a moving `captureTime` also runs on the engine's own clock.
 */
export function createHeroAnimator(app: AuraApp): HeroAnimator {
  const hero = app.nodes.require("hero");
  let gait: Gait = "Idle", phase = 0, issued: Gait | "" = "", lastX = 0, lastZ = 0, lastTime = 0, groundSpeed = 0, primed = false;
  return {
    get gait() { return gait; },
    get groundSpeed() { return groundSpeed; },
    reset(x, z, time) { gait = "Idle"; phase = 0; issued = ""; lastX = x; lastZ = z; if (time !== undefined) lastTime = time; groundSpeed = 0; primed = true; },
    update({ x, z, airborne, onBoat, time }) {
      if (!primed) { lastX = x; lastZ = z; lastTime = time; primed = true; }
      const dt = time - lastTime;
      const distance = onBoat ? 0 : Math.hypot(x - lastX, z - lastZ);
      if (dt > 0) {
        groundSpeed += (distance / dt - groundSpeed) * (1 - Math.exp(-dt / 0.08));
        lastTime = time;
      }
      lastX = x; lastZ = z;
      const next = onBoat ? "Idle" : pickGait(gait, groundSpeed, airborne);
      if (next !== gait) {
        const walkRun = gait !== "Idle" && next !== "Idle";
        phase = walkRun ? (phase / CLIP_SECONDS[gait]) * CLIP_SECONDS[next] : 0;
        gait = next;
      }
      if (gait === "Idle") phase = time % CLIP_SECONDS.Idle;
      else if (airborne) phase = (phase + Math.max(0, dt)) % CLIP_SECONDS.Run;
      else phase = (phase + distance / STRIDE_SPEED[gait]) % CLIP_SECONDS[gait];
      hero.play(gait, { loop: false, captureTime: phase, crossFade: issued !== gait ? 0.15 : false });
      issued = gait;
      return gait;
    }
  };
}
