import { runAuraScene } from "../../common";
import { instancingSizeSpec } from "../../../scenes/prd15/instancing-size";

export default (host: HTMLElement) => runAuraScene(instancingSizeSpec, host);
