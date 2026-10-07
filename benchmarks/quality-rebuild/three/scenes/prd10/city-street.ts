/** Lane prd10 adapter module (three r185). Runs the `prd10-city-street` spec through `runThreeScene`. */
import { getPrd10Scene } from "../../../scenes/prd10/index";
import { runThreeScene } from "../../common";

export default (host: HTMLElement) => runThreeScene(getPrd10Scene("prd10-city-street"), host);
