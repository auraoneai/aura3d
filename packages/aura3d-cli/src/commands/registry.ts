/**
 * Lane command registry barrel (C-39). Importing this module registers every
 * lane's commands; each prdNN/index.ts is empty until its lane lands.
 */

import "./prd01/index.js";
import "./prd02/index.js";
import "./prd03/index.js";
import "./prd04/index.js";
import "./prd05/index.js";
import "./prd06/index.js";
import "./prd08/index.js";
import "./prd09/index.js";
import "./prd10/index.js";
import "./prd11/index.js";
import "./prd13/index.js";
import "./prd14/index.js";
import "./prd15/index.js";
import "./assets/index.js";
import "./evidence/index.js";
import "./verify/index.js";
import "./agent-tools/index.js";
import "./import-three/index.js";
import { registerPrd07Cli } from "./prd07/index.js";
import "./animation-io/index.js";
import "./generate/index.js";
import "./asset-post/index.js";
import "./convert/index.js";

// prd07 registers through a function (its tests call it too; duplicates are tolerated):
// `vfx validate-atlas` and the `vfx-pools-to-effects` codemod.
registerPrd07Cli();

export {};
