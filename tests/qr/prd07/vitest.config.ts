// PRD-07 lane test config — same resolution aliases as the root config, with
// `include` pointed at tests/qr/prd07/** (the root glob is custodian-owned and
// fixed to tests/{unit,integration,assets}). Run:
//   pnpm exec vitest run --config tests/qr/prd07/vitest.config.ts

import baseConfig from "../../../vitest.config";

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ["tests/qr/prd07/**/*.test.ts"]
  }
};
