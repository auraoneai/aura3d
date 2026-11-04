import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { canonicalizeManifestBytes, normalizeNpmArchiveBytes, sortTarEntries } from '../../../tools/release/deterministic-archive.mjs';

/** Minimal ustar writer: one regular-file entry per row, in the given order. */
function tar(rows: Array<{ path: string; text: string; pax?: boolean }>): Buffer {
  const block = (name: string, size: number, type: string) => {
    const header = Buffer.alloc(512);
    header.write(name, 0, 'utf8'); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
    header.write(`${size.toString(8).padStart(11, '0')}\0`, 124); header.write('00000000000\0', 136); header.write('        ', 148);
    header.write(type, 156); header.write('ustar\0', 257); header.write('00', 263);
    header.write(`${[...header].reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0')}\0 `, 148);
    return header;
  };
  const padded = (data: Buffer) => Buffer.concat([data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
  const parts: Buffer[] = [];
  for (const row of rows) {
    if (row.pax) {
      const record = ` path=${row.path}\n`;
      const length = `${record.length + String(record.length + 3).length}`;
      const pax = Buffer.from(`${length}${record}`);
      parts.push(block('PaxHeader', pax.length, 'x'), padded(pax));
    }
    const data = Buffer.from(row.text);
    parts.push(block(row.pax ? 'truncated' : row.path, data.length, '0'), padded(data));
  }
  return Buffer.concat([...parts, Buffer.alloc(1024)]);
}

const entries = (bytes: Buffer): string[] => {
  const out: string[] = [];
  for (let offset = 0; offset + 512 <= bytes.length; ) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const size = Number.parseInt(header.subarray(124, 135).toString('utf8'), 8);
    if (String.fromCharCode(header[156]!) !== 'x') out.push(`${header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '')}=${bytes.subarray(offset + 512, offset + 512 + size).toString('utf8')}`);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
};

describe('deterministic npm archive entry order', () => {
  const rows = [{ path: 'package/dist/index.js', text: 'a' }, { path: 'package/package.json', text: 'b' }, { path: 'package/README.md', text: 'c' }, { path: 'package/dist/index.d.ts', text: 'd'.repeat(700) }];

  it('gives the same bytes for any entry order, with entry contents unchanged', () => {
    const forward = normalizeNpmArchiveBytes(gzipSync(tar(rows)));
    const reversed = normalizeNpmArchiveBytes(gzipSync(tar([...rows].reverse())));
    expect(Buffer.compare(forward, reversed)).toBe(0);
    expect(entries(gunzipSync(forward))).toEqual(['package/README.md=c', `package/dist/index.d.ts=${'d'.repeat(700)}`, 'package/dist/index.js=a', 'package/package.json=b']);
    expect(Buffer.compare(normalizeNpmArchiveBytes(forward), forward)).toBe(0);
  });

  it('keeps a pax extension header with its entry', () => {
    const long = `package/${'x'.repeat(120)}.js`;
    const sorted = sortTarEntries(tar([{ path: 'package/z.js', text: 'z' }, { path: long, text: 'long', pax: true }, { path: 'package/a.js', text: 'a' }]));
    expect(entries(sorted)).toEqual(['package/a.js=a', 'truncated=long', 'package/z.js=z']);
  });

  it('refuses a duplicate path and a truncated archive', () => {
    expect(() => sortTarEntries(tar([{ path: 'package/a', text: '1' }, { path: 'package/a', text: '2' }]))).toThrow(/Duplicate tar entry path/);
    expect(() => sortTarEntries(tar(rows).subarray(0, 700))).toThrow(/Truncated tar entry/);
  });

  it('gives the same bytes when pnpm emits the packed dependency maps in another order (ACR pass 011, @aura3d/debug)', () => {
    const manifest = (deps: string[]) => `{\n  "name": "@aura3d/debug",\n  "dependencies": {\n${deps.map((name) => `    "${name}": "5.0.0"`).join(',\n')}\n  },\n  "files": [\n    "dist"\n  ]\n}`;
    const pack = (deps: string[]) => normalizeNpmArchiveBytes(gzipSync(tar([{ path: 'package/dist/index.js', text: 'a' }, { path: 'package/package.json', text: manifest(deps) }])));
    const sorted = pack(['@aura3d/animation', '@aura3d/physics', '@aura3d/rendering']);
    expect(Buffer.compare(pack(['@aura3d/animation', '@aura3d/rendering', '@aura3d/physics']), sorted)).toBe(0);
    expect(entries(gunzipSync(sorted))).toContain(`package/package.json=${manifest(['@aura3d/animation', '@aura3d/physics', '@aura3d/rendering'])}`);
    expect(canonicalizeManifestBytes(Buffer.from('not json')).toString()).toBe('not json');
  });

  it('normalizes entry headers (mtime, owner ids, mode class) so a repack of other file metadata converges', () => {
    const plain = tar([{ path: 'package/a.js', text: 'a' }]);
    const odd = Buffer.from(plain);
    odd.write('0000664\0', 100); odd.write('0001750\0', 108); odd.write('00000012345\0', 136); odd.write('someone', 265);
    const header = (bytes: Buffer) => gunzipSync(normalizeNpmArchiveBytes(gzipSync(bytes))).subarray(0, 512);
    expect(Buffer.compare(header(odd), header(plain))).toBe(0);
    const out = header(plain);
    expect(out.subarray(100, 108).toString()).toBe('0000644\0');
    expect(Number.parseInt(out.subarray(148, 154).toString(), 8)).toBe([...out.subarray(0, 148), ...out.subarray(156)].reduce((a, b) => a + b, 0) + 8 * 32);
  });
});
