/**
 * `aura3d meshy ledger` — a local credit ledger for paid Meshy generation.
 *
 * Bookkeeping only: this module never talks to Meshy. A wrapper that calls Meshy (for example through Kiro Prism)
 * reserves credits here BEFORE a paid call and settles the record after. Spend is UNCAPPED by default (owner decision,
 * 2026-10-25): credits are tracked for visibility and the only automatic stop is the real Prism balance reaching 0.
 * A per-game cap and a global cap are opt-in (`config`, `--cap`, `--game-cap`, `--global-cap`, env); once set they are
 * HARD stops enforced under a lock, and a refusal prints the remaining credits and the flag that raises the cap. `reconcile` (no --rid) is the only place a
 * credential is read, and only to GET the Prism pool balance (`AURA3D_PRISM_KEY` or `AURA3D_PRISM_KEY_FILE`; never printed).
 *
 * Lessons baked in:
 *  - A rate-limited or timed-out poll does not mean the task failed: the task usually finishes and is charged.
 *    Such a call settles as `unconfirmed` and keeps counting its estimate until `reconcile` proves otherwise.
 *  - Only a confirmed no-charge outcome (auth/validation/credit errors, a create rejected by a 429, a FAILED task)
 *    settles as `failed` (counts 0). A 429 on a poll (`/text-to-3d/<id>`) means the task exists: unconfirmed, with its id.
 *  - Every record carries a required game/project tag, and `prefixedName` makes raw download names game-prefixed so
 *    two games cannot silently reuse each other's `rocks.raw.glb`.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

export type MeshyLedgerStatus = "reserved" | "ok" | "failed" | "unconfirmed";

export interface MeshyLedgerRecord {
  readonly ts: string;
  readonly rid: string;
  /** `baseline` records snapshot the Prism pool for `reconcile`; `config` records persist the caps. Neither counts as spend. */
  readonly kind?: "baseline" | "config";
  /** On a `config` record: the cap, or `null` to clear a stored cap. */
  readonly global_cap?: number | null;
  readonly game_cap?: number | null;
  readonly status: MeshyLedgerStatus;
  readonly game?: string;
  readonly op?: string;
  readonly est?: number;
  readonly actual?: number;
  readonly task_id?: string;
  readonly note?: string;
  readonly pool_remaining?: number;
  readonly pool_keys?: Readonly<Record<string, number>>;
  /** Key ids left out of a total-only baseline (keys that joined the pool after it). */
  readonly pool_excluded?: readonly string[];
  /** Counted ledger spend when the baseline was taken; reconcile compares only the spend after it. */
  readonly ledger_spent?: number;
}

export interface MeshyLedgerOptions {
  /** Defaults to $AURA3D_MESHY_LEDGER, then ~/.aura3d/meshy-ledger.jsonl. */
  readonly ledgerPath?: string;
  /** Opt-in total the whole ledger may spend. Unset: $AURA3D_MESHY_GLOBAL_CAP, then a cap stored by `config`, else no cap. */
  readonly globalCap?: number;
  /** Opt-in per-game cap used when a call passes none. Unset: $AURA3D_MESHY_GAME_CAP, then stored by `config`, else no cap. */
  readonly gameCap?: number;
  readonly lockTimeoutMs?: number;
  readonly now?: () => Date;
}

export interface MeshyLedgerTotals {
  readonly spent: number;
  readonly unconfirmed: number;
  readonly byGame: Readonly<Record<string, number>>;
  readonly unconfirmedRids: readonly string[];
}

/** Meshy's published per-operation credit costs (preview 20, refine 10, remesh 5, rigging 5, animate 3, retexture 10). */
export const MESHY_CREDIT_ESTIMATES: Readonly<Record<string, number>> = {
  preview: 20,
  refine: 10,
  remesh: 5,
  rigging: 5,
  animate: 3,
  retexture: 10
};

/** Tags the ledger writes itself; nobody may reserve under them. */
const RESERVED_TAGS = new Set(["unattributed", "baseline"]);
const GAME_TAG = /^[a-z][a-z0-9-]{1,39}$/;
const STALE_LOCK_MS = 60_000;

export class MeshyLedgerError extends Error {
  constructor(readonly code: "CAP_GLOBAL" | "CAP_GAME" | "BAD_GAME_TAG" | "BAD_RECORD" | "UNKNOWN_RID" | "BAD_TRANSITION" | "LOCK_TIMEOUT" | "BAD_POOL", message: string) {
    super(message);
    this.name = "MeshyLedgerError";
  }
}

export function defaultLedgerPath(): string {
  return process.env.AURA3D_MESHY_LEDGER ?? resolve(homedir(), ".aura3d", "meshy-ledger.jsonl");
}

/** Caps persisted in the ledger by `config` (flag > env > stored > no cap). A `null` clears a stored cap. */
function storedConfig(ledgerPath: string): { readonly globalCap?: number; readonly gameCap?: number } {
  if (!existsSync(ledgerPath)) return {};
  let globalCap: number | undefined;
  let gameCap: number | undefined;
  for (const line of readFileSync(ledgerPath, "utf8").split("\n")) {
    if (!line.includes('"config"')) continue;
    try {
      const record = JSON.parse(line) as MeshyLedgerRecord;
      if (record.kind !== "config") continue;
      if (record.global_cap !== undefined) globalCap = record.global_cap ?? undefined;
      if (record.game_cap !== undefined) gameCap = record.game_cap ?? undefined;
    } catch {
      // torn line: ignore
    }
  }
  return { ...(globalCap !== undefined ? { globalCap } : {}), ...(gameCap !== undefined ? { gameCap } : {}) };
}

/** `"off"` clears a stored cap; a positive number sets it; `undefined` leaves it alone. */
export type CapSetting = number | "off" | undefined;

/** Persist (or clear) opt-in caps in the ledger so every shell and agent sees the same limits. */
export function setMeshyCaps(caps: { readonly globalCap?: CapSetting; readonly gameCap?: CapSetting; readonly note?: string }, options: MeshyLedgerOptions = {}): MeshyLedgerRecord {
  const resolved = resolveOptions({ ...options, globalCap: 1, gameCap: 1 });
  for (const value of [caps.globalCap, caps.gameCap]) if (typeof value === "number" && (!Number.isFinite(value) || value <= 0)) throw new MeshyLedgerError("BAD_RECORD", "Caps must be positive numbers, or \"off\".");
  if (caps.globalCap === undefined && caps.gameCap === undefined) throw new MeshyLedgerError("BAD_RECORD", "config needs --global-cap and/or --game-cap (a number, or off to remove the cap).");
  const stored = (value: CapSetting): number | null | undefined => (value === "off" ? null : value);
  return withLock(resolved, () => {
    const record: MeshyLedgerRecord = { ts: resolved.now().toISOString(), rid: `config-${resolved.now().getTime()}`, kind: "config", status: "ok", ...(caps.globalCap !== undefined ? { global_cap: stored(caps.globalCap) } : {}), ...(caps.gameCap !== undefined ? { game_cap: stored(caps.gameCap) } : {}), ...(caps.note ? { note: caps.note } : {}) };
    appendFileSync(resolved.ledgerPath, JSON.stringify(record) + "\n");
    return record;
  });
}

interface ResolvedOptions {
  readonly ledgerPath: string;
  readonly globalCap: number | undefined;
  readonly gameCap: number | undefined;
  readonly lockTimeoutMs: number;
  readonly now: () => Date;
}

function resolveOptions(options: MeshyLedgerOptions): ResolvedOptions {
  const envCap = Number(process.env.AURA3D_MESHY_GLOBAL_CAP);
  const envGameCap = Number(process.env.AURA3D_MESHY_GAME_CAP);
  const ledgerPath = resolve(options.ledgerPath ?? defaultLedgerPath());
  const stored = options.globalCap !== undefined && options.gameCap !== undefined ? {} : storedConfig(ledgerPath);
  return {
    ledgerPath,
    globalCap: options.globalCap ?? (Number.isFinite(envCap) && envCap > 0 ? envCap : stored.globalCap),
    gameCap: options.gameCap ?? (Number.isFinite(envGameCap) && envGameCap > 0 ? envGameCap : stored.gameCap),
    lockTimeoutMs: options.lockTimeoutMs ?? 30_000,
    now: options.now ?? (() => new Date())
  };
}

export function assertGameTag(game: string): string {
  if (!GAME_TAG.test(game)) {
    throw new MeshyLedgerError("BAD_GAME_TAG", `Meshy ledger needs a game/project tag like "drift" or "last-train" (lowercase letters, digits, dashes; got "${game}").`);
  }
  return game;
}

/**
 * Raw Meshy downloads must carry the game tag so two games never share `rocks.raw.glb`.
 * `prefixedName("drift", "lamp")` -> `drift-lamp`; an already-prefixed name is returned unchanged.
 */
export function prefixedName(game: string, name: string): string {
  assertGameTag(game);
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) throw new MeshyLedgerError("BAD_RECORD", `Asset name "${name}" must start with a letter and use letters, digits, "-" or "_".`);
  return name === game || name.startsWith(`${game}-`) || name.startsWith(`${game}_`) ? name : `${game}-${name}`;
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function withLock<T>(resolved: ResolvedOptions, fn: () => T): T {
  mkdirSync(dirname(resolved.ledgerPath), { recursive: true });
  const lock = `${resolved.ledgerPath}.lock.d`;
  const started = Date.now();
  for (;;) {
    try {
      mkdirSync(lock);
      writeFileSync(`${lock}/pid`, String(process.pid));
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let stale = false;
      try {
        const owner = Number(readFileSync(`${lock}/pid`, "utf8"));
        stale = !Number.isFinite(owner) || !pidAlive(owner) || Date.now() - statSync(lock).mtimeMs > STALE_LOCK_MS;
      } catch {
        // pid file not written yet (owner is between mkdir and writeFile) or the lock was just released
        const info = statSync(lock, { throwIfNoEntry: false });
        if (!info) continue;
        stale = Date.now() - info.mtimeMs > 2_000;
      }
      if (stale) {
        rmSync(lock, { recursive: true, force: true });
        continue;
      }
      if (Date.now() - started > resolved.lockTimeoutMs) throw new MeshyLedgerError("LOCK_TIMEOUT", `Meshy ledger lock ${lock} is held by another process.`);
      sleepSync(50 + Math.floor(Math.random() * 100));
    }
  }
  try {
    return fn();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

export function readMeshyLedger(options: MeshyLedgerOptions = {}): readonly MeshyLedgerRecord[] {
  const { ledgerPath } = resolveOptions(options);
  if (!existsSync(ledgerPath)) return [];
  return readFileSync(ledgerPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as MeshyLedgerRecord);
}

/** Latest record per reservation id wins (fields merge). failed counts 0; reserved/unconfirmed/ok count actual ?? est. */
export function meshyLedgerTotals(records: readonly MeshyLedgerRecord[]): MeshyLedgerTotals {
  const byRid = new Map<string, MeshyLedgerRecord>();
  for (const record of records) if (!record.kind) byRid.set(record.rid, { ...(byRid.get(record.rid) ?? {}), ...record });
  let spent = 0;
  let unconfirmed = 0;
  const byGame: Record<string, number> = {};
  const unconfirmedRids: string[] = [];
  for (const record of byRid.values()) {
    const cost = record.status === "failed" ? 0 : record.actual ?? record.est ?? 0;
    spent += cost;
    if (record.game) byGame[record.game] = (byGame[record.game] ?? 0) + cost;
    if (record.status === "unconfirmed") {
      unconfirmed += cost;
      unconfirmedRids.push(record.rid);
    }
  }
  return { spent, unconfirmed, byGame, unconfirmedRids };
}

export interface ReserveInput {
  readonly game: string;
  readonly op: string;
  /** Defaults to the published estimate for `op`. */
  readonly est?: number;
  /** Optional per-game cap for this call; defaults to the ledger's game cap, if one is set. With no cap the call is never refused for spend. */
  readonly cap?: number;
}

export interface MeshyBudgetCheck {
  readonly allowed: boolean;
  readonly game: string;
  readonly ops: readonly string[];
  readonly cost: number;
  readonly gameSpent: number;
  /** `null`: no per-game cap is in force (the default). */
  readonly gameCap: number | null;
  readonly gameLeft: number | null;
  readonly globalSpent: number;
  /** `null`: no global cap is in force (the default). */
  readonly globalCap: number | null;
  readonly globalLeft: number | null;
  readonly refusal?: { readonly code: "CAP_GLOBAL" | "CAP_GAME"; readonly message: string };
}

function estimateFor(op: string, est?: number): number {
  const value = est ?? MESHY_CREDIT_ESTIMATES[op];
  if (value === undefined || !Number.isFinite(value) || value < 0) throw new MeshyLedgerError("BAD_RECORD", `No credit estimate for op "${op}"; pass an explicit estimate.`);
  return value;
}

/** Pure budget check against the current ledger. Never writes. `reserve --dry-run` and the real reserve share it. */
export function checkMeshyBudget(input: { readonly game: string; readonly ops: readonly string[]; readonly est?: number; readonly cap?: number }, options: MeshyLedgerOptions = {}): MeshyBudgetCheck {
  const resolved = resolveOptions(options);
  const game = assertGameTag(input.game);
  if (RESERVED_TAGS.has(game)) throw new MeshyLedgerError("BAD_GAME_TAG", `"${game}" is a ledger-internal tag; use your game or project slug.`);
  if (input.ops.length === 0) throw new MeshyLedgerError("BAD_RECORD", "At least one op is required.");
  const cap = input.cap ?? resolved.gameCap;
  if (cap !== undefined && (!Number.isFinite(cap) || cap <= 0)) throw new MeshyLedgerError("BAD_RECORD", "A per-game cap must be a positive number.");
  const cost = input.ops.reduce((sum, op) => sum + estimateFor(op, input.ops.length === 1 ? input.est : undefined), 0);
  const totals = meshyLedgerTotals(readMeshyLedger(resolved));
  const gameSpent = totals.byGame[game] ?? 0;
  const globalCap = resolved.globalCap;
  const base = { game, ops: input.ops, cost, gameSpent, gameCap: cap ?? null, gameLeft: cap === undefined ? null : Math.max(0, cap - gameSpent), globalSpent: totals.spent, globalCap: globalCap ?? null, globalLeft: globalCap === undefined ? null : Math.max(0, globalCap - totals.spent) };
  if (globalCap !== undefined && totals.spent + cost > globalCap) {
    return { ...base, allowed: false, refusal: { code: "CAP_GLOBAL", message: `REFUSED: global cap ${globalCap} would be exceeded (a cap you set; spent ${totals.spent}, need ${cost}, ${base.globalLeft} left). Raise it with --global-cap <N> or AURA3D_MESHY_GLOBAL_CAP=<N>, or remove it with \`aura3d meshy ledger config --global-cap off\`.` } };
  }
  if (cap !== undefined && gameSpent + cost > cap) {
    const needed = gameSpent + cost;
    return { ...base, allowed: false, refusal: { code: "CAP_GAME", message: `REFUSED: ${game} cap ${cap} would be exceeded (a cap you set; spent ${gameSpent}, need ${cost}, ${base.gameLeft} left under the cap). Raise it with --cap ${needed} (this call) or AURA3D_MESHY_GAME_CAP=${needed} (all tags), or remove it with \`aura3d meshy ledger config --game-cap off\`.` } };
  }
  return { ...base, allowed: true };
}

/** Reserve credits before a paid call. Throws MeshyLedgerError (CAP_GLOBAL / CAP_GAME) without writing when over a cap. */
export function reserveMeshyCredits(input: ReserveInput, options: MeshyLedgerOptions = {}): string {
  const resolved = resolveOptions(options);
  return withLock(resolved, () => {
    const check = checkMeshyBudget({ game: input.game, ops: [input.op], ...(input.est !== undefined ? { est: input.est } : {}), ...(input.cap !== undefined ? { cap: input.cap } : {}) }, resolved);
    if (!check.allowed) throw new MeshyLedgerError(check.refusal!.code, check.refusal!.message);
    const rid = `${resolved.now().getTime()}-${Math.random().toString(36).slice(2, 8)}`;
    const record: MeshyLedgerRecord = { ts: resolved.now().toISOString(), rid, game: check.game, op: input.op, est: check.cost, status: "reserved" };
    appendFileSync(resolved.ledgerPath, JSON.stringify(record) + "\n");
    return rid;
  });
}

export interface SettleInput {
  readonly status: Exclude<MeshyLedgerStatus, "reserved">;
  readonly task_id?: string;
  readonly actual?: number;
  readonly note?: string;
}

const ALLOWED: Readonly<Record<MeshyLedgerStatus, readonly MeshyLedgerStatus[]>> = {
  reserved: ["ok", "failed", "unconfirmed"],
  unconfirmed: ["ok", "failed", "unconfirmed"],
  ok: ["ok"],
  failed: ["failed"]
};

/** Settle (or later reconcile) a reservation. `failed` is final; `ok` only accepts a corrected actual. */
export function settleMeshyCredits(rid: string, input: SettleInput, options: MeshyLedgerOptions = {}): MeshyLedgerRecord {
  const resolved = resolveOptions(options);
  return withLock(resolved, () => {
    const records = readMeshyLedger(resolved).filter((record) => record.rid === rid);
    if (records.length === 0) throw new MeshyLedgerError("UNKNOWN_RID", `Unknown reservation ${rid}.`);
    const current = records.reduce<MeshyLedgerRecord>((merged, record) => ({ ...merged, ...record }), records[0]!);
    if (!ALLOWED[current.status].includes(input.status)) {
      throw new MeshyLedgerError("BAD_TRANSITION", `Reservation ${rid} is ${current.status}; it cannot become ${input.status}.`);
    }
    const next: MeshyLedgerRecord = {
      ts: resolved.now().toISOString(),
      rid,
      status: input.status,
      ...(input.task_id ? { task_id: input.task_id } : {}),
      ...(input.actual !== undefined ? { actual: input.actual } : {}),
      ...(input.note ? { note: input.note } : {})
    };
    appendFileSync(resolved.ledgerPath, JSON.stringify(next) + "\n");
    return { ...current, ...next };
  });
}

export interface MeshyCallOutcome {
  /** Meshy CLI exit code: 0 ok, 3 auth, 4 validation, 6 rate limit, 8 timeout, 9 credits. */
  readonly exitCode: number;
  readonly taskId?: string;
  /** Provider task status when known (SUCCEEDED, FAILED, PENDING, IN_PROGRESS...). */
  readonly taskStatus?: string;
  /** Meshy CLI stderr, e.g. `meshy api 429 on /text-to-3d/<id>: ...`. A 429 on a poll carries the task id. */
  readonly errorText?: string;
}

const POLL_429 = /\b429 on \/(?:text-to-3d|image-to-3d|remesh|rigging|animations|retexture)\/([A-Za-z0-9-]{8,})/;
const CREATE_429 = /\b429 on \/(?:text-to-3d|image-to-3d|remesh|rigging|animations|retexture)\s*:/;

/**
 * Decide how a finished Meshy call settles. A rate limit or timeout without a confirmed result is NOT a failure:
 * the task may already be charged, so it stays `unconfirmed` (counted) until a `get` confirms it.
 */
export function classifyMeshyOutcome(outcome: MeshyCallOutcome): SettleInput {
  const taskStatus = outcome.taskStatus?.toUpperCase();
  if (taskStatus === "FAILED" || taskStatus === "CANCELED") return { status: "failed", task_id: outcome.taskId, note: `task ${taskStatus}` };
  if (taskStatus === "SUCCEEDED") return { status: "ok", task_id: outcome.taskId };
  if (outcome.exitCode === 0) return { status: "ok", task_id: outcome.taskId };
  const polled = outcome.errorText ? POLL_429.exec(outcome.errorText)?.[1] : undefined;
  if (!outcome.taskId && polled) return { status: "unconfirmed", task_id: polled, note: `exit ${outcome.exitCode}: poll rate-limited, task ${polled} exists and is charged; resume with get, then reconcile` };
  if (!outcome.taskId && outcome.errorText && CREATE_429.test(outcome.errorText)) return { status: "failed", note: `exit ${outcome.exitCode}: create rejected by a 429 before a task existed` };
  if (outcome.taskId) return { status: "unconfirmed", task_id: outcome.taskId, note: `exit ${outcome.exitCode}; task exists, resume with get before paying again` };
  if ([3, 4, 9].includes(outcome.exitCode)) return { status: "failed", note: `exit ${outcome.exitCode}: rejected before a task was created` };
  return { status: "unconfirmed", note: `exit ${outcome.exitCode}: no task id seen (rate limit or timeout); verify before treating as failed` };
}

export interface MeshyLedgerSummary {
  /** `null`: uncapped (the default). */
  readonly globalCap: number | null;
  readonly gameCap: number | null;
  readonly spent: number;
  /** Credits left under the global cap; `null` when there is none. */
  readonly left: number | null;
  readonly unconfirmed: number;
  readonly unconfirmedRids: readonly string[];
  readonly byGame: Readonly<Record<string, number>>;
  /** Tags above the per-game cap; always empty when no per-game cap is set. */
  readonly overCap: Readonly<Record<string, number>>;
}

export function summarizeMeshyLedger(options: MeshyLedgerOptions = {}): MeshyLedgerSummary {
  const resolved = resolveOptions(options);
  const totals = meshyLedgerTotals(readMeshyLedger(resolved));
  const gameCap = resolved.gameCap;
  const overCap = gameCap === undefined ? {} : Object.fromEntries(Object.entries(totals.byGame).filter(([game, spent]) => game !== "unattributed" && spent > gameCap));
  return { globalCap: resolved.globalCap ?? null, gameCap: gameCap ?? null, spent: totals.spent, left: resolved.globalCap === undefined ? null : resolved.globalCap - totals.spent, unconfirmed: totals.unconfirmed, unconfirmedRids: totals.unconfirmedRids, byGame: totals.byGame, overCap };
}

export interface PrismPoolSnapshot {
  /** Sum of `remaining` over every pooled key. */
  readonly remaining: number;
  /** Remaining credits per masked key id. */
  readonly keys: Readonly<Record<string, number>>;
}

/** Parse Kiro Prism `GET /admin/meshy` (`{ keys: [{ id, state, remaining }], totals }`). Masked ids only. */
export function parsePrismPool(json: unknown): PrismPoolSnapshot {
  const rows = (json as { keys?: unknown } | null)?.keys;
  if (!Array.isArray(rows) || rows.length === 0) throw new MeshyLedgerError("BAD_POOL", "Prism /admin/meshy returned no keys; cannot reconcile.");
  const keys: Record<string, number> = {};
  for (const row of rows as Array<{ id?: unknown; remaining?: unknown; state?: unknown }>) {
    if (typeof row.id !== "string" || typeof row.remaining !== "number" || !Number.isFinite(row.remaining)) throw new MeshyLedgerError("BAD_POOL", "Prism /admin/meshy has a key row without a string id and a numeric remaining.");
    keys[row.id] = row.remaining;
  }
  return { remaining: Object.values(keys).reduce((sum, value) => sum + value, 0), keys };
}

export interface FetchPrismPoolInput {
  readonly baseUrl?: string;
  readonly key: string;
  readonly fetchImpl?: typeof fetch;
}

/** Read-only GET of the pooled Meshy balance. The key is only ever sent as the Authorization header and scrubbed from errors. */
export async function fetchPrismPool(input: FetchPrismPoolInput): Promise<PrismPoolSnapshot> {
  const base = (input.baseUrl ?? "https://prism.auraone.ai").replace(/\/+$/, "");
  const scrub = (text: string): string => text.split(input.key).join("<redacted>");
  try {
    const response = await (input.fetchImpl ?? fetch)(`${base}/admin/meshy`, { method: "GET", headers: { Authorization: `Bearer ${input.key}` } });
    if (!response.ok) throw new MeshyLedgerError("BAD_POOL", `Prism /admin/meshy answered HTTP ${response.status}.`);
    return parsePrismPool(await response.json());
  } catch (error) {
    if (error instanceof MeshyLedgerError) throw error;
    throw new MeshyLedgerError("BAD_POOL", scrub(`Could not read Prism /admin/meshy: ${(error as Error).message}`));
  }
}

function lastBaseline(records: readonly MeshyLedgerRecord[]): MeshyLedgerRecord | undefined {
  return [...records].reverse().find((record) => record.kind === "baseline");
}

/**
 * Record the Prism pool as the zero point for `reconcile`. Keys added to the pool later are ignored by the delta.
 * Pass `pool` for a per-key snapshot (detects top-ups) or `{ totalRemaining, excludeKeys }` when only the pool total was
 * written down (a legacy baseline: the keys listed joined the pool after it and are left out of the comparison).
 */
export function recordMeshyBaseline(pool: PrismPoolSnapshot | { readonly totalRemaining: number; readonly excludeKeys: readonly string[] }, options: MeshyLedgerOptions & { readonly note?: string; readonly excludeKeys?: readonly string[] } = {}): MeshyLedgerRecord {
  const resolved = resolveOptions(options);
  const detail = "keys" in pool
    ? (() => {
        const exclude = new Set(options.excludeKeys ?? []);
        const keys = Object.fromEntries(Object.entries(pool.keys).filter(([id]) => !exclude.has(id)));
        return { pool_remaining: Object.values(keys).reduce((sum, value) => sum + value, 0), pool_keys: keys };
      })()
    : { pool_remaining: pool.totalRemaining, pool_excluded: pool.excludeKeys };
  return withLock(resolved, () => {
    const record: MeshyLedgerRecord = { ts: resolved.now().toISOString(), rid: `baseline-${resolved.now().getTime()}`, kind: "baseline", status: "ok", ...detail, ledger_spent: meshyLedgerTotals(readMeshyLedger(resolved)).spent, ...(options.note ? { note: options.note } : {}) };
    appendFileSync(resolved.ledgerPath, JSON.stringify(record) + "\n");
    return record;
  });
}

export interface MeshyReconciliation {
  /** Counted ledger spend since the baseline. */
  readonly ledgerSpent: number;
  readonly ledgerAttributed: number;
  readonly ledgerAdjustments: number;
  readonly prismSpent: number;
  /** prismSpent minus ledgerSpent: positive means Prism charged more than the ledger counted. */
  readonly delta: number;
  readonly poolRemaining: number;
  /** `null`: no global cap in force. */
  readonly globalCap: number | null;
  readonly leftUnderCap: number | null;
  readonly baselineAt: string;
  readonly keysAddedSinceBaseline: readonly string[];
  readonly keysToppedUp: readonly string[];
  readonly unconfirmedRids: readonly string[];
  readonly applied?: number;
}

/**
 * Compare the ledger with what Prism says the baseline keys lost. Prism cannot attribute spend to a game tag, so the
 * delta is pool-wide: other consumers of the same pool, monthly resets and top-ups all move it. Keys whose balance rose
 * since the baseline are listed in `keysToppedUp` and contribute 0 (never negative spend).
 * `apply` records the delta as an `unattributed` adjustment so the global cap tracks Prism's number.
 */
export function reconcileWithPrism(pool: PrismPoolSnapshot, options: MeshyLedgerOptions & { readonly apply?: boolean } = {}): MeshyReconciliation {
  const resolved = resolveOptions(options);
  const baseline = lastBaseline(readMeshyLedger(resolved));
  if (baseline?.pool_remaining === undefined) throw new MeshyLedgerError("BAD_POOL", "No baseline in this ledger. Record one first: aura3d meshy ledger baseline (reads the Prism pool) or baseline --pool-json <file>.");
  let prismSpent = 0;
  const toppedUp: string[] = [];
  let added: string[];
  if (baseline.pool_keys) {
    for (const [id, was] of Object.entries(baseline.pool_keys)) {
      const now = pool.keys[id];
      if (now === undefined) continue;
      if (now > was) toppedUp.push(id);
      else prismSpent += was - now;
    }
    added = Object.keys(pool.keys).filter((id) => !(id in baseline.pool_keys!));
  } else {
    const excluded = new Set(baseline.pool_excluded ?? []);
    const current = Object.entries(pool.keys).filter(([id]) => !excluded.has(id)).reduce((sum, [, value]) => sum + value, 0);
    prismSpent = Math.max(0, baseline.pool_remaining - current);
    added = [...excluded].filter((id) => id in pool.keys);
  }
  const compute = (): MeshyReconciliation => {
    const totals = meshyLedgerTotals(readMeshyLedger(resolved));
    const since = totals.spent - (baseline.ledger_spent ?? 0);
    const adjustments = totals.byGame.unattributed ?? 0;
    return { ledgerSpent: since, ledgerAttributed: since - adjustments, ledgerAdjustments: adjustments, prismSpent, delta: prismSpent - since, poolRemaining: pool.remaining, globalCap: resolved.globalCap ?? null, leftUnderCap: resolved.globalCap === undefined ? null : resolved.globalCap - totals.spent - Math.max(0, prismSpent - since), baselineAt: baseline.ts, keysAddedSinceBaseline: added, keysToppedUp: toppedUp, unconfirmedRids: totals.unconfirmedRids };
  };
  const result = compute();
  if (!options.apply || result.delta === 0) return result;
  withLock(resolved, () => {
    const rid = `reconcile-${resolved.now().getTime()}`;
    appendFileSync(resolved.ledgerPath, JSON.stringify({ ts: resolved.now().toISOString(), rid, game: "unattributed", op: "adjustment", est: result.delta, actual: result.delta, status: "ok", note: `reconcile vs Prism pool since ${baseline.ts}: Prism ${prismSpent}, ledger ${result.ledgerSpent}` }) + "\n");
  });
  return { ...result, applied: result.delta };
}

interface CliIo {
  readonly cwd: string;
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

function flag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

const LEDGER_USAGE =
  "aura3d meshy ledger status|reserve|settle|reconcile|baseline|config|list [--ledger path] [--global-cap N] [--game-cap N]\n" +
  "  Spend is uncapped by default (owner decision 2026-10-25): credits are tracked for visibility; caps below are opt-in. Prism/Meshy refusing for a zero balance (exit 9) is the only automatic stop.\n" +
  "  config    --global-cap N|off and/or --game-cap N|off [--note text]   (opt in to a cap, or remove one; flag > $AURA3D_MESHY_GLOBAL_CAP/_GAME_CAP > stored > no cap)\n" +
  "  reserve   --game <tag> --op preview|refine|remesh|rigging|animate|retexture [--est N] [--cap N]   (prints the reservation id; --cap is an opt-in limit for this call)\n" +
  "  reserve   --dry-run --game <tag> --op preview,refine,rigging [--cap N]                            (cost of the chain; writes nothing; exit 3 only if a cap you set would refuse it)\n" +
  "  settle    --rid <id> --status ok|failed|unconfirmed [--task-id T] [--actual N] [--note text]\n" +
  "  settle    --rid <id> --exit-code N [--task-id T] [--task-status SUCCEEDED|FAILED|...] [--error-text \"meshy api 429 on /text-to-3d/<id>...\"]   (classified: a rate-limited poll stays unconfirmed)\n" +
  "  reconcile --rid <id> --status ok|failed [--task-id T] [--actual N]                                  (resolve one unconfirmed reservation)\n" +
  "  reconcile [--apply] [--pool-json file]                                                              (ledger vs the Prism pool since the baseline; --apply books the delta as an unattributed adjustment)\n" +
  "  baseline  [--pool-json file] [--exclude-keys id,id] [--note text]                                   (snapshot the Prism pool as the reconcile zero point)\n" +
  "  baseline  --pool-remaining N --exclude-keys id,id                                                   (legacy: only the pool total was written down; the listed keys joined after it)\n" +
  "  list      [--game <tag>]\n" +
  "  Prism read (reconcile/baseline without --pool-json): $AURA3D_PRISM_KEY or $AURA3D_PRISM_KEY_FILE, $AURA3D_PRISM_URL (default https://prism.auraone.ai). The key is only sent as a header and never printed.";

async function readPool(argv: readonly string[], io: CliIo): Promise<PrismPoolSnapshot> {
  const file = flag(argv, "--pool-json");
  if (file) return parsePrismPool(JSON.parse(readFileSync(resolve(io.cwd, file), "utf8")));
  const keyFile = process.env.AURA3D_PRISM_KEY_FILE;
  const key = process.env.AURA3D_PRISM_KEY ?? (keyFile ? readFileSync(keyFile, "utf8").trim() : undefined);
  if (!key) throw new MeshyLedgerError("BAD_POOL", "Set AURA3D_PRISM_KEY or AURA3D_PRISM_KEY_FILE to read the Prism pool, or pass --pool-json <saved GET /admin/meshy>.");
  return fetchPrismPool({ key, ...(process.env.AURA3D_PRISM_URL ? { baseUrl: process.env.AURA3D_PRISM_URL } : {}) });
}

export async function meshyLedgerCommand(argv: readonly string[], io: CliIo): Promise<number> {
  const sub = argv[0];
  const capFlag = flag(argv, "--global-cap");
  const gameCapFlag = flag(argv, "--game-cap");
  const numeric = (value: string | undefined): number | undefined => (value !== undefined && value !== "off" ? Number(value) : undefined);
  const options: MeshyLedgerOptions = {
    ...(flag(argv, "--ledger") ? { ledgerPath: resolve(io.cwd, flag(argv, "--ledger")!) } : {}),
    ...(numeric(capFlag) !== undefined ? { globalCap: numeric(capFlag)! } : {}),
    ...(numeric(gameCapFlag) !== undefined ? { gameCap: numeric(gameCapFlag)! } : {})
  };
  try {
    if (sub === "status" || sub === undefined) {
      io.stdout(JSON.stringify(summarizeMeshyLedger(options)));
      return 0;
    }
    if (sub === "reserve") {
      const game = flag(argv, "--game");
      const op = flag(argv, "--op");
      const capValue = flag(argv, "--cap");
      if (!game || !op || (capValue !== undefined && !Number.isFinite(Number(capValue)))) {
        io.stderr(LEDGER_USAGE);
        return 2;
      }
      const est = flag(argv, "--est");
      const cap = capValue !== undefined ? Number(capValue) : undefined;
      if (argv.includes("--dry-run")) {
        const check = checkMeshyBudget({ game, ops: op.split(",").filter(Boolean), ...(est ? { est: Number(est) } : {}), ...(cap !== undefined ? { cap } : {}) }, options);
        io.stdout(JSON.stringify({ dryRun: true, ...check }));
        if (!check.allowed) io.stderr(check.refusal!.message);
        return check.allowed ? 0 : 3;
      }
      io.stdout(reserveMeshyCredits({ game, op, ...(cap !== undefined ? { cap } : {}), ...(est ? { est: Number(est) } : {}) }, options));
      return 0;
    }
    if (sub === "config") {
      const setting = (value: string | undefined): CapSetting => (value === undefined ? undefined : value === "off" ? "off" : Number(value));
      const record = setMeshyCaps({ globalCap: setting(capFlag), gameCap: setting(gameCapFlag), ...(flag(argv, "--note") ? { note: flag(argv, "--note")! } : {}) }, flag(argv, "--ledger") ? { ledgerPath: resolve(io.cwd, flag(argv, "--ledger")!) } : {});
      io.stdout(JSON.stringify({ ...(record.global_cap !== undefined ? { globalCap: record.global_cap } : {}), ...(record.game_cap !== undefined ? { gameCap: record.game_cap } : {}) }));
      return 0;
    }
    if (sub === "baseline") {
      const exclude = flag(argv, "--exclude-keys")?.split(",").filter(Boolean) ?? [];
      const note = flag(argv, "--note") ? { note: flag(argv, "--note")! } : {};
      const total = flag(argv, "--pool-remaining");
      const record = total !== undefined
        ? recordMeshyBaseline({ totalRemaining: Number(total), excludeKeys: exclude }, { ...options, ...note })
        : recordMeshyBaseline(await readPool(argv, io), { ...options, excludeKeys: exclude, ...note });
      io.stdout(JSON.stringify({ baselineAt: record.ts, poolRemaining: record.pool_remaining, keys: Object.keys(record.pool_keys ?? {}).length, ledgerSpent: record.ledger_spent }));
      return 0;
    }
    if (sub === "reconcile" && flag(argv, "--rid") === undefined) {
      const result = reconcileWithPrism(await readPool(argv, io), { ...options, apply: argv.includes("--apply") });
      io.stdout(JSON.stringify(result));
      return 0;
    }
    if (sub === "settle" || sub === "reconcile") {
      const rid = flag(argv, "--rid");
      if (!rid) {
        io.stderr(LEDGER_USAGE);
        return 2;
      }
      const taskId = flag(argv, "--task-id");
      const exitCode = flag(argv, "--exit-code");
      const status = flag(argv, "--status") as SettleInput["status"] | undefined;
      let input: SettleInput;
      if (sub === "settle" && exitCode !== undefined) {
        input = classifyMeshyOutcome({ exitCode: Number(exitCode), ...(taskId ? { taskId } : {}), ...(flag(argv, "--task-status") ? { taskStatus: flag(argv, "--task-status")! } : {}), ...(flag(argv, "--error-text") ? { errorText: flag(argv, "--error-text")! } : {}) });
      } else if (status === "ok" || status === "failed" || status === "unconfirmed") {
        if (sub === "reconcile" && status === "unconfirmed") {
          io.stderr("reconcile settles an unconfirmed reservation to ok or failed.");
          return 2;
        }
        input = { status, ...(taskId ? { task_id: taskId } : {}), ...(flag(argv, "--actual") ? { actual: Number(flag(argv, "--actual")) } : {}), ...(flag(argv, "--note") ? { note: flag(argv, "--note")! } : {}) };
      } else {
        io.stderr(LEDGER_USAGE);
        return 2;
      }
      io.stdout(JSON.stringify(settleMeshyCredits(rid, input, options)));
      return 0;
    }
    if (sub === "list") {
      const game = flag(argv, "--game");
      const merged = new Map<string, MeshyLedgerRecord>();
      for (const record of readMeshyLedger(options)) if (!record.kind) merged.set(record.rid, { ...(merged.get(record.rid) ?? {}), ...record });
      for (const record of merged.values()) if (!game || record.game === game) io.stdout(JSON.stringify(record));
      return 0;
    }
    io.stderr(LEDGER_USAGE);
    return 2;
  } catch (error) {
    if (error instanceof MeshyLedgerError) {
      io.stderr(error.message);
      return error.code === "CAP_GLOBAL" || error.code === "CAP_GAME" ? 3 : 1;
    }
    throw error;
  }
}
