import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { inspectAdmittedArchiveFiles } from '../../../tools/release/admitted-archive-modes.mjs';

function tarRecord(path: string, data: Uint8Array, mode: number, kind = '0'): Buffer[] {
  const header = Buffer.alloc(512);
  const text = (value: string, offset: number, length: number) => header.write(value, offset, length, 'ascii');
  const octal = (value: number, offset: number, length: number) => text(`${value.toString(8).padStart(length - 1, '0')}\0`, offset, length);
  text(path, 0, 100); octal(mode, 100, 8); octal(0, 108, 8); octal(0, 116, 8);
  octal(data.byteLength, 124, 12); octal(0, 136, 12); header.fill(32, 148, 156); header[156] = kind.charCodeAt(0);
  text('ustar\0', 257, 6); text('00', 263, 2);
  text(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0')}\0 `, 148, 8);
  return [header, Buffer.from(data), Buffer.alloc((512 - data.byteLength % 512) % 512)];
}
function archive(mode = 0o751, corrupt = false) {
  const manifest = Buffer.from('{"name":"fixture","version":"1.0.0"}');
  const longName = `package/${'nested/'.repeat(14)}tool.js`;
  let length = 0, record = '';
  for (;;) {
    record = `${length} path=${longName}\n`;
    const next = Buffer.byteLength(record);
    if (next === length) break;
    length = next;
  }
  const pieces = [...tarRecord('package/package.json', manifest, 0o644),
    ...tarRecord('pax', Buffer.from(record), 0o644, 'x'),
    ...tarRecord('package/placeholder', Buffer.from('hello\n'), mode), Buffer.alloc(1024)];
  if (corrupt) pieces[0][10] ^= 1;
  return { bytes: gzipSync(Buffer.concat(pieces)), path: longName.slice('package/'.length) };
}

describe('admitted archive file mode inspection', () => {
  it('binds tar executable bits to the parser-verified file order and PAX path', () => {
    const input = archive(), parsed = inspectAdmittedArchiveFiles(input.bytes);
    expect(parsed.manifest).toMatchObject({ name: 'fixture', version: '1.0.0' });
    expect(parsed.files.map(file => [file.path, file.executable])).toEqual([['package.json', 0], [input.path, 0o111]]);
    expect(parsed.files[1].sha256).toBe(createHash('sha256').update('hello\n').digest('hex'));
    expect(parsed.files[1].size).toBe(6);
  });

  it('returns independent byte snapshots instead of mutable cached contents', () => {
    const input = archive(), first = inspectAdmittedArchiveFiles(input.bytes);
    first.files[1].bytes[0] = 0;
    expect(inspectAdmittedArchiveFiles(input.bytes).files[1].bytes[0]).toBe('h'.charCodeAt(0));
  });

  it('rejects privileged mode bits and a corrupted tar header', () => {
    expect(() => inspectAdmittedArchiveFiles(archive(0o4755).bytes)).toThrow(/unsupported tar file mode/);
    expect(() => inspectAdmittedArchiveFiles(archive(0o751, true).bytes)).toThrow(/checksum/);
  });
});
