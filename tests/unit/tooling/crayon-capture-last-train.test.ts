import vm from "node:vm";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONTROLLER, EXPOSED_IDS, MODULE_MARKER, balanceInput, blobPatchSource, compareSessions, decodeInputs, driftFraction, encodeInputs, exposureSource, shouldBrake,
  type CaptureSession, type StepInput
} from "../../../tools/crayon-capture/last-train-lib";
import { buildReference, parseMarkerBlocks, validateSessions } from "../../../tools/crayon-capture/last-train-assemble";

const idle: StepInput = { accelerate: false, brake: false, reverse: false, left: false, right: false, cruisePace: null };
const session = (n: number, over: Partial<CaptureSession> = {}): CaptureSession => ({
  schema: "a3d-crayon-capture/1", session: n, constants: { passengerTable: [], legLengths: [1] }, inputs: "3x- 2xA/brisk", events: [{ step: 0, t: 0, kind: "phase", phase: "docked", leg: 0 }],
  trace: [[0, 0, 0]], loops: [1, 2, 3].map((loop) => ({ loop, steps: 10, seconds: 1, legs: [], score: 0, wallet: 0, heapUsedBytes: 5, stateKeys: { deliveredRides: 18, claimedRides: 28, arrivals: 14, trips: 10 } })),
  ...over
});

describe("last-train capture hook", () => {
  it("exposes lazy getters for every id and tolerates ids that do not exist yet", () => {
    const src = exposureSource(["WM", "Missing"]);
    const sandbox: Record<string, unknown> = {};
    vm.runInNewContext(`var globalThis_ = this; ${src.replace("globalThis.__a3d", "this.__a3d")}; function WM(){ return 1 }`, sandbox);
    const a3d = sandbox.__a3d as Record<string, unknown>;
    expect(typeof a3d.WM).toBe("function");
    expect(a3d.Missing).toBeUndefined();
    expect(EXPOSED_IDS).toContain("WM");
    expect(EXPOSED_IDS).toContain("GM");
  });

  it("patches only the large Blob part that contains the module marker (string and byte parts)", () => {
    const seen: { parts: unknown[] }[] = [];
    class FakeBlob { constructor(public parts: unknown[], public opts?: unknown) { seen.push(this); } }
    const sandbox = { window: { Blob: FakeBlob } as Record<string, unknown>, TextDecoder, ArrayBuffer, Uint8Array };
    vm.runInNewContext(blobPatchSource(MODULE_MARKER, "/*EXPOSE*/"), sandbox);
    const Patched = sandbox.window.Blob as new (parts: unknown[], opts?: unknown) => FakeBlob;
    const big = `${"x".repeat(600000)}${MODULE_MARKER}`;
    expect(new Patched([big]).parts[0]).toBe(`/*EXPOSE*/${big}`);
    const bytes = new TextEncoder().encode(big);
    expect(new Patched([bytes]).parts[0]).toBe(`/*EXPOSE*/${big}`);
    const small = `short ${MODULE_MARKER}`;
    expect(new Patched([small]).parts[0]).toBe(small);
    const unrelated = "y".repeat(600000);
    expect(new Patched([unrelated]).parts[0]).toBe(unrelated);
    expect(sandbox.window.__a3dPatchCount).toBe(2);
  });
});

describe("last-train capture controller and scripts", () => {
  it("balance presses left for positive roll and right for negative, with a dead band", () => {
    expect(balanceInput(0.3, 0, DEFAULT_CONTROLLER)).toEqual({ left: true, right: false });
    expect(balanceInput(-0.3, 0, DEFAULT_CONTROLLER)).toEqual({ left: false, right: true });
    expect(balanceInput(0.01, 0, DEFAULT_CONTROLLER)).toEqual({ left: false, right: false });
  });

  it("brakes only when moving and inside the stopping distance plus margin", () => {
    expect(shouldBrake(0.2, 1, DEFAULT_CONTROLLER)).toBe(false);
    expect(shouldBrake(8.2, 500, DEFAULT_CONTROLLER)).toBe(false);
    expect(shouldBrake(8.2, 20, DEFAULT_CONTROLLER)).toBe(false);
    expect(shouldBrake(8.2, 14, DEFAULT_CONTROLLER)).toBe(true);
  });

  it("input scripts round-trip run-length encoding", () => {
    const inputs: StepInput[] = [idle, idle, { ...idle, accelerate: true, cruisePace: "brisk" }, { ...idle, accelerate: true, cruisePace: "brisk", left: true }, { ...idle, brake: true }];
    const text = encodeInputs(inputs);
    expect(text).toBe("2x- 1xA/brisk 1xAL/brisk 1xB");
    expect(decodeInputs(text)).toEqual(inputs);
    expect(() => decodeInputs("nope")).toThrow();
  });

  it("driftFraction is the worst relative deviation from the first value", () => {
    expect(driftFraction([100, 100, 100])).toBe(0);
    expect(driftFraction([100, 104, 97])).toBeCloseTo(0.04, 9);
    expect(driftFraction([0, 1])).toBeNull();
    expect(driftFraction([100, null, 90])).toBeCloseTo(0.1, 9);
  });
});

describe("last-train capture assembly", () => {
  it("parses marker blocks including CRLF logs", () => {
    const body = JSON.stringify({ a: 1 });
    expect(parseMarkerBlocks(`noise\r\n@@CRAYON_CAPTURE_BEGIN:1\r\n${body}\r\n@@CRAYON_CAPTURE_END:1\r\n`)).toEqual([{ a: 1 }]);
    expect(parseMarkerBlocks(`@@CRAYON_CAPTURE_BEGIN:1\n${body}\n@@CRAYON_CAPTURE_END:1\n@@CRAYON_CAPTURE_BEGIN:2\n${body}\n@@CRAYON_CAPTURE_END:2`)).toHaveLength(2);
  });

  it("validates repeatability, loops and errors", () => {
    expect(validateSessions([session(1), session(2)])).toEqual([]);
    expect(validateSessions([session(1)]).join()).toMatch(/>= 2 sessions/);
    expect(validateSessions([session(1), session(2, { error: "boom" })]).join()).toMatch(/error: boom/);
    expect(validateSessions([session(1), session(2, { loops: [] })]).join()).toMatch(/0\/3 loops/);
    expect(validateSessions([session(1), session(2, { inputs: "9x-" })]).join()).toMatch(/input script differs/);
    expect(compareSessions(session(1), session(2, { trace: [[0, 0, 0.5]] })).maxTraceDelta).toBe(0.5);
  });

  it("builds a reference without the bulky passenger table and with flat state-size drift", () => {
    const ref = buildReference([session(1), session(2)], { sources: ["a.log"], generatedAt: "2026-10-23T00:00:00.000Z" }) as Record<string, unknown>;
    expect((ref.constants as Record<string, unknown>).passengerTable).toBeUndefined();
    const mem = ref.memory as { stateKeysDrift: Record<string, number | null> };
    expect(Object.values(mem.stateKeysDrift).every((d) => d === 0)).toBe(true);
    expect((ref.repeatability as { sessions: number }).sessions).toBe(2);
  });
});
