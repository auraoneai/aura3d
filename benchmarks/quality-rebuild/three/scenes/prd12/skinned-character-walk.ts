// Lane scene prd12-skinned-character-walk rendered with three@0.185.1.
// The scene content lives in scenes/prd12/index.ts; three/common.ts is the translator.
import { getActiveSceneSpec } from "../../../shared/registry";
import { runThreeScene, type RunOptions } from "../../common";

export default (host: HTMLElement, opts?: RunOptions) => {
  const spec = getActiveSceneSpec("prd12-skinned-character-walk");
  if (!spec) throw new Error("prd12-skinned-character-walk is not active in the registry");
  return runThreeScene(spec, host, opts);
};
