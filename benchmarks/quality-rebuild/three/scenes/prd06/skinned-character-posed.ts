// Lane adapter (PRD-06 T0.15): `prd06-skinned-character-posed` through three.js.
// CesiumMan's clip is unnamed in the glTF JSON; three's GLTFLoader names it
// `animation_0` (GLTFLoader.js: `animationDef.name || 'animation_' + index`),
// so the adapter remaps Aura3D's `animation-0` convention.
import { prd06SkinnedCharacterPosed } from "../../../scenes/prd06/skinned-character-posed";
import { runThreeScene } from "../../common";

const spec = {
  ...prd06SkinnedCharacterPosed,
  objects: prd06SkinnedCharacterPosed.objects.map((object) =>
    object.animation?.clip === "animation-0"
      ? { ...object, animation: { ...object.animation, clip: "animation_0" } }
      : object)
};

export default (host: HTMLElement) => runThreeScene(spec, host);
