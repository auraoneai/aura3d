/**
 * fal.ai queue client shared by `assets generate` (Idol) and `animation generate` (HY-Motion).
 *
 * Resume-safe by construction: the queue submission is written to `pendingFile` before polling and ledgered at submit
 * time, so a rerun after a client timeout or crash polls the same request instead of paying again. A pending file is
 * only replaced by a new paid submit when fal itself says the old request is gone or failed; a network error while
 * checking it stops with "rerun to resume" instead. On success a `done-*` file keeps the result (and the input hash),
 * so a crash between "result fetched" and "outputs downloaded" also resumes for $0.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { loadFalKey, redactSecret, type LoadFalKeyOptions } from "./falKey.js";

export const FAL_QUEUE_BASE = "https://queue.fal.run";
export const FAL_TIMEOUT_MS = 90 * 60_000;

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export interface FalLedgerTarget {
  /** JSONL file; one line per paid submit (status "submitted"). */
  readonly file: string;
  /** Extra fields for the ledger line (game, key, usd, ...). Never put secrets here. */
  readonly entry: Readonly<Record<string, unknown>>;
}

export interface FalTransportOptions extends LoadFalKeyOptions {
  /** Explicit key (else loaded with loadFalKey). */
  readonly key?: string;
  readonly fetch?: FetchLike;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Poll interval (default 4000 ms; AURA3D_FAL_POLL_MS overrides for tests/CI). */
  readonly pollMs?: number;
  /** Base back-off for 429/5xx submit retries and download retries (default 5000 ms; AURA3D_FAL_RETRY_MS overrides). */
  readonly retryBaseMs?: number;
  /** Give up polling after this long (default 90 min); the pending file stays so a rerun resumes. */
  readonly timeoutMs?: number;
  readonly queueBase?: string;
  readonly now?: () => number;
}

export interface FalQueueOptions extends FalTransportOptions {
  readonly pendingFile?: string;
  readonly ledger?: FalLedgerTarget;
  /** Prefix for error messages ("hero idol"). */
  readonly label?: string;
}

export interface FalQueueResult<T = unknown> {
  readonly requestId: string;
  readonly result: T;
  /** true when no new paid submit happened (pending request resumed or a completed result reused). */
  readonly resumed: boolean;
  /** "submitted": paid now; "pending": an earlier submit was resumed; "done": an earlier completed result was reused. */
  readonly from: "submitted" | "pending" | "done";
}

interface FalSubmission {
  readonly request_id: string;
  readonly status_url?: string;
  readonly response_url?: string;
  readonly model?: string;
  readonly submittedAt?: string;
  readonly inputHash?: string;
}

const QUEUED = new Set(["IN_QUEUE", "IN_PROGRESS"]);

function envNumber(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

export function hashFalInput(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 16);
}

export function doneFileFor(pendingFile: string): string {
  const name = basename(pendingFile);
  return join(dirname(pendingFile), name.includes("pending-") ? name.replace("pending-", "done-") : `${name}.done.json`);
}

export function appendFalLedger(file: string, entry: Readonly<Record<string, unknown>>): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function requestUrls(base: string, model: string, sub: FalSubmission): { status: string; response: string } {
  // fal returns both URLs; the fallback uses the app id (owner/app) the queue API routes requests by.
  const app = model.split("/").slice(0, 2).join("/");
  return {
    status: sub.status_url ?? `${base}/${app}/requests/${sub.request_id}/status`,
    response: sub.response_url ?? `${base}/${app}/requests/${sub.request_id}`
  };
}

function transport(options: FalTransportOptions) {
  const fetchFn: FetchLike = options.fetch ?? (globalThis.fetch as unknown as FetchLike);
  if (typeof fetchFn !== "function") throw new Error("fal: global fetch is missing; use Node 18+.");
  return {
    fetchFn,
    sleep: options.sleep ?? defaultSleep,
    pollMs: options.pollMs ?? envNumber("AURA3D_FAL_POLL_MS") ?? 4000,
    retryBaseMs: options.retryBaseMs ?? envNumber("AURA3D_FAL_RETRY_MS") ?? 5000,
    timeoutMs: options.timeoutMs ?? FAL_TIMEOUT_MS,
    base: (options.queueBase ?? FAL_QUEUE_BASE).replace(/\/+$/, ""),
    now: options.now ?? Date.now
  };
}

/**
 * Run one fal queue request to completion: resume `pendingFile` if present, else submit (ledgered at submit time),
 * poll until COMPLETED (90 min default), fetch the result. Throws with a message that never contains the key.
 */
export async function falQueueRun<T = unknown>(model: string, input: unknown, options: FalQueueOptions = {}): Promise<FalQueueResult<T>> {
  const label = options.label ?? model;
  const key = options.key ?? loadFalKey(options).key;
  const t = transport(options);
  const headers = { Authorization: `Key ${key}`, "Content-Type": "application/json" };
  const safe = (text: string): string => redactSecret(text, key);
  const inputHash = hashFalInput(input);

  try {
    const doneFile = options.pendingFile ? doneFileFor(options.pendingFile) : undefined;
    if (doneFile && existsSync(doneFile)) {
      const done = readJson<{ request_id?: string; model?: string; inputHash?: string; result?: T }>(doneFile);
      if (done?.result !== undefined && done.request_id && done.inputHash === inputHash && (done.model ?? model) === model) {
        return { requestId: done.request_id, result: done.result, resumed: true, from: "done" };
      }
    }

    let sub: FalSubmission | undefined;
    let resumed = false;
    if (options.pendingFile && existsSync(options.pendingFile)) {
      const pending = readJson<FalSubmission>(options.pendingFile);
      if (pending?.request_id) {
        const urls = requestUrls(t.base, pending.model ?? model, pending);
        let response: Awaited<ReturnType<FetchLike>>;
        try {
          response = await t.fetchFn(urls.status, { headers });
        } catch (error) {
          throw new Error(`${label}: could not reach fal to check pending request ${pending.request_id} (${(error as Error).message ?? error}); rerun to resume it (a pending request is never resubmitted blind).`);
        }
        if (response.status === 429 || response.status >= 500) {
          throw new Error(`${label}: fal returned ${response.status} while checking pending request ${pending.request_id}; rerun to resume it.`);
        }
        const status = response.ok ? ((await response.json().catch(() => ({}))) as { status?: string }).status : undefined;
        if (response.ok && !status) {
          throw new Error(`${label}: fal returned an unreadable status for pending request ${pending.request_id}; rerun to resume it.`);
        }
        if (response.ok && status && (QUEUED.has(status) || status === "COMPLETED")) {
          sub = pending;
          resumed = true;
        } else {
          // fal no longer knows the request, or it failed: failed requests are not billed, so a fresh submit is safe.
          renameSync(options.pendingFile, join(dirname(options.pendingFile), `stale-${Date.now()}-${basename(options.pendingFile)}`));
        }
      }
    }

    for (let attempt = 0; !sub; attempt++) {
      const response = await t.fetchFn(`${t.base}/${model}`, { method: "POST", headers, body: JSON.stringify(input) });
      if (response.ok) {
        const body = (await response.json()) as FalSubmission;
        if (!body?.request_id) throw new Error(`${label}: fal accepted the submit but returned no request_id`);
        sub = { request_id: body.request_id, status_url: body.status_url, response_url: body.response_url, model, submittedAt: new Date(t.now()).toISOString(), inputHash };
        if (options.pendingFile) {
          mkdirSync(dirname(options.pendingFile), { recursive: true });
          writeFileSync(options.pendingFile, `${JSON.stringify(sub, null, 1)}\n`);
        }
        if (options.ledger) appendFalLedger(options.ledger.file, { ...options.ledger.entry, model, requestId: sub.request_id, status: "submitted" });
        break;
      }
      const text = (await response.text().catch(() => "")).slice(0, 400);
      if (response.status === 401 || response.status === 403) {
        throw new Error(`${label}: fal rejected the key (${response.status}). Check FAL_KEY / --key-file / ~/.config/aura3d/fal.env.`);
      }
      if (attempt >= 3 || (response.status < 500 && response.status !== 429)) throw new Error(`${label}: submit ${response.status} ${text}`);
      await t.sleep(t.retryBaseMs * (attempt + 1));
    }

    const urls = requestUrls(t.base, sub.model ?? model, sub);
    const started = t.now();
    for (let first = true; ; first = false) {
      if (!first || !resumed) await t.sleep(t.pollMs);
      let state: { status?: string } | undefined;
      try {
        state = (await (await t.fetchFn(urls.status, { headers })).json()) as { status?: string };
      } catch {
        state = undefined;
      }
      if (state?.status === "COMPLETED") break;
      if (state?.status && !QUEUED.has(state.status)) {
        if (options.pendingFile) rmSync(options.pendingFile, { force: true });
        throw new Error(`${label}: status ${JSON.stringify(state).slice(0, 300)}`);
      }
      if (t.now() - started > t.timeoutMs) {
        throw new Error(`${label}: still queued after ${Math.round(t.timeoutMs / 60_000)} min (request ${sub.request_id}); rerun the same command to resume it without paying again.`);
      }
    }

    const response = await t.fetchFn(urls.response, { headers });
    const out = (await response.json().catch(() => ({ detail: "unreadable result body" }))) as T & { detail?: unknown };
    if (!response.ok || (out as { detail?: unknown }).detail) {
      if (options.pendingFile) rmSync(options.pendingFile, { force: true });
      throw new Error(`${label}: result ${response.status} ${JSON.stringify((out as { detail?: unknown }).detail ?? out).slice(0, 400)}`);
    }
    if (options.pendingFile) {
      writeFileSync(doneFileFor(options.pendingFile), `${JSON.stringify({ request_id: sub.request_id, model, inputHash, completedAt: new Date(t.now()).toISOString(), result: out })}\n`);
      rmSync(options.pendingFile, { force: true });
    }
    return { requestId: sub.request_id, result: out as T, resumed, from: resumed ? "pending" : "submitted" };
  } catch (error) {
    throw new Error(safe(error instanceof Error ? error.message : String(error)));
  }
}

/** Download a fal media URL (unauthenticated CDN) with retries. */
export async function falDownload(url: string, dest: string, options: FalTransportOptions = {}): Promise<string> {
  const t = transport(options);
  mkdirSync(dirname(dest), { recursive: true });
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await t.fetchFn(url);
      if (!response.ok) throw new Error(`download ${response.status}`);
      writeFileSync(dest, Buffer.from(await response.arrayBuffer()));
      return dest;
    } catch (error) {
      if (attempt >= 3) throw new Error(`download of ${basename(dest)} failed: ${(error as Error).message ?? error}`);
      await t.sleep(Math.min(3000, t.retryBaseMs));
    }
  }
}
