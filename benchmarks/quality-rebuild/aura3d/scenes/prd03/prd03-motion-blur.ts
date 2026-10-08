/** Lane prd03 adapter — prd03-motion-blur (PRD-03 Phase 4). */
import { runAuraScene } from "../../common";
import { PRD03_SCENE_SPECS } from "../../../scenes/prd03/specs";

export default (host: HTMLElement) => runAuraScene(PRD03_SCENE_SPECS["prd03-motion-blur"], host);
