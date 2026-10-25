import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  checkMeshyBudget,
  classifyMeshyOutcome,
  DEFAULT_MESHY_GAME_CAP,
  fetchPrismPool,
  meshyLedgerCommand,
  parsePrismPool,
  readMeshyLedger,
  reconcileWithPrism,
  recordMeshyBaseline,
  reserveMeshyCredits,
  setMeshyCaps,
  settleMeshyCredits,
  summarizeMeshyLedger,
  MeshyLedgerError
} from "../../../../packages/aura3d-cli/src/commands/meshyLedger.js";

const dirs: string[] = [];
function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "aura3d-ledger-rec-"));
  dirs.push(dir);
  return dir;
}
function ledger(globalCap = 1000): { ledgerPath: string; globalCap: number } {
  return { ledgerPath: join(tmp(), "ledger.jsonl"), globalCap };
}
const pool = (remaining: Record<string, number>) => ({ keys: Object.entries(remaining).map(([id, value]) => ({ id, state: "ok", remaining: value })) });
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("meshy ledger hard stops", () => {
  test("the per-game cap defaults to 420 and refuses with the remaining credits and the flag that raises it", () => {
    const options = ledger(5000);
    expect(DEFAULT_MESHY_GAME_CAP).toBe(420);
    for (let i = 0; i < 14; i += 1) reserveMeshyCredits({ game: "ninja", op: "preview" }, options);
    expect(summarizeMeshyLedger(options).byGame.ninja).toBe(280);
    for (let i = 0; i < 7; i += 1) reserveMeshyCredits({ game: "ninja", op: "refine" }, options);
    expect(summarizeMeshyLedger(options).byGame.ninja).toBe(350);
    for (let i = 0; i < 3; i += 1) reserveMeshyCredits({ game: "ninja", op: "remesh" }, options);
    for (let i = 0; i < 12; i += 1) reserveMeshyCredits({ game: "ninja", op: "animate" }, options);
    expect(summarizeMeshyLedger(options).byGame.ninja).toBe(401);
    const before = readMeshyLedger(options).length;
    let error: MeshyLedgerError | undefined;
    try {
      reserveMeshyCredits({ game: "ninja", op: "preview" }, options);
    } catch (caught) {
      error = caught as MeshyLedgerError;
    }
    expect(error?.code).toBe("CAP_GAME");
    expect(error?.message).toMatch(/REFUSED: ninja cap 420 would be exceeded \(spent 401, need 20, 19 left under the cap\)/);
    expect(error?.message).toMatch(/--cap 421/);
    expect(error?.message).toMatch(/AURA3D_MESHY_GAME_CAP=421/);
    expect(readMeshyLedger(options).length).toBe(before);
  });

  test("an explicit --cap or AURA3D_MESHY_GAME_CAP raises the cap on purpose", () => {
    const options = { ...ledger(5000), gameCap: 40 };
    reserveMeshyCredits({ game: "silt", op: "preview" }, options);
    reserveMeshyCredits({ game: "silt", op: "preview" }, options);
    expect(() => reserveMeshyCredits({ game: "silt", op: "preview" }, options)).toThrowError(/silt cap 40/);
    expect(reserveMeshyCredits({ game: "silt", op: "preview", cap: 60 }, options)).toMatch(/^\d+-/);
    vi.stubEnv("AURA3D_MESHY_GAME_CAP", "100");
    expect(reserveMeshyCredits({ game: "wind", op: "preview" }, { ledgerPath: options.ledgerPath, globalCap: 5000 })).toMatch(/^\d+-/);
    expect(checkMeshyBudget({ game: "wind", ops: ["preview"] }, { ledgerPath: options.ledgerPath, globalCap: 5000 }).gameCap).toBe(100);
  });

  test("a tag already over its cap (legacy spend) is refused with 0 left, never silently allowed", () => {
    const options = ledger(5000);
    const rid = reserveMeshyCredits({ game: "drift", op: "preview", cap: 1000 }, options);
    settleMeshyCredits(rid, { status: "ok", actual: 500 }, options);
    const check = checkMeshyBudget({ game: "drift", ops: ["animate"] }, options);
    expect(check).toMatchObject({ allowed: false, gameLeft: 0, gameSpent: 500, gameCap: 420 });
    expect(check.refusal?.message).toMatch(/0 left under the cap/);
    expect(summarizeMeshyLedger(options).overCap).toEqual({ drift: 500 });
  });

  test("the global cap hard-stops and names the way to raise it", () => {
    const options = ledger(25);
    reserveMeshyCredits({ game: "wind", op: "preview" }, options);
    expect(() => reserveMeshyCredits({ game: "silt", op: "refine" }, options)).toThrowError(/global cap 25 would be exceeded \(spent 20, need 10, 5 left\).*--global-cap/);
  });

  test("ledger-internal tags cannot be reserved", () => {
    expect(() => reserveMeshyCredits({ game: "unattributed", op: "preview" }, ledger())).toThrowError(/ledger-internal/);
  });
});

describe("meshy ledger dry run", () => {
  test("shows the cost of a chain and the remaining credits without writing", async () => {
    const options = ledger(1000);
    const out: string[] = [];
    const err: string[] = [];
    const io = { cwd: "/", stdout: (line: string) => out.push(line), stderr: (line: string) => err.push(line) };
    const base = ["--ledger", options.ledgerPath, "--global-cap", "1000"];
    expect(await meshyLedgerCommand(["reserve", "--dry-run", "--game", "serpentine", "--op", "preview,refine,rigging", ...base], io)).toBe(0);
    expect(JSON.parse(out.pop()!)).toMatchObject({ dryRun: true, allowed: true, cost: 35, gameLeft: 420, globalLeft: 1000, ops: ["preview", "refine", "rigging"] });
    expect(readMeshyLedger(options)).toEqual([]);
    expect(await meshyLedgerCommand(["reserve", "--dry-run", "--game", "serpentine", "--op", "preview,refine", "--cap", "20", ...base], io)).toBe(3);
    expect(JSON.parse(out.pop()!)).toMatchObject({ allowed: false, cost: 30 });
    expect(err.pop()).toMatch(/REFUSED: serpentine cap 20/);
    expect(readMeshyLedger(options)).toEqual([]);
  });
});

describe("meshy ledger rate-limit accounting", () => {
  test("a 429 on a poll keeps the task and counts it; a 429 on a create is not charged", () => {
    const poll = classifyMeshyOutcome({ exitCode: 6, errorText: 'error: meshy api 429 on /text-to-3d/01a169b2-bed8-72b0-b17a-32f59f5b8914: {"detail":"rate_limited"}' });
    expect(poll).toMatchObject({ status: "unconfirmed", task_id: "01a169b2-bed8-72b0-b17a-32f59f5b8914" });
    const create = classifyMeshyOutcome({ exitCode: 6, errorText: 'error: meshy api 429 on /text-to-3d: {"detail":"rate_limited"}' });
    expect(create.status).toBe("failed");
    expect(classifyMeshyOutcome({ exitCode: 6, errorText: "error: meshy api 429 on /remesh/0199aaaa-bbbb-cccc: x" })).toMatchObject({ status: "unconfirmed" });
    expect(classifyMeshyOutcome({ exitCode: 8 })).toMatchObject({ status: "unconfirmed" });
    expect(classifyMeshyOutcome({ exitCode: 3 })).toMatchObject({ status: "failed" });
  });

  test("the legacy helper bug: a rate-limited poll settled as failed hid a charged task; unconfirmed keeps counting", () => {
    const options = ledger();
    const rid = reserveMeshyCredits({ game: "last-train", op: "preview" }, options);
    settleMeshyCredits(rid, classifyMeshyOutcome({ exitCode: 6, errorText: "meshy api 429 on /text-to-3d/0199aaaa-bbbb-cccc-dddd: rate_limited" }), options);
    expect(summarizeMeshyLedger(options)).toMatchObject({ spent: 20, unconfirmed: 20 });
    settleMeshyCredits(rid, { status: "ok", task_id: "0199aaaa-bbbb-cccc-dddd" }, options);
    expect(summarizeMeshyLedger(options)).toMatchObject({ spent: 20, unconfirmed: 0 });
  });

  test("settle --error-text round-trips through the CLI", async () => {
    const options = ledger();
    const out: string[] = [];
    const io = { cwd: "/", stdout: (line: string) => out.push(line), stderr: () => undefined };
    const base = ["--ledger", options.ledgerPath];
    await meshyLedgerCommand(["reserve", "--game", "heatsink", "--op", "refine", ...base], io);
    const rid = out.pop()!;
    expect(await meshyLedgerCommand(["settle", "--rid", rid, "--exit-code", "6", "--error-text", "meshy api 429 on /text-to-3d/0199aaaa-bbbb-cccc-dddd: x", ...base], io)).toBe(0);
    expect(JSON.parse(out.pop()!)).toMatchObject({ status: "unconfirmed", task_id: "0199aaaa-bbbb-cccc-dddd" });
  });
});

describe("meshy ledger reconcile against Prism (mocked, no network, no spend)", () => {
  test("parsePrismPool reads masked ids and remaining, and rejects malformed pools", () => {
    expect(parsePrismPool(pool({ "meshy-01-aaaaaa": 300, "meshy-02-bbbbbb": 100 }))).toEqual({ remaining: 400, keys: { "meshy-01-aaaaaa": 300, "meshy-02-bbbbbb": 100 } });
    expect(() => parsePrismPool({ keys: [] })).toThrowError(MeshyLedgerError);
    expect(() => parsePrismPool({ keys: [{ id: "x" }] })).toThrowError(/numeric remaining/);
  });

  test("fetchPrismPool sends the key only as a header and scrubs it from errors", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer sekret-key");
      return new Response(JSON.stringify(pool({ "meshy-01-aaaaaa": 50 })), { status: 200 });
    });
    await expect(fetchPrismPool({ key: "sekret-key", baseUrl: "https://prism.example/", fetchImpl: fetchImpl as unknown as typeof fetch })).resolves.toMatchObject({ remaining: 50 });
    expect(String(fetchImpl.mock.calls[0]![0])).toBe("https://prism.example/admin/meshy");
    const failing = vi.fn(async () => {
      throw new Error("connect failed to https://x/?k=sekret-key");
    });
    const error = await fetchPrismPool({ key: "sekret-key", fetchImpl: failing as unknown as typeof fetch }).catch((caught) => caught as Error);
    expect(error.message).not.toContain("sekret-key");
    expect(error.message).toContain("<redacted>");
    const denied = vi.fn(async () => new Response("no", { status: 401 }));
    await expect(fetchPrismPool({ key: "sekret-key", fetchImpl: denied as unknown as typeof fetch })).rejects.toThrowError(/HTTP 401/);
  });

  test("reconcile prints the delta, ignores keys added after the baseline, and flags top-ups", () => {
    const options = ledger(10000);
    recordMeshyBaseline(parsePrismPool(pool({ a: 1000, b: 1000, c: 500 })), options);
    const rid = reserveMeshyCredits({ game: "drift", op: "preview" }, options);
    settleMeshyCredits(rid, { status: "ok" }, options);
    reserveMeshyCredits({ game: "drift", op: "refine" }, options);
    const now = parsePrismPool(pool({ a: 940, b: 1000, c: 700, d: 1310 }));
    const result = reconcileWithPrism(now, options);
    expect(result).toMatchObject({ ledgerSpent: 30, prismSpent: 60, delta: 30, keysAddedSinceBaseline: ["d"], keysToppedUp: ["c"], poolRemaining: 3950, leftUnderCap: 9940 });
    expect(summarizeMeshyLedger(options).spent).toBe(30);
  });

  test("--apply books the delta once as an unattributed adjustment that counts toward the global cap only", () => {
    const options = ledger(200);
    recordMeshyBaseline(parsePrismPool(pool({ a: 1000 })), options);
    reserveMeshyCredits({ game: "drift", op: "preview" }, options);
    const now = parsePrismPool(pool({ a: 900 }));
    expect(reconcileWithPrism(now, { ...options, apply: true })).toMatchObject({ delta: 80, applied: 80 });
    expect(summarizeMeshyLedger(options)).toMatchObject({ spent: 100, byGame: { drift: 20, unattributed: 80 }, left: 100, overCap: {} });
    expect(reconcileWithPrism(now, { ...options, apply: true })).toMatchObject({ delta: 0 });
    expect(summarizeMeshyLedger(options).spent).toBe(100);
    expect(() => reserveMeshyCredits({ game: "drift", op: "preview", cap: 1000 }, { ...options, globalCap: 110 })).toThrowError(/global cap 110/);
  });

  test("a total-only legacy baseline compares the pool without the keys that joined later", () => {
    const options = ledger(10000);
    recordMeshyBaseline({ totalRemaining: 2000, excludeKeys: ["new1", "new2"] }, options);
    reserveMeshyCredits({ game: "drift", op: "preview" }, options);
    const now = parsePrismPool(pool({ a: 900, b: 1000, new1: 310, new2: 1000 }));
    expect(reconcileWithPrism(now, options)).toMatchObject({ ledgerSpent: 20, prismSpent: 100, delta: 80, keysAddedSinceBaseline: ["new1", "new2"] });
  });

  test("a later baseline only compares the spend after it", () => {
    const options = ledger(10000);
    reserveMeshyCredits({ game: "drift", op: "preview" }, options);
    recordMeshyBaseline(parsePrismPool(pool({ a: 500 })), options);
    reserveMeshyCredits({ game: "drift", op: "refine" }, options);
    expect(reconcileWithPrism(parsePrismPool(pool({ a: 490 })), options)).toMatchObject({ ledgerSpent: 10, prismSpent: 10, delta: 0 });
    expect(summarizeMeshyLedger(options).spent).toBe(30);
  });

  test("config persists the caps in the ledger; flag and env override them; config records never count as spend", async () => {
    const options = { ledgerPath: join(tmp(), "ledger.jsonl") };
    expect(summarizeMeshyLedger(options)).toMatchObject({ globalCap: 1000, gameCap: 420 });
    setMeshyCaps({ globalCap: 10000, gameCap: 500, note: "owner authorised 10,000 on 2026-10-23" }, options);
    expect(summarizeMeshyLedger(options)).toMatchObject({ globalCap: 10000, gameCap: 500, spent: 0 });
    expect(summarizeMeshyLedger({ ...options, globalCap: 50 })).toMatchObject({ globalCap: 50, gameCap: 500 });
    vi.stubEnv("AURA3D_MESHY_GAME_CAP", "100");
    expect(summarizeMeshyLedger(options)).toMatchObject({ gameCap: 100, globalCap: 10000 });
    vi.unstubAllEnvs();
    expect(() => setMeshyCaps({}, options)).toThrowError(/config needs/);
    expect(() => setMeshyCaps({ globalCap: -1 }, options)).toThrowError(/positive/);
    const out: string[] = [];
    const io = { cwd: "/", stdout: (line: string) => out.push(line), stderr: () => undefined };
    expect(await meshyLedgerCommand(["config", "--global-cap", "7000", "--ledger", options.ledgerPath], io)).toBe(0);
    expect(JSON.parse(out.pop()!)).toEqual({ globalCap: 7000 });
    expect(summarizeMeshyLedger(options)).toMatchObject({ globalCap: 7000, gameCap: 500 });
    expect(reserveMeshyCredits({ game: "wind", op: "preview" }, options)).toMatch(/^\d+-/);
    expect(summarizeMeshyLedger(options).spent).toBe(20);
  });

  test("reconcile without a baseline says how to record one; baseline excludes listed keys", () => {
    const options = ledger();
    expect(() => reconcileWithPrism(parsePrismPool(pool({ a: 1 })), options)).toThrowError(/No baseline/);
    const baseline = recordMeshyBaseline(parsePrismPool(pool({ a: 100, b: 900 })), { ...options, excludeKeys: ["b"] });
    expect(baseline.pool_remaining).toBe(100);
    expect(summarizeMeshyLedger(options).spent).toBe(0);
  });

  test("the CLI baseline and reconcile subcommands read a saved pool file", async () => {
    const options = ledger(1000);
    const dir = tmp();
    writeFileSync(join(dir, "before.json"), JSON.stringify(pool({ a: 500, b: 500 })));
    writeFileSync(join(dir, "after.json"), JSON.stringify(pool({ a: 470, b: 500 })));
    const out: string[] = [];
    const err: string[] = [];
    const io = { cwd: dir, stdout: (line: string) => out.push(line), stderr: (line: string) => err.push(line) };
    const base = ["--ledger", options.ledgerPath, "--global-cap", "1000"];
    expect(await meshyLedgerCommand(["baseline", "--pool-json", "before.json", ...base], io)).toBe(0);
    expect(JSON.parse(out.pop()!)).toMatchObject({ poolRemaining: 1000, keys: 2 });
    await meshyLedgerCommand(["reserve", "--game", "apex", "--op", "preview", ...base], io);
    out.pop();
    expect(await meshyLedgerCommand(["reconcile", "--pool-json", "after.json", ...base], io)).toBe(0);
    expect(JSON.parse(out.pop()!)).toMatchObject({ ledgerSpent: 20, prismSpent: 30, delta: 10 });
    expect(await meshyLedgerCommand(["list", ...base], io)).toBe(0);
    expect(out.map((line) => JSON.parse(line)).every((row) => row.kind !== "baseline")).toBe(true);
    delete process.env.AURA3D_PRISM_KEY;
    delete process.env.AURA3D_PRISM_KEY_FILE;
    expect(await meshyLedgerCommand(["reconcile", ...base], io)).toBe(1);
    expect(err.pop()).toMatch(/AURA3D_PRISM_KEY/);
  });
});
