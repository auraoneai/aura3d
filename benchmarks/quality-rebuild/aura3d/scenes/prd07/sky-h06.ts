// 07 Phase D S4 — prd07-sky-h06 (dayNight sky at hour 6).
import { runPrd07AuraScene, type Prd07RunOptions } from "./common";
import { getPrd07SceneSpec } from "../../../scenes/prd07/specs";

export default (host: HTMLElement, opts?: Prd07RunOptions) => runPrd07AuraScene(getPrd07SceneSpec("prd07-sky-h06"), host, opts);
