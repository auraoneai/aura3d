import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { capabilitySlug, checkReceipts, minorOf, parseAuditRows, validateReceipt } from "../../../tools/receipts/check.mjs";
import { classifyWebGpuEvidence, isSoftwareAdapter } from "../../../tools/receipts/webgpu-evidence.mjs";

const AUDIT = `# Audit

## Engine API

| Capability | Label | Code | Evidence |
|---|---|---|---|
| \`looks.preset(id)\` | shipped | a | b |
| \`tsl\` (62 names), \`compute\` | experimental | a | b |
| Other effects (AO) | partial | a | b |
| \`check-deploy --dist\` | shipped (static checks) | a | b |
`;

describe("receipt gate: audit parsing", () => {
  it("slugs capabilities without backticks or punctuation", () => {
    expect(capabilitySlug("`looks.preset(id)`")).toBe("looks-preset-id");
    expect(minorOf("4.5.2")).toBe("4.5");
  });

  it("finds shipped rows, including 'shipped (static checks)', and skips headers and other labels", () => {
    const rows = parseAuditRows(AUDIT);
    expect(rows.map((row: { slug: string; shipped: boolean }) => [row.slug, row.shipped])).toEqual([
      ["looks-preset-id", true],
      ["tsl-62-names-compute", false],
      ["other-effects-ao", false],
      ["check-deploy-dist", true]
    ]);
  });

  it("parses the real audit: shipped rows exist and every slug is unique", () => {
    const rows = parseAuditRows(readFileSync("docs/comparisons/aura3d-capability-audit.md", "utf8"));
    expect(rows.filter((row: { shipped: boolean }) => row.shipped).length).toBeGreaterThan(20);
    expect(new Set(rows.map((row: { slug: string }) => row.slug)).size).toBe(rows.length);
  });
});

describe("receipt gate: checkReceipts", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "receipt-gate-"));
    mkdirSync(join(root, "docs/comparisons"), { recursive: true });
    mkdirSync(join(root, "evidence/frames"), { recursive: true });
    mkdirSync(join(root, "tests"), { recursive: true });
    writeFileSync(join(root, "docs/comparisons/aura3d-capability-audit.md"), AUDIT);
    writeFileSync(join(root, "package.json"), JSON.stringify({ version: "4.5.1" }));
    writeFileSync(join(root, "tests/a.spec.ts"), "");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function frame(name: string, bytes = "pixels") {
    writeFileSync(join(root, "evidence/frames", name), bytes);
    return { file: `evidence/frames/${name}`, sha256: createHash("sha256").update(bytes).digest("hex"), meanLuma: 90, nonBlackRatio: 0.8 };
  }
  function receipt(slug: string, version: string, patch: Record<string, unknown> = {}) {
    const body = { capability: slug, version, gitSha: "abcdef1", renderer: "swiftshader", scene: "s", frames: [frame(`${slug}.png`)], tests: ["tests/a.spec.ts"], date: "2026-10-28", ...patch };
    mkdirSync(join(root, "evidence/receipts", slug), { recursive: true });
    writeFileSync(join(root, "evidence/receipts", slug, `${version}.json`), JSON.stringify(body));
  }
  const missingSlugs = () => checkReceipts({ repoRoot: root }).missing.map((row: { slug: string }) => row.slug);

  it("fails when shipped rows have no receipt and names them", () => {
    expect(checkReceipts({ repoRoot: root }).pass).toBe(false);
    expect(missingSlugs()).toEqual(["looks-preset-id", "check-deploy-dist"]);
  });

  it("passes when every shipped row has a receipt in the current minor, any patch", () => {
    receipt("looks-preset-id", "4.5.0");
    receipt("check-deploy-dist", "4.5.1");
    expect(checkReceipts({ repoRoot: root }).pass).toBe(true);
  });

  it("does not accept a receipt from an older minor", () => {
    receipt("looks-preset-id", "4.4.0");
    receipt("check-deploy-dist", "4.5.0");
    expect(missingSlugs()).toEqual(["looks-preset-id"]);
  });

  it("lets one receipt cover several rows through `covers`", () => {
    receipt("looks-preset-id", "4.5.0", { covers: ["check-deploy-dist"] });
    expect(checkReceipts({ repoRoot: root }).pass).toBe(true);
  });

  it("rejects a receipt whose frame bytes changed", () => {
    receipt("looks-preset-id", "4.5.0");
    receipt("check-deploy-dist", "4.5.0");
    writeFileSync(join(root, "evidence/frames/looks-preset-id.png"), "tampered");
    const result = checkReceipts({ repoRoot: root });
    expect(result.pass).toBe(false);
    expect(result.invalid[0].problems.join(" ")).toContain("sha256 does not match");
  });

  it("rejects a missing test file and a capability that does not match its directory", () => {
    const problems = validateReceipt(
      { capability: "x", version: "4.5.0", gitSha: "abcdef1", renderer: "r", scene: "s", frames: [frame("f.png")], tests: ["tests/missing.ts"], date: "2026-10-28" },
      { repoRoot: root, minor: "4.5", slug: "y" }
    );
    expect(problems.join(" ")).toContain("does not match its directory");
    expect(problems.join(" ")).toContain("tests/missing.ts does not exist");
  });

  it("rejects out-of-range metrics and non-hex hashes", () => {
    const problems = validateReceipt(
      { capability: "x", version: "4.5.0", gitSha: "nothex!", renderer: "r", scene: "s", date: "2026-10-28", tests: ["tests/a.spec.ts"], frames: [{ file: "evidence/frames/none.png", sha256: "zz", meanLuma: 300, nonBlackRatio: 2 }] },
      { repoRoot: root, minor: "4.5", slug: "x" }
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        "gitSha is not a 7 to 40 character hex string",
        "frames[0].sha256 is not 64 hex characters",
        "frames[0].meanLuma must be a number in 0..255",
        "frames[0].nonBlackRatio must be a number in 0..1"
      ])
    );
  });
});

describe("WebGPU evidence classification", () => {
  const software = { vendor: "google", architecture: "swiftshader", description: "SwiftShader" };
  const gpu = { vendor: "apple", architecture: "metal-3", description: "Apple M2" };
  const base = { backend: "webgpu", dispatch: { workgroups: [1024], readbackExact: true }, render: { frames: 60 }, pixels: { meanLuma: 80, nonBlackRatio: 0.7 } };

  it("detects software adapters", () => {
    expect(isSoftwareAdapter(software)).toBe(true);
    expect(isSoftwareAdapter({ isFallbackAdapter: true, vendor: "x" })).toBe(true);
    expect(isSoftwareAdapter(gpu)).toBe(false);
  });

  it("grants 'software-webgpu' for SwiftShader and 'real-gpu' only for a hardware adapter", () => {
    expect(classifyWebGpuEvidence({ adapter: software, ...base })).toEqual({ claim: "software-webgpu", missing: [] });
    expect(classifyWebGpuEvidence({ adapter: gpu, ...base })).toEqual({ claim: "real-gpu", missing: [] });
  });

  it("grants nothing, and names the gap, when adapter, backend, dispatch, rendering or pixels is missing", () => {
    expect(classifyWebGpuEvidence({ ...base, adapter: undefined }).missing).toEqual(["adapter"]);
    expect(classifyWebGpuEvidence({ adapter: gpu, ...base, backend: "webgl2" }).missing).toEqual(["backend"]);
    expect(classifyWebGpuEvidence({ adapter: gpu, ...base, dispatch: { workgroups: [1], readbackExact: false } }).missing).toEqual(["dispatch"]);
    expect(classifyWebGpuEvidence({ adapter: gpu, ...base, render: { frames: 0 } }).missing).toEqual(["rendering"]);
    const blank = classifyWebGpuEvidence({ adapter: gpu, ...base, pixels: { meanLuma: 0, nonBlackRatio: 0 } });
    expect(blank.missing).toEqual(["pixels"]);
    expect(blank.claim).toBe("none");
  });

  it("does not require dispatch for a render-only (TSL material) claim", () => {
    const { dispatch: _dispatch, ...renderOnly } = base;
    expect(classifyWebGpuEvidence({ adapter: gpu, ...renderOnly }, { requireDispatch: false }).claim).toBe("real-gpu");
    expect(classifyWebGpuEvidence({ adapter: gpu, ...renderOnly }).missing).toEqual(["dispatch"]);
  });
});
