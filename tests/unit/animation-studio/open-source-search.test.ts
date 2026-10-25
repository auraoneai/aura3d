import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OpenSourceNoMatchError,
  OpenSourceSearchError,
  generateWithMeshy,
  locateCli,
  noMatchMessage,
  searchOpenSources,
  toOpenSourceResults,
  type CliRun,
  type CliRunner
} from "../../../packages/create-aura3d/templates/animation-studio/scripts/open-source-search";
import { resolveAsset } from "../../../packages/create-aura3d/templates/animation-studio/scripts/resolve-asset";

const ok = (stdout: string): CliRun => ({ status: 0, stdout, stderr: "" });
const report = (candidates: unknown[]) => ok(JSON.stringify({ candidates }));
const good = {
  id: "khronos:CesiumMan",
  source: "khronos",
  title: "Cesium Man",
  license: "CC-BY-4.0",
  autoPullable: true,
  downloadUrl: "https://example.test/CesiumMan.glb",
  author: "Cesium"
};

afterEach(() => vi.unstubAllGlobals());

describe("toOpenSourceResults", () => {
  it("keeps the licence and author the provider reported (never a hard-coded one)", () => {
    const [r] = toOpenSourceResults([{ ...good, license: "CC0-1.0", author: "Poly Haven" }], 10);
    expect(r).toMatchObject({ license: "CC0-1.0", attribution: "Poly Haven", url: good.downloadUrl });
  });

  it("drops candidates that are not licence-clear, downloadable GLBs", () => {
    const out = toOpenSourceResults(
      [
        { ...good, id: "no-license", license: undefined },
        { ...good, id: "not-auto", autoPullable: false },
        { ...good, id: "gltf", downloadUrl: "https://example.test/model.gltf" },
        { ...good, id: "no-url", downloadUrl: undefined },
        { ...good, id: "keeper" }
      ],
      10
    );
    expect(out.map((r) => r.id)).toEqual(["keeper"]);
  });

  it("honours the limit", () => {
    expect(toOpenSourceResults([good, { ...good, id: "b" }, { ...good, id: "c" }], 2)).toHaveLength(2);
  });
});

describe("searchOpenSources", () => {
  it("asks the CLI for the animation profile first and retries without it", () => {
    const calls: string[][] = [];
    const runner: CliRunner = (args) => {
      calls.push([...args]);
      return args.includes("--profile") ? report([]) : report([good]);
    };
    const results = searchOpenSources("walking man", { role: "character", animated: true, runner });
    expect(results.map((r) => r.id)).toEqual(["khronos:CesiumMan"]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(["assets", "search", "walking man", "--json", "--animated", "--profile", "animation-character"]);
    expect(calls[1]).toEqual(["assets", "search", "walking man", "--json", "--animated"]);
  });

  it("uses the prop profile for props and returns [] (never a guess) when nothing matches", () => {
    const calls: string[][] = [];
    const runner: CliRunner = (args) => {
      calls.push([...args]);
      return report([]);
    };
    expect(searchOpenSources("teapot", { role: "prop", runner })).toEqual([]);
    expect(calls[0]).toContain("animation-prop");
  });

  it("throws a search error (not an empty result) when the CLI cannot run", () => {
    const runner: CliRunner = () => ({ status: null, stdout: "", stderr: "", error: new Error("the Aura3D CLI is not installed") });
    expect(() => searchOpenSources("robot", { runner })).toThrow(OpenSourceSearchError);
    expect(() => searchOpenSources("robot", { runner })).toThrow(/not installed/);
  });

  it("throws when the CLI fails without a report", () => {
    const runner: CliRunner = () => ({ status: 2, stdout: "", stderr: "boom\nstack", });
    expect(() => searchOpenSources("robot", { runner })).toThrow(/open-source search failed: boom/);
  });

  it("rejects output that is not JSON", () => {
    expect(() => searchOpenSources("robot", { runner: () => ok("no report here") })).toThrow(OpenSourceSearchError);
  });
});

describe("noMatchMessage", () => {
  it("says plainly nothing was found and names both next steps", () => {
    const msg = noMatchMessage("dragon", "drake", "character");
    expect(msg).toMatch(/No open-source model matched "dragon"/);
    expect(msg).toMatch(/--file \.\/your-rigged-character\.glb/);
    expect(msg).toMatch(/--allow-meshy --budget 40/);
    expect(noMatchMessage("crate", "box", "prop")).toMatch(/--allow-meshy --budget 30/);
    expect(noMatchMessage("crate", "box", "prop")).toMatch(/aura3d assets add/);
  });
});

describe("locateCli", () => {
  it("prefers AURA3D_CLI and otherwise needs an installed binary", () => {
    expect(locateCli("/nonexistent", { AURA3D_CLI: "/opt/aura3d" })).toBe("/opt/aura3d");
    expect(locateCli("/nonexistent", {})).toBeUndefined();
  });
});

describe("generateWithMeshy", () => {
  const meshyReport = {
    chosen: "meshy",
    costCredits: 30,
    meshy: { ran: true, prompt: "a wooden crate", estimateCredits: 30, commands: ["meshy generate --out /tmp/out-crate"] }
  };

  it("runs the CLI ladder with the budget and returns the generated GLB", () => {
    const calls: string[][] = [];
    const runner: CliRunner = (args) => {
      calls.push([...args]);
      return ok(JSON.stringify(meshyReport));
    };
    const out = generateWithMeshy("crate", "box", "prop", 30, runner, () => ["/tmp/out-crate/model.glb"]);
    expect(out).toEqual({ file: "/tmp/out-crate/model.glb", prompt: "a wooden crate", credits: 30 });
    expect(calls[0]).toEqual(["assets", "resolve", "crate", "--name", "box", "--role", "prop", "--allow", "meshy", "--budget", "30", "--json"]);
  });

  it("explains why Meshy did not run instead of pretending", () => {
    const runner: CliRunner = () =>
      ok(JSON.stringify({ chosen: "none", skipped: [{ rung: "meshy", reason: "budget 10 is below the estimate" }] }));
    expect(() => generateWithMeshy("crate", "box", "prop", 10, runner, () => [])).toThrow(/budget 10 is below the estimate/);
  });

  it("fails when Meshy reports success but wrote no GLB", () => {
    const runner: CliRunner = () => ok(JSON.stringify(meshyReport));
    expect(() => generateWithMeshy("crate", "box", "prop", 30, runner, () => [])).toThrow(/no \.glb/);
  });
});

describe("resolveAsset with nothing found", () => {
  it("throws OpenSourceNoMatchError with the next steps and never touches the network", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("network must not be used");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const runner: CliRunner = () => report([]);
    const failure = await resolveAsset("unobtainium golem", "golem", "character", { runner }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(OpenSourceNoMatchError);
    expect((failure as Error).message).toMatch(/--allow-meshy --budget 40/);
    expect((failure as Error).message).toMatch(/--file \.\/your-rigged-character\.glb/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
