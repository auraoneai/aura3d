/**
 * Drift & Deliver port: generated 3D models (Meshy text-to-3D through Kiro Prism, prompts in assets/ATTRIBUTION.md).
 *
 * Each GLB is a single textured primitive whose longest side is 1.9 units. Cars are baked to face +z (the port's forward) with
 * their lowest point at y = 0 (`tools`: gltf-transform vertex bake, see assets/ATTRIBUTION.md); props are centred and stood on
 * the ground by `propTransform`.
 * URLs are same-origin pathnames with a content hash: the production bridge refuses http(s) model URLs.
 */
import { defineModelAssets, instances, model } from "@aura3d/engine";
import type { CarKind } from "./vehicles";

const LICENSE = "Meshy generated asset (AuraOne account plan terms at generation time); original text prompt in assets/ATTRIBUTION.md; 2026-10-23";
const glb = (file: string, sha256: string) => ({ url: new URL(`./assets/models/${file}`, import.meta.url).pathname, sha256 });

export const MODEL_ASSETS = defineModelAssets({
  courier: glb("courier.glb", "5bad4129b1109d866de42b3666bc482073a9a08ed03c7d901f543add48f2cbba"),
  sedan: glb("sedan.glb", "fac209266bd3ed4195b3a809025a773017f64364be1a7641ffa0846945fed39b"),
  hatch: glb("hatch.glb", "4bda108ecb13d9890661e4f9a611904f7c32634d77f4e7baa364bcc880193c98"),
  van: glb("van.glb", "327356a17ddfb9d7c54eb84f8e57a062e451f6228594dad7914f47e80e2978c9"),
  truck: glb("truck.glb", "6e9614ec658b0f96aa909419878231d4a97a15d121e9613caf3937a1164a042e"),
  lamp: glb("lamp.glb", "86fef2d34542dce7a84146acaad458058fafa1d0f4634cfeacbc52ef5917a1c0"),
  signal: glb("signal.glb", "33e96793382ff6e3b8d8c685332a2dfb02ea1b869fc1988514976f53d2eed955"),
  tree: glb("tree.glb", "4d264419765776dffd472d62b7db873f68c172c6ce88c3fda6f4c8442bb6700d"),
  palm: glb("palm.glb", "65b89d01c5aee94540ff04841845ec72cf42cf3c0cf30b6ca97f58ed895e5877"),
  shelter: glb("shelter.glb", "578b76b11ca99660e11c3e4a1edfdef4c062fc9826f1cc24ed3f511f10a787f9"),
  hydrant: glb("hydrant.glb", "1ae03a9d75cd93f9c31a9aa4ed20fa7e3054f8e039ccfe5905a71c307866edf9"),
  clocktower: glb("clocktower.glb", "2a1059d8c13b17209202995da8e9acc028399df7534233b255d2f38c28d37706"),
  lighthouse: glb("lighthouse.glb", "dc0753bfeba905a42422e7748a07bf1e62f1cb026f136e06f85b8828347e1418"),
  watertank: glb("watertank.glb", "f79b0d9bfc54302ac90ae4ea8e085337bd73e3ef8b0364e4b039978dd6483ff4")
}, { license: LICENSE, queryParam: null }).refs;

export type ModelKey = keyof typeof MODEL_ASSETS;
export type PropKey = Exclude<ModelKey, "courier" | "sedan" | "hatch" | "van" | "truck">;

type CarKey = "courier" | "sedan" | "hatch" | "van" | "truck";

const GLB_LENGTH = 1.9;
/** Target length along the car in metres. The car GLBs are baked to face +z with their lowest point at y = 0. */
const CAR_LENGTH: Record<CarKey, number> = { courier: 4.4, sedan: 4.5, hatch: 3.7, van: 4.7, truck: 6.0 };

export const TRAFFIC_MODEL: Record<CarKind, Exclude<CarKey, "courier">> = { sedan: "sedan", hatch: "hatch", van: "van", pickup: "truck" };

/** A runtime-addressable car model: the app moves it with `nodes.require(id).setPosition/setRotation`. */
/**
 * `bodyOrder` (GU47 WP-28 GC-AN1, shift look): "YXZ" applies yaw, then pitch and roll about the car's own axes; the
 * default "ZYX" (the original look) rolls about the world z axis.
 */
export function carModel(id: string, key: CarKey, castShadow: boolean, bodyOrder?: "YXZ") {
  return model(MODEL_ASSETS[key], { name: id, scale: CAR_LENGTH[key] / GLB_LENGTH, castShadow, receiveShadow: false, ...(bodyOrder ? { rotationOrder: bodyOrder } : {}) }).runtime({ id });
}

/** Uniform scale that brings a car GLB to its target length. */
export const carScale = (key: CarKey): number => CAR_LENGTH[key] / GLB_LENGTH;

/**
 * Traffic of one car kind as ONE instanced model (one draw per kind instead of one node per car). The app moves the cars
 * with `nodes.require(id).setInstances(transforms)` every frame; `start` holds the first transforms.
 */
export function trafficInstances(id: string, key: Exclude<CarKey, "courier">, castShadow: boolean, start: readonly { position: [number, number, number]; rotation: [number, number, number] }[]) {
  const scale = carScale(key);
  // GU47 WP-28 GC-L2: traffic casts in the shift look (one instanced shadow draw per kind and cascade)
  return instances.model(MODEL_ASSETS[key], { name: id, transforms: start.map((t) => ({ position: t.position, rotation: t.rotation, scale })), castShadow, receiveShadow: false }).runtime({ id });
}

/** Distance from each prop GLB's origin down to its lowest point (GLB units, longest side 1.9). */
export const PROP_BELOW: Record<PropKey, number> = {
  lamp: 0.95, signal: 0.95, tree: 0.95, palm: 0.95, shelter: 0.56, hydrant: 0.95, clocktower: 0.95, lighthouse: 0.95, watertank: 0.86
};

/** Instance transform that stands a prop on the ground at (x, z) with its longest side scaled to `size` metres. */
export function propTransform(key: PropKey, x: number, z: number, yaw: number, size: number, y = 0): { position: [number, number, number]; rotation: [number, number, number]; scale: number } {
  const s = size / GLB_LENGTH;
  return { position: [x, y + PROP_BELOW[key] * s, z], rotation: [0, yaw, 0], scale: s };
}
