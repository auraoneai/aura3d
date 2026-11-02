import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

// These exceptions are for these historical Git blobs, not a general exemption
// for replacement assets. A changed blob needs an explicit LFS-policy review.
const legacyFixtures = [
  {
    path: "fixtures/asset-corpus/damaged-helmet.glb",
    oid: "119805cbdf11fd245fd37aa7115145b5d4a4803f",
    size: 3_773_916,
    magic: "glTF"
  },
  {
    path: "fixtures/asset-corpus/avocado.glb",
    oid: "6d94b8cfb6c1ceca592a4977dc81e08e1348d345",
    size: 7_256_224,
    magic: "glTF"
  },
  {
    path: "fixtures/environment-corpus/hdri/kloppenheim_06_puresky_1k.hdr",
    oid: "c15a4b4119c623a42fbc04506f768d03ffb87a37",
    size: 1_173_154,
    magic: "#?RADIANCE\n"
  },
  {
    path: "fixtures/environment-corpus/hdri/studio_small_08_1k.hdr",
    oid: "fd9f69afe08224343587bc42e731ece06b3fdee2",
    size: 1_508_872,
    magic: "#?RADIANCE\n"
  },
  {
    path: "fixtures/environment-corpus/hdri/autumn_field_puresky_1k.hdr",
    oid: "9ec1178bb22a307a4313fb3f3fc77e72d3c31f99",
    size: 1_092_974,
    magic: "#?RADIANCE\n"
  }
] as const;

const lfsNeighbors = [
  "fixtures/asset-corpus/new.glb",
  "fixtures/asset-corpus/avocado-copy.glb",
  "fixtures/asset-corpus/damaged-helmet-copy.glb",
  "fixtures/asset-corpus/antique-camera.glb",
  "tests/fixtures/avocado.glb",
  "tests/fixtures/damaged-helmet.glb",
  "fixtures/environment-corpus/hdri/new.hdr",
  "fixtures/environment-corpus/hdri/autumn_field_puresky_1k-copy.hdr",
  "fixtures/environment-corpus/hdri/kloppenheim_06_puresky_1k-copy.hdr",
  "fixtures/environment-corpus/hdri/studio_small_08_1k-copy.hdr",
  "fixtures/environment-corpus/hdri/kloppenheim_06_puresky_2k.hdr",
  "fixtures/environment-corpus/hdri/studio_small_08_2k.hdr",
  "fixtures/environment-corpus/hdri/deep_space_starfield_8k.hdr"
] as const;

const existingPointers = [
  {
    path: "apps/aura-clash-showcase/public/aura-assets/arenaNeonDowntownTextured.312f2320.glb",
    corpusNeighbor: "fixtures/asset-corpus/antique-camera.glb"
  },
  {
    path: "public/hdri/belfast_sunset_puresky_1k.hdr",
    corpusNeighbor: "fixtures/environment-corpus/hdri/new.hdr"
  }
] as const;

const binaryAttributes = { filter: "unset", diff: "unset", merge: "unset", text: "unset" };
const lfsAttributes = { filter: "lfs", diff: "lfs", merge: "lfs", text: "unset" };
const pointerHeader = "version https://git-lfs.github.com/spec/v1\n";
const pointerPattern = /^version https:\/\/git-lfs\.github\.com\/spec\/v1\noid sha256:[a-f0-9]{64}\nsize [1-9][0-9]*\n$/;

// No checkout, network, worktree enumeration, or writes to the real index.
// Only explicitly named files and their ancestor .gitattributes are read.
const gitEnv: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_ALLOW_PROTOCOL: "",
  GIT_ATTR_NOSYSTEM: "1",
  GIT_CONFIG_COUNT: "0",
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_NO_LAZY_FETCH: "1",
  GIT_TERMINAL_PROMPT: "0"
};
for (const key of [
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_CONFIG",
  "GIT_CONFIG_PARAMETERS",
  "GIT_DIR",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_PREFIX",
  "GIT_WORK_TREE"
]) delete gitEnv[key];

function git(cwd: string, args: readonly string[], input?: Buffer): Buffer {
  return execFileSync("git", args, {
    cwd,
    env: gitEnv,
    input,
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30_000
  });
}

function gitText(cwd: string, args: readonly string[], input?: Buffer): string {
  return git(cwd, args, input).toString("utf8").trim();
}

function attributes(cwd: string, path: string): Record<string, string> {
  const fields = git(cwd, ["check-attr", "-z", "filter", "diff", "merge", "text", "--", path])
    .toString("utf8")
    .split("\0");
  const result: Record<string, string> = {};
  for (let i = 0; i < fields.length - 1; i += 3) {
    expect(fields[i]).toBe(path);
    result[fields[i + 1]] = fields[i + 2];
  }
  return result;
}

function cleanIntoObject(repo: string, path: string, bytes: Buffer): { oid: string; bytes: Buffer } {
  // Git LFS's clean filter is local-only. The throwaway repo has no remote and
  // only its object store is written; neither git add nor a commit is needed.
  const oid = gitText(repo, [
    "-c", "filter.lfs.clean=git-lfs clean -- %f",
    "-c", "filter.lfs.required=true",
    "hash-object", "-w", "--stdin", `--path=${path}`
  ], bytes);
  return { oid, bytes: git(repo, ["cat-file", "blob", oid]) };
}

function pointer(oid: string, size: number): string {
  return `${pointerHeader}oid sha256:${oid}\nsize ${size}\n`;
}

describe("legacy fixture Git LFS attributes", () => {
  let tempRepo: string;

  beforeAll(() => {
    tempRepo = mkdtempSync(join(tmpdir(), "aura3d-lfs-fixture-attributes-"));
    git(tempRepo, ["init", "--quiet", "--object-format=sha1"]);
    writeFileSync(join(tempRepo, ".gitattributes"), readFileSync(join(repoRoot, ".gitattributes")));

    // Copy only possible ancestor attribute files for these explicit paths.
    // This preserves nested-rule precedence without walking the checkout.
    const paths = [
      ...legacyFixtures.map((fixture) => fixture.path),
      ...lfsNeighbors,
      ...existingPointers.flatMap((entry) => [entry.path, entry.corpusNeighbor])
    ];
    const attributePaths = new Set<string>();
    for (const path of paths) {
      for (let dir = posix.dirname(path); dir !== "."; dir = posix.dirname(dir)) {
        attributePaths.add(`${dir}/.gitattributes`);
      }
    }
    for (const path of attributePaths) {
      const source = join(repoRoot, path);
      if (!existsSync(source)) continue;
      const destination = join(tempRepo, path);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(source, destination);
    }
  });

  afterAll(() => {
    if (tempRepo) rmSync(tempRepo, { recursive: true, force: true });
  });

  it("keeps the named fixtures and pointer examples tracked", () => {
    const paths = [
      ...legacyFixtures.map((fixture) => fixture.path),
      ...existingPointers.map((entry) => entry.path)
    ];
    const tracked = gitText(repoRoot, ["ls-files", "--", ...paths]).split("\n").sort();
    expect(tracked).toEqual([...paths].sort());
  });

  it.each(legacyFixtures)("keeps $path's pinned bytes as an ordinary binary Git blob", (fixture) => {
    const path = join(repoRoot, fixture.path);
    expect(lstatSync(path).isFile()).toBe(true);
    const blob = readFileSync(path);
    expect(blob.length).toBe(fixture.size);
    expect(blob.subarray(0, fixture.magic.length).toString("utf8")).toBe(fixture.magic);
    const oid = gitText(tempRepo, ["hash-object", "-w", "--no-filters", "--stdin"], blob);
    expect(oid).toBe(fixture.oid);
    expect(gitText(tempRepo, ["cat-file", "-t", oid])).toBe("blob");
    expect(gitText(tempRepo, ["cat-file", "-s", oid])).toBe(String(fixture.size));
    expect(git(tempRepo, ["cat-file", "blob", oid]).equals(blob)).toBe(true);
    expect(attributes(tempRepo, fixture.path), fixture.path).toEqual(binaryAttributes);

    const sample = Buffer.concat([Buffer.from(fixture.magic), Buffer.from([0, 13, 10, 255])]);
    expect(cleanIntoObject(tempRepo, fixture.path, sample).bytes).toEqual(sample);
  });

  it.each(lfsNeighbors)("keeps neighboring/new asset %s LFS-tracked", (path) => {
    expect(attributes(tempRepo, path), path).toEqual(lfsAttributes);
  });

  it.each([
    { path: "fixtures/asset-corpus/new.glb", bytes: Buffer.from("glTF\0\r\nnew asset") },
    { path: "fixtures/environment-corpus/hdri/new.hdr", bytes: Buffer.from("#?RADIANCE\n\0\r\nnew asset") }
  ])("routes new $path bytes through the offline LFS clean filter", ({ path, bytes }) => {
    const stored = cleanIntoObject(tempRepo, path, bytes);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    expect(stored.bytes.toString("utf8")).toBe(pointer(sha256, bytes.length));
  });

  it.each(existingPointers)("leaves the existing LFS pointer $path unchanged", (entry) => {
    expect(attributes(tempRepo, entry.path), entry.path).toEqual(lfsAttributes);
    // The checkout may contain either the pointer or its hydrated bytes.
    const path = join(repoRoot, entry.path);
    expect(lstatSync(path).isFile()).toBe(true);
    const current = readFileSync(path);
    const expected = current.subarray(0, pointerHeader.length).toString("utf8") === pointerHeader
      ? current
      : Buffer.from(pointer(createHash("sha256").update(current).digest("hex"), current.length));
    expect(expected.toString("utf8")).toMatch(pointerPattern);
    const expectedOid = gitText(tempRepo, ["hash-object", "-w", "--no-filters", "--stdin"], expected);
    const cleaned = cleanIntoObject(tempRepo, entry.path, current);
    expect(cleaned.oid).toBe(expectedOid);
    expect(cleaned.bytes).toEqual(expected);

    for (const target of [entry.path, entry.corpusNeighbor]) {
      expect(attributes(tempRepo, target), target).toEqual(lfsAttributes);
      const stored = cleanIntoObject(tempRepo, target, expected);
      expect(stored.oid).toBe(expectedOid);
      expect(stored.bytes).toEqual(expected);
    }
  });
});
