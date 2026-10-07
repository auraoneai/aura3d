// Lane scene prd12-skinned-character-walk rendered through the Aura3D public API.
// The scene content lives in scenes/prd12/index.ts; aura3d/common.ts is the translator.
import { getActiveSceneSpec } from "../../../shared/registry";
import { runAuraScene, type RunOptions } from "../../common";

export default (host: HTMLElement, opts?: RunOptions) => {
  const spec = getActiveSceneSpec("prd12-skinned-character-walk");
  if (!spec) throw new Error("prd12-skinned-character-walk is not active in the registry");
  return runAuraScene(spec, host, opts);
};
