import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { collectSupportedExampleCatalog } from "../../../tools/agent-examples/index.js";
import { catalogSetErrors } from "../../browser/native-examples-catalog.spec.js";

// This discovery traverses the supported-example source inventory and belongs
// in the remote source suite, not in a local quick-unit run.
describe("documented native example catalog fixture completeness", () => {
  it("covers every discovered starter and documented example exactly once", () => {
    const root = process.cwd();
    const file = JSON.parse(readFileSync(resolve(root, "tests/fixtures/native-examples-catalog/expectations.json"), "utf8")) as {
      cases: Array<{ id: string }>;
    };
    const required = collectSupportedExampleCatalog(root).map(({ id }) => id);
    const observed = file.cases.map(({ id }) => id).filter((id) => id.startsWith("starter-example:") || id.startsWith("documented-example:"));
    expect(catalogSetErrors(required, observed)).toEqual([]);
  }, 30_000);
});
