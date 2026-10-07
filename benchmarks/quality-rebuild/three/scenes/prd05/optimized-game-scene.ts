import { prd05SceneSpecs } from "../../../scenes/prd05/index";
import { runPrd05ThreeScene } from "./common";

export default (host: HTMLElement, opts?: { qrFlags?: readonly string[] }) =>
  runPrd05ThreeScene(prd05SceneSpecs["prd05-optimized-game-scene"], host, opts);
