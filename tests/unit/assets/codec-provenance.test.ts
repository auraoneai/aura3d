import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type Artifact = {
  id: string;
  project: string;
  version: string;
  revision: string;
  upstreamPath: string;
  sourceUrl: string;
  sha256: string;
  destinations: string[];
  equivalentSources?: { version: string; revision: string; sourceUrl: string }[];
};

const basisRevision = "b76a431c6a39c07fe8bb2edf1cbf44781150ed6b";
const dracoGltfRevision = "9f856abaafb4b39f1f013763ff061522e0261c6f";
const dracoNpmRevision = "8786740086a9f4d83f44aa83badfbea4dce7a1b5";
const meshoptRevision = "9d9890c73011d75920af614485296d1e03e95448";
const basisDirectories = ["packages/assets/vendor/basis", "public/aura-decoders/basis", "fixtures/asset-corpus/decoders"];
const dracoDirectories = ["packages/assets/vendor/draco", "public/aura-decoders/draco", "fixtures/asset-corpus/decoders"];

// Pin the expected upstream identities independently of the manifest so an
// accidental manifest edit cannot silently bless changed decoder bytes.
const expected = [
  {
    id: "basis-transcoder-js", project: "BinomialLLC/basis_universal", version: "v1_50_0_2", revision: basisRevision,
    upstreamPath: "webgl/transcoder/build/basis_transcoder.js", sha256: "8478b5b6d6b74e7d3082b89f6417321d8d1dc0307f2b30d4484bb11b441696a1",
    destinations: basisDirectories.map((directory) => `${directory}/basis_transcoder.js`)
  },
  {
    id: "basis-transcoder-wasm", project: "BinomialLLC/basis_universal", version: "v1_50_0_2", revision: basisRevision,
    upstreamPath: "webgl/transcoder/build/basis_transcoder.wasm", sha256: "6cf17dc889352c42e9acf8897107978d127005fe3386c36a0e3845e27967630a",
    destinations: basisDirectories.map((directory) => `${directory}/basis_transcoder.wasm`)
  },
  {
    id: "draco-gltf-js", project: "google/draco", version: "1.5.6", revision: dracoGltfRevision,
    upstreamPath: "javascript/draco_decoder_gltf.js", sha256: "8625489da79a805f4f2a7d511c3e52d8b4085608a9d2a4d5f4f9de5db0aea04f",
    destinations: dracoDirectories.map((directory) => `${directory}/draco_decoder.js`)
  },
  {
    id: "draco-gltf-wasm", project: "google/draco", version: "1.5.6", revision: dracoGltfRevision,
    upstreamPath: "javascript/draco_decoder_gltf.wasm", sha256: "a680d927bed9cb864ddbd63521868891af2bfbe755092761b4837487618df8ac",
    destinations: ["packages/assets/vendor/draco/draco_decoder.wasm", "public/aura-decoders/draco/draco_decoder.wasm", "fixtures/asset-corpus/decoders/draco_decoder_gltf.wasm"]
  },
  {
    id: "draco-npm-js", project: "google/draco", version: "1.5.7", revision: dracoNpmRevision,
    upstreamPath: "javascript/npm/draco3d/draco_decoder_nodejs.js", sha256: "e8049906ef3f8f75d3456c22a3f31bfdfe5b5b5bd09ccdec613b9e9a49d554d8",
    destinations: ["marketing/public/assets/draco/draco_decoder_nodejs.js"]
  },
  {
    id: "draco-npm-wasm", project: "google/draco", version: "1.5.7", revision: dracoNpmRevision,
    upstreamPath: "javascript/npm/draco3d/draco_decoder.wasm", sha256: "2516a4e43526d71787bf2f678f951329f7f858f8f15f42d4bc9e370b31a0da3a",
    destinations: ["marketing/public/assets/draco/draco_decoder.wasm"]
  },
  {
    id: "basis-apache-license", project: "BinomialLLC/basis_universal", version: "v1_50_0_2", revision: basisRevision,
    upstreamPath: "LICENSE", sha256: "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4",
    destinations: ["packages/assets/vendor/basis/LICENSE.txt", "public/aura-decoders/basis/LICENSE.txt", "fixtures/asset-corpus/decoders/LICENSE-basis.txt"]
  },
  {
    id: "basis-zstd-license", project: "BinomialLLC/basis_universal", version: "v1_50_0_2", revision: basisRevision,
    upstreamPath: "zstd/LICENSE", sha256: "2c1a7fa704df8f3a606f6fc010b8b5aaebf403f3aeec339a12048f1ba7331a0b",
    destinations: ["packages/assets/vendor/basis/LICENSE-zstd.txt", "public/aura-decoders/basis/LICENSE-zstd.txt", "fixtures/asset-corpus/decoders/LICENSE-zstd.txt"]
  },
  {
    id: "draco-apache-license", project: "google/draco", version: "1.5.6", revision: dracoGltfRevision,
    upstreamPath: "LICENSE", sha256: "d3709b0fb4b8a94bbb1d02b8a2e484f258b0d9c5c5a01f940391f3fe662cd1a4",
    destinations: ["packages/assets/vendor/draco/LICENSE.txt", "public/aura-decoders/draco/LICENSE.txt", "fixtures/asset-corpus/decoders/LICENSE-draco.txt", "marketing/public/assets/draco/LICENSE.txt"]
  },
  {
    id: "meshopt-decoder-esm", project: "zeux/meshoptimizer", version: "v1.2", revision: meshoptRevision,
    upstreamPath: "js/meshopt_decoder.mjs", sha256: "cb08bf53ad8ad9693d8bb759b2dbade350eb38bcce63d005385e225b564c5f6a",
    destinations: ["packages/assets/vendor/meshopt/meshopt_decoder.mjs", "packages/assets/vendor/meshopt_decoder.mjs", "public/aura-decoders/meshopt/meshopt_decoder.mjs", "fixtures/asset-corpus/decoders/meshopt_decoder.js"]
  },
  {
    id: "meshopt-decoder-cjs", project: "zeux/meshoptimizer", version: "v1.2", revision: meshoptRevision,
    upstreamPath: "js/meshopt_decoder.cjs", sha256: "fedf06f101ff2ba59d66335578230b7e8f5fac5057dee084be64c67444ac6c12",
    destinations: ["packages/assets/vendor/meshopt/meshopt_decoder.cjs", "public/aura-decoders/meshopt/meshopt_decoder.cjs"]
  },
  {
    id: "meshopt-mit-license", project: "zeux/meshoptimizer", version: "v1.2", revision: meshoptRevision,
    upstreamPath: "LICENSE.md", sha256: "f03037ca7bad1e3eb7f4a63fa6084a8baabd5ba30d3c239a9a7f35705d873e26",
    destinations: ["packages/assets/vendor/meshopt/LICENSE.txt", "public/aura-decoders/meshopt/LICENSE.txt", "fixtures/asset-corpus/decoders/LICENSE-meshopt.txt"]
  }
];

describe("official codec provenance", () => {
  it("pins official sources and verifies every checked-in payload and license copy", () => {
    const root = process.cwd();
    const manifest = JSON.parse(readFileSync(path.join(root, "packages/assets/vendor/codec-provenance.json"), "utf8")) as {
      schemaVersion: number;
      basisDracoAcquiredAt: string;
      meshoptAcquiredAt: string;
      codecLicenses: Record<string, string[]>;
      artifacts: Artifact[];
    };
    expect(manifest.schemaVersion).toBe(1);
    expect(Number.isNaN(Date.parse(manifest.basisDracoAcquiredAt))).toBe(false);
    expect(Number.isNaN(Date.parse(manifest.meshoptAcquiredAt))).toBe(false);
    expect(manifest.codecLicenses).toEqual({
      basis: ["basis-apache-license", "basis-zstd-license"],
      draco: ["draco-apache-license"],
      meshopt: ["meshopt-mit-license"]
    });
    expect(manifest.artifacts.map(({ id }) => id).sort()).toEqual(expected.map(({ id }) => id).sort());

    for (const pinned of expected) {
      const actual = manifest.artifacts.find(({ id }) => id === pinned.id);
      expect(actual).toBeDefined();
      expect(actual).toMatchObject({
        project: pinned.project, version: pinned.version, revision: pinned.revision,
        upstreamPath: pinned.upstreamPath, sha256: pinned.sha256
      });
      expect(actual!.sourceUrl).toBe(`https://raw.githubusercontent.com/${pinned.project}/${pinned.revision}/${pinned.upstreamPath}`);
      expect([...actual!.destinations].sort()).toEqual([...pinned.destinations].sort());
      for (const destination of pinned.destinations) {
        const digest = createHash("sha256").update(readFileSync(path.join(root, destination))).digest("hex");
        expect(digest, destination).toBe(pinned.sha256);
      }
    }
    expect(manifest.artifacts.find(({ id }) => id === "draco-apache-license")?.equivalentSources).toEqual([{
      version: "1.5.7",
      revision: dracoNpmRevision,
      sourceUrl: `https://raw.githubusercontent.com/google/draco/${dracoNpmRevision}/LICENSE`
    }]);
  });
});
