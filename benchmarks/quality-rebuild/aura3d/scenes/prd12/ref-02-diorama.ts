// §9.3 showcase reference prd12-ref-02-diorama — Aura side uses engine defaults plus
// the scene's high-level intent only (§8.4): no hand-tuned overrides.
import { getActiveSceneSpec } from "../../../shared/registry";
import { runAuraScene, type RunOptions } from "../../common";

export default (host: HTMLElement, opts?: RunOptions) => {
  const spec = getActiveSceneSpec("prd12-ref-02-diorama");
  if (!spec) throw new Error("prd12-ref-02-diorama is not active in the registry");
  return runAuraScene(spec, host, opts);
};
