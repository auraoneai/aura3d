// Lane adapter (PRD-06 T0.15): `prd06-skinned-character-posed` through the
// Aura3D public API. The spec's `animation-0` clip token is Aura3D's loader
// naming for an unnamed glTF clip (GLTFLoader.ts `createAnimationClips`).
import { prd06SkinnedCharacterPosed } from "../../../scenes/prd06/skinnedCharacterPosed";
import { runAuraScene } from "../../common";

export default (host: HTMLElement) => runAuraScene(prd06SkinnedCharacterPosed, host);
