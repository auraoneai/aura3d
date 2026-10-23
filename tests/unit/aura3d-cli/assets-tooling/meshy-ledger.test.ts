import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  assertGameTag,
  classifyMeshyOutcome,
  meshyLedgerCommand,
  meshyLedgerTotals,
  prefixedName,
  readMeshyLedger,
  reserveMeshyCredits,
  settleMeshyCredits,
  summarizeMeshyLedger,
  MeshyLedgerError
} from "../../../../packages/aura3d-cli/src/commands/meshyLedger.js";

const dirs: string[] = [];
function ledger(globalCap = 100): { ledgerPath: string; globalCap: number } {
  const dir = mkdtempSync(join(tmpdir(), "aura3d-ledger-"));
  dirs.push(dir);
  return { ledgerPath: join(dir, "ledger.jsonl"), globalCap };
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("meshy ledger", () => {
  test("reserve, settle ok, and totals per game", () => {
    const options = ledger();
    const rid = reserveMeshyCredits({ game: "drift", op: "preview", cap: 50 }, options);
    expect(summarizeMeshyLedger(options)).toMatchObject({ spent: 20, left: 80, byGame: { drift: 20 } });
    settleMeshyCredits(rid, { status: "ok", task_id: "t1" }, options);
    reserveMeshyCredits({ game: "drift", op: "refine", cap: 50 }, options);
    reserveMeshyCredits({ game: "wind", op: "preview", cap: 50 }, options);
    expect(summarizeMeshyLedger(options)).toMatchObject({ spent: 50, byGame: { drift: 30, wind: 20 } });
  });

  test("a per-game cap and the global cap refuse before writing anything", () => {
    const options = ledger(45);
    reserveMeshyCredits({ game: "drift", op: "preview", cap: 30 }, options);
    const before = readMeshyLedger(options).length;
    expect(() => reserveMeshyCredits({ game: "drift", op: "preview", cap: 30 }, options)).toThrowError(/drift cap 30 would be exceeded/);
    reserveMeshyCredits({ game: "wind", op: "preview", cap: 100 }, options);
    expect(() => reserveMeshyCredits({ game: "wind", op: "refine", cap: 100 }, options)).toThrowError(/global cap 45 would be exceeded/);
    try {
      reserveMeshyCredits({ game: "wind", op: "refine", cap: 100 }, options);
    } catch (error) {
      expect((error as MeshyLedgerError).code).toBe("CAP_GLOBAL");
    }
    expect(readMeshyLedger(options).length).toBe(before + 1);
  });

  test("a rate-limited call stays unconfirmed and keeps counting until reconciled", () => {
    const options = ledger();
    const rid = reserveMeshyCredits({ game: "silt", op: "preview", cap: 100 }, options);
    expect(classifyMeshyOutcome({ exitCode: 6 })).toMatchObject({ status: "unconfirmed" });
    expect(classifyMeshyOutcome({ exitCode: 6, taskId: "abc" })).toMatchObject({ status: "unconfirmed", task_id: "abc" });
    settleMeshyCredits(rid, classifyMeshyOutcome({ exitCode: 6, taskId: "abc" }), options);
    expect(summarizeMeshyLedger(options)).toMatchObject({ spent: 20, unconfirmed: 20, unconfirmedRids: [rid] });
    settleMeshyCredits(rid, { status: "ok", task_id: "abc" }, options);
    expect(summarizeMeshyLedger(options)).toMatchObject({ spent: 20, unconfirmed: 0 });
  });

  test("only confirmed no-charge outcomes settle as failed (count 0), and failed is final", () => {
    const options = ledger();
    expect(classifyMeshyOutcome({ exitCode: 4 })).toMatchObject({ status: "failed" });
    expect(classifyMeshyOutcome({ exitCode: 9 })).toMatchObject({ status: "failed" });
    expect(classifyMeshyOutcome({ exitCode: 0, taskStatus: "FAILED", taskId: "x" })).toMatchObject({ status: "failed" });
    expect(classifyMeshyOutcome({ exitCode: 8 })).toMatchObject({ status: "unconfirmed" });
    expect(classifyMeshyOutcome({ exitCode: 0, taskId: "ok1" })).toMatchObject({ status: "ok" });
    const rid = reserveMeshyCredits({ game: "ninja", op: "refine", cap: 100 }, options);
    settleMeshyCredits(rid, { status: "failed", note: "validation" }, options);
    expect(summarizeMeshyLedger(options).spent).toBe(0);
    expect(() => settleMeshyCredits(rid, { status: "ok" }, options)).toThrowError(/cannot become ok/);
    expect(() => settleMeshyCredits("nope", { status: "ok" }, options)).toThrowError(/Unknown reservation/);
  });

  test("an actual cost overrides the estimate", () => {
    const options = ledger();
    const rid = reserveMeshyCredits({ game: "drift", op: "preview", cap: 100 }, options);
    settleMeshyCredits(rid, { status: "ok", actual: 12 }, options);
    expect(meshyLedgerTotals(readMeshyLedger(options)).byGame).toEqual({ drift: 12 });
  });

  test("game tags are required and names are game-prefixed", () => {
    expect(() => assertGameTag("Drift!")).toThrowError(/game\/project tag/);
    expect(() => reserveMeshyCredits({ game: "", op: "preview", cap: 10 }, ledger())).toThrowError(MeshyLedgerError);
    expect(prefixedName("drift", "lamp")).toBe("drift-lamp");
    expect(prefixedName("drift", "drift-lamp")).toBe("drift-lamp");
    expect(prefixedName("last-train", "last-train_tram")).toBe("last-train_tram");
    expect(() => prefixedName("drift", "../etc")).toThrowError(/must start with a letter/);
  });

  test("a stale lock left by a dead process is taken over", () => {
    const options = ledger();
    const lock = `${options.ledgerPath}.lock.d`;
    mkdirSync(lock, { recursive: true });
    writeFileSync(join(lock, "pid"), "999999");
    expect(reserveMeshyCredits({ game: "drift", op: "animate", cap: 10 }, options)).toMatch(/^\d+-/);
    expect(existsSync(lock)).toBe(false);
  });

  test("the CLI command round-trips reserve, settle by exit code, reconcile and status", async () => {
    const options = ledger(100);
    const out: string[] = [];
    const err: string[] = [];
    const io = { cwd: "/", stdout: (line: string) => out.push(line), stderr: (line: string) => err.push(line) };
    const base = ["--ledger", options.ledgerPath, "--global-cap", "100"];
    expect(await meshyLedgerCommand(["reserve", "--game", "wind", "--op", "preview", "--cap", "40", ...base], io)).toBe(0);
    const rid = out.pop()!;
    expect(await meshyLedgerCommand(["settle", "--rid", rid, "--exit-code", "6", ...base], io)).toBe(0);
    expect(JSON.parse(out.pop()!)).toMatchObject({ status: "unconfirmed" });
    expect(await meshyLedgerCommand(["reconcile", "--rid", rid, "--status", "ok", "--task-id", "t9", ...base], io)).toBe(0);
    expect(JSON.parse(out.pop()!)).toMatchObject({ status: "ok", task_id: "t9" });
    expect(await meshyLedgerCommand(["reserve", "--game", "wind", "--op", "preview", "--cap", "30", ...base], io)).toBe(3);
    expect(err.pop()).toMatch(/REFUSED/);
    expect(await meshyLedgerCommand(["status", ...base], io)).toBe(0);
    expect(JSON.parse(out.pop()!)).toMatchObject({ spent: 20, left: 80, unconfirmed: 0, byGame: { wind: 20 } });
    expect(await meshyLedgerCommand(["reserve", "--game", "wind", ...base], io)).toBe(2);
  });
});
