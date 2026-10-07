import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const TOOL = join(repoRoot, "tools/showcase-library/game-capture-parity.mjs");

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "a3d-parity-"));
  const mk = (route: string, lines: string) => {
    const dir = join(root, "apps", route, "src");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "main.ts"), lines);
  };
  mk("showcase-fixt-art", `const c = url.get("capture");\nvisualReviewCapture ? lights.key.intensity(3) : lights.key.intensity(2);\n`);
  mk("showcase-fixt-framing", `visualReviewCapture ? camera.setPose("hero") : camera.setPose("play");\n`);
  mk("showcase-fixt-transient", `visualReviewCapture ? fx.pulse.stop() : fx.pulse.run();\n`);
  mk("showcase-fixt-unknown", `visualReviewCapture ? frobnicate() : defrob();\n`);
  mk("showcase-fixt-clean", `const seed = url.get("seed");\n`);
  // Scenario file importing only @aura3d/game/capture — exempt.
  const scDir = join(root, "apps", "showcase-fixt-scenarios", "src", "scenarios");
  mkdirSync(scDir, { recursive: true });
  writeFileSync(join(scDir, "pot.ts"), `import { captureFromUrl } from "@aura3d/game/capture";\nconst ctx = captureFromUrl(new URL(window.location.href));\n`);
  mkdirSync(join(root, "apps", "showcase-fixt-scenarios", "src"), { recursive: true });
  writeFileSync(join(root, "apps", "showcase-fixt-scenarios", "src", "main.ts"), `const seed = url.get("seed");\n`);
  return root;
}

function run(args: string[]): { code: number } {
  try {
    execFileSync("node", [TOOL, ...args], { stdio: "pipe" });
    return { code: 0 };
  } catch (e) {
    return { code: (e as { status?: number }).status ?? 1 };
  }
}

describe("tools/showcase-library/game-capture-parity.mjs flags", () => {
  const root = fixtureRoot();
  it("exits 1 under the matching fail flag and 0 without it, per class", () => {
    expect(run(["--root", root, "--routes", "showcase-fixt-art", "--fail-on-art"]).code).toBe(1);
    expect(run(["--root", root, "--routes", "showcase-fixt-art"]).code).toBe(0);
    expect(run(["--root", root, "--routes", "showcase-fixt-framing", "--fail-on-framing"]).code).toBe(1);
    expect(run(["--root", root, "--routes", "showcase-fixt-transient", "--fail-on-transient"]).code).toBe(1);
    expect(run(["--root", root, "--routes", "showcase-fixt-unknown", "--fail-on-unknown"]).code).toBe(1);
    expect(run(["--root", root, "--routes", "showcase-fixt-art", "--fail-on-any"]).code).toBe(1);
    expect(run(["--root", root, "--routes", "showcase-fixt-clean", "--fail-on-any"]).code).toBe(0);
  });
  it("--routes limits scanning to the named routes", () => {
    expect(run(["--root", root, "--routes", "showcase-fixt-clean", "--fail-on-any"]).code).toBe(0);
    expect(run(["--root", root, "--fail-on-any"]).code).toBe(1);
  });
  it("scenario files importing only @aura3d/game/capture are exempt", () => {
    expect(run(["--root", root, "--routes", "showcase-fixt-scenarios", "--fail-on-any"]).code).toBe(0);
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));
});
