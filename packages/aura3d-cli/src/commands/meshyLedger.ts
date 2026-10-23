/**
 * `aura3d meshy ledger` — a local credit ledger for paid Meshy generation.
 *
 * Bookkeeping only: this module never talks to Meshy and never reads, prints or stores a credential. A wrapper that
 * calls Meshy (for example through Kiro Prism) reserves credits here BEFORE a paid call and settles the record after.
 * Per-game caps and one global cap are enforced under a lock, so many agents or shells can share one ledger.
 *
 * Lessons baked in:
 *  - A rate-limited or timed-out poll does not mean the task failed: the task usually finishes and is charged.
 *    Such a call settles as `unconfirmed` and keeps counting its estimate until `reconcile` proves otherwise.
 *  - Only a confirmed no-charge outcome (auth/validation/credit errors, a FAILED task) settles as `failed` (counts 0).
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
  readonly status: MeshyLedgerStatus;
  readonly game?: string;
  readonly op?: string;
  readonly est?: number;
  readonly actual?: number;
  readonly task_id?: string;
  readonly note?: string;
}

export interface MeshyLedgerOptions {
  /** Defaults to $AURA3D_MESHY_LEDGER, then ~/.aura3d/meshy-ledger.jsonl. */
  readonly ledgerPath?: string;
  /** Total credits the whole ledger may spend. Defaults to $AURA3D_MESHY_GLOBAL_CAP, then 1000. */
  readonly globalCap?: number;
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

export const DEFAULT_MESHY_GLOBAL_CAP = 1000;
const GAME_TAG = /^[a-z][a-z0-9-]{1,39}$/;
const STALE_LOCK_MS = 60_000;

export class MeshyLedgerError extends Error {
  constructor(readonly code: "CAP_GLOBAL" | "CAP_GAME" | "BAD_GAME_TAG" | "BAD_RECORD" | "UNKNOWN_RID" | "BAD_TRANSITION" | "LOCK_TIMEOUT", message: string) {
    super(message);
    this.name = "MeshyLedgerError";
  }
}

export function defaultLedgerPath(): string {
  return process.env.AURA3D_MESHY_LEDGER ?? resolve(homedir(), ".aura3d", "meshy-ledger.jsonl");
}

function resolveOptions(options: MeshyLedgerOptions): Required<Omit<MeshyLedgerOptions, "now">> & { readonly now: () => Date } {
  const envCap = Number(process.env.AURA3D_MESHY_GLOBAL_CAP);
  return {
    ledgerPath: resolve(options.ledgerPath ?? defaultLedgerPath()),
    globalCap: options.globalCap ?? (Number.isFinite(envCap) && envCap > 0 ? envCap : DEFAULT_MESHY_GLOBAL_CAP),
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

function withLock<T>(resolved: ReturnType<typeof resolveOptions>, fn: () => T): T {
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
  for (const record of records) byRid.set(record.rid, { ...(byRid.get(record.rid) ?? {}), ...record });
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
  /** Per-game cap for this call; the call is refused when the game's spend plus `est` would exceed it. */
  readonly cap: number;
}

/** Reserve credits before a paid call. Throws MeshyLedgerError (CAP_GLOBAL / CAP_GAME) without writing when over a cap. */
export function reserveMeshyCredits(input: ReserveInput, options: MeshyLedgerOptions = {}): string {
  const resolved = resolveOptions(options);
  const game = assertGameTag(input.game);
  const est = input.est ?? MESHY_CREDIT_ESTIMATES[input.op];
  if (est === undefined || !Number.isFinite(est) || est < 0) throw new MeshyLedgerError("BAD_RECORD", `No credit estimate for op "${input.op}"; pass an explicit estimate.`);
  if (!Number.isFinite(input.cap) || input.cap <= 0) throw new MeshyLedgerError("BAD_RECORD", "A positive per-game cap is required.");
  return withLock(resolved, () => {
    const totals = meshyLedgerTotals(readMeshyLedger(resolved));
    const gameSpent = totals.byGame[game] ?? 0;
    if (totals.spent + est > resolved.globalCap) {
      throw new MeshyLedgerError("CAP_GLOBAL", `REFUSED: global cap ${resolved.globalCap} would be exceeded (spent ${totals.spent}, need ${est}).`);
    }
    if (gameSpent + est > input.cap) {
      throw new MeshyLedgerError("CAP_GAME", `REFUSED: ${game} cap ${input.cap} would be exceeded (spent ${gameSpent}, need ${est}).`);
    }
    const rid = `${resolved.now().getTime()}-${Math.random().toString(36).slice(2, 8)}`;
    const record: MeshyLedgerRecord = { ts: resolved.now().toISOString(), rid, game, op: input.op, est, status: "reserved" };
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
}

/**
 * Decide how a finished Meshy call settles. A rate limit or timeout without a confirmed result is NOT a failure:
 * the task may already be charged, so it stays `unconfirmed` (counted) until a `get` confirms it.
 */
export function classifyMeshyOutcome(outcome: MeshyCallOutcome): SettleInput {
  const taskStatus = outcome.taskStatus?.toUpperCase();
  if (taskStatus === "FAILED" || taskStatus === "CANCELED") return { status: "failed", task_id: outcome.taskId, note: `task ${taskStatus}` };
  if (taskStatus === "SUCCEEDED") return { status: "ok", task_id: outcome.taskId };
  if (outcome.exitCode === 0) return { status: "ok", task_id: outcome.taskId };
  if (outcome.taskId) return { status: "unconfirmed", task_id: outcome.taskId, note: `exit ${outcome.exitCode}; task exists, resume with get before paying again` };
  if ([3, 4, 9].includes(outcome.exitCode)) return { status: "failed", note: `exit ${outcome.exitCode}: rejected before a task was created` };
  return { status: "unconfirmed", note: `exit ${outcome.exitCode}: no task id seen (rate limit or timeout); verify before treating as failed` };
}

export function summarizeMeshyLedger(options: MeshyLedgerOptions = {}): { readonly globalCap: number; readonly spent: number; readonly left: number; readonly unconfirmed: number; readonly unconfirmedRids: readonly string[]; readonly byGame: Readonly<Record<string, number>> } {
  const resolved = resolveOptions(options);
  const totals = meshyLedgerTotals(readMeshyLedger(resolved));
  return { globalCap: resolved.globalCap, spent: totals.spent, left: resolved.globalCap - totals.spent, unconfirmed: totals.unconfirmed, unconfirmedRids: totals.unconfirmedRids, byGame: totals.byGame };
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
  "aura3d meshy ledger status|reserve|settle|reconcile|list [--ledger path] [--global-cap N]\n" +
  "  reserve   --game <tag> --op preview|refine|remesh|rigging|animate|retexture [--est N] --cap N   (prints the reservation id)\n" +
  "  settle    --rid <id> --status ok|failed|unconfirmed [--task-id T] [--actual N] [--note text]\n" +
  "  settle    --rid <id> --exit-code N [--task-id T] [--task-status SUCCEEDED|FAILED|...]          (classified: a rate limit stays unconfirmed)\n" +
  "  reconcile --rid <id> --status ok|failed [--task-id T] [--actual N]\n" +
  "  list      [--game <tag>]";

export async function meshyLedgerCommand(argv: readonly string[], io: CliIo): Promise<number> {
  const sub = argv[0];
  const capFlag = flag(argv, "--global-cap");
  const options: MeshyLedgerOptions = {
    ...(flag(argv, "--ledger") ? { ledgerPath: resolve(io.cwd, flag(argv, "--ledger")!) } : {}),
    ...(capFlag ? { globalCap: Number(capFlag) } : {})
  };
  try {
    if (sub === "status" || sub === undefined) {
      io.stdout(JSON.stringify(summarizeMeshyLedger(options)));
      return 0;
    }
    if (sub === "reserve") {
      const game = flag(argv, "--game");
      const op = flag(argv, "--op");
      const cap = Number(flag(argv, "--cap"));
      if (!game || !op || !Number.isFinite(cap)) {
        io.stderr(LEDGER_USAGE);
        return 2;
      }
      const est = flag(argv, "--est");
      io.stdout(reserveMeshyCredits({ game, op, cap, ...(est ? { est: Number(est) } : {}) }, options));
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
        input = classifyMeshyOutcome({ exitCode: Number(exitCode), ...(taskId ? { taskId } : {}), ...(flag(argv, "--task-status") ? { taskStatus: flag(argv, "--task-status")! } : {}) });
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
      for (const record of readMeshyLedger(options)) merged.set(record.rid, { ...(merged.get(record.rid) ?? {}), ...record });
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
