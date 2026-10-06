/**
 * C-30 — benchmark scene registry aggregator (custodian prd12, CONTRACTS.md
 * §3.8). Aggregates every lane's scene index; new scene ids are `<owner>-<slug>`.
 */

export interface BenchSceneRegistration {
  readonly id: string;
  readonly spec: unknown;
}

import { scenes as prd01 } from "../scenes/prd01/index";
import { scenes as prd02 } from "../scenes/prd02/index";
import { scenes as prd03 } from "../scenes/prd03/index";
import { scenes as prd04 } from "../scenes/prd04/index";
import { scenes as prd05 } from "../scenes/prd05/index";
import { scenes as prd06 } from "../scenes/prd06/index";
import { scenes as prd07 } from "../scenes/prd07/index";
import { scenes as prd08 } from "../scenes/prd08/index";
import { scenes as prd09 } from "../scenes/prd09/index";
import { scenes as prd10 } from "../scenes/prd10/index";
import { scenes as prd11 } from "../scenes/prd11/index";
import { scenes as prd12 } from "../scenes/prd12/index";
import { scenes as prd13 } from "../scenes/prd13/index";
import { scenes as prd14 } from "../scenes/prd14/index";
import { scenes as prd15 } from "../scenes/prd15/index";

export const ALL_SCENES: readonly BenchSceneRegistration[] = [
  ...prd01, ...prd02, ...prd03, ...prd04, ...prd05, ...prd06, ...prd07, ...prd08,
  ...prd09, ...prd10, ...prd11, ...prd12, ...prd13, ...prd14, ...prd15
];
