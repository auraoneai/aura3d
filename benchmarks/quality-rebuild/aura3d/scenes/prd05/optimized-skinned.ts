import { prd05SceneSpecs } from "../../../scenes/prd05/index";
import { runPrd05AuraScene, type Prd05AuraSceneOptions } from "./common";

export default (host: HTMLElement, opts?: Prd05AuraSceneOptions) =>
  runPrd05AuraScene(prd05SceneSpecs["prd05-optimized-skinned"], host, opts);
