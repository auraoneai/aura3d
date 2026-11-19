/**
 * Cumulus Dash Idol pass (2026-11): image-to-3D GLBs (speridlabs/idol/max, spec tools/idol/specs/cumulus-dash.json,
 * admitted through tools/idol/admit.sh) that replace the procedural sky-kid hero, the golden cloud steed, the sky
 * pterosaurs, the storm tyrant, the hermit cottage, the shrine gate pillars, the rolling boulders and the roast pickups.
 * Render layer only: each model is generated at the procedural model's size (grounded at y = 0, +Z forward) and mounted
 * under the procedural node's runtime id, origin and Euler order, so world.ts drives it unchanged and the simulation,
 * replays and camera never see a difference. `?idol=0` restores the procedural art for A/B frames.
 */
import { group, instances, model, type AuraInstanceWindOption, type AuraTransformSpec } from "@aura3d/engine";
import { CUMULUS_IDOL_ASSETS as assets } from "../../apps/showcase-cloud-runner-port/src/idol-assets";
import { idolHeroPose, type IdolRig } from "./art/idolHero";
import { IDOL_HERO_RIG } from "./art/idolHeroRig";
import type { SkyKidHeroPose } from "./art/proceduralModels";

type V3 = readonly [number, number, number];

/** Idol art is on unless the URL says `idol=0`. */
export function idolEnabled(): boolean {
  const search = typeof location !== "undefined" ? location.search : "";
  return new URLSearchParams(search).get("idol") !== "0";
}

type HeroRim = { readonly color: string; readonly power: number; readonly intensity: number } | null | undefined;

/** The rigged hero; world.ts sets its root transform (ZYX, like the procedural group) and `idolHeroFrame` poses it. */
export function idolHeroNode(heroRim: HeroRim) {
  return model(assets.cdSkyKidHero, {
    name: "hero",
    scaleMode: "world",
    rotationOrder: "ZYX",
    castShadow: true,
    receiveShadow: false,
    ...(heroRim ? { materialOverrides: [{ rim: { color: heroRim.color, power: heroRim.power, intensity: heroRim.intensity } }] } : {})
  }).runtime({ id: "hero" });
}

export interface PoseTarget { setAnimationPose(pose: never): unknown }

/** Writes one frame of the procedural articulation onto the Idol skeleton (replace pose: the rig is fully code-driven). */
export function idolHeroFrame(hero: PoseTarget, pose: SkyKidHeroPose, rig: IdolRig = IDOL_HERO_RIG): void {
  hero.setAnimationPose(idolHeroPose(rig, pose) as never);
}

/**
 * The golden cloud steed: its saddle mass sits behind the node origin like the procedural cloud (world.ts seats the rider
 * there), and it is flattened to the procedural cloud's 0.72 m crown so the rider's surf crouch sits on top, not inside it.
 */
export function idolCloudNode() {
  return group("sky-cloud", [
    model(assets.cdCloudSteed, { name: "sky-cloud-model", scaleMode: "world", position: [0, 0, -0.78], scale: [1.1, 0.62, 1], castShadow: false, receiveShadow: false }).runtime({ id: "sky-cloud-model" })
  ], { rotationOrder: "ZYX" }).runtime({ id: "sky-cloud" }); // world.ts sets its visibility every frame
}

/**
 * The wyvern flaps: the Idol wyvern was split (no new generation) into body and two wing GLBs along its wing-span axis
 * (measured on the normalised model: head toward (-0.613, 0, 0.79), span (0.79, 0, 0.613) through the torso at
 * (-0.282, *, -0.119)). An inner frame turns the head onto +Z (the procedural wyvern's facing); each wing hangs from its
 * shoulder pivot and `idolPterosaurFlap` rotates it about the body's head-tail axis every frame.
 */
const WYVERN = {
  head: [-0.613, 0, 0.79] as V3,
  shoulderL: [-0.045, 1.2, 0.065] as V3,
  shoulderR: [-0.519, 1.2, -0.303] as V3,
  frameYaw: Math.atan2(0.613, 0.79)
};
export function idolPterosaurNode(index: number) {
  const s = (id: string) => ({ name: id, scaleMode: "world" as const, castShadow: true, receiveShadow: false });
  const wing = (side: "L" | "R") => {
    const at = side === "L" ? WYVERN.shoulderL : WYVERN.shoulderR;
    return group(`ptera-wing${side}-${index}`, [
      model(side === "L" ? assets.cdSkyWyvernWingL : assets.cdSkyWyvernWingR, { ...s(`ptera-wing${side}-${index}-model`), position: [-at[0], -at[1], -at[2]] })
    ], { position: [at[0], at[1], at[2]], rotationOrder: "ZYX" }).runtime({ id: `ptera-wing${side}-${index}` });
  };
  return group(`ptera-body-${index}`, [
    group(`ptera-frame-${index}`, [model(assets.cdSkyWyvernBody, s(`ptera-torso-${index}`)), wing("L"), wing("R")], { rotation: [0, WYVERN.frameYaw, 0] })
  ], { position: [0, -500, 0] }).runtime({ id: `ptera-body-${index}` });
}

/** Wing angle (radians, + raises both wings) about the head-tail axis as Euler angles for the ZYX node order (R = Rz Ry Rx). */
export function wyvernWingEuler(angle: number, side: "L" | "R"): [number, number, number] {
  const a = side === "L" ? angle : -angle;
  const [hx, hy, hz] = WYVERN.head, l = Math.hypot(hx, hy, hz), sn = Math.sin(a / 2);
  const x = (hx / l) * sn, y = (hy / l) * sn, z = (hz / l) * sn, w = Math.cos(a / 2);
  const r00 = 1 - 2 * (y * y + z * z), r10 = 2 * (x * y + z * w), r20 = 2 * (x * z - y * w), r21 = 2 * (y * z + x * w), r22 = 1 - 2 * (x * x + y * y);
  return [Math.atan2(r21, r22), Math.asin(Math.max(-1, Math.min(1, -r20))), Math.atan2(r10, r00)];
}

export interface WingHandle { setRotation(x: number, y: number, z: number): unknown }
/** Flaps the wyvern's wings with the world's flap phase (`flap` in -0.55..0.9 from world.ts). */
export function idolPterosaurFlap(node: (id: string) => WingHandle, index: number, flap: number): void {
  const angle = flap * 1.15;
  const l = wyvernWingEuler(angle, "L"), r = wyvernWingEuler(angle, "R");
  node(`ptera-wingL-${index}`).setRotation(l[0], l[1], l[2]);
  node(`ptera-wingR-${index}`).setRotation(r[0], r[1], r[2]);
}

/**
 * Cloud steed billow (the procedural cloud never moved inside; the Idol cloud breathes while it carries the rider).
 * `parentScale` is the uniform scale world.ts gives the "sky-cloud" group this frame. Since Aura3D 5.7.0 the nested
 * model's `setScale` is parent-local; dividing by the group scale keeps the drawn size the steed was tuned at (before
 * 5.7.0 the same call set its world scale, so the group's 0.6-1.7 scale never reached the model's size).
 */
export function idolCloudBillow(node: (id: string) => { setScale(s: [number, number, number]): unknown }, clock: number, parentScale = 1): void {
  const s = 1 / parentScale;
  node("sky-cloud-model").setScale([1.1 * (1 + 0.035 * Math.sin(clock * 3.1)) * s, 0.62 * (1 + 0.06 * Math.sin(clock * 2.3 + 1)) * s, (1 + 0.035 * Math.sin(clock * 2.7 + 2)) * s]);
}

/**
 * The storm tyrant is the rigged Idol tyrant (cdStormTyrantRig, 70 bones; same mesh and +Z facing as the rigid
 * cdStormTyrant it replaces). The GLB is normalised to 1 m and carries no node scale, so the model is mounted at the
 * generator's recorded sceneScale (8.439, the rigid model's 8.42 m) inside the "rex-body" group that world.ts places;
 * world.ts poses "rex-model" every frame from art/rexAnimation.ts (distance-driven walk with planted feet, roar, hurt).
 */
export const REX_MODEL_SCALE = 8.439;

/**
 * The ride log (F3 GPU QA: the vertex-coloured procedural trunk read as blurry stretched bark): the Idol cedar log,
 * its axis baked onto +X (8.20 m long, 1.30 m radius, axis at y 1.299), scaled to the procedural 6.44 m log and centred
 * on its axis inside the "ride-log" node world.ts rolls about X.
 */
export const RIDE_LOG = { length: 8.204, axisY: 1.299, centreX: 0.047, centreZ: 0.042, targetLength: 6.44 } as const;
/** Top of the Idol ride log's bark above the ground: the node carries its axis 1.0 m up (world.ts), plus its scaled radius. */
export const RIDE_LOG_TOP = 1.0 + RIDE_LOG.axisY * (RIDE_LOG.targetLength / RIDE_LOG.length);
export function idolRideLogNode() {
  const k = RIDE_LOG.targetLength / RIDE_LOG.length;
  return group("ride-log", [
    model(assets.cdRideLog, { name: "ride-log-model", scaleMode: "world", scale: k, position: [-RIDE_LOG.centreX * k, -RIDE_LOG.axisY * k, -RIDE_LOG.centreZ * k], castShadow: true, receiveShadow: true })
  ], { position: [0, -500, 0] }).runtime({ id: "ride-log" });
}
export function idolTyrantNode() {
  return group("rex-body", [
    model(assets.cdStormTyrantRig, { name: "rex-model", scaleMode: "world", scale: REX_MODEL_SCALE, castShadow: true, receiveShadow: false }).runtime({ id: "rex-model" })
  ], { position: [0, -500, 0] }).runtime({ id: "rex-body" }); // world.ts sets its visibility and transform every frame
}

/** Boulder: the procedural stone is a 1 m radius ball resting on its origin (centre at y = 1); world.ts scales it by 1.9. */
export function idolBoulderNode(index: number) {
  return group(`boulder-${index}`, [
    model(assets.cdBoulder, { name: `boulder-${index}-model`, scaleMode: "world", rotation: [0, index * 2.1, 0], castShadow: true, receiveShadow: false })
  ]).runtime({ id: `boulder-${index}` }); // world.ts sets its visibility every frame
}

/** Roast pickup: the procedural haunch is centred on its origin, the Idol one grounded, so it drops by half its height. */
export function idolRoastNode(index: number, height: number) {
  return group(`meat-${index}`, [
    model(assets.cdHoneyRoast, { name: `meat-${index}-model`, scaleMode: "world", position: [0, -height / 2, 0], castShadow: false, receiveShadow: false })
  ]).runtime({ id: `meat-${index}` });
}

export function idolCottageNode(position: V3, yaw: number) {
  return model(assets.cdHermitCottage, { name: "home-hut", scaleMode: "world", position: [position[0], position[1], position[2]], rotation: [0, yaw, 0], castShadow: false, receiveShadow: true }).runtime({ id: "home-hut" });
}

/** Gate pillars stand at x = +/-7.7 m (no crossbar over the road; their 2.2 m roof caps and bell brackets clear the runner corridor, terrain.ts CORRIDOR_HALF); each bell bracket (+X on the model) turns toward the road. */
export const SHRINE_PILLAR_X = 7.7;
/** `pillarY`: optional world base Y of each pillar (index 0 = local -X = the road's +lateral side), from art/idolGrounding.ts. */
export function idolShrineGateNode(name: string, position: V3, yaw: number, pillarY?: readonly [number, number]) {
  return group(name, [-SHRINE_PILLAR_X, SHRINE_PILLAR_X].map((x, i) =>
    model(assets.cdShrinePillar, { name: `${name}-pillar-${i}`, scaleMode: "world", position: [x, pillarY ? pillarY[i]! - position[1] : 0, 0], rotation: [0, x < 0 ? 0 : Math.PI, 0], castShadow: false, receiveShadow: true })
  ), { position: [position[0], position[1], position[2]], rotation: [0, yaw, 0] }).runtime({ id: name });
}

/* ------------------------------------------------------------------ roadside set pieces (instanced, one draw each) */

/** Unit-height (1 m) Idol tree and outcrop models placed with the procedural scatter transforms (scale = height in metres). */
export function idolRoadsideNodes(kind: "round" | "pine" | "rock", transforms: readonly AuraTransformSpec[], wind?: AuraInstanceWindOption) {
  const asset = kind === "round" ? assets.cdCanopyTree : kind === "pine" ? assets.cdBonsaiPine : assets.cdShoulderRock;
  const name = kind === "round" ? "hero-trees-round" : kind === "pine" ? "hero-trees-pine" : "hero-rocks";
  return [instances.model(asset, {
    name, scaleMode: "world", instancingAware: true, castShadow: false, receiveShadow: false, transforms,
    ...(wind && kind !== "rock" ? { wind } : {})
  })];
}
