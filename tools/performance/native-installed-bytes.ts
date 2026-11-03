/** Pure Node helper for the native performance probe; starts no browser. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const digest = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

/**
 * Installed bytes of the frozen candidate: the summed regular-file sizes inside
 * every gate-bound package archive, after verifying each archive digest. This
 * is what `npm install` of the candidate writes, independent of the browser.
 */
export function installedCandidateBytes(root: string, archives: ReadonlyArray<{ path: string; sha256: string }>): number {
  if (!archives.length) throw new Error("The code-complete gate lists no candidate archives");
  let total = 0;
  for (const archive of archives) {
    const bytes = readFileSync(resolve(root, archive.path));
    if (digest(bytes) !== archive.sha256) throw new Error(`Candidate archive digest mismatch: ${archive.path}`);
    const tar = gunzipSync(bytes);
    for (let offset = 0; offset + 512 <= tar.length;) {
      const header = tar.subarray(offset, offset + 512);
      if (header.every((byte) => byte === 0)) break;
      const size = Number.parseInt(header.subarray(124, 136).toString("ascii").replace(/\0.*$/s, "").trim() || "0", 8);
      if (!Number.isSafeInteger(size) || size < 0) throw new Error(`Invalid tar entry size in ${archive.path}`);
      const type = String.fromCharCode(header[156] ?? 0);
      // Regular files only; pax/GNU long-name metadata records (x, g, L, K)
      // carry their own type and are not installed bytes.
      if (type === "0" || type === "\0") total += size;
      offset += 512 + Math.ceil(size / 512) * 512;
    }
  }
  return total;
}

