import { getPrd04SceneSpec } from "../../../scenes/prd04/index";
import { runPrd04AuraScene, type Prd04PageOptions } from "./common";

export default (host: HTMLElement, opts?: Prd04PageOptions) => runPrd04AuraScene(getPrd04SceneSpec("prd04-damaged-helmet"), host, opts?.qrFlags ?? []);
