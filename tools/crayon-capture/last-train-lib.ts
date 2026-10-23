/**
 * tools/crayon-capture/last-train-lib — pure helpers for the Last Train to the Sea reference capture.
 *
 * The original game exposes no QA hooks. The capture patches the game's own module text as it is
 * turned into a Blob (`BLOB_PATCH_SOURCE`) so the module's pure state functions (`WM` step, `GM`
 * door/depart action, `FM` state constructor, route sampler `Cu`, ...) become reachable as
 * `window.__a3d`, then steps them headlessly at exactly 1/60 s from a closed-loop controller whose
 * per-step inputs are recorded. Nothing here evaluates third-party code outside the browser.
 */

export const LAST_TRAIN_SCHEMA = "a3d-crayon-capture/1";
export const SIM_STEP = 1 / 60;
export const MODULE_MARKER = "src/service/economy.js";

/** Minified ids in the hash-pinned module (SHA-256 62fb7ac5...928ca); see tests/fixtures/crayon/last-train/PROVENANCE.md. */
export const EXPOSED_IDS = [
  "WM", "GM", "FM", "Cu", "tu", "Jh", "B_", "Ww", "Yx", "jx", "$x", "qx", "cM", "lM", "mx",
  "TM", "EM", "kM", "AM", "RM", "CM", "Kx", "g_", "u_", "zx", "K_", "H_", "V_", "G_", "mM", "dM", "W_", "ef"
] as const;

/** Source prepended to the game module: lazy getters, so ids assigned later by the bundle's lazy inits resolve on access. */
export function exposureSource(ids: readonly string[] = EXPOSED_IDS): string {
  const getters = ids.map((id) => `get ${JSON.stringify(id)}(){try{return ${id}}catch(e){return undefined}}`).join(",");
  return `globalThis.__a3d={${getters}};\n`;
}

/**
 * Pre-boot hook: wraps `Blob` so the game module text (any string part, or a large Uint8Array/ArrayBuffer
 * part) that contains the economy module marker gets the exposure source prepended. Runs in every frame
 * including the sandboxed about:srcdoc game iframe (context.addInitScript).
 */
export function blobPatchSource(marker: string = MODULE_MARKER, exposure: string = exposureSource()): string {
  return `(function () {
  if (window.__a3dBlobPatched) return;
  window.__a3dBlobPatched = true;
  var NativeBlob = window.Blob;
  var marker = ${JSON.stringify(marker)};
  var exposure = ${JSON.stringify(exposure)};
  var patched = 0;
  function PatchedBlob(parts, opts) {
    try {
      if (parts && parts.length) {
        var out = [];
        for (var i = 0; i < parts.length; i++) {
          var p = parts[i];
          if (typeof p === "string" && p.length > 500000 && p.indexOf(marker) >= 0) { out.push(exposure + p); patched++; continue; }
          if ((p instanceof ArrayBuffer || ArrayBuffer.isView(p)) && p.byteLength > 500000) {
            var text = new TextDecoder().decode(p);
            if (text.indexOf(marker) >= 0) { out.push(exposure + text); patched++; continue; }
          }
          out.push(p);
        }
        parts = out;
      }
    } catch (e) { /* fall through to the native Blob */ }
    return new NativeBlob(parts, opts);
  }
  PatchedBlob.prototype = NativeBlob.prototype;
  Object.defineProperty(window, "Blob", { value: PatchedBlob, configurable: true, writable: true });
  Object.defineProperty(window, "__a3dPatchCount", { get: function () { return patched; } });
})()`;
}

export interface StepInput {
  readonly accelerate: boolean;
  readonly brake: boolean;
  readonly reverse: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly cruisePace: string | null;
}

export interface ControllerParams {
  /** Roll PD gains: u = -(kRoll*roll + kVel*rollVelocity); press a side when |u| exceeds `deadband`. */
  readonly kRoll: number;
  readonly kVel: number;
  readonly deadband: number;
  /** Cruise pace key of the game's `AM` table (slow/easy 4.8, cruise/brisk 8.2, fast 12.5). */
  readonly pace: string;
  /** Brake when the remaining leg distance is below speed^2 / (2 * decel) + margin. */
  readonly brakeDecel: number;
  readonly brakeMargin: number;
}

export const DEFAULT_CONTROLLER: ControllerParams = { kRoll: 6, kVel: 1.2, deadband: 0.15, pace: "brisk", brakeDecel: 4, brakeMargin: 6 };

/** Balance decision from roll and roll velocity: left presses reduce a positive roll (E2 = right - left). */
export function balanceInput(roll: number, rollVelocity: number, p: ControllerParams): { left: boolean; right: boolean } {
  const u = -(p.kRoll * roll + p.kVel * rollVelocity);
  return { left: u < -p.deadband, right: u > p.deadband };
}

export function shouldBrake(speed: number, remaining: number, p: ControllerParams): boolean {
  return speed > 0.5 && remaining < (speed * speed) / (2 * p.brakeDecel) + p.brakeMargin;
}

/** Run-length encode booleans and pace into `<steps>x[ABRLP]/<pace>` segments. */
export function encodeInputs(inputs: readonly StepInput[]): string {
  const key = (i: StepInput): string => `${i.accelerate ? "A" : ""}${i.brake ? "B" : ""}${i.reverse ? "R" : ""}${i.left ? "L" : ""}${i.right ? "P" : ""}${i.accelerate && i.cruisePace ? `/${i.cruisePace}` : ""}` || "-";
  const out: string[] = [];
  let prev = "";
  let n = 0;
  for (const i of inputs) {
    const k = key(i);
    if (k === prev) { n++; continue; }
    if (n) out.push(`${n}x${prev}`);
    prev = k;
    n = 1;
  }
  if (n) out.push(`${n}x${prev}`);
  return out.join(" ");
}

export function decodeInputs(text: string): StepInput[] {
  const out: StepInput[] = [];
  for (const seg of text.split(/\s+/).filter(Boolean)) {
    const m = /^(\d+)x(.*)$/.exec(seg);
    if (!m) throw new Error(`bad input segment: ${seg}`);
    const [flags, pace] = (m[2] as string).split("/");
    const f = flags === "-" ? "" : (flags as string);
    const input: StepInput = {
      accelerate: f.includes("A"), brake: f.includes("B"), reverse: f.includes("R"), left: f.includes("L"), right: f.includes("P"),
      cruisePace: pace ?? null
    };
    for (let k = 0; k < Number(m[1]); k++) out.push(input);
  }
  return out;
}

export interface SessionEvent { readonly step: number; readonly t: number; readonly kind: string; readonly [key: string]: unknown }

export interface LoopSummary {
  readonly loop: number;
  readonly steps: number;
  readonly seconds: number;
  readonly legs: readonly { leg: number; steps: number; seconds: number; fares: number; tips: number; lost: number; aboard: number; catches: number }[];
  readonly score: number;
  readonly wallet: number;
  readonly heapUsedBytes: number | null;
  readonly stateKeys: { readonly deliveredRides: number; readonly claimedRides: number; readonly arrivals: number; readonly trips: number };
}

/** Drift of a numeric series against its first element as a fraction (null when the first is 0 or missing). */
export function driftFraction(series: readonly (number | null)[]): number | null {
  const first = series[0];
  if (first == null || first === 0) return null;
  let worst = 0;
  for (const v of series) if (v != null) worst = Math.max(worst, Math.abs(v - first) / Math.abs(first));
  return worst;
}

export interface CaptureSession {
  readonly schema: string;
  readonly session: number;
  readonly constants: Record<string, unknown>;
  readonly route?: Record<string, unknown>;
  readonly inputs: string;
  readonly events: readonly SessionEvent[];
  readonly trace: readonly unknown[];
  readonly loops: readonly LoopSummary[];
  readonly error?: string;
}

/** Fields of two sessions' run that must agree for the capture to count as repeatable. */
export function compareSessions(a: CaptureSession, b: CaptureSession): { identicalInputs: boolean; identicalEvents: boolean; maxTraceDelta: number } {
  const ev = (s: CaptureSession): string => JSON.stringify(s.events.map((e) => [e.step, e.kind, e.phase ?? null, e.leg ?? null]));
  let maxTraceDelta = 0;
  const n = Math.min(a.trace.length, b.trace.length);
  for (let i = 0; i < n; i++) {
    const x = a.trace[i] as number[];
    const y = b.trace[i] as number[];
    for (let k = 0; k < Math.min(x.length, y.length); k++) maxTraceDelta = Math.max(maxTraceDelta, Math.abs((x[k] as number) - (y[k] as number)));
  }
  return { identicalInputs: a.inputs === b.inputs, identicalEvents: ev(a) === ev(b), maxTraceDelta };
}
