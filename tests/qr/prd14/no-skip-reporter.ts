// tests/qr/prd14/no-skip-reporter.ts — P-22: on CI a skipped lane-14 browser
// test fails the run. Skips used to hide missing routes (`test.skip(!existsSync)`
// guards, #684); a green lane run must mean every spec executed. Locally the
// reporter only lists the skips so authors can see them.
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

export default class NoSkipInCiReporter implements Reporter {
  private readonly skipped: string[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === "skipped") this.skipped.push(test.titlePath().filter(Boolean).join(" > "));
  }

  onEnd(result: FullResult): { status: FullResult["status"] } | undefined {
    if (this.skipped.length === 0) return undefined;
    const list = this.skipped.map((t) => `  - ${t}`).join("\n");
    if (!process.env.CI) {
      console.warn(`[no-skip] ${this.skipped.length} skipped test(s) (fatal on CI):\n${list}`);
      return undefined;
    }
    console.error(`[no-skip] ${this.skipped.length} skipped test(s) on CI; lane-14 runs must execute every spec:\n${list}`);
    return { status: result.status === "passed" ? "failed" : result.status };
  }

  printsToStdio(): boolean {
    return false;
  }
}
