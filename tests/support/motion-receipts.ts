// Shared by the browser receipt specs (animation + physics at the root) and their unit test.
// A receipt is the 3.5 schema from the beat-three.js PRD: one JSON per capability and version
// plus the PNG frames it cites. Remote ACR runs cannot egress files, so a spec prints the
// receipt to the run log between markers and `tools/receipts/extract-acr-receipts.mjs`
// writes it under evidence/receipts/ from that log.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface ReceiptFrame {
  /** Path relative to the repository root, under evidence/receipts/<capability>/. */
  readonly file: string;
  /** sha256 of the PNG bytes at `file`. */
  readonly sha256: string;
  /** Mean Rec. 709 luma of the frame's sRGB bytes, 0..255. */
  readonly meanLuma: number;
  /** Share of pixels whose brightest channel exceeds 8/255, 0..1. */
  readonly nonBlackRatio: number;
  /** What this frame shows, so a reader can match it to a claim. */
  readonly label: string;
}

export interface Receipt {
  readonly capability: string;
  readonly version: string;
  readonly gitSha: string;
  readonly renderer: string;
  readonly scene: string;
  readonly frames: readonly ReceiptFrame[];
  readonly tests: readonly string[];
  readonly date: string;
  /** Measured values the spec asserted on (positions, pixel counts, contact counts). */
  readonly measurements: Readonly<Record<string, unknown>>;
}

/** A frame as the browser harness reports it, before it is named and hashed. */
export interface HarnessFrame {
  readonly name: string;
  readonly label: string;
  readonly pngBase64: string;
  readonly meanLuma: number;
  readonly nonBlackRatio: number;
}

export const RECEIPT_MARKER = "RECEIPT_JSON::";
export const RECEIPT_FRAME_MARKER = "RECEIPT_FRAME::";

export function receiptDir(capability: string): string {
  return join("evidence", "receipts", capability);
}

export function receiptPath(capability: string, version: string): string {
  return join(receiptDir(capability), `${version}.json`);
}

export function framePath(capability: string, version: string, name: string): string {
  return join(receiptDir(capability), "frames", `${version}-${name}.png`);
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Mean luma and non-black ratio over an RGBA byte array (alpha ignored). */
export { frameStats } from "./frame-stats";

/** Problems with a receipt object; empty when it satisfies the 3.5 schema. */
export function validateReceipt(value: unknown): string[] {
  const problems: string[] = [];
  const receipt = value as Partial<Receipt> | null;
  if (receipt === null || typeof receipt !== "object") return ["receipt is not an object"];
  for (const key of ["capability", "version", "gitSha", "renderer", "scene", "date"] as const) {
    if (typeof receipt[key] !== "string" || receipt[key]!.length === 0) problems.push(`${key} must be a non-empty string`);
  }
  if (typeof receipt.date === "string" && Number.isNaN(Date.parse(receipt.date))) problems.push("date must parse as an ISO date");
  if (!Array.isArray(receipt.tests) || receipt.tests.length === 0) problems.push("tests must list at least one test path");
  if (!Array.isArray(receipt.frames) || receipt.frames.length === 0) {
    problems.push("frames must list at least one frame");
  } else {
    receipt.frames.forEach((frame, index) => {
      const at = `frames[${index}]`;
      if (typeof frame.file !== "string" || !frame.file.endsWith(".png")) problems.push(`${at}.file must be a .png path`);
      if (typeof frame.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(frame.sha256)) problems.push(`${at}.sha256 must be 64 hex characters`);
      if (typeof frame.meanLuma !== "number" || !(frame.meanLuma >= 0 && frame.meanLuma <= 255)) problems.push(`${at}.meanLuma must be within 0..255`);
      if (typeof frame.nonBlackRatio !== "number" || !(frame.nonBlackRatio >= 0 && frame.nonBlackRatio <= 1)) problems.push(`${at}.nonBlackRatio must be within 0..1`);
      if (typeof frame.nonBlackRatio === "number" && frame.nonBlackRatio === 0) problems.push(`${at} is an all-black frame`);
    });
  }
  return problems;
}

/** Hash the harness frames and assemble a receipt; the PNG bytes ride along for writing. */
export function buildReceipt(input: {
  readonly capability: string;
  readonly version: string;
  readonly gitSha: string;
  readonly renderer: string;
  readonly scene: string;
  readonly tests: readonly string[];
  readonly frames: readonly HarnessFrame[];
  readonly measurements: Readonly<Record<string, unknown>>;
  readonly date?: string;
}): { receipt: Receipt; pngs: ReadonlyMap<string, Buffer> } {
  const pngs = new Map<string, Buffer>();
  const frames: ReceiptFrame[] = input.frames.map((frame) => {
    const bytes = Buffer.from(frame.pngBase64, "base64");
    const file = framePath(input.capability, input.version, frame.name);
    pngs.set(file, bytes);
    return { file, sha256: sha256Hex(bytes), meanLuma: frame.meanLuma, nonBlackRatio: frame.nonBlackRatio, label: frame.label };
  });
  const receipt: Receipt = {
    capability: input.capability,
    version: input.version,
    gitSha: input.gitSha,
    renderer: input.renderer,
    scene: input.scene,
    frames,
    tests: input.tests,
    date: input.date ?? new Date().toISOString(),
    measurements: input.measurements
  };
  return { receipt, pngs };
}

/** Write a receipt and its frames under `root`, throwing on a schema problem. */
export function writeReceipt(root: string, receipt: Receipt, pngs: ReadonlyMap<string, Buffer>): void {
  const problems = validateReceipt(receipt);
  if (problems.length > 0) throw new Error(`receipt ${receipt.capability}: ${problems.join("; ")}`);
  for (const [file, bytes] of pngs) {
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  const target = join(root, receiptPath(receipt.capability, receipt.version));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(receipt, null, 2)}\n`);
}

/**
 * Print the receipt and frames to stdout between markers. The remote runner's log is
 * the only artifact channel, so this is what makes a receipt survive the run.
 */
export function emitReceipt(receipt: Receipt, pngs: ReadonlyMap<string, Buffer>): void {
  for (const [file, bytes] of pngs) {
    console.log(`${RECEIPT_FRAME_MARKER}${file}::${bytes.toString("base64")}`);
  }
  console.log(`${RECEIPT_MARKER}${JSON.stringify(receipt)}`);
}

/** Pull receipts and frames back out of a run log (used by the extract script and its test). */
export function parseReceiptLog(log: string): { receipts: Receipt[]; pngs: Map<string, Buffer> } {
  const receipts: Receipt[] = [];
  const pngs = new Map<string, Buffer>();
  for (const rawLine of log.split(/\r?\n/)) {
    const frameAt = rawLine.indexOf(RECEIPT_FRAME_MARKER);
    if (frameAt >= 0) {
      const rest = rawLine.slice(frameAt + RECEIPT_FRAME_MARKER.length);
      const split = rest.indexOf("::");
      if (split > 0) pngs.set(rest.slice(0, split), Buffer.from(rest.slice(split + 2).trim(), "base64"));
      continue;
    }
    const receiptAt = rawLine.indexOf(RECEIPT_MARKER);
    if (receiptAt >= 0) receipts.push(JSON.parse(rawLine.slice(receiptAt + RECEIPT_MARKER.length)) as Receipt);
  }
  return { receipts, pngs };
}
