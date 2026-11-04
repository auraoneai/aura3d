import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T0.13 — every path referenced by a root package.json script must exist,
 * unless it is listed in tools/quality-gate/root-manifest-pending.json with
 * an open issue (then it is reported as `pending-root-manifest`, never
 * silently passed).
 */

type PendingDoc = {
  readonly issue?: string;
  readonly githubIssue?: number;
  readonly entries?: readonly { script?: string; path: string; reason?: string }[];
};

const root = resolve(__dirname, "../../..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};
const pending = JSON.parse(
  readFileSync(resolve(root, "tools/quality-gate/root-manifest-pending.json"), "utf8"),
) as PendingDoc;
const pendingPaths = new Set((pending.entries ?? []).map((entry) => entry.path));

const SCRIPT_PATH = /(?:tools|tests|benchmarks)\/[^\s'";&|)]+/g;

function referencedPaths(command: string): string[] {
  const found = command.match(SCRIPT_PATH) ?? [];
  return found
    .map((path) => path.replace(/[.,]+$/, ""))
    .filter((path) => !path.includes("*") && !path.startsWith("tests/reports"));
}

describe("root manifest script paths (Q-15-1 pending until merged)", () => {
  it("declares pending entries under an open issue", () => {
    expect(typeof pending.issue).toBe("string");
    expect(typeof pending.githubIssue).toBe("number");
  });

  it("references no path that is missing and not pending", () => {
    const missing: string[] = [];
    const pendingReported: string[] = [];
    for (const [script, command] of Object.entries(pkg.scripts)) {
      for (const path of referencedPaths(command)) {
        if (existsSync(resolve(root, path))) continue;
        if (pendingPaths.has(path)) {
          pendingReported.push(`${script}: ${path}`);
        } else {
          missing.push(`${script}: ${path}`);
        }
      }
    }
    for (const entry of pendingReported.sort()) {
      // Reported, never silently passed.
      console.log(`pending-root-manifest (${pending.issue}#${pending.githubIssue}) ${entry}`);
    }
    expect(
      missing,
      `root scripts reference missing paths not listed in root-manifest-pending.json:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  // Re-baselined 2026-11-02 for 5.0 (owner-delegated): Q-15-1 ≤80 target carried as 5.x debt; cap prevents growth.
  // 121 = exact root script count after the 5.0 re-baseline (120 on main + verify:api-docs; the
  // check:clean-install:source/:browser aliases added with it were unreferenced, so script-prune
  // --check removed them: tools/package-clean-install is run by tools/remote-acr/*.sh directly).
  // No new root scripts; lower this when scripts are removed.
  const ROOT_SCRIPT_CAP = 121;

  it("caps the script count at the 5.0 re-baseline (Q-15-1 ≤80 target is 5.x debt)", () => {
    const count = Object.keys(pkg.scripts).length;
    console.log(`root script count: ${count} (cap ${ROOT_SCRIPT_CAP}; Q-15-1 target ≤ 80, 5.x debt)`);
    expect(count).toBeLessThanOrEqual(ROOT_SCRIPT_CAP);
  });
});
