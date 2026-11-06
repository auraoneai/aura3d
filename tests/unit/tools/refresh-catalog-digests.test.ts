import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error plain mjs tool
import { refreshCatalogDigests, refreshDigestsInText } from "../../../tools/agent-examples/refresh-catalog-digests.mjs";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

describe("refresh-catalog-digests", () => {
  it("rewrites only changed digests and leaves the rest byte-identical", () => {
    const root = mkdtempSync(join(tmpdir(), "digest-"));
    dirs.push(root);
    mkdirSync(join(root, "t"), { recursive: true });
    writeFileSync(join(root, "a.txt"), "new-a");
    writeFileSync(join(root, "b.txt"), "same");
    const file = join(root, "t/expectations.json");
    const original = `{\n  "x": { "source": {\n    "path": "a.txt",\n    "sha256": "${sha("old-a")}"\n  },\n  "deps": [\n    { "path": "b.txt", "sha256": "${sha("same")}" },\n    { "path": "gone.txt", "sha256": "${"0".repeat(64)}" }\n  ] }\n}\n`;
    writeFileSync(file, original);
    const r = refreshCatalogDigests({ root, file: "t/expectations.json" });
    expect(r.changes).toEqual([{ path: "a.txt", from: sha("old-a"), to: sha("new-a") }]);
    expect(r.missing).toEqual(["gone.txt"]);
    expect(readFileSync(file, "utf8")).toBe(original.replace(sha("old-a"), sha("new-a")));
    expect(refreshCatalogDigests({ root, file: "t/expectations.json", write: false }).changes).toEqual([]);
  });

  it("does not touch an unchanged entry that shares the stale hash with a changed one", () => {
    const stale = sha("old");
    const text = JSON.stringify({ list: [{ path: "changed.txt", sha256: stale }, { path: "kept.txt", sha256: stale }] }, null, 1);
    const out = refreshDigestsInText(text, (p: string) => (p === "changed.txt" ? sha("fresh") : stale));
    expect(JSON.parse(out.text).list).toEqual([{ path: "changed.txt", sha256: sha("fresh") }, { path: "kept.txt", sha256: stale }]);
  });
});
