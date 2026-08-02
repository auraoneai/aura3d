import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

interface ReviewModule {
  validateShowcaseVisualReviewRecord(
    review: Record<string, unknown>,
    options: { root: string; routes: readonly Record<string, unknown>[] }
  ): {
    ok: boolean;
    fileOk: boolean;
    failures: readonly string[];
    routeResults: Map<string, { ok: boolean; failures: readonly string[] }>;
  };
}

interface ProbeModule {
  createRouteSourceHash(routeId: string, root: string): string;
}

const reviewModule = import(
  pathToFileURL(join(process.cwd(), "tools/showcase-library/showcase-manual-review-gate.mjs")).href
) as Promise<ReviewModule>;
const probeModule = import(
  pathToFileURL(join(process.cwd(), "tools/showcase-library/route-primary-probes.mjs")).href
) as Promise<ProbeModule>;
const roots: string[] = [];
const route = { id: "showcase-review-fixture", releaseClass: "release-ready candidate" } as const;

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("hash-bound showcase manual review", () => {
  it("accepts a current human review bound to source, route health, and three screenshot classes", async () => {
    const fixture = await createFixture();
    const result = (await reviewModule).validateShowcaseVisualReviewRecord(fixture.review, {
      root: fixture.root,
      routes: [route]
    });
    expect(result.ok).toBe(true);
    expect(result.fileOk).toBe(true);
    expect(result.routeResults.get(route.id)?.ok).toBe(true);
  });

  it.each([
    ["source bytes", "source"],
    ["screenshot bytes", "screenshot"],
    ["route-health bytes", "route-health"],
    ["review timestamp", "timestamp"],
    ["overall verdict", "overall-verdict"],
    ["blocking issues", "blocking-issues"]
  ])("rejects a review after %s changes", async (_label, mutation) => {
    const fixture = await createFixture();
    if (mutation === "source") {
      writeFileSync(join(fixture.root, "apps", route.id, "src", "main.ts"), "export const changed = true;\n");
    } else if (mutation === "screenshot") {
      writeFileSync(join(fixture.root, fixture.screenshotPaths[0]), "changed-image");
    } else if (mutation === "route-health") {
      writeFileSync(join(fixture.root, "apps", route.id, "route-health.json"), "{\"changed\":true}\n");
    } else if (mutation === "timestamp") {
      fixture.review.reviewedAt = "2000-01-01T00:00:00.000Z";
      (fixture.review.routes as Array<Record<string, unknown>>)[0].reviewedAt = fixture.review.reviewedAt;
    } else if (mutation === "overall-verdict") {
      fixture.review.overallVerdict = "fail";
    } else {
      (fixture.review.routes as Array<Record<string, unknown>>)[0].blockingIssues = ["visual:not-approved"];
    }
    const result = (await reviewModule).validateShowcaseVisualReviewRecord(fixture.review, {
      root: fixture.root,
      routes: [route]
    });
    expect(result.ok).toBe(false);
  });

  it("never treats an automated or fixture reviewer as human approval", async () => {
    const fixture = await createFixture();
    fixture.review.reviewer = { id: "ci-fixture", name: "Automated visual fixture", kind: "human" };
    const result = (await reviewModule).validateShowcaseVisualReviewRecord(fixture.review, {
      root: fixture.root,
      routes: [route]
    });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain("visual-review-human-reviewer-required");
  });
});

async function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "aura3d-showcase-review-"));
  roots.push(root);
  const appDir = join(root, "apps", route.id);
  mkdirSync(join(appDir, "src"), { recursive: true });
  mkdirSync(join(root, "tools", "showcase-library"), { recursive: true });
  mkdirSync(join(root, "tests", "reports", "showcase-route-primary-probes"), { recursive: true });
  writeFileSync(join(appDir, "src", "main.ts"), "export const scene = \"review-fixture\";\n");
  writeFileSync(join(appDir, "route-health.json"), "{\"classification\":\"release-ready candidate\"}\n");
  writeFileSync(join(root, "tools", "showcase-library", "fixture.txt"), "visual gate source\n");
  writeFileSync(
    join(root, "tests", "reports", "showcase-route-primary-probes", `${route.id}.json`),
    "{\"pass\":true}\n"
  );
  const screenshotPaths = [
    `tests/reports/${route.id}-desktop.png`,
    `tests/reports/${route.id}-mobile.png`,
    `tests/reports/${route.id}-gameplay.png`
  ];
  for (const [index, path] of screenshotPaths.entries()) {
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    writeFileSync(join(root, path), `fixture-image-${index}`);
  }
  const sourceHash = (await probeModule).createRouteSourceHash(route.id, root);
  const routeHealthHash = hash(join(appDir, "route-health.json"));
  const reviewedAt = "2099-01-01T00:00:00.000Z";
  const sourceCommit = "a82bd80b1b66c7c2629119780ef8de9553edad70";
  const screenshots = screenshotPaths.map((path, index) => ({
    kind: ["desktop", "mobile", "gameplay"][index],
    path,
    sha256: hash(join(root, path)),
    viewport: index === 1 ? { width: 390, height: 844 } : { width: 1440, height: 900 }
  }));
  const review = {
    schema: "aura3d-showcase-visual-review/2.0",
    reviewer: { id: "alex-reviewer", name: "Alex Reviewer", kind: "human" },
    reviewedAt,
    sourceCommit,
    overallVerdict: "pass",
    summary: "Human review of the exact source and screenshots.",
    routes: [{
      id: route.id,
      reviewedAt,
      sourceCommit,
      sourceHash,
      routeHealthHash,
      screenshots,
      verdict: "pass",
      blockingIssues: [],
      approvalScope: "public-release"
    }]
  };
  return { root, review, screenshotPaths };
}

function hash(path: string): string {
  return `sha256-${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}
