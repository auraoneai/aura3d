import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "vitest";

test("ExternalParity glTF corpus alias maps the requested filename to the loader corpus proof", () => {
  const manifest = JSON.parse(readFileSync("fixtures/external-parity/gltf-corpus/manifest.json", "utf8")) as {
    assets?: readonly unknown[];
    source?: { readonly revision?: string };
  };
  const ok = existsSync("tests/assets/external-parity-gltf-loader-corpus.test.ts") &&
    Array.isArray(manifest.assets) &&
    manifest.assets.length >= 25 &&
    manifest.source?.revision === "2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf";
  writeFileSync("tests/reports/external-parity-gltf-corpus-alias.json", `${JSON.stringify({ ok, sourceTest: "tests/assets/external-parity-gltf-loader-corpus.test.ts" }, null, 2)}\n`);
  expect(ok).toBe(true);
});
