/**
 * P-22 (lane 08): no-skipped-in-CI reporter for the prd08 Playwright config.
 *
 * Under CI every collected test must actually run. A skipped, fixme'd or
 * annotated-skip test turns the whole run red, so a vacuous green
 * (`test.skip(...)` guards, missing preconditions) cannot land on main.
 * Locally (no `CI`) skips are reported but do not change the result.
 */
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

export default class NoSkipInCiReporter implements Reporter {
  private readonly skipped: string[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    // Skipped tests are never retried, so one "skipped" result is final.
    if (result.status === "skipped") this.skipped.push(test.titlePath().filter(Boolean).join(" > "));
  }

  async onEnd(result: FullResult): Promise<{ status?: FullResult["status"] } | undefined> {
    if (this.skipped.length === 0) return undefined;
    const list = this.skipped.map((title) => `  - ${title}`).join("\n");
    if (!process.env.CI) {
      console.warn(`[prd08 no-skip] ${this.skipped.length} skipped test(s) (allowed locally only):\n${list}`);
      return undefined;
    }
    console.error(`[prd08 no-skip] ${this.skipped.length} skipped test(s) in CI; skips are not allowed:\n${list}`);
    return { status: result.status === "passed" ? "failed" : result.status };
  }
}
