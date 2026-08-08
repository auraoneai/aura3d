import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readChecklistScope } from "../../../tools/threejs-parity-common/index.js";

describe("current Three.js parity checklist scope", () => {
  it("counts only the bounded current acceptance items", () => {
    const directory = mkdtempSync(join(tmpdir(), "aura-current-parity-"));
    const path = join(directory, "prd.md");
    writeFileSync(path, [
      "- [x] unrelated before",
      "## CURRENT START",
      "- [x] proven item",
      "- [ ] open item",
      "## CURRENT END",
      "- [ ] unrelated after"
    ].join("\n"));

    expect(readChecklistScope({ path, startHeading: "## CURRENT START", endHeading: "## CURRENT END" })).toMatchObject({
      checked: 1,
      unchecked: 1,
      total: 2
    });
  });

  it("fails closed on a zero-item scope instead of laundering it as complete", () => {
    const directory = mkdtempSync(join(tmpdir(), "aura-empty-parity-"));
    const path = join(directory, "prd.md");
    writeFileSync(path, "## CURRENT START\nprose only\n## CURRENT END\n");

    expect(() => readChecklistScope({ path, startHeading: "## CURRENT START", endHeading: "## CURRENT END" }))
      .toThrow(/zero acceptance items/);
  });
});
