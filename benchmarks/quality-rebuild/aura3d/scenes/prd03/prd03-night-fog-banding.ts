/** Lane prd03 adapter — prd03-night-fog-banding (PRD-03 §16.1). */
import { runAuraScene } from "../../common";
import { PRD03_SCENE_SPECS } from "../../../scenes/prd03/specs";

export default (host: HTMLElement) => runAuraScene(PRD03_SCENE_SPECS["prd03-night-fog-banding"], host);
