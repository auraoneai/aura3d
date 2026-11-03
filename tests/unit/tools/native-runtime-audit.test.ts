import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectSourceEvidence, inspectSourceEntries } from "../../../tools/native-runtime-audit/source-evidence.js";
import { inspectRuntimeNetwork, redactRuntimeNetworkEvents } from "../../../tools/native-runtime-audit/runtime-network.js";
import { collectDependencyGraph } from "../../../tools/native-runtime-audit/dependency-graph.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const source = (path: string, text: string) => ({ path, bytes: Buffer.from(text) });

describe("native implementation source evidence", () => {
  it("records imports, references and independently supplied fingerprints as review candidates without claiming authorship", () => {
    const report = inspectSourceEntries([
      source("src/renderer.ts", 'import { Renderer } from "three/webgpu";\n// three is a number here\n'),
      source("src/ordinary.ts", 'import "three-helper"; const value = "playcanvas-helper";'),
      source("workers/capture.worker.ts", "const sentinel = 'invented-fingerprint-for-test';")
    ], { fingerprints: [{ id: "synthetic", text: "invented-fingerprint-for-test" }] });
    expect(report.findings).toContainEqual(expect.objectContaining({ path: "src/renderer.ts", kind: "package-import", detail: "three/webgpu", line: 1 }));
    expect(report.findings).toContainEqual(expect.objectContaining({ path: "src/renderer.ts", kind: "text-reference", detail: "three", line: 2 }));
    expect(report.findings).toContainEqual(expect.objectContaining({ path: "workers/capture.worker.ts", kind: "fingerprint", detail: "synthetic" }));
    expect(report.findings.some((finding) => finding.path === "src/ordinary.ts")).toBe(false);
    expect(report.files.find((file) => file.path.includes("worker"))?.sourceKind).toBe("worker");
    expect(report.files.every((file) => file.replacementStatus === "unreviewed" && file.license === null && /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
    expect(report.limitations.join(" ")).toContain("neither a match nor its absence proves authorship");
  });

  it("inspects source-map contents, encoded data and binary byte signatures", () => {
    const encoded = Buffer.from('export { Engine } from "@babylonjs/core"; // synthetic embedded payload').toString("base64");
    const map = JSON.stringify({ version: 3, sources: ["../three/src/core.js"], sourcesContent: ['import "playcanvas";'] });
    const report = inspectSourceEntries([
      source("dist/bundle.js.map", map),
      source("src/table.ts", `const table = "${encoded}";`),
      { path: "src/codec.wasm", bytes: Buffer.from([0, 97, 98, 99, 222, 173, 190, 239]) }
    ], { fingerprints: [{ id: "synthetic-bytes", bytesHex: "deadbeef" }] });
    expect(report.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "dist/bundle.js.map", sourceKind: "source-map" }),
      expect.objectContaining({ path: "dist/bundle.js.map#source-0", sourceKind: "source-map-content" }),
      expect.objectContaining({ path: "src/table.ts#base64-0", sourceKind: "encoded-content" }),
      expect.objectContaining({ path: "src/codec.wasm", sourceKind: "binary" })
    ]));
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "dist/bundle.js.map", kind: "source-map-reference", detail: "three" }),
      expect.objectContaining({ path: "dist/bundle.js.map#source-0", kind: "package-import", detail: "playcanvas" }),
      expect.objectContaining({ path: "src/table.ts#base64-0", kind: "package-import", detail: "@babylonjs/core" }),
      expect.objectContaining({ path: "src/codec.wasm", kind: "fingerprint", detail: "synthetic-bytes" })
    ]));
  });

  it("classifies published formulas as standardized-equation review candidates, never as proof", () => {
    const report = inspectSourceEntries([
      source("src/color.ts", "export const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;\n"),
      source("src/luma.ts", "export const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;\n"),
      source("src/fresnel.glsl.ts", "export const f = `vec3 F = F0 + (1.0 - F0) * pow(1.0 - VoH, 5.0);`;\n"),
      source("src/random.ts", "let s = 1; export const next = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0);\n"),
      source("src/plain.ts", "export const half = 0.5; export const scale = pow(2.0, 5.0);\n")
    ]);
    const equations = report.findings.filter((finding) => finding.kind === "standardized-equation");
    expect(equations.map(({ path, detail }) => [path, detail])).toEqual([
      ["src/color.ts", "sRGB transfer function (IEC 61966-2-1)"],
      ["src/luma.ts", "BT.709 luminance coefficients (ITU-R BT.709)"],
      ["src/fresnel.glsl.ts", "Schlick Fresnel approximation (Schlick 1994)"],
      ["src/random.ts", "Numerical Recipes linear congruential generator"]
    ]);
    expect(equations.every((finding) => finding.line === 1 && finding.review === undefined)).toBe(true);
    expect(report.candidateReview).toEqual({ candidates: 4, reviewed: 0, unreviewed: 4, byDisposition: {}, gatedUnreviewed: 4 });
    expect(report.limitations.join(" ")).toContain("only a recorded reviewer disposition classifies them");
  });

  it("applies digest-bound human candidate dispositions and validates them", () => {
    const entry = source("src/color.ts", "// Ported from upstream source: example\nexport const k = 0.04045;\n");
    const sha256 = createHash("sha256").update(entry.bytes).digest("hex");
    const base = { sha256, license: "MIT", owner: "WP-29", replacementStatus: "independent" as const, reviewEvidence: ["review notes"] };
    const candidateReviews = [
      { kind: "standardized-equation" as const, disposition: "standardized-equation" as const, reviewer: "WP-29 reviewer", note: "IEC 61966-2-1 threshold" },
      { kind: "provenance-reference" as const, detail: "unrelated detail", disposition: "false-positive" as const, reviewer: "WP-29 reviewer", note: "does not match" }
    ];
    const report = inspectSourceEntries([entry], { provenance: { [entry.path]: { ...base, candidateReviews } } });
    expect(report.findings).toContainEqual(expect.objectContaining({ kind: "standardized-equation", review: { disposition: "standardized-equation", reviewer: "WP-29 reviewer", note: "IEC 61966-2-1 threshold" } }));
    // A review with a non-matching detail leaves the candidate unreviewed.
    expect(report.findings.find((finding) => finding.kind === "provenance-reference")?.review).toBeUndefined();
    expect(report.candidateReview).toMatchObject({ candidates: 2, reviewed: 1, unreviewed: 1, byDisposition: { "standardized-equation": 1 } });
    for (const invalid of [
      [{ ...candidateReviews[0]!, reviewer: " " }],
      [{ ...candidateReviews[0]!, disposition: "looks-fine" }],
      [{ ...candidateReviews[0]!, kind: "unknown-kind" }],
      [{ ...candidateReviews[0]!, note: "" }],
      "not-an-array"
    ]) {
      expect(() => inspectSourceEntries([entry], { provenance: { [entry.path]: { ...base, candidateReviews: invalid as never } } })).toThrow(/Invalid candidate review/);
    }
    expect(() => inspectSourceEntries([source(entry.path, "changed 0.04045")], { provenance: { [entry.path]: { ...base, candidateReviews } } })).toThrow(/Stale provenance digest/);
  });

  it("binds reviewed records to exact bytes and rejects missing review evidence", () => {
    const entry = source("src/value.ts", "export const x = 1;");
    const sha256 = createHash("sha256").update(entry.bytes).digest("hex");
    const provenance = { sha256, license: "MIT", owner: "Aura3D", replacementStatus: "independent" as const, reviewEvidence: ["independent construction notes"] };
    expect(inspectSourceEntries([entry], { provenance: { [entry.path]: provenance } }).files[0]).toMatchObject(provenance);
    expect(() => inspectSourceEntries([source(entry.path, "changed")], { provenance: { [entry.path]: provenance } })).toThrow(/Stale provenance digest/);
    expect(() => inspectSourceEntries([entry], { provenance: { [entry.path]: { ...provenance, reviewEvidence: [] } } })).toThrow(/Invalid provenance/);
    expect(() => inspectSourceEntries([entry, entry])).toThrow(/Duplicate/);
  });

  it("handles nested source maps, generated numeric tables and unavailable map content", () => {
    const nested = { version: 3, sections: [{ offset: { line: 0, column: 0 }, map: {
      version: 3, sources: ["original.ts", "missing.ts"], sourcesContent: ['import "three";', null]
    } }] };
    const inlineMap = Buffer.from(JSON.stringify(nested)).toString("base64");
    const numbers = Array.from({ length: 65 }, (_, index) => index).join(",");
    const report = inspectSourceEntries([
      source("out.js", `//# sourceMappingURL=data:application/json;base64,${inlineMap}`),
      source("lut.ts", `// generated file\nexport const data = [${numbers}, 65];`)
    ]);
    expect(report.files).toContainEqual(expect.objectContaining({ path: "lut.ts", sourceKind: "generated-data" }));
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "out.js#base64-0#section-0#source-0", kind: "package-import", detail: "three" }),
      expect.objectContaining({ path: "out.js#base64-0#section-0", kind: "missing-source-map-content" }),
      expect.objectContaining({ path: "lut.ts", kind: "embedded-data" })
    ]));
  });

  it("records bundle paths and license or upstream notices as review candidates, without assigning ownership", () => {
    const map = JSON.stringify({ version: 3, sourceRoot: "../node_modules/library/", sources: ["src/render.js"], sourcesContent: ["export const answer = 42;"] });
    const report = inspectSourceEntries([
      source("payload!/dist/bundle.js", "// node_modules/library/render.js\n/*! SPDX-License-Identifier: MIT */\n// Copyright (c) 2026 Example\n// Derived from example.org/reference\nexport const value = 42;"),
      source("payload!/dist/bundle.js.map", map),
      source("payload!/LICENSE.txt", "License terms are listed here."),
      source("src/plain.ts", 'const text = "node_modules/library/render.js and copyright law";\n// copyright law is discussed here\n')
    ]);
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "payload!/dist/bundle.js", kind: "bundled-source", line: 1 }),
      expect.objectContaining({ path: "payload!/dist/bundle.js", kind: "license-notice", line: 2 }),
      expect.objectContaining({ path: "payload!/dist/bundle.js", kind: "license-notice", line: 3 }),
      expect.objectContaining({ path: "payload!/dist/bundle.js", kind: "provenance-reference", line: 4 }),
      expect.objectContaining({ path: "payload!/dist/bundle.js.map", kind: "bundled-source", detail: "../node_modules/library/" }),
      expect.objectContaining({ path: "payload!/LICENSE.txt", kind: "license-notice" })
    ]));
    expect(report.findings.some(({ path }) => path === "src/plain.ts")).toBe(false);
    expect(report.files.every((file) => file.owner === null && file.license === null && file.replacementStatus === "unreviewed")).toBe(true);
  });

  it("inspects section-only and percent-encoded source maps and rejects malformed review evidence", () => {
    const map = { version: 3, sections: [{ offset: { line: 0, column: 0 }, map: {
      version: 3, sources: ["../vendor/library/index.js"], sourcesContent: ['import "playcanvas";']
    } }] };
    const sectionMap = Buffer.from(JSON.stringify(map)).toString("base64");
    const percentMap = encodeURIComponent(JSON.stringify({ version: 3, sources: ["entry.js"], sourcesContent: ['import "three";'] }));
    const entry = source("inline.js", `//# sourceMappingURL=data:application/json;base64,${sectionMap}\n//# sourceMappingURL=data:application/json,${percentMap}`);
    const report = inspectSourceEntries([entry]);
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "inline.js#base64-0#section-0", kind: "bundled-source" }),
      expect.objectContaining({ path: "inline.js#base64-0#section-0#source-0", kind: "package-import", detail: "playcanvas" }),
      expect.objectContaining({ path: "inline.js#inline-map-0#source-0", kind: "package-import", detail: "three" })
    ]));
    const sha256 = createHash("sha256").update(entry.bytes).digest("hex");
    expect(() => inspectSourceEntries([entry], { provenance: { [entry.path]: { sha256, license: " ", owner: "Aura3D", replacementStatus: "independent", reviewEvidence: ["notes"] } } })).toThrow(/Invalid provenance/);
    expect(() => inspectSourceEntries([entry], { fingerprints: [{ id: "synthetic", bytesHex: "abc" }] })).toThrow(/Invalid fingerprint bytes/);
  });

  it("redacts remote map attribution and reports malformed inline map data", () => {
    const map = JSON.stringify({ version: 3, sourceRoot: "https://user:password@example.com/vendor/package/?token=secret#fragment",
      sources: ["source.js"], sourcesContent: ["export const answer = 42;"] });
    const report = inspectSourceEntries([
      source("dist/bundle.js.map", map),
      source("dist/bad.js", "//# sourceMappingURL=data:application/json;base64,%%%")
    ]);
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "dist/bundle.js.map", kind: "provenance-reference", detail: "https://example.com/vendor/package/" }),
      expect.objectContaining({ path: "dist/bad.js", kind: "invalid-source-map" })
    ]));
    expect(JSON.stringify(report)).not.toMatch(/password|token|secret|fragment/);
  });

  it("inventories source and supplied package payloads while refusing traversal and symlinks", () => {
    const root = mkdtempSync(join(tmpdir(), "aura3d-source-audit-"));
    roots.push(root);
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, "payload", "dist"), { recursive: true });
    writeFileSync(join(root, "src", "main.ts"), "export const value = 1;");
    writeFileSync(join(root, "payload", "package.json"), '{"name":"fixture"}');
    writeFileSync(join(root, "payload", "dist", "bundle.js"), 'import "three";');
    const report = collectSourceEvidence(root, { paths: ["src"], payloads: ["payload"] });
    expect(report.files.map((file) => file.path)).toEqual(["src/main.ts", "payload!/dist/bundle.js", "payload!/package.json"]);
    expect(report.findings).toContainEqual(expect.objectContaining({ path: "payload!/dist/bundle.js", kind: "package-import" }));
    expect(() => collectSourceEvidence(root, { paths: ["../"] })).toThrow(/escapes/);
    symlinkSync("/tmp", join(root, "src", "external"));
    expect(() => collectSourceEvidence(root, { paths: ["src"] })).toThrow(/symlink/);
  });

  it("excludes stale reports and historical comparisons but scans other report directories", () => {
    const root = mkdtempSync(join(tmpdir(), "aura3d-source-exclusions-"));
    roots.push(root);
    for (const path of ["tests/reports", "tools/_quarantine", "tools/bench-vs-threejs", "tools/reports"]) {
      mkdirSync(join(root, path), { recursive: true });
      writeFileSync(join(root, path, "file.js"), 'import "three";');
    }
    const report = collectSourceEvidence(root, { paths: ["tests", "tools"] });
    expect(report.files.map((file) => file.path)).toEqual(["tools/reports/file.js"]);
    expect(report.limitations.join(" ")).toContain("tests/reports");
  });
});

describe("native dependency change observations", () => {
  it("checks the current root manifest in isolation and detects a newly introduced alias", () => {
    const root = mkdtempSync(join(tmpdir(), "aura3d-manifest-change-"));
    roots.push(root);
    const current = JSON.parse(readFileSync("package.json", "utf8")) as Record<string, unknown>;
    const manifest = { name: current.name, dependencies: current.dependencies, devDependencies: current.devDependencies,
      peerDependencies: current.peerDependencies, optionalDependencies: current.optionalDependencies };
    const writeManifest = () => writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
    writeManifest();
    writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\nimporters:\n  .: {}\n");
    expect(collectDependencyGraph(root).findings).toEqual([]);
    manifest.devDependencies = { ...(manifest.devDependencies as Record<string, string>), syntheticAlias: "npm:three@1.0.0", "three-helper": "1.0.0" };
    writeManifest();
    const changed = collectDependencyGraph(root);
    expect(changed.findings).toContainEqual(expect.objectContaining({ name: "three", edge: expect.objectContaining({ source: "manifest", field: "devDependencies", name: "syntheticAlias", alias: true }) }));
    expect(changed.findings.some(({ name }) => name === "three-helper")).toBe(false);
  });

  it("retains lock peers, differing catalog resolutions, nested overrides, and registry aliases", () => {
    const root = mkdtempSync(join(tmpdir(), "aura3d-lock-change-"));
    roots.push(root);
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fixture", overrides: { three: { ".": "npm:helper@1", helper: "1" }, "three-helper": "1" } }));
    writeFileSync(join(root, "pnpm-lock.yaml"), `lockfileVersion: '9.0'
catalogs:
  default:
    renderer:
      specifier: npm:three@1.2.0
      version: playcanvas@1.0.0
importers:
  .:
    dependencies:
      utility:
        specifier: 1.0.0
        version: 1.0.0(three@1.2.0)
packages:
  utility@1.0.0:
    optionalDependencies:
      renderer: npm:playcanvas@1.0.0
    peerDependencies:
      three: ^1.2.0
    peerDependenciesMeta:
      three:
        optional: true
snapshots:
  utility@1.0.0:
    dependencies:
      child: 2.0.0(playcanvas@1.0.0)
`);
    mkdirSync(join(root, "profile"));
    writeFileSync(join(root, "profile", "package.json"), JSON.stringify({ name: "profile" }));
    writeFileSync(join(root, "profile", "package-lock.json"), JSON.stringify({ name: "profile", lockfileVersion: 3, packages: {
      "": { name: "profile" }, "node_modules/alias": { version: "1.0.0", resolved: "https://user:secret@registry.example/three/-/three-1.0.0.tgz?token=secret" }
    } }));
    const report = collectDependencyGraph(root, { installProfiles: ["profile"] });
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "three", edge: expect.objectContaining({ source: "override", selector: "three>helper" }) }),
      expect.objectContaining({ name: "three", edge: expect.objectContaining({ source: "lock-catalog", name: "renderer", specifierName: "three", resolvedName: "playcanvas" }) }),
      expect.objectContaining({ name: "playcanvas", edge: expect.objectContaining({ source: "lock-catalog", name: "renderer" }) }),
      expect.objectContaining({ name: "three", edge: expect.objectContaining({ source: "lock-importer", field: "peerBindings", via: "utility" }) }),
      expect.objectContaining({ name: "playcanvas", edge: expect.objectContaining({ source: "lock-snapshot", field: "peerBindings", via: "child" }) }),
      expect.objectContaining({ name: "playcanvas", edge: expect.objectContaining({ source: "lock-package", field: "optionalDependencies", optional: true }) }),
      expect.objectContaining({ name: "three", edge: expect.objectContaining({ source: "lock-package", field: "peerDependencies", optional: true }) }),
      expect.objectContaining({ name: "three", edge: expect.objectContaining({ source: "npm-lock-package", name: "alias", alias: true }) })
    ]));
    expect(report.findings.some(({ name }) => name === "three-helper")).toBe(false);
    expect(JSON.stringify(report)).not.toContain("secret");
  });
});

describe("native runtime network observations", () => {
  it("flags every unexpected attempt, including failures, and engine URLs as review candidates", () => {
    const events = [
      { url: "http://127.0.0.1:3210/consumer.js", resourceType: "script", method: "GET" },
      { url: "https://user:password@cdn.example/npm/three@1.0/build/three.module.js?token=secret#fragment", resourceType: "script", failure: "net::ERR_INTERNET_DISCONNECTED" },
      { url: "https://cdn.example/three-helper.js", resourceType: "script" }
    ];
    const report = inspectRuntimeNetwork(events, { allowedOrigins: ["http://127.0.0.1:3210"] });
    expect(report.events.map((event) => event.disposition)).toEqual(["allowed", "unexpected", "unexpected"]);
    expect(report.events[1]).toMatchObject({ url: "https://cdn.example/npm/three@1.0/build/three.module.js", failed: true });
    expect(report.findings).toContainEqual(expect.objectContaining({ event: 1, kind: "engine-reference" }));
    expect(report.findings.some((finding) => finding.event === 2 && finding.kind === "engine-reference")).toBe(false);
    expect(JSON.stringify(report)).not.toMatch(/password|token|secret|fragment/);
    expect(inspectRuntimeNetwork(redactRuntimeNetworkEvents(events), { allowedOrigins: ["http://127.0.0.1:3210"] }).findings).toEqual(report.findings);
  });

  it("requires exact permitted origins and handles opaque or malformed URLs conservatively", () => {
    expect(() => inspectRuntimeNetwork([], { allowedOrigins: ["https://example.org/path"] })).toThrow(/exact HTTP/);
    const report = inspectRuntimeNetwork([
      { url: "https://example.org.evil.test/a.js", resourceType: "script" },
      { url: "not a URL" },
      { url: "data:text/javascript;base64,YQ==" },
      { url: "blob:https://example.org/opaque-token" }
    ], { allowedOrigins: ["https://example.org"] });
    expect(report.events.map((event) => event.disposition)).toEqual(["unexpected", "unexpected", "allowed", "allowed"]);
    expect(report.events[1].url).toBe("[invalid URL]");
    expect(report.events[2].url).toBe("data:[redacted]");
    expect(report.events[3].url).toBe("blob:https://example.org/[redacted]");
  });

  it("records and reclassifies WebSocket attempts without leaking URL credentials or query data", () => {
    const events = [
      { url: "wss://user:password@cdn.example/npm/three@1.0/bridge.js?token=secret#fragment", resourceType: "websocket", method: "GET", failure: "blocked" },
      { url: "wss://cdn.example/three-helper", resourceType: "websocket" },
      { url: "wss://controlled.example/socket", resourceType: "websocket" }
    ];
    // Allowing the HTTPS origin must not implicitly allow its WebSocket peer.
    const options = { allowedOrigins: ["https://controlled.example"] };
    const report = inspectRuntimeNetwork(events, options);
    expect(report.events.map((event) => event.disposition)).toEqual(["unexpected", "unexpected", "unexpected"]);
    expect(report.events[0]).toMatchObject({ url: "wss://cdn.example/npm/three@1.0/bridge.js", failed: true });
    expect(report.findings).toContainEqual(expect.objectContaining({ event: 0, kind: "engine-reference" }));
    expect(report.findings.some((finding) => finding.event === 1 && finding.kind === "engine-reference")).toBe(false);
    expect(JSON.stringify(report)).not.toMatch(/password|token|secret|fragment/);
    expect(inspectRuntimeNetwork(redactRuntimeNetworkEvents(events), options).findings).toEqual(report.findings);
    expect(inspectRuntimeNetwork([events[2]!], { allowedOrigins: ["wss://controlled.example"] }).events[0]?.disposition).toBe("allowed");
  });
});
