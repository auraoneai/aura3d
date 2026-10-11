/**
 * Lane prd10 adapter module (aura3d). Runs `prd10-terrain-layers` through `runAuraScene`.
 * With `world` on, the primitive stand-ins are replaced by real `world.*`
 * nodes (see ./world.ts); with `world` off the spec renders unchanged.
 */
import { getPrd10Scene } from "../../../scenes/prd10/index";
import { runAuraScene, type RunOptions } from "../../common";
import { prd10SpecFor, prd10WorldNodes, worldOn } from "./world";

const ID = "prd10-terrain-layers";

export default (host: HTMLElement, opts: RunOptions = {}) => {
  const on = worldOn(opts.qrFlags);
  return runAuraScene(prd10SpecFor(getPrd10Scene(ID), on), host, { ...opts, extraNodes: () => prd10WorldNodes(ID, on) });
};
