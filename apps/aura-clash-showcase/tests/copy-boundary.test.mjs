import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(root, file), "utf-8");
const files = [
  "index.html",
  "src/legacy/ui/TitleScreen.ts",
  "src/legacy/playable/AuraClashArenaApp.ts",
];

const forbiddenPatterns = [
  /\bflagship\b/i,
  /\bmature\b/i,
  /\bproduction[- ]ready\b/i,
  /\brelease[- ]ready\b/i,
  /\bcomplete game\b/i,
  /\bfinished game\b/i,
  /\bpremium\b/i,
  /\bcinematic\b/i,
];

function assertNoMaturityClaims(file, content) {
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(content, pattern, `${file} contains a forbidden maturity claim`);
  }
}

test("the public entry dispatches to the checked legacy arena by default", () => {
  assert.match(read("index.html"), /<script\s+type="module"\s+src="\.\/src\/main\.ts"/);
  const dispatcher = read("src/main.ts");
  assert.match(dispatcher, /const DEFAULT_ON\s*=\s*false\b/);
  assert.match(dispatcher, /flags\.on\(ROUTE_FLAG\)\s*\?\s*import\("\.\/v2\/boot"\)\s*:\s*import\("\.\/legacy\/main"\)/);
  assert.match(
    read("src/legacy/main.ts"),
    /import\("\.\/playable\/AuraClashArenaApp"\)\.then\(\(module\)\s*=>\s*module\.mountAuraClashArenaApp\(\)\)/,
  );
});

for (const file of files) {
  test(`${file} preserves the development-showcase copy boundary`, () => {
    const content = read(file);
    assertNoMaturityClaims(file, content);
    assert.match(content, /development showcase/i, `${file} must frame the route as a development showcase`);
  });
}

test("each public entry description uses development-showcase framing", () => {
  const content = read("index.html");
  for (const pattern of [
    /<meta name="description" content="([^"]+)"/i,
    /<meta property="og:description" content="([^"]+)"/i,
    /<meta name="twitter:description" content="([^"]+)"/i,
  ]) {
    const match = content.match(pattern);
    assert.ok(match, `missing description matching ${pattern}`);
    assert.match(match[1], /development showcase/i);
  }
  const structuredData = content.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  assert.ok(structuredData, "missing structured description");
  assert.match(JSON.parse(structuredData[1]).description, /development showcase/i);
});

test("the mounted arena markup contains the development-showcase framing", () => {
  const content = read("src/legacy/playable/AuraClashArenaApp.ts");
  const markup = [...content.matchAll(/root\.innerHTML\s*=\s*`([\s\S]*?)`;/g)];
  assert.equal(markup.length, 1, "expected exactly one mounted arena template");
  assert.match(markup[0][1], /development showcase/i);
});

test("the opt-in v2 shell also avoids unsupported maturity claims", () => {
  const file = "src/v2/boot.ts";
  assertNoMaturityClaims(file, read(file));
});
