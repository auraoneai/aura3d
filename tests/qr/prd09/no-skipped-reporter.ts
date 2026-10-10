// tests/qr/prd09/no-skipped-reporter.ts — P-22 (lane 09) no-skipped-in-CI gate.
//
// A Playwright reporter that fails the run when any test ends `skipped` while
// `process.env.CI` is set. A skipped lane gate is not a pass: every PRD-09 spec
// must execute on CI (PRD-16 P-22; red-flag revert of #599 for
// capture-divergence.spec.ts). Locally (no CI) it only lists the skips.
//
// Used by tests/qr/prd09/playwright.config.ts and playwright.prd09.config.ts.
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

export default class NoSkippedInCiReporter implements Reporter {
  private readonly skipped: string[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    // Retries re-report the same test; only the final outcome counts.
    if (result.status === "skipped" && result.retry >= test.retries) {
      this.skipped.push(`${test.parent.project()?.name ?? "?"} > ${test.titlePath().slice(1).join(" > ")}`);
    }
  }

  async onEnd(result: FullResult): Promise<{ status?: FullResult["status"] } | void> {
    if (this.skipped.length === 0) return;
    const heading = `[prd09 no-skipped] ${this.skipped.length} skipped test(s)`;
    const lines = this.skipped.map((title) => `  - ${title}`).join("\n");
    if (!process.env.CI) {
      console.warn(`${heading} (allowed outside CI):\n${lines}`);
      return;
    }
    console.error(`${heading} — skips are not allowed in CI (P-22):\n${lines}`);
    return { status: result.status === "interrupted" || result.status === "timedout" ? result.status : "failed" };
  }

  printsToStdio(): boolean {
    return false;
  }
}
