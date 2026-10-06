/**
 * eslint/qr/index.js — aggregates every lane's eslint/qr/prdNN.js plus the
 * custodian rules. CONTRACTS.md §3.8: `eslint.config.js` imports `eslint/qr/*.js`.
 */

import prd01 from "./prd01.js";
import prd02 from "./prd02.js";
import prd03 from "./prd03.js";
import prd04 from "./prd04.js";
import prd05 from "./prd05.js";
import prd06 from "./prd06.js";
import prd07 from "./prd07.js";
import prd08 from "./prd08.js";
import prd09 from "./prd09.js";
import prd10 from "./prd10.js";
import prd11 from "./prd11.js";
import prd12 from "./prd12.js";
import prd13 from "./prd13.js";
import prd14 from "./prd14.js";
import prd15 from "./prd15.js";
import noCrossLaneImport from "./no-cross-lane-import.js";

export default [
  {
    files: ["packages/*/src/**/*.ts", "benchmarks/quality-rebuild/**/*.ts"],
    plugins: { "qr": { rules: { "no-cross-lane-import": noCrossLaneImport } } },
    rules: { "qr/no-cross-lane-import": "warn" }
  },
  ...prd01,
  ...prd02,
  ...prd03,
  ...prd04,
  ...prd05,
  ...prd06,
  ...prd07,
  ...prd08,
  ...prd09,
  ...prd10,
  ...prd11,
  ...prd12,
  ...prd13,
  ...prd14,
  ...prd15
];
