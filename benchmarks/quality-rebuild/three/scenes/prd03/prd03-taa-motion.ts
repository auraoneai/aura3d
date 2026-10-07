/** Lane prd03 adapter — prd03-taa-motion (PRD-03 §16.1). */
import { runThreeScene } from "../../common";
import { PRD03_SCENE_SPECS } from "../../../scenes/prd03/specs";

export default (host: HTMLElement) => runThreeScene(PRD03_SCENE_SPECS["prd03-taa-motion"], host);
