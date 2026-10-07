/** Lane prd10 adapter module (aura3d). Runs the `prd10-interior-room` spec through `runAuraScene`. */
import { getPrd10Scene } from "../../../scenes/prd10/index";
import { runAuraScene } from "../../common";

export default (host: HTMLElement) => runAuraScene(getPrd10Scene("prd10-interior-room"), host);
