/** Lane prd03 adapter — prd03-scene18-bloom (PRD-03 §16.1). */
import { runAuraScene } from "../../common";
import { PRD03_SCENE_SPECS } from "../../../scenes/prd03/specs";
import { mapThreeUnrealBloom } from "./bloomMapping";

const spec = PRD03_SCENE_SPECS["prd03-scene18-bloom"];
// Frozen three UnrealBloom → Aura V2 mapping (bloomMapping.ts): the shared
// harness translates `spec.bloom` strength/radius/threshold into
// effects.bloom() intensity/radius/threshold, so the spec encodes the mapped
// authored values — radius already carries the mapped scatter (the §7.1
// radius→scatter alias), knee/clampLuminance ride the §6.6 defaults (Q-12-2).
const bloom = mapThreeUnrealBloom(spec.bloom!.strength, spec.bloom!.radius, spec.bloom!.threshold);
const mapped = { ...spec, bloom: { strength: bloom.intensity, radius: bloom.scatter, threshold: bloom.threshold } };

export default (host: HTMLElement) => runAuraScene(mapped, host);
