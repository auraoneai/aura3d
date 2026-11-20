/**
 * @aura3d/cli 5.6.0 A6 — the help catalog (`aura3d help --json`) lists every command (built-in + C-39 registry)
 * with summary, usage and flags; prd07's verbs are registered; `assets budget` is gone; monorepo-only verbs are marked.
 */
import { describe, expect, it } from "vitest";
import "../../../../packages/aura3d-cli/src/commands/registry";
import {
  builtinCommands,
  cliCatalog,
  cliCatalogCommands,
  formatCommandHelp,
  formatGroupHelp,
  matchCatalogCommand,
  readCliVersion,
  suggestCommands,
  unknownCommandMessage,
  usageFlags
} from "../../../../packages/aura3d-cli/src/cli-help";
import { cliCommandFor, cliCommandNames, codemodFor, codemodNames } from "../../../../packages/aura3d-cli/src/contracts/commands";
import { SKIN_HELP } from "../../../../packages/aura3d-cli/src/skin/command";
import { readFileSync } from "node:fs";

const PROFILE = "general";

/** Names that existed when 5.6.0 shipped A6: they must never silently disappear from the catalog (5.7.0 removed two provider-specific asset commands deliberately). */
const KNOWN_COMMANDS = [
  "animation inspect-clips", "animation package", "animation plan", "animation preview", "animation render", "animation review",
  "animation scene", "animation validate-hero", "animation verify", "assets add", "assets admit", "assets assemble-character",
  "assets bake-impostor", "assets bind-game-route-evidence", "assets certify-game-geometry", "assets export",
  "assets inspect", "assets library", "assets list", "assets lookdev", "assets merge-clips", "assets optimize", "assets prune",
  "assets repair-skin", "assets resolve", "assets review", "assets scan", "assets search", "assets serve", "assets thumbnail",
  "assets typegen", "assets validate", "assets validate-animation", "assets validate-animation-studio", "assets validate-game",
  "check-deploy", "codemod", "core inspect-programs", "doctor", "environments bake", "evidence judge", "examples", "help",
  "import-three", "info", "init", "look capture", "look judge", "look lint", "look rubric", "migrate lighting",
  "migrate three", "perf gate", "perf-report", "prd08 motion-report", "render", "sfx admit", "validate", "verify", "vfx validate-atlas"
];

describe("help --json catalog", () => {
  const catalog = cliCatalog(PROFILE);
  const names = catalog.commands.map((command) => command.name);

  it("lists every registry command and every built-in, sorted and unique", () => {
    for (const name of cliCommandNames()) expect(names).toContain(name);
    for (const builtin of builtinCommands(PROFILE)) expect(names).toContain(builtin.name);
    expect([...names].sort()).toEqual(names);
    expect(new Set(names).size).toBe(names.length);
    for (const name of KNOWN_COMMANDS) expect(names, name).toContain(name);
  });

  it("gives every command a summary, usage and the flags named in its usage", () => {
    for (const command of catalog.commands) {
      expect(command.summary.length, command.name).toBeGreaterThan(10);
      expect(command.usage, command.name).toContain("aura3d");
      expect(command.flags).toEqual(usageFlags(command.usage, command.name));
      expect(["builtin", "registry"]).toContain(command.source);
    }
    expect(catalog.commands.find((c) => c.name === "assets add")!.flags).toEqual(expect.arrayContaining(["--name", "--type", "--license", "--role"]));
  });

  it("is stable: same input, same JSON; schema, package and version from package.json", () => {
    expect(JSON.stringify(cliCatalog(PROFILE))).toBe(JSON.stringify(catalog));
    // invariant: help --json must report the published package name/version from packages/aura3d-cli/package.json; the toContain checks are on the help catalog, not on source text.
    const pkg = JSON.parse(readFileSync(new URL("../../../../packages/aura3d-cli/package.json", import.meta.url), "utf8")) as { name: string; version: string };
    expect(catalog.schema).toBe("aura3d.cli-help/1");
    expect(readCliVersion()).toEqual({ name: pkg.name, version: pkg.version });
    expect(catalog.version).toBe(pkg.version);
    expect(Object.keys(catalog.exitCodes)).toEqual(["0", "1", "2"]);
  });

  it("built-in entries match the snapshot (registry entries are owned by their lanes)", () => {
    const builtins = catalog.commands.filter((c) => c.source === "builtin").map(({ name, summary, flags, monorepoOnly }) => ({ name, summary, flags, monorepoOnly }));
    expect(builtins).toMatchSnapshot();
  });

  it("registers prd07: vfx validate-atlas and the vfx-pools-to-effects codemod", () => {
    expect(cliCommandFor("vfx validate-atlas")?.owner).toBe("prd07");
    expect(codemodFor("vfx-pools-to-effects")?.owner).toBe("prd07");
    expect(catalog.codemods.map((c) => c.name)).toEqual(codemodNames());
  });

  it("drops the assets budget stub", () => {
    expect(cliCommandFor("assets budget")).toBeUndefined();
    expect(names).not.toContain("assets budget");
  });

  it("marks monorepo-only verbs (whole verb → '(monorepo)' summary; modes → note only)", () => {
    const byName = new Map(catalog.commands.map((c) => [c.name, c]));
    for (const name of ["assets bake-impostor", "assets lookdev", "perf gate"]) {
      expect(byName.get(name)!.summary, name).toMatch(/\(monorepo\)$/);
      expect(byName.get(name)!.monorepoOnly, name).toMatch(/monorepo-only/);
    }
    for (const name of ["assets optimize", "look judge", "codemod"]) {
      expect(byName.get(name)!.summary, name).not.toMatch(/\(monorepo\)$/);
      expect(byName.get(name)!.monorepoOnly, name).toMatch(/^monorepo-only for /);
    }
    expect(byName.get("look judge")!.monorepoOnly).toContain("--judge prism");
    expect(byName.get("assets optimize")!.monorepoOnly).toContain("<id…> mode");
    expect(catalog.codemods.filter((c) => c.monorepoOnly).map((c) => c.name)).toEqual(["animation-3.1", "pin-emissive-defaults"]);
    expect(byName.get("assets add")!.monorepoOnly).toBeUndefined();
  });
});

describe("help <command>", () => {
  const commands = cliCatalogCommands(PROFILE);

  it("matches the longest command and ignores positional args", () => {
    expect(matchCatalogCommand(["assets", "inspect", "model.glb"], commands)?.name).toBe("assets inspect");
    expect(matchCatalogCommand(["animation", "scene", "cast", "add"], commands)?.name).toBe("animation scene");
    expect(matchCatalogCommand(["codemod", "pin-emissive-defaults", "src/**/*.ts"], commands)?.name).toBe("codemod");
    expect(matchCatalogCommand(["nope"], commands)).toBeUndefined();
  });

  it("prints full usage, every alternate form on its own line, and the monorepo note", () => {
    const optimize = formatCommandHelp(commands.find((c) => c.name === "assets optimize")!);
    expect(optimize.split("\n").filter((line) => line.trimStart().startsWith("aura3d assets optimize")).length).toBeGreaterThanOrEqual(3);
    expect(optimize).toContain("Note: monorepo-only for <id…> mode");
    const codemod = formatCommandHelp(commands.find((c) => c.name === "codemod")!);
    expect(codemod).toContain("pin-emissive-defaults (monorepo)");
    expect(codemod).toContain("vfx-pools-to-effects —");
    expect(formatCommandHelp(commands.find((c) => c.name === "assets add")!)).toMatch(/^Usage: aura3d assets add/);
  });

  it("lists a group's commands", () => {
    const look = formatGroupHelp("look", commands)!;
    expect(look).toContain("aura3d look capture");
    expect(look).toContain("aura3d look judge");
    expect(formatGroupHelp("nope", commands)).toBeUndefined();
  });
});

describe("unknown command suggestions", () => {
  const names = cliCatalogCommands(PROFILE).map((c) => c.name);

  it("suggests close names, more specific first", () => {
    expect(suggestCommands(["asets", "add"], names)[0]).toBe("assets add");
    expect(suggestCommands(["assets", "optimise"], names)[0]).toBe("assets optimize");
    expect(suggestCommands(["rendr"], names)).toContain("render");
    expect(suggestCommands(["optimize"], names)).toContain("assets optimize");
    expect(suggestCommands(["zzzzzzzz"], names)).toEqual([]);
  });

  it("names the typed command and points at aura3d help", () => {
    const message = unknownCommandMessage(["asets", "add", "--name", "x"], cliCatalogCommands(PROFILE));
    expect(message).toContain('unknown command "asets add x"');
    expect(message).toContain("Did you mean: aura3d assets add");
    expect(message).toContain("aura3d help --json");
  });
});

describe("SKIN_HELP", () => {
  it("documents every repair-skin flag cli.ts reads", () => {
    for (const flag of ["--out", "--normalize", "--max-influences", "--prune-distant", "--smooth-bridges", "--smooth-threshold", "--smooth-rounds", "--smooth-rings", "--cut-stretch", "--rebuild-limbs", "--material-map", "--refit-skeleton", "--keep-clips", "--json"]) {
      expect(SKIN_HELP, flag).toContain(flag);
    }
    const repair = cliCatalogCommands(PROFILE).find((c) => c.name === "assets repair-skin")!;
    expect(repair.flags).toEqual(expect.arrayContaining(["--refit-skeleton", "--keep-clips", "--smooth-rounds", "--smooth-rings", "--smooth-threshold", "--cut-stretch"]));
  });
});
