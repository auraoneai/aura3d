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

export interface ModelSet { letter: boolean; bell: boolean; bellModel?: boolean; cottage: boolean; trees: boolean; hero: boolean; wisp: boolean; boat: boolean; stones: boolean; shrubs: boolean }

/**
 * The bell is split out of belltower.glb (assets/models/belltower-bell.glb, see model-assets.ts) so it can swing. Both
 * files share the Meshy file's units: the tower is placed with `targetHeight` (normalised: bottom-centre of its bounds at
 * the node position), and the bell file is re-centred on its yoke, so the bell node goes where the yoke sits in the
 * placed tower and a z rotation swings it from there.
 */
export const BELLTOWER_FILE_BOUNDS = { min: [-0.576689, -0.951994, -0.531289], max: [0.575231, 0.950971, 0.52925] } as const;
export const BELL_PIVOT_IN_FILE = [0.002974, 0.621514, 0.190564] as const;
export const BELLTOWER_HEIGHT = 4.6;
export function bellModelPose(tower: { x: number; y: number; z: number; h?: number }): { position: [number, number, number]; scale: number } {
  const b = BELLTOWER_FILE_BOUNDS;
  const scale = (tower.h ?? BELLTOWER_HEIGHT) / (b.max[1] - b.min[1]);
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  return {
    position: [tower.x + scale * (BELL_PIVOT_IN_FILE[0] - cx), tower.y + scale * (BELL_PIVOT_IN_FILE[1] - b.min[1]), tower.z + scale * (BELL_PIVOT_IN_FILE[2] - cz)],
    scale
  };
}

export function availableModels(): ModelSet {
  return {
    letter: hasModel("letter"),
    bell: hasModel("belltower"),
    bellModel: hasModel("belltower") && hasModel("bell"),
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

/**
 * Static dressing: cottages, the bell frame (and its swinging bell), trees, shrubs, stones. The animated pieces (hero,
 * wisp, boat) are added by `addAnimatedModels`. Nothing casts or receives engine shadows: the scene authors no lights
 * (the painted shaders carry their own key light and the GLBs take the engine's implicit fill), so there is no shadow
 * light, and the traveller's contact shadow is the scene's own blob.
 */
export function addStaticModels(builder: Scene, sc: Scenery, set: ModelSet): void {
  if (set.cottage) {
    sc.placements.cottages.forEach((p, i) => builder.add(model(MODEL_ASSETS.cottage, { name: `cottage-${i}`, targetHeight: p.h ?? 8, position: [p.x, p.y, p.z], rotation: [0, p.yaw, 0], castShadow: false, receiveShadow: false, collider: false })));
  }
  if (set.bell) sc.placements.bell.forEach((p) => builder.add(model(MODEL_ASSETS.belltower, { name: "belltower", targetHeight: p.h ?? BELLTOWER_HEIGHT, position: [p.x, p.y, p.z], rotation: [0, 0, 0], castShadow: false, receiveShadow: false, collider: false })));
  if (set.bellModel) sc.placements.bell.slice(0, 1).forEach((p) => {
    const pose = bellModelPose(p);
    builder.add(model(MODEL_ASSETS.bell, { name: "belltower-bell", scaleMode: "world", scale: [pose.scale, pose.scale, pose.scale], position: pose.position, castShadow: false, receiveShadow: false, collider: false }).runtime({ id: "bell-model" }));
  });
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
