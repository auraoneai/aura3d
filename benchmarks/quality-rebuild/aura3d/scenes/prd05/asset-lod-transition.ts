import { prd05SceneSpecs } from "../../../scenes/prd05/index";
import { runPrd05AuraScene } from "./common";

export default (host: HTMLElement, opts?: { qrFlags?: readonly string[] }) =>
  runPrd05AuraScene(prd05SceneSpecs["prd05-asset-lod-transition"], host, opts);
