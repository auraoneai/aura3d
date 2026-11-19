import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { falQueueRun, hashFalInput } from "../../../../packages/aura3d-cli/src/commands/generate/falClient.js";
import { FalKeyMissingError, loadFalKey, parseFalEnv, redactSecret } from "../../../../packages/aura3d-cli/src/commands/generate/falKey.js";
import { createFakeFal, fastFal } from "./fake-fal.js";

const KEY = "fal-test-SECRET-0123456789abcdef";
const dirs: string[] = [];
function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "aura3d-fal-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const MODEL = "fal-ai/hunyuan-motion";
const results = { [MODEL]: (input: Record<string, unknown>) => ({ motion_json: { url: `https://cdn.test/${String(input.prompt)}.json` } }) };
const ledgerLines = (file: string) => (existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>) : []);

describe("falQueueRun", () => {
  test("submit writes the pending file before polling, ledgers at submit time, and leaves a done file", async () => {
    const dir = tmp();
    const pendingFile = join(dir, "pending-dict.json");
    const ledger = join(dir, "ledger.jsonl");
    const fal = createFakeFal({ results, polls: 2 });
    let pendingSeenWhilePolling = false;
    const fetch = async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
      if (url.endsWith("/status")) pendingSeenWhilePolling ||= existsSync(pendingFile) && ledgerLines(ledger).length === 1;
      return fal.fetch(url, init);
    };
    const run = await falQueueRun(MODEL, { prompt: "run" }, { key: KEY, fetch, ...fastFal, pendingFile, ledger: { file: ledger, entry: { game: "g", key: "Run", usd: 0.08 } } });
    expect(run).toMatchObject({ requestId: "req-1", resumed: false, from: "submitted", result: { motion_json: { url: "https://cdn.test/run.json" } } });
    expect(pendingSeenWhilePolling).toBe(true);
    expect(existsSync(pendingFile)).toBe(false);
    expect(JSON.parse(readFileSync(join(dir, "done-dict.json"), "utf8"))).toMatchObject({ request_id: "req-1", model: MODEL, inputHash: hashFalInput({ prompt: "run" }) });
    expect(ledgerLines(ledger)).toEqual([expect.objectContaining({ game: "g", key: "Run", usd: 0.08, model: MODEL, requestId: "req-1", status: "submitted" })]);
    expect(fal.calls[0]!.headers.Authorization).toBe(`Key ${KEY}`);
  });

  test("a timed-out run keeps its pending file; the rerun resumes the same request and never pays twice", async () => {
    const dir = tmp();
    const pendingFile = join(dir, "pending-idol.json");
    const ledger = join(dir, "ledger.jsonl");
    const stuck = createFakeFal({ results, stuck: true });
    await expect(falQueueRun(MODEL, { prompt: "run" }, { key: KEY, fetch: stuck.fetch, ...fastFal, timeoutMs: 0, pendingFile, ledger: { file: ledger, entry: {} } }))
      .rejects.toThrowError(/rerun the same command to resume/);
    expect(existsSync(pendingFile)).toBe(true);
    // A new process: fal now reports the request done. No POST may happen.
    const later = createFakeFal({ results });
    later.seed(MODEL, "req-1", { prompt: "run" }, 0);
    const resumed = await falQueueRun(MODEL, { prompt: "run" }, { key: KEY, fetch: later.fetch, ...fastFal, pendingFile, ledger: { file: ledger, entry: {} } });
    expect(resumed).toMatchObject({ requestId: "req-1", resumed: true, from: "pending" });
    expect(later.posts()).toHaveLength(0);
    expect(ledgerLines(ledger)).toHaveLength(1);
    // A third run reuses the done file without any network call.
    const offline = createFakeFal({ results });
    const reused = await falQueueRun(MODEL, { prompt: "run" }, { key: KEY, fetch: offline.fetch, ...fastFal, pendingFile });
    expect(reused).toMatchObject({ requestId: "req-1", resumed: true, from: "done" });
    expect(offline.calls).toHaveLength(0);
    // ...but a different input does not reuse a stale result.
    const changed = createFakeFal({ results });
    await falQueueRun(MODEL, { prompt: "jump" }, { key: KEY, fetch: changed.fetch, ...fastFal, pendingFile });
    expect(changed.posts()).toHaveLength(1);
  });

  test("a pending request that cannot be checked is not resubmitted blind", async () => {
    const dir = tmp();
    const pendingFile = join(dir, "pending-dict.json");
    const fal = createFakeFal({ results });
    writeFileSync(pendingFile, JSON.stringify(fal.seed(MODEL, "req-9")));
    const offline = async (url: string, init?: { method?: string }) => {
      if (url.endsWith("/status")) throw new Error("ECONNRESET");
      return fal.fetch(url, init);
    };
    await expect(falQueueRun(MODEL, { prompt: "x" }, { key: KEY, fetch: offline, ...fastFal, pendingFile })).rejects.toThrowError(/rerun to resume/);
    expect(fal.posts()).toHaveLength(0);
    expect(existsSync(pendingFile)).toBe(true);
  });

  test("a pending request fal no longer knows is set aside and resubmitted once", async () => {
    const dir = tmp();
    const pendingFile = join(dir, "pending-dict.json");
    const fal = createFakeFal({ results });
    writeFileSync(pendingFile, JSON.stringify({ request_id: "gone", status_url: "https://queue.fal.run/fal-ai/hunyuan-motion/requests/gone/status", response_url: "https://queue.fal.run/fal-ai/hunyuan-motion/requests/gone" }));
    const run = await falQueueRun(MODEL, { prompt: "x" }, { key: KEY, fetch: fal.fetch, ...fastFal, pendingFile });
    expect(run.resumed).toBe(false);
    expect(fal.posts()).toHaveLength(1);
    expect(readdirSync(dir).some((name) => name.startsWith("stale-"))).toBe(true);
  });

  test("429 and 5xx submits back off and retry; other 4xx fail fast", async () => {
    const dir = tmp();
    const ledger = join(dir, "ledger.jsonl");
    const sleeps: number[] = [];
    const busy = createFakeFal({ results, submitFailures: { status: 429, count: 2 } });
    const run = await falQueueRun(MODEL, { prompt: "x" }, { key: KEY, fetch: busy.fetch, sleep: async (ms) => { sleeps.push(ms); }, pollMs: 0, retryBaseMs: 10, ledger: { file: ledger, entry: {} } });
    expect(run.requestId).toBe("req-1");
    expect(busy.posts()).toHaveLength(3);
    expect(sleeps.slice(0, 2)).toEqual([10, 20]);
    expect(ledgerLines(ledger)).toHaveLength(1);
    const bad = createFakeFal({ results, submitFailures: { status: 422, count: 1, body: '{"detail":"duration out of range"}' } });
    await expect(falQueueRun(MODEL, { prompt: "x" }, { key: KEY, fetch: bad.fetch, ...fastFal })).rejects.toThrowError(/submit 422 .*duration out of range/);
    expect(bad.posts()).toHaveLength(1);
  });

  test("errors never contain the key, even when fal echoes it back", async () => {
    const echo = createFakeFal({ results, submitFailures: { status: 400, count: 1, body: `{"detail":"bad header Authorization: Key ${KEY}"}` } });
    const error = await falQueueRun(MODEL, { prompt: "x" }, { key: KEY, fetch: echo.fetch, ...fastFal }).catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("[redacted]");
    expect((error as Error).message).not.toContain(KEY);
    const denied = createFakeFal({ results, submitFailures: { status: 401, count: 1 } });
    const deniedError = await falQueueRun(MODEL, {}, { key: KEY, fetch: denied.fetch, ...fastFal }).catch((caught: Error) => caught);
    expect((deniedError as Error).message).toMatch(/rejected the key .*FAL_KEY/);
    expect((deniedError as Error).message).not.toContain(KEY);
  });
});

describe("fal key loading", () => {
  test("order: FAL_KEY env, --key-file, ~/.config/aura3d/fal.env, ~/.config/auraone/fal.env", () => {
    const home = tmp();
    const cwd = tmp();
    mkdirSync(join(home, ".config/aura3d"), { recursive: true });
    mkdirSync(join(home, ".config/auraone"), { recursive: true });
    writeFileSync(join(home, ".config/auraone/fal.env"), "export FAL_KEY='auraone-key'\n");
    expect(loadFalKey({ env: {}, home })).toEqual({ key: "auraone-key", source: "~/.config/auraone/fal.env" });
    writeFileSync(join(home, ".config/aura3d/fal.env"), "# comment\nFAL_KEY=aura3d-key\n");
    expect(loadFalKey({ env: {}, home })).toEqual({ key: "aura3d-key", source: "~/.config/aura3d/fal.env" });
    writeFileSync(join(cwd, "my.key"), "bare-key-value\n");
    expect(loadFalKey({ env: {}, home, cwd, keyFile: "my.key" })).toEqual({ key: "bare-key-value", source: "key-file" });
    expect(loadFalKey({ env: { FAL_KEY: "env-key" }, home, cwd, keyFile: "my.key" })).toEqual({ key: "env-key", source: "env:FAL_KEY" });
    expect(() => loadFalKey({ env: {}, home, cwd, keyFile: "missing.key" })).toThrowError(/--key-file missing.key does not exist/);
  });

  test("a missing key names the fix", () => {
    const home = tmp();
    const error = (() => { try { loadFalKey({ env: {}, home }); } catch (caught) { return caught as Error; } return undefined; })();
    expect(error).toBeInstanceOf(FalKeyMissingError);
    expect(error!.message).toMatch(/Set FAL_KEY .*--key-file .*~\/\.config\/aura3d\/fal\.env/);
  });

  test("env-file parsing and redaction", () => {
    expect(parseFalEnv('FOO=1\nexport FAL_KEY="abc:def"\n')).toBe("abc:def");
    expect(parseFalEnv("FOO=1\nBAR=2\n")).toBeUndefined();
    expect(redactSecret(`x Key ${KEY} y ${KEY}`, KEY)).toBe("x Key [redacted] y [redacted]");
  });
});
