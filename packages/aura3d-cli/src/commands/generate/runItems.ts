/** Bounded-concurrency item runner shared by the Idol and motion specs. */

export interface RunSpecOptions<I, R> {
  readonly only?: readonly string[];
  readonly concurrency?: number;
  readonly onResult?: (result: R & { key: string; error?: string }, item: I) => void;
}

/** Bounded-concurrency runner shared by the Idol and motion specs; per-item errors become `{ key, error }` rows. */
export async function runItems<I extends { key: string }, R extends { key: string }>(
  items: readonly I[],
  run: (item: I) => Promise<R>,
  options: RunSpecOptions<I, R>,
  redact: (text: string) => string = (text) => text
): Promise<(R | { key: string; error: string })[]> {
  const selected = items.filter((item) => !options.only?.length || options.only.includes(item.key));
  const results: (R | { key: string; error: string })[] = [];
  let next = 0;
  const workers = Math.max(1, Math.min(options.concurrency ?? 6, selected.length));
  await Promise.all(Array.from({ length: workers }, async () => {
    while (next < selected.length) {
      const item = selected[next++]!;
      let result: R | { key: string; error: string };
      try {
        result = await run(item);
      } catch (error) {
        result = { key: item.key, error: redact(String((error as Error).message ?? error)).slice(0, 600) };
      }
      results.push(result);
      options.onResult?.(result as R & { key: string; error?: string }, item);
    }
  }));
  return results;
}
