import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { sourceIdentity } from "../../tools/muse3jsparity-readiness/source-identity";

export const temporalHash = (bytes: string | Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** Lossless RGBA8 readback serialization; WebGL rows begin at the bottom. */
export function retainTemporalFrame(path: string, width: number, height: number, pixels: readonly number[], origin: "bottom-left" | "top-left" = "bottom-left") {
  if (pixels.length !== width * height * 4) throw new Error("Temporal readback dimensions do not match pixels");
  const raw = Buffer.from(pixels);
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) { const sourceY = origin === "bottom-left" ? height - 1 - y : y; raw.copy(rows, y * (width * 4 + 1) + 1, sourceY * width * 4, (sourceY + 1) * width * 4); }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
  mkdirSync(dirname(resolve(path)), { recursive: true }); writeFileSync(resolve(path), png);
  return { path, sha256: temporalHash(png), readbackSha256: temporalHash(raw), width, height, format: "rgba8", readbackOrigin: origin, pngOrigin: "top-left" };
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}

/** The source archive retains authentic Git metadata; no invented commit fallback. */
export function temporalSourceIdentity() {
  return sourceIdentity(process.cwd());
}


/** Record observed OS process ancestry; worker argv alone omits the invoking test flags. */
export function temporalCommandIdentity() {
  const ancestors: { pid: number; parentPid: number; commandLine: string; argv?: string[] }[] = [];
  let pid = process.ppid;
  for (let depth = 0; pid > 1 && depth < 8; depth++) {
    const row = execFileSync("ps", ["-p", String(pid), "-o", "ppid=", "-o", "command="], { encoding: "utf8" }).trim();
    const match = /^(\d+)\s+([\s\S]+)$/.exec(row);
    if (!match) throw new Error(`Cannot establish temporal producer process ancestry for ${pid}`);
    const parentPid = Number(match[1]);
    const cmdline = `/proc/${pid}/cmdline`;
    const argv = existsSync(cmdline) ? readFileSync(cmdline).toString().split("\0").filter(Boolean) : undefined;
    ancestors.push({ pid, parentPid, commandLine: match[2]!, ...(argv ? { argv } : {}) });
    // The nearest Playwright CLI owns the test invocation; outer shells are unrelated.
    if (/playwright[^\n]*\btest\b/.test(match[2]!)) break;
    pid = parentPid;
  }
  const receiptPath = process.env.AURA3D_COMMAND_RECEIPT;
  return { worker: { executable: process.execPath, argv: process.argv, cwd: process.cwd() }, ancestors,
    ...(receiptPath ? { invocationReceipt: { path: receiptPath, sha256: temporalHash(readFileSync(receiptPath)) } } : {}) };
}
