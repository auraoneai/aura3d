import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface DocsManifest {
  readonly schema: string;
  readonly requirements: {
    readonly minimumGuidePages: number;
    readonly minimumRunnableOrLinkedSnippets: number;
  };
  readonly docs: readonly { readonly path: string }[];
  readonly snippets: readonly { readonly id: string; readonly doc: string; readonly linkedExample: string | null }[];
}

describe("V5 docs", () => {
  it("covers guide depth, snippets, stability labels, migration map, and workflow verbs", () => {
    const manifest = JSON.parse(readFileSync(resolve("docs/project/v5-roadmap-docs-manifest.json"), "utf8")) as DocsManifest;
    const allDocs = manifest.docs.map((doc) => readFileSync(resolve(doc.path), "utf8")).join("\n");

    expect(manifest.schema).toBe("g3d-v5-docs-manifest/v1");
    expect(manifest.docs.length).toBeGreaterThanOrEqual(manifest.requirements.minimumGuidePages);
    expect(manifest.snippets.length).toBeGreaterThanOrEqual(manifest.requirements.minimumRunnableOrLinkedSnippets);
    expect(manifest.docs.every((doc) => existsSync(resolve(doc.path)))).toBe(true);
    expect(allDocs).toContain("stable");
    expect(allDocs).toContain("experimental");
    expect(allDocs).toContain("internal");
    expect(allDocs).toContain("Three.js Developer Quick Map");
    expect(allDocs).toContain("What Still Requires Raw Three.js Or Another Engine");
    for (const word of ["Install", "Scaffold", "Build", "Deploy", "Debug", "Migrate"]) {
      expect(allDocs).toContain(word);
    }
  });
});
