/** Lane prd13 adapter module (three r185). Runs the `prd13-neon-arcade` spec through `runThreeScene`. */
import { getPrd13Scene } from "../../../scenes/prd13/index";
import { runThreeScene } from "../../common";

export default (host: HTMLElement) => runThreeScene(getPrd13Scene("prd13-neon-arcade"), host);
