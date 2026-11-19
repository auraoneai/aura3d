/**
 * Serpentine Sky Run Idol pass: image-to-3D GLBs (speridlabs/idol/max, admitted through tools/idol/admit.sh, spec in
 * tools/idol/specs/serpentine-sky-run.json) that replace the procedural runner, the pooled road entities (oni, spirit
 * chariot, barrier, slide arch, feast table) and the landmarks (serpent head, gatehouse, tail monument, sky islands, roadside
 * lanterns, torii, sanctuary planetlet). Render layer only: each model is generated at the procedural model's measured size,
 * grounded at y = 0 and facing +Z (towards the oncoming runner, like the procedural builders), so placement code, pools,
 * collision and replays are untouched. Pivots that are not at the base (sky islands, serpent head) are restored by a
 * child offset inside the runtime group. `?idol=0` restores the procedural art for A/B.
 */
import { group, model, type AuraModelOptions } from "@aura3d/engine";
import { SERPENTINE_IDOL_ASSETS, type SerpentineIdolKey } from "../../../apps/showcase-serpentine-sky-run-port/src/idol-assets";
import type { PooledEntityModelType, SkyIslandVariantKey } from "./proceduralModels";

/** Idol art is on unless the URL says `idol=0`. */
export function idolEnabled(search: string | undefined = typeof location !== "undefined" ? location.search : undefined): boolean {
  return new URLSearchParams(search ?? "").get("idol") !== "0";
}

export type IdolKey = SerpentineIdolKey;
type ModelRef = typeof SERPENTINE_IDOL_ASSETS.ssrOni;

/** The typed model ref of an Idol key (route-scoped catalogue). */
export const idolAsset = (key: IdolKey): ModelRef => SERPENTINE_IDOL_ASSETS[key] as ModelRef;
const ref = idolAsset;

/** Pooled road entities (ENTITY_MODELS keys) -> Idol asset. */
export const IDOL_ENTITY_ASSETS: Readonly<Partial<Record<PooledEntityModelType, IdolKey>>> = {
  arch: "ssrArch",
  barrier: "ssrBarrier",
  oni: "ssrOni",
  sweeper: "ssrSweeperBody",
  feast: "ssrFeast"
};

/** Sky island variants -> Idol asset (the original look's plain island uses the shrine island). */
export const IDOL_ISLAND_ASSETS: Readonly<Record<SkyIslandVariantKey, IdolKey>> = {
  spireC: "ssrIslandPagoda",
  spireB: "ssrIslandLantern",
  spireA: "ssrIslandShrine",
  island: "ssrIslandShrine"
};

/**
 * Where the procedural model's origin sits above its lowest point (m): the islands hang their rock 7.6 m below the turf
 * crown at targetHeight 15 (scaled with the procedural `s`), the serpent head's neck reaches 42.6 m below its origin.
 */
export const IDOL_PIVOT_DROP = { island: 7.6, serpentHead: 42.59, planetlet: 15.56 } as const;

function idolNode(id: string, key: IdolKey, options: { castShadow?: boolean; receiveShadow?: boolean; drop?: number; scale?: number | readonly [number, number, number] } = {}) {
  const opts: AuraModelOptions = {
    name: `${id}-idol`,
    scaleMode: "world",
    castShadow: options.castShadow ?? false,
    receiveShadow: options.receiveShadow ?? true,
    ...(options.drop ? { position: [0, -options.drop, 0] as [number, number, number] } : {}),
    ...(Array.isArray(options.scale) ? { scale: [...options.scale] as [number, number, number] } : options.scale && options.scale !== 1 ? { scale: options.scale as number } : {})
  };
  return group(id, [model(ref(key), opts)], { position: [0, -500, 0] }).runtime({ id });
}

/**
 * The spirit chariot rolls: a wheel-less Idol body (ssrSweeperBody, generated front-on-+X, turned to face +Z like the
 * other entities) on four separate Idol wheels (ssrCartWheel, 1 m across, disc facing +Z, turned onto the X axle). Each
 * wheel hangs from its own pivot group `${id}-wheel-<k>` at the body's measured axle stubs (hub height 0.25 m, so the body
 * rides up by WHEEL_RADIUS - 0.25); world.ts turns every pivot about X by `chariotWheelAngle(distance)` each frame.
 */
export const CHARIOT_WHEEL_RADIUS = 0.55;
const CHARIOT_HUB_Y = 0.25;
/** Axle stub centres in the turned body frame (x = side, z = fore/aft), measured on ssrSweeperBody. */
export const CHARIOT_WHEELS: readonly (readonly [number, number])[] = [[-1.24, 0.43], [1.24, 0.43], [-1.24, -1.06], [1.24, -1.06]];
/** Wheel spin for a distance rolled along the road (the chariot travels towards -Z): angle = -distance / radius. */
export const chariotWheelAngle = (distance: number): number => -distance / CHARIOT_WHEEL_RADIUS;

function buildIdolChariotNode(id: string) {
  const lift = CHARIOT_WHEEL_RADIUS - CHARIOT_HUB_Y;
  const wheelScale = CHARIOT_WHEEL_RADIUS / 0.5;
  return group(id, [
    model(ref("ssrSweeperBody"), { name: `${id}-idol`, scaleMode: "world", castShadow: false, receiveShadow: true, position: [0, lift, 0], rotation: [0, -Math.PI / 2, 0] }),
    ...CHARIOT_WHEELS.map(([x, z], k) => group(`${id}-wheel-${k}`, [
      model(ref("ssrCartWheel"), { name: `${id}-wheel-${k}-idol`, scaleMode: "world", castShadow: false, receiveShadow: true, position: [0, -CHARIOT_WHEEL_RADIUS, 0], rotation: [0, Math.PI / 2, 0], scale: wheelScale })
    ], { position: [x, CHARIOT_WHEEL_RADIUS, z] }).runtime({ id: `${id}-wheel-${k}` }))
  ], { position: [0, -500, 0] }).runtime({ id });
}

/** The Idol node for a pooled entity, or null when that entity keeps its sculpted procedural model. */
export function buildIdolEntityNode(type: PooledEntityModelType, id: string) {
  if (type === "sweeper") return buildIdolChariotNode(id);
  const key = IDOL_ENTITY_ASSETS[type];
  return key ? idolNode(id, key) : null;
}

/** Sky island at the procedural `targetHeight` (the Idol islands are 16.8 m wide like the targetHeight-15 crag). */
export function buildIdolIslandNode(variant: SkyIslandVariantKey, targetHeight: number, id: string, castShadow = false) {
  const s = targetHeight / (variant === "spireC" ? 22 : variant === "spireB" ? 15 : variant === "spireA" ? 14 : 15);
  return idolNode(id, IDOL_ISLAND_ASSETS[variant], { castShadow, receiveShadow: castShadow, drop: IDOL_PIVOT_DROP.island * s, scale: s });
}

export const buildIdolSerpentHeadNode = (id = "serpent-head") => idolNode(id, "ssrSerpentHead", { receiveShadow: false, drop: IDOL_PIVOT_DROP.serpentHead });
/**
 * Gatehouse: the Idol gateway grew taller (35.8 m vs the procedural 29.4 m) and its inner column pair stands close to the
 * road, so at the chase camera the columns filled a quarter of the frame (owner GPU review). It is widened 18% (inner
 * columns pushed out from about +-9.6 m to +-11.3 m) and brought down to the procedural height and depth.
 */
export const GATEHOUSE_SCALE = [1.18, 0.82, 0.82] as const;
export const buildIdolGatehouseNode = (id = "serpent-gatehouse") => idolNode(id, "ssrGatehouse", { receiveShadow: true, scale: GATEHOUSE_SCALE });
export const buildIdolTailMonumentNode = (id = "serpent-tail-monument") => idolNode(id, "ssrTailMonument", { receiveShadow: false });
export const buildIdolPlanetletNode = (id = "sanctuary-planetlet") => idolNode(id, "ssrPlanetlet", { receiveShadow: false, drop: IDOL_PIVOT_DROP.planetlet });
export const buildIdolLanternNode = (id: string, castShadow = false) => idolNode(id, "ssrLantern", { castShadow, receiveShadow: castShadow });
/** The Idol torii stands its posts at +-6.7 m; 1.1x puts them at +-GATE_HALF_SPAN (7.4 m), outside the 7.2 m road top. */
export const IDOL_TORII_SCALE = 1.1;
export const buildIdolToriiNode = (id: string) => idolNode(id, "ssrTorii", { receiveShadow: true, scale: IDOL_TORII_SCALE });
