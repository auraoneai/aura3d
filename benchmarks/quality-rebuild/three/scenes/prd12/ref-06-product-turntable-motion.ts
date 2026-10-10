// §9.3 showcase reference prd12-ref-06-product-turntable — rendered through the showcase
// pipeline (three/lib/showcase.ts) per §9.1.
import { getActiveSceneSpec } from "../../../shared/registry";
import { runThreeShowcase } from "../../lib/showcase";
import type { RunOptions } from "../../common";

export default (host: HTMLElement, opts?: RunOptions) => {
  const spec = getActiveSceneSpec("prd12-ref-06-product-turntable-motion");
  if (!spec) throw new Error("prd12-ref-06-product-turntable-motion is not active in the registry");
  return runThreeShowcase(spec, host, opts);
};
