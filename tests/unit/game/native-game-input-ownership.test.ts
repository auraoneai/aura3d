import path from "node:path";
import * as ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGame } from "@aura3d/engine/game";
import { createGame as createGameV5 } from "@aura3d/engine/v5/game";
import { scene } from "@aura3d/engine";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function installWindow() {
  const win = new EventTarget() as EventTarget & Record<string, unknown>;
  win.__AURA3D_EVIDENCE_OPT_IN__ = true;
  win.location = { search: "", pathname: "/", href: "http://localhost/" };
  vi.stubGlobal("window", win);
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  return win;
}

function inputTypeDiagnostics(): number[] {
  const root = process.cwd();
  const probe = path.join(root, "__game_input_type_probe__.ts");
  const internal = path.join(root, "__game_internal_type_probe__.d.ts");
  const input = path.join(root, "__game_input_controller_type_probe__.d.ts");
  const app = path.join(root, "__game_app_type_probe__.d.ts");
  const legacy = path.join(root, "packages/game/src/index.ts");
  const modern = path.join(root, "packages/game/src/v5.ts");
  const shared = path.join(root, "packages/game/src/shared.ts");
  const core = path.join(root, "packages/game/src/createGameCore.ts");
  const runtime = path.join(root, "packages/engine/src/agent-api/GameAppRuntime.ts");
  const files = new Map<string, string>([
    [probe, `
      import type { Prd09Game as LegacyGame } from "@aura3d/engine/game";
      import type { Prd09Game as ModernGame } from "@aura3d/engine/v5/game";
      const legacyHasInputProperty: Pick<LegacyGame<string, string>, "input"> = { input: undefined };
      const modernHasInputProperty: Pick<ModernGame<string, string>, "input"> = { input: undefined };
      const legacyMayBeUndefined: LegacyGame<string, string>["input"] = undefined;
      const modernMayBeUndefined: ModernGame<string, string>["input"] = undefined;
      declare const legacy: LegacyGame<string, string>;
      declare const modern: ModernGame<string, string>;
      if (legacy.input) legacy.input.press("Space");
      if (modern.input) modern.input.press("Space");
      legacy.input.press("Space");
      modern.input.press("Space");
    `],
    [internal, `
      export interface Game<A = string, B = string> {}
      export type AuraApp = any;
      export { GameAppRuntime } from "runtime-probe";
    `],
    [input, `
      export interface GameInputController { press(key: string): void }
      export interface GameInputOptions {}
    `],
    [app, "export interface AuraAppHandle {}"]
  ]);
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler
  };
  const host = ts.createCompilerHost(options);
  const read = host.readFile.bind(host);
  const exists = host.fileExists.bind(host);
  const source = host.getSourceFile.bind(host);
  host.readFile = (name) => files.get(name) ?? read(name);
  host.fileExists = (name) => files.has(name) || exists(name);
  host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) =>
    files.has(name)
      ? ts.createSourceFile(name, files.get(name)!, languageVersion, true)
      : source(name, languageVersion, onError, shouldCreateNewSourceFile);
  host.resolveModuleNames = (names, containingFile) => names.map((name) => {
    let found: string | undefined;
    if (containingFile === probe && name === "@aura3d/engine/game") found = legacy;
    if (containingFile === probe && name === "@aura3d/engine/v5/game") found = modern;
    if ((containingFile === legacy || containingFile === modern) && (name === "./shared" || name === "./shared.js")) found = shared;
    if (containingFile === shared && name === "./createGameCore") found = core;
    if (containingFile === core && name === "@aura3d/engine/v5/internal") found = internal;
    if (containingFile === internal && name === "runtime-probe") found = runtime;
    if (containingFile === runtime && name === "./GameRuntimeCore.js") found = input;
    if (containingFile === runtime && name === "./AuraAppHandle") found = app;
    return found === undefined
      ? undefined
      : { resolvedFileName: found, extension: found.endsWith(".d.ts") ? ts.Extension.Dts : ts.Extension.Ts };
  });
  const program = ts.createProgram([probe], options, host);
  return program.getSemanticDiagnostics(program.getSourceFile(probe)!).map((diagnostic) => diagnostic.code);
}

describe("full game input and evidence ownership", () => {
  it("exposes possibly undefined input consistently through both public entry types", () => {
    expect(inputTypeDiagnostics()).toEqual([18048, 18048]);
  });

  it.each([
    ["legacy", createGame],
    ["v5", createGameV5]
  ])("%s keeps input absent when unconfigured and owns the configured controller", async (_entry, makeGame) => {
    const withoutInput = makeGame({
      id: "no-input", target: null, autoStart: false, scene: () => scene()
    });
    const withInput = makeGame({
      id: "configured-input", target: null, autoStart: false, scene: () => scene(),
      input: { actions: { jump: ["Space"] }, autoListen: false }
    });
    try {
      expect(withoutInput.input).toBeUndefined();
      expect(Object.hasOwn(withoutInput, "input")).toBe(true);
      expect(withoutInput.runtime.input).toBeUndefined();
      expect(withoutInput.runtime.evidence.inputControllers).toBe(0);
      expect(withInput.input).toBe(withInput.runtime.input);
      expect(withInput.runtime.evidence.inputControllers).toBe(1);
      withInput.input!.press("Space");
      withInput.runtime.step(1 / 60);
      expect(withInput.input!.held("jump")).toBe(true);
    } finally {
      await withoutInput.dispose();
      await withInput.dispose();
    }
    expect(withInput.runtime.evidence.activeInputControllers).toBe(0);
  });

  it("keeps the newer public game evidence when an older game with the same id disposes", async () => {
    const win = installWindow();
    const options = {
      id: "shared-game", target: null, autoStart: false, scene: () => scene(),
      evidence: { schema: 1, legacyGlobals: ["__SHARED_GAME__"] }
    };
    const first = createGame(options);
    const second = createGame(options);
    const registry = win.__AURA3D_GAME_EVIDENCE__ as Record<string, unknown>;
    try {
      const secondEvidence = registry["shared-game"];
      expect(win.__SHARED_GAME__).toBe(secondEvidence);
      await first.dispose();
      expect(registry["shared-game"]).toBe(secondEvidence);
      expect(win.__SHARED_GAME__).toBe(secondEvidence);
    } finally {
      await first.dispose();
      await second.dispose();
    }
    expect(Object.hasOwn(registry, "shared-game")).toBe(false);
    expect(Object.hasOwn(win, "__SHARED_GAME__")).toBe(false);
  });

  it("restores a live legacy game's evidence after an overlapping v5 game disposes", async () => {
    const win = installWindow();
    const options = {
      id: "shared-game", target: null, autoStart: false, scene: () => scene(),
      evidence: { schema: 1, legacyGlobals: ["__SHARED_GAME__"] }
    };
    const first = createGame(options);
    const registry = win.__AURA3D_GAME_EVIDENCE__ as Record<string, unknown>;
    const firstEvidence = registry["shared-game"];
    const second = createGameV5(options);
    try {
      expect(registry["shared-game"]).not.toBe(firstEvidence);
      await second.dispose();
      expect(registry["shared-game"]).toBe(firstEvidence);
      expect(win.__SHARED_GAME__).toBe(firstEvidence);
    } finally {
      await second.dispose();
      await first.dispose();
    }
    expect(Object.hasOwn(registry, "shared-game")).toBe(false);
    expect(Object.hasOwn(win, "__SHARED_GAME__")).toBe(false);
  });

  it("releases game listeners when evidence installation rejects a reserved alias", () => {
    const win = installWindow();
    const add = vi.spyOn(win, "addEventListener");
    const remove = vi.spyOn(win, "removeEventListener");
    const cancel = vi.spyOn(globalThis, "cancelAnimationFrame");

    expect(() => createGame({
      id: "invalid-alias", target: null, autoStart: false, scene: () => scene(),
      evidence: { schema: 1, legacyGlobals: ["__AURA3D_GAME_EVIDENCE__"] }
    })).toThrow(/EVIDENCE_CHANNEL_RESERVED_ALIAS_V1/);
    const keydown = add.mock.calls.find(([name]) => name === "keydown")?.[1];
    expect(keydown).toBeDefined();
    expect(remove).toHaveBeenCalledWith("keydown", keydown);
    expect(cancel).toHaveBeenCalledWith(1);
    expect(Object.hasOwn(win, "__AURA3D_GAME_EVIDENCE__")).toBe(false);
  });
});
