import { getPrd04SceneSpec } from "../../../scenes/prd04/index";
import { runPrd04ThreeScene } from "./common";

export default (host: HTMLElement) => runPrd04ThreeScene(getPrd04SceneSpec("prd04-anisotropy"), host);
