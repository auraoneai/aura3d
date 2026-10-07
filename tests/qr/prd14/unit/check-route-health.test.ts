import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * T1.8 — scripts/check-route-health.mjs against fixture dirs (§7.4 rules).
 * Fixture trees live beside the unit dir in route-health-fixtures/<case>/.
 */
const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = `${HERE}/../route-health-fixtures`;
const SCRIPT = `${HERE}/../../../../scripts/check-route-health.mjs`;

function run(dir, routes = []) {
  const args = [SCRIPT, "--dir", dir];
  if (routes.length) args.push("--routes", routes.join(","));
  try {
    const out = execFileSync("node", args, { encoding: "utf8" });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

describe("check-route-health.mjs (T1.8)", () => {
  it("passes an accepted route with human acceptedBy", () => {
    const r = run(ROOT, ["good-accepted"]);
    expect(r.code).toBe(0);
  });

  it("passes an in-rebuild route not publicly showcased", () => {
    const r = run(ROOT, ["good-in-rebuild"]);
    expect(r.code).toBe(0);
  });

  it("fails when publicShowcase: true and qualityGate.status !== accepted", () => {
    const r = run(ROOT, ["bad-showcase-unaccepted"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("publicShowcase: true");
    expect(r.out).toContain("in-rebuild");
  });

  it("fails when an accepted gate has empty acceptedBy", () => {
    const r = run(ROOT, ["bad-accepted-empty"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("acceptedBy");
  });

  it("fails when acceptedBy contains an agent session id", () => {
    const r = run(ROOT, ["bad-accepted-agent"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("agent id");
    expect(r.out).toContain("devin-9f8a7b6c5d");
  });

  it("fails when acceptedBy contains a GitHub bot login", () => {
    const r = run(ROOT, ["bad-accepted-bot"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("dependabot[bot]");
  });

  it("fails on remaining free-text claim/systems and sourceOccurrences in a V2 file", () => {
    const r = run(ROOT, ["bad-freetext"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("claim");
    expect(r.out).toContain("systems");
    expect(r.out).toContain("sourceOccurrences");
  });

  it("skips §7.4 schema rules on a pre-migration file (no qualityGate)", () => {
    const r = run(ROOT, ["legacy-freetext"]);
    expect(r.code).toBe(0);
  });

  it("reports every failing fixture in one run", () => {
    const r = run(ROOT);
    expect(r.code).toBe(1);
    for (const name of ["bad-showcase-unaccepted", "bad-accepted-empty", "bad-accepted-agent", "bad-accepted-bot", "bad-freetext"]) {
      expect(r.out).toContain(name);
    }
  });

  it("exits 2 when no route-health files exist", () => {
    const r = run(`${ROOT}/good-accepted`, ["nope"]);
    expect(r.code).toBe(2);
  });
});
