import { defineConfig } from "vitest/config";
import baseConfig from "../../../vitest.config";

/**
 * Lane-local vitest config: the repo-wide include list covers
 * tests/{unit,integration,assets} only, so `tests/qr/prdNN/` suites would be
 * silently empty under `vitest run <path>` (positional args are filters over
 * `include`). The qr-prd04 workflow's unit job points vitest here instead.
 * `include` is replaced (not merged) so only this lane's tests run.
 */
export default defineConfig({
	...baseConfig,
	test: {
		...baseConfig.test,
		include: ["tests/qr/prd04/unit/**/*.test.ts"]
	}
});
