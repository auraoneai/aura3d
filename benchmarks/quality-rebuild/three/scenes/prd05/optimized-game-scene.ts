import { prd05SceneSpecs } from "../../../scenes/prd05/index";
import { runPrd05ThreeScene, type Prd05ThreeSceneOptions } from "./common";

export default (host: HTMLElement, opts?: Prd05ThreeSceneOptions) =>
  runPrd05ThreeScene(prd05SceneSpecs["prd05-optimized-game-scene"], host, opts);
