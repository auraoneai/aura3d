/**
 * P-22 no-skipped-in-CI reporter. On CI (`CI` env set), any skipped test fails
 * the run unless its skip came from `requireOrSkip` with an unexpired
 * `integrated-pending.json` id. Locally it only prints the skip list.
 *
 * Wire it into a Playwright config's `reporter` array:
 *   ["./tests/support/noSkipInCiReporter.ts"]
 */
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { isIntegratedPending } from "./requireOrSkip";

interface SkipRecord {
  readonly title: string;
  readonly file: string;
  readonly reason: string;
  readonly listedId: string | null;
}

const REQUIRE_PREFIX = /^requireOrSkip:([^\s]+) — /;

export function classifySkip(reason: string): string | null {
  const match = REQUIRE_PREFIX.exec(reason);
  if (!match) return null;
  return isIntegratedPending(match[1]!) ? match[1]! : null;
}

export default class NoSkipInCiReporter implements Reporter {
  private readonly skips: SkipRecord[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== "skipped") return;
    const reason = test.annotations.find((a) => a.type === "skip" || a.type === "fixme")?.description ?? "(no reason)";
    this.skips.push({ title: test.titlePath().join(" › "), file: test.location.file, reason, listedId: classifySkip(reason) });
  }

  async onEnd(result: FullResult): Promise<{ status?: FullResult["status"] } | undefined> {
    if (this.skips.length === 0) return undefined;
    const unlisted = this.skips.filter((s) => s.listedId === null);
    console.log(`\n[no-skip-in-ci] ${this.skips.length} skipped test(s); ${unlisted.length} not covered by integrated-pending.json`);
    for (const s of this.skips) {
      console.log(`  ${s.listedId ? `listed:${s.listedId}` : "UNLISTED"}  ${s.title}  (${s.reason})`);
    }
    if (process.env.CI && unlisted.length > 0 && result.status === "passed") {
      console.log("[no-skip-in-ci] FAIL: CI runs may not skip unlisted tests (P-22). Use requireOrSkip + an integrated-pending entry with owner/issue/expiry, or fix the test.");
      return { status: "failed" };
    }
    return undefined;
  }
}
