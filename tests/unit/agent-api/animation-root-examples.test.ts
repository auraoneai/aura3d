import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// docs/api/animation-root.md embeds the regions of animation-root-examples.ts verbatim; that file is
// typechecked, so the docs cannot drift from the root declarations without failing here or in tsc.
const source = readFileSync("tests/unit/agent-api/animation-root-examples.ts", "utf8");
const doc = readFileSync("docs/api/animation-root.md", "utf8");
const regions = ["layers", "root-motion", "retargeting", "two-bone-ik"] as const;

describe("docs/api/animation-root.md", () => {
  for (const name of regions) {
    test(`embeds the compiled "${name}" example verbatim`, () => {
      const match = source.match(new RegExp(`// region ${name}\\n([\\s\\S]*?)// endregion`));
      expect(match, `region ${name} missing from the examples file`).not.toBeNull();
      expect(doc).toContain(match![1]!.trimEnd());
    });
  }

  test("names the receipt spec and the not-proven boundary", () => {
    expect(doc).toContain("tests/browser/animation-root-receipts.spec.ts");
    expect(doc).toContain("They do not prove retargeting for arbitrary rigs");
  });
});
