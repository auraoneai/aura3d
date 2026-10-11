import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T3.6 — injected regressions must be blocked by the gate.
 *
 * The test branch `qr/injected-regressions` (never merged) carries three
 * commits through public spec fields on prd12-ref-01-automotive-studio: key
 * light intensity halved, environment.intensity 0, pixelRatioScale 0.5. A gate
 * run on that branch writes its verdicts under
 * benchmarks/quality-rebuild/out/injected-<id>/verdicts.json.
 *
 * RF1 / P-32: no test here returns without asserting.
 *   - Every run asserts, through a real `git ls-remote` + `git log`, that the
 *     branch exists and carries the injection commit for each id.
 *   - With QR_INJECTED_VERDICTS_REQUIRED=1 (the injected-regressions gate run)
 *     each id's verdicts.json MUST exist and MUST fail the gate; missing
 *     output is a test failure, not a pending note.
 *   - Without it, verdicts that are present are still checked.
 */

const root = resolve(__dirname, "../../..");
const injectedDir = join(root, "benchmarks/quality-rebuild/out");
const BRANCH = "refs/heads/qr/injected-regressions";
/** ls-remote and a possible depth-3 fetch are network round trips. */
const GIT_TIMEOUT_MS = 90_000;
const VERDICTS_REQUIRED = process.env.QR_INJECTED_VERDICTS_REQUIRED === "1";

/** Injection id → the field its commit subject names on the branch. */
const INJECTIONS: Readonly<Record<string, RegExp>> = {
  "shadow-half": /^T3\.6 inject: ref-01 key light intensity /,
  "ibl-zero": /^T3\.6 inject: ref-01 environment\.intensity /,
  "dpr-half": /^T3\.6 inject: ref-01 pixelRatioScale /
};

function git(args: readonly string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

let branchSubjects: readonly string[] | null = null;

/** Tip SHA from ls-remote, then the subjects of its three newest commits. */
function injectionSubjects(): readonly string[] {
  if (branchSubjects) return branchSubjects;
  const line = git(["ls-remote", "origin", BRANCH]);
  const sha = line.split(/\s+/)[0] ?? "";
  expect(sha, `${BRANCH} must exist on origin (git ls-remote origin ${BRANCH})`).toMatch(/^[0-9a-f]{40}$/);
  let present = true;
  try {
    git(["cat-file", "-e", `${sha}^{commit}`]);
  } catch {
    present = false;
  }
  if (!present) {
    // A shallow CI checkout fetches only what it needs; a full clone must not be made shallow.
    const shallow = git(["rev-parse", "--is-shallow-repository"]) === "true";
    git(["fetch", "--no-tags", "--quiet", ...(shallow ? ["--depth=3"] : []), "origin", sha]);
  }
  branchSubjects = git(["log", "--format=%s", "-3", sha]).split("\n");
  return branchSubjects;
}

describe("injected regressions (T3.6)", () => {
  it("branch qr/injected-regressions exists on origin with the three injection commits", () => {
    const subjects = injectionSubjects();
    expect(subjects).toHaveLength(3);
    for (const [id, subject] of Object.entries(INJECTIONS)) {
      expect(subjects.some((s) => subject.test(s)), `${id} commit on ${BRANCH}`).toBe(true);
    }
  }, GIT_TIMEOUT_MS);

  for (const [id, subject] of Object.entries(INJECTIONS)) {
    it(`injection ${id}: commit exists and recorded gate output blocks it`, () => {
      expect(injectionSubjects().some((s) => subject.test(s)), `${id} commit on ${BRANCH}`).toBe(true);
      const file = join(injectedDir, `injected-${id}`, "verdicts.json");
      if (VERDICTS_REQUIRED) {
        expect(existsSync(file), `${file} (QR_INJECTED_VERDICTS_REQUIRED=1: the gate run must record it)`).toBe(true);
      }
      if (!existsSync(file)) return; // asserted above: the commit is real; verdicts not required in this run
      const doc = JSON.parse(readFileSync(file, "utf8")) as { itemVerdicts?: Record<string, string[]>; exitCode?: number };
      const verdicts = Object.values(doc.itemVerdicts ?? {}).flat();
      expect(doc.exitCode ?? 0, `${id} must fail the gate`).toBeGreaterThan(0);
      expect(verdicts.some((v) => v === "regression" || v === "reference-gap"), `${id} verdicts`).toBe(true);
    }, GIT_TIMEOUT_MS);
  }
});
