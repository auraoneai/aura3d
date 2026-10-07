/** Lane prd03 adapter — prd03-cut-velocity (PRD-03 Phase 4). */
import { runThreeScene } from "../../common";
import { PRD03_SCENE_SPECS } from "../../../scenes/prd03/specs";

export default (host: HTMLElement) => runThreeScene(PRD03_SCENE_SPECS["prd03-cut-velocity"], host);
