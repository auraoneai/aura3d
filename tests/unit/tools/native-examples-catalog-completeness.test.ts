import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CREATE_AURA3D_TEMPLATES } from "../../../packages/create-aura3d/src/index.js";
import { collectCapabilityCatalog } from "../../../tools/agent-examples/index.js";
import { catalogSetErrors } from "../../browser/native-examples-catalog.spec.js";

describe("native example catalog fixture completeness", () => {
  it("covers every current template and capability scenario exactly once", () => {
    const root = process.cwd();
    const file = JSON.parse(readFileSync(resolve(root, "tests/fixtures/native-examples-catalog/expectations.json"), "utf8")) as {
      cases: Array<{ id: string }>;
    };
    const required = [
      ...CREATE_AURA3D_TEMPLATES.map((name) => `template:${name}`),
      ...collectCapabilityCatalog(root).map(({ id }) => id)
    ];
    const observed = file.cases.map(({ id }) => id).filter((id) => id.startsWith("template:") || id.startsWith("capability-example:"));
    expect(catalogSetErrors(required, observed)).toEqual([]);
  });

  it("rejects omitted starter and documented catalog cases", () => {
    const required = ["template:sample", "capability-example:sample", "starter-example:sample", "documented-example:apps/sample"];
    const errors = catalogSetErrors(required, required.slice(0, 2));
    expect(errors.join("\n")).toContain("starter-example:sample");
    expect(errors.join("\n")).toContain("documented-example:apps/sample");
  });
});
