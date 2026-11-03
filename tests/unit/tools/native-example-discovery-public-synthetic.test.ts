import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverExampleCatalog } from "../../../tools/agent-examples/index.js";

const roots: string[] = [];

function write(root: string, path: string, contents: string): void {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

function fixture(classifications = "", routes: readonly object[] = []): string {
  const root = mkdtempSync(join(tmpdir(), "aura3d-example-discovery-"));
  roots.push(root);
  write(root, "docs/project/showcase/apps-classification.md", classifications);
  write(root, "tools/showcase-library/route-gates.json", JSON.stringify({ routes }));
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("supported example discovery from synthetic roots", () => {
  it("keeps public references and retained spec/gate-only examples", () => {
    const root = fixture();
    write(root, "docs/agents/examples.md", "Use apps/public-example and [relative](../../apps/relative-example/), not vendor/apps/not-a-route.\n");
    write(root, "apps/public-example/index.html", "<div>public</div>");
    write(root, "apps/relative-example/index.html", "<div>public relative link</div>");
    write(root, "apps/not-a-route/index.html", "<div>not referenced as a route</div>");
    write(root, "tests/browser/retained.spec.ts", 'open("/examples/spec-example/index.html");\n');
    write(root, "examples/spec-example/index.html", "<div>spec</div>");
    write(root, "tools/readiness/index.ts", 'check("examples/gated-example/main.ts");\n');
    write(root, "examples/gated-example/main.ts", "// retained readiness input\n");

    expect(discoverExampleCatalog(root).entries.map(({ id }) => id)).toEqual([
      "documented-example:apps/public-example",
      "documented-example:apps/relative-example",
      "documented-example:examples/gated-example",
      "documented-example:examples/spec-example"
    ]);
  });

  it("preserves missing routes explicitly promised by public docs or classification", () => {
    const root = fixture([
      "| `apps/missing-starter` | starter example |",
      "| `examples/missing-library` | library demo |"
    ].join("\n"), [{ id: "missing-release", releaseClass: "release-ready candidate" }]);
    write(root, "docs/agents/examples.md", "Use examples/missing-documented.\n");
    write(root, "docs/index.md", "See [the missing route](../apps/missing-hub/).\n");
    write(root, "docs/workflows/game.md", "Use [the example](../../examples/missing-workflow/index.html).\n");

    expect(discoverExampleCatalog(root).entries.map(({ id }) => id)).toEqual([
      "documented-example:apps/missing-hub",
      "documented-example:apps/missing-release",
      "starter-example:missing-starter",
      "documented-example:examples/missing-documented",
      "documented-example:examples/missing-library",
      "documented-example:examples/missing-workflow"
    ]);
  });

  it("respects explicit non-public labels even when public docs and tests refer to the route", () => {
    const root = fixture("| `apps/internal-example` | internal diagnostic |");
    write(root, "docs/agents/examples.md", "Mention apps/internal-example.\n");
    write(root, "tests/unit/internal.test.ts", 'check("apps/internal-example/index.html");\n');
    write(root, "apps/internal-example/index.html", "<div>diagnostic</div>");

    const catalog = discoverExampleCatalog(root);
    expect(catalog.entries).toEqual([]);
    expect(catalog.exemptions).toContainEqual({
      sourcePath: "apps/internal-example",
      reason: "non-public classification: internal diagnostic"
    });
  });

  it("recognizes explicit internal-only and removed-from-public README classifications", () => {
    const root = fixture();
    write(root, "tests/unit/retained.test.ts", [
      'check("apps/internal-kits/kit.json");',
      'check("examples/internal-fixture/main.ts");',
      'check("apps/removed-route/index.html");',
      'check("apps/removed-markdown/index.html");',
      'check("apps/removed-prose/index.html");',
      'check("apps/not-public/index.html");'
    ].join("\n"));
    write(root, "apps/internal-kits/README.md", "Kit staging. Internal only: this app has no deploy target.\n");
    write(root, "examples/internal-fixture/README.md", "Internal renderer-backed physics contract fixture for deterministic assertions.\n");
    write(root, "apps/removed-route/README.md", "- Classification: removed-from-public-showcase; retained as a tool.\n");
    write(root, "apps/removed-markdown/README.md", "- **Classification:** `removed-from-public-showcase`; retained as a tool.\n");
    write(root, "apps/removed-prose/README.md", "This route was removed from the public showcase.\n");
    write(root, "apps/not-public/README.md", "This route is not a public example.\n");
    write(root, "docs/agents/mentions.md", "The retained sources are apps/internal-kits, examples/internal-fixture, apps/removed-route and apps/not-public.\n");

    const catalog = discoverExampleCatalog(root);
    expect(catalog.entries).toEqual([]);
    for (const sourcePath of ["apps/internal-kits", "examples/internal-fixture", "apps/removed-route", "apps/removed-markdown", "apps/removed-prose", "apps/not-public"]) {
      expect(catalog.exemptions).toContainEqual({
        sourcePath,
        reason: "README explicitly marks the route non-public"
      });
    }
  });

  it("does not mistake non-public subfeatures or past showcase status for unsupported public examples", () => {
    const root = fixture();
    write(root, "docs/agents/examples.md", "Use apps/still-documented and examples/private-subfeature.\n");
    write(root, "apps/still-documented/README.md", "This route was removed from the public showcase, but remains a supported documentation example.\n");
    write(root, "examples/private-subfeature/README.md", "This public example uses a cache that is not a public API.\n");

    expect(discoverExampleCatalog(root).entries.map(({ id }) => id)).toEqual([
      "documented-example:apps/still-documented",
      "documented-example:examples/private-subfeature"
    ]);
  });

  it("does not suppress explicitly public classifications because of README wording or a support-directory name", () => {
    const root = fixture([
      "| `apps/explicit-public` | library demo |",
      "| `apps/showcase-port-shared` | starter example |",
      "| `apps/shared` | starter example |"
    ].join("\n"));
    write(root, "apps/explicit-public/README.md", "This route was removed from the public showcase.\n");

    expect(discoverExampleCatalog(root).entries.map(({ id }) => id)).toEqual([
      "documented-example:apps/explicit-public",
      "starter-example:shared",
      "starter-example:showcase-port-shared"
    ]);
  });

  it("exempts the known shared port source directory instead of treating a source-file mention as a route", () => {
    const root = fixture();
    write(root, "tests/unit/retained.test.ts", 'check("apps/showcase-port-shared/quickbar.css");\n');
    write(root, "apps/showcase-port-shared/quickbar.css", "/* shared source, not a route */\n");

    const catalog = discoverExampleCatalog(root);
    expect(catalog.entries).toEqual([]);
    expect(catalog.exemptions).toContainEqual({
      sourcePath: "apps/showcase-port-shared",
      reason: "support-only source directory"
    });
  });

  it("retains a shared-named path when it is publicly documented, navigable, or has a fixture host", () => {
    const publicRoot = fixture();
    write(publicRoot, "docs/agents/examples.md", "Use apps/showcase-port-shared.\n");
    write(publicRoot, "apps/showcase-port-shared/quickbar.css", "/* source */\n");
    expect(discoverExampleCatalog(publicRoot).entries.map(({ id }) => id))
      .toEqual(["documented-example:apps/showcase-port-shared"]);

    const missingRoot = fixture();
    write(missingRoot, "docs/agents/examples.md", "Use apps/showcase-port-shared.\n");
    expect(discoverExampleCatalog(missingRoot).entries.map(({ id }) => id))
      .toEqual(["documented-example:apps/showcase-port-shared"]);

    const routeRoot = fixture();
    write(routeRoot, "tests/unit/retained.test.ts", 'check("apps/showcase-port-shared/index.html");\n');
    write(routeRoot, "apps/showcase-port-shared/index.html", "<div>route</div>");
    expect(discoverExampleCatalog(routeRoot).entries.map(({ id }) => id))
      .toEqual(["documented-example:apps/showcase-port-shared"]);

    const hostedRoot = fixture();
    write(hostedRoot, "tests/unit/retained.test.ts", 'check("apps/showcase-port-shared/main.ts");\n');
    write(hostedRoot, "apps/showcase-port-shared/main.ts", "// source example\n");
    write(hostedRoot, "tests/fixtures/showcase-port-shared/index.html", "<div>host</div>");
    expect(discoverExampleCatalog(hostedRoot).entries.map(({ id }) => id))
      .toEqual(["documented-example:apps/showcase-port-shared"]);
  });
});
