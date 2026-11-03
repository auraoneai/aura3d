import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { inspectNpmArchive } from './portable-npm-lock.mjs';

const MAX_ARCHIVE = 64 * 1024 * 1024;
const MAX_EXPANDED = 256 * 1024 * 1024;
const fail = message => { throw new Error(`ADMITTED_ARCHIVE_MODES: ${message}`); };

/**
 * Inspect exact local archive bytes and derive regular-file execute bits.
 * This is byte inspection only; it neither reviews nor admits an archive.
 */
export function inspectAdmittedArchiveFiles(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > MAX_ARCHIVE) fail('invalid archive bytes');
  const snapshot = Buffer.from(bytes);
  // The shared parser verifies tar checksums, paths, type, framing, PAX names,
  // limits and file ordering. Read that same verified ordering only for mode.
  const parsed = inspectNpmArchive(snapshot);
  let tar;
  try { tar = gunzipSync(snapshot, { maxOutputLength: MAX_EXPANDED }); } catch { fail('invalid archive compression'); }
  let offset = 0, index = 0;
  const files = [];
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const number = (start, length) => {
      const text = header.subarray(start, start + length).toString('ascii').replace(/\0.*$/, '').trim();
      if (text && !/^[0-7]+$/.test(text)) fail('invalid tar header');
      const value = text ? Number.parseInt(text, 8) : 0;
      if (!Number.isSafeInteger(value) || value < 0) fail('invalid tar number');
      return value;
    };
    const size = number(124, 12), type = String.fromCharCode(header[156] || 48);
    const end = offset + 512 + size;
    if (!Number.isSafeInteger(end) || end > tar.length) fail('truncated tar');
    if (type === '0') {
      const file = parsed.files[index++], mode = number(100, 8);
      if (!file || mode > 0o777) fail('unsupported tar file mode');
      const content = Uint8Array.from(file.bytes);
      files.push({ path: file.path, bytes: content, size: content.byteLength,
        sha256: createHash('sha256').update(content).digest('hex'), executable: mode & 0o111 });
    } else if (type !== '5' && type !== 'x') fail('unsupported tar entry');
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (index !== parsed.files.length || new Set(files.map(file => file.path)).size !== files.length) fail('tar file inventory differs');
  return { manifest: parsed.manifest, files };
}
