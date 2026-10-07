/**
 * §6.9 score history (T4.7). history/index.jsonl is append-only: one line per
 * (round, item, judge-aggregate) with commit, run and runner-image. report.ts
 * renders trends from these lines.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import type { PanelRoundRecordDoc } from "./types";

export interface HistoryLine {
  readonly roundId: string;
  readonly itemId: string;
  readonly median: number;
  readonly verdict: string;
  readonly commitSha: string;
  readonly githubRunId: string;
  readonly runnerImage: string;
  readonly classes: readonly string[];
}

export function appendRound(round: PanelRoundRecordDoc, indexPath: string): void {
  const lines = round.aggregates.map((aggregate) =>
    JSON.stringify({
      roundId: round.roundId,
      itemId: aggregate.itemId,
      median: aggregate.median,
      verdict: aggregate.verdict,
      commitSha: round.env.commitSha,
      githubRunId: round.env.githubRunId,
      runnerImage: round.env.runnerImage,
      classes: aggregate.classes
    } satisfies HistoryLine)
  );
  if (lines.length > 0) appendFileSync(indexPath, lines.join("\n") + "\n", "utf8");
}

export function readHistory(indexPath: string): HistoryLine[] {
  if (!existsSync(indexPath)) return [];
  return readFileSync(indexPath, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as HistoryLine);
}

/** Median per round for one item, in append order. */
export function trend(indexPath: string, itemId: string): readonly { roundId: string; median: number }[] {
  return readHistory(indexPath)
    .filter((line) => line.itemId === itemId)
    .map((line) => ({ roundId: line.roundId, median: line.median }));
}
