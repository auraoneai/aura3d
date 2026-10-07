import { getPrd04SceneSpec } from "../../../scenes/prd04/index";
import { runPrd04AuraScene } from "./common";

export default (host: HTMLElement) => runPrd04AuraScene(getPrd04SceneSpec("prd04-alpha-mask"), host);
