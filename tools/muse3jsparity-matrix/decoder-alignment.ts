import { createHash } from "node:crypto";

/** npm registry metadata + source bytes verified 2026-09-05. No inferred semver. */
export const KTX_R185_PROVENANCE = {
  version: "1.0.1",
  upstreamCommit: "12d85ad9c188c2ef71326a4f56d9a2581690b504",
  upstreamSource: "https://github.com/donmccurdy/ktx-parse/tree/12d85ad9c188c2ef71326a4f56d9a2581690b504",
  npmMetadata: "https://registry.npmjs.org/ktx-parse/1.0.1",
  npmIntegrity: "sha512-djwUWv/82Xc8LOVinJU4EBrVqYkO8OsUDSPEtY/OOVY8BSe3DMU7D7PlIAZ0pI7ZZtErj7mqpJcgffUTABvgaA==",
  upstreamModule: "https://unpkg.com/ktx-parse@1.0.1/dist/ktx-parse.modern.js",
  upstreamSha256: "a8ee3a22bcb47a1ad7e14d5c629fbfb700fedf73a972cb397998d94237b12764",
  vendoredSource: "https://github.com/mrdoob/three.js/blob/r185/examples/jsm/libs/ktx-parse.module.js",
  vendoredSha256: "f40c491f6c44dde511268121f778a0050e73b1a15fd844c1ae2c78c73213eafc",
  scope: "KTX2 parser exports, read/write and repository compressed corpus; does not certify every Basis transcoder format",
  containerMapping: "r185 adds redundant levelCount; upstream 1.0.1 exposes levels. Compare levelCount to the KTX2 header and levels.length=max(1,header levelCount), then compare all remaining fields exactly."
} as const;

export function assertDecoderVersion(lib: string, installed: string | null, minimum: string | null): void {
  const parse = (version: string | null) => version?.match(/^(\d+)\.(\d+)\.(\d+)$/)?.slice(1).map(Number);
  const actual = parse(installed); const expected = parse(minimum);
  if (!actual || !expected) throw new Error(`${lib}: missing or unverified decoder version (${installed} vs ${minimum})`);
  for (let i = 0; i < 3; i++) {
    if (actual[i]! > expected[i]!) return;
    if (actual[i]! < expected[i]!) throw new Error(`${lib}: installed ${installed} is older than required ${minimum}`);
  }
}

export const decoderSha256 = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");

export function assertKtxProvenance(vendored: string, installed: string, provenance: typeof KTX_R185_PROVENANCE | null): void {
  if (!provenance || !/^[0-9a-f]{40}$/.test(provenance.upstreamCommit)) throw new Error("ktx-parse: missing upstream provenance");
  if (decoderSha256(vendored) !== provenance.vendoredSha256) throw new Error("ktx-parse: r185 content changed; reverify upstream mapping");
  if (decoderSha256(installed) !== provenance.upstreamSha256) throw new Error("ktx-parse: installed content lacks a verified equivalence mapping");
}

export interface KtxParserModule {
  readonly [name: string]: unknown;
  read(bytes: Uint8Array): unknown;
  write(container: unknown, options?: { keepWriter: boolean }): Uint8Array;
}

export function verifyKtxBehavior(reference: KtxParserModule, installed: KtxParserModule, fixtures: readonly Uint8Array[]) {
  if (fixtures.length === 0) throw new Error("ktx-parse: missing positive compressed fixtures");
  const exports = Object.keys(reference).sort();
  for (const key of exports) {
    if (typeof reference[key] !== typeof installed[key] || (typeof reference[key] !== "function" && reference[key] !== installed[key])) {
      throw new Error(`ktx-parse: incompatible export ${key}`);
    }
  }
  const serialize = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => {
    if (item instanceof Uint8Array) return Array.from(item);
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
    }
    return item;
  });
  for (const [index, bytes] of fixtures.entries()) {
    const expected = reference.read(bytes); const actual = installed.read(bytes);
    const normalize = (value: unknown, source: Uint8Array): unknown => {
      if (!value || typeof value !== "object") throw new Error("ktx-parse: invalid container");
      const container = value as { levelCount?: number; levels?: readonly unknown[] };
      const headerCount = new DataView(source.buffer, source.byteOffset, source.byteLength).getUint32(40, true);
      if (container.levelCount !== undefined && container.levelCount !== headerCount) throw new Error("ktx-parse: levelCount differs from container header");
      if (container.levels?.length !== Math.max(1, headerCount)) throw new Error("ktx-parse: mip levels differ from container header");
      const { levelCount: _redundant, ...rest } = container;
      return rest;
    };
    if (serialize(normalize(expected, bytes)) !== serialize(normalize(actual, bytes))) throw new Error(`ktx-parse: fixture ${index} decoded differently`);
    const rewritten = installed.write(actual, { keepWriter: true });
    if (serialize(normalize(reference.read(rewritten), rewritten)) !== serialize(normalize(installed.read(rewritten), rewritten))) throw new Error(`ktx-parse: fixture ${index} write/read mismatch`);
  }
  for (const bytes of [new Uint8Array(), new Uint8Array(80), new Uint8Array([0xab, 0x4b, 0x54])]) {
    for (const parser of [reference, installed]) {
      let rejected = false;
      try { parser.read(bytes); } catch { rejected = true; }
      if (!rejected) throw new Error("ktx-parse: malformed container was accepted");
    }
  }
  return { exportsCompared: exports.length, positiveFixtures: fixtures.length, malformedFixtures: 3, readWriteEquivalent: true };
}
