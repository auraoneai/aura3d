/**
 * Lane prd06 scene `prd06-skinned-character-posed` (PRD-06 T0.15, ex-`08b`).
 * CesiumMan posed at clip index 0, t = 0.75 s — the animated-pose variant of
 * `08-skinned-character` (shared/scenes.ts:174): same camera, same lights,
 * same ground. The frozen mid-clip pose makes the deformed-pose silhouette
 * and skinned-shadow bugs visible where the bind pose hides them.
 *
 * `animation.clip` uses Aura3D's loader naming for an unnamed glTF clip
 * (`animation-<index>`); the three.js adapter remaps it to three's
 * `animation_<index>` convention. Adapters live in
 * `aura3d/scenes/prd06/` and `three/scenes/prd06/`.
 */
import type { SceneSpec } from "../../shared/types";
import { RESOLUTION } from "../../shared/types";

export const prd06SkinnedCharacterPosed: SceneSpec = {
  id: "prd06-skinned-character-posed",
  index: 106,
  title: "Skin / character posed",
  purpose:
    "CesiumMan posed at clip 0, t=0.75s — deformed-pose silhouette and " +
    "skinned-shadow parity where 08's bind pose hides them",
  resolution: RESOLUTION,
  camera: { position: [0.6, 1.0, 2.6], target: [0, 0.8, 0], fov: 40, near: 0.05, far: 50 },
  background: { kind: "color", color: "#202329" },
  environment: { hdri: "studioSmall08", intensity: 0.6, rotation: 0 },
  toneMapping: "aces-filmic",
  exposure: 1,
  lights: [{ kind: "directional", name: "sun", color: "#fff2e0", intensity: 2.5, position: [2, 4, 3], target: [0, 0, 0], castShadow: true }],
  objects: [
    {
      kind: "primitive",
      name: "ground plane",
      shape: "plane",
      size: [6, 1, 6],
      position: [0, 0, 0],
      material: { color: "#6d7076", roughness: 0.9, metalness: 0 },
      castShadow: false,
      receiveShadow: true
    },
    {
      kind: "model",
      name: "cesium man posed",
      asset: "cesiumMan",
      position: [0, 0, 0],
      castShadow: true,
      receiveShadow: true,
      animation: { clip: "animation-0", time: 0.75 }
    }
  ],
  shadows: { mapSize: 2048, type: "pcf-soft", directionalExtent: 2.5, bias: -0.0005, normalBias: 0.02 },
  time: 0.75,
  settleFrames: 4,
  owner: "prd06",
  qrFlags: ["animation"],
  masks: ["shadow-receiver", "silhouette-edge"],
  primaryRegion: "shadow-receiver"
};
