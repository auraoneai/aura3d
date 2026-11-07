import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  aura3d,
  auraPhysicsPlugin,
  classifyModule,
  findPhysicsUsage,
  isRapierInitRequest,
  PHYSICS_ON_DEMAND_CONDITION,
  PHYSICS_STRIPPED_MESSAGE,
  scanModuleGraphForPhysics
} from "../../../packages/assets/src/vite/auraDecoders.js";
import { strippedRapierInitSource, strippedRapierPackageSource } from "../../../packages/assets/src/vite/auraPhysics.js";

/** Lane 519: build-time physics selection in the Aura3D Vite plugin (`aura3d({ physics })`). */

describe("physics usage scanner", () => {
  it.each([
    ["declared body", `primitives.box({}).physics({ type: "dynamic" })`],
    ["app.physics", `app.physics.step(dt)`],
    ["preloadPhysics", `await preloadPhysics();`],
    ["ensurePhysics import", `import { ensurePhysics } from "@aura3d/engine/physics";`],
    ["PhysicsWorld", `new PhysicsWorld()`],
    ["rapier import", `import RAPIER from "@dimforge/rapier3d-compat";`],
    ["rigid body", `world.createRigidBody(desc)`],
    ["collider option", `model(assets.crate, { collider: "bounds" })`],
    ["character controller", `createCharacterController(app)`],
    ["genre kit", `game.platformer({ target: "#app" })`],
    ["createGame", `createGame({})`],
    ["scene kits", `sceneKits.arena()`],
    ["vehicle", `createVehicleChassis(spec)`],
    ["computed member with a physics literal", `app["phy" + "sics"]; const key = "physics"; app[key].step()`],
    ["mention in a comment", `// TODO: add physics later\nexport const x = 1;`],
    ["mention in a string", `console.log("no physics yet")`]
  ])("keeps physics for %s", (_label, code) => {
    expect(findPhysicsUsage(code)).toBeDefined();
  });

  it.each([
    ["a lit box", `import { createAuraApp, scene, primitives, material, lights } from "@aura3d/engine";\ncreateAuraApp("#app", { scene: scene().add(primitives.box({ material: material.pbr({ color: "#fff" }) })).add(lights.directional({})) });`],
    ["a product viewer", `const viewer = createAuraApp(canvas, { scene: scene().add(model(assets.chair)), renderer: { quality: "high" } }); await viewer.ready();`],
    ["physical material (not physics)", `material.physical({ clearcoat: 1 })`]
  ])("strips for %s", (_label, code) => {
    expect(findPhysicsUsage(code)).toBeUndefined();
  });

  it("does not see through fully computed access (documented: set physics: true)", () => {
    expect(findPhysicsUsage(`const k = ["ph", "ys", "ics"].join(""); app[k].step()`)).toBeUndefined();
  });
});

describe("module classification", () => {
  const root = mkdtempSync(path.join(tmpdir(), "a3d-519-"));
  const write = (relative: string, json: object) => {
    mkdirSync(path.join(root, relative), { recursive: true });
    writeFileSync(path.join(root, relative, "package.json"), JSON.stringify(json));
  };
  write("app", { name: "my-app", dependencies: { "@aura3d/engine": "5.0.3", "@dimforge/rapier3d-compat": "0.20.0" } });
  write("app/node_modules/addon", { name: "addon", peerDependencies: { "@aura3d/engine": "*" } });
  write("app/node_modules/lodash", { name: "lodash" });
  write("mono/packages/engine", { name: "@aura3d/engine-runtime" });
  write("mono", { name: "@aura3d/engine" });
  write("mono/apps/game", { name: "aura3d-game" });

  it.each([
    ["app/src/main.ts", "app"],
    ["app/index.html", "app"],
    ["app/node_modules/@aura3d/engine/dist/physics-rapier/index.js", "aura"],
    ["app/node_modules/addon/index.js", "aura-addon"],
    ["app/node_modules/lodash/index.js", "skip"],
    ["mono/packages/engine/src/index.ts", "aura"],
    ["mono/apps/game/src/main.ts", "app"],
    ["mono/apps/shared/util.ts", "app"]
  ])("%s is %s", (relative, kind) => {
    expect(classifyModule(path.join(root, relative))).toBe(kind);
  });

  it("skips virtual modules", () => {
    expect(classifyModule("\0vite/preload-helper.js")).toBe("skip");
    expect(classifyModule("virtual:aura3d-decoder-deployment")).toBe("skip");
  });
});

type Info = { code: string; importedIds: string[]; dynamicallyImportedIds: string[] };
function graphContext(modules: Record<string, Info>, known: readonly string[]) {
  const load = vi.fn(async ({ id }: { id: string }) => {
    const info = modules[id];
    if (!info) throw new Error(`unexpected load ${id}`);
    return info;
  });
  return { getModuleIds: () => known[Symbol.iterator](), load };
}
const classifyByPrefix = (id: string) => id.startsWith("/app/") ? "app" as const : id.startsWith("/addon/") ? "aura-addon" as const : id.startsWith("\0") ? "skip" as const : "aura" as const;

describe("module graph scan", () => {
  it("strips when no app module mentions physics, following static and dynamic imports", async () => {
    const context = graphContext({
      "/app/index.html": { code: `import "/app/main.ts"`, importedIds: ["/app/main.ts"], dynamicallyImportedIds: [] },
      "/app/main.ts": { code: `createAuraApp("#app", {})`, importedIds: ["/engine/index.js", "/app/ui.ts"], dynamicallyImportedIds: ["/app/late.ts"] },
      "/app/ui.ts": { code: `export const label = "Hello"`, importedIds: [], dynamicallyImportedIds: [] },
      "/app/late.ts": { code: `export const later = 1`, importedIds: [], dynamicallyImportedIds: [] }
    }, ["/app/index.html", "/engine/physics.js", "\0vite/preload-helper.js"]);
    const result = await scanModuleGraphForPhysics(context, classifyByPrefix);
    expect(result).toEqual({ used: false, scannedModules: 4 });
    // Aura3D package modules are never loaded by the scan.
    expect(context.load.mock.calls.map(([arg]) => arg.id)).not.toContain("/engine/index.js");
  });

  it("keeps physics when a dynamically imported app module uses it", async () => {
    const context = graphContext({
      "/app/main.ts": { code: `import("/app/level.ts")`, importedIds: [], dynamicallyImportedIds: ["/app/level.ts"] },
      "/app/level.ts": { code: `node.physics({ type: "dynamic" })`, importedIds: [], dynamicallyImportedIds: [] }
    }, ["/app/main.ts"]);
    expect(await scanModuleGraphForPhysics(context, classifyByPrefix)).toMatchObject({ used: true, evidence: { id: "/app/level.ts", token: "physics" } });
  });

  it("keeps physics when an Aura3D add-on dependency uses it", async () => {
    const context = graphContext({
      "/app/main.ts": { code: `import { spawn } from "addon"`, importedIds: ["/addon/index.js"], dynamicallyImportedIds: [] },
      "/addon/index.js": { code: `export function spawn(app) { app.physics.createBody({}) }`, importedIds: [], dynamicallyImportedIds: [] }
    }, ["/app/main.ts"]);
    expect(await scanModuleGraphForPhysics(context, classifyByPrefix)).toMatchObject({ used: true, evidence: { id: "/addon/index.js" } });
  });

  it("keeps physics when it cannot find any application module", async () => {
    expect(await scanModuleGraphForPhysics(graphContext({}, ["/engine/index.js"]), classifyByPrefix)).toMatchObject({ used: true });
  });
});

describe("rapier-init request matching", () => {
  it.each([
    ["#aura3d/rapier-init", "/x/node_modules/@aura3d/engine/dist/physics-rapier/index.js", true],
    ["#aura3d/rapier-init", undefined, true],
    ["./rapierInit.js", "/mono/packages/physics-rapier/src/index.ts", true],
    ["./rapierInit.js", "/mono/packages/physics-rapier/dist/index.js", true],
    ["./rapierInit.js", "/mono/packages/other/src/index.ts", false],
    ["./rapierInit.js", undefined, false],
    ["@dimforge/rapier3d-compat", "/mono/packages/physics-rapier/src/index.ts", false]
  ])("%s from %s -> %s", (source, importer, expected) => {
    expect(isRapierInitRequest(source, importer)).toBe(expected);
  });
});

type Hooks = ReturnType<typeof auraPhysicsPlugin>;
function pluginContext(modules: Record<string, Info>, known: readonly string[], resolved?: string) {
  return {
    ...graphContext(modules, known),
    resolve: vi.fn(async () => resolved === undefined ? null : { id: resolved }),
    warn: vi.fn()
  };
}
async function resolveWith(plugin: Hooks, context: ReturnType<typeof pluginContext>, source: string, importer: string, options?: { ssr?: boolean }) {
  return (plugin.resolveId as (this: unknown, ...args: unknown[]) => Promise<string | null>).call(context, source, importer, options);
}
const INIT_IMPORTER = "/x/node_modules/@aura3d/engine/dist/physics-rapier/index.js";
const noPhysicsGraph = (): ReturnType<typeof pluginContext> => pluginContext({
  [path.resolve("/tmp/a3d-519-app/src/main.ts")]: { code: `createAuraApp("#app", { scene })`, importedIds: [], dynamicallyImportedIds: [] }
}, [path.resolve("/tmp/a3d-519-app/src/main.ts")]);

describe("aura3d({ physics }) resolveId / load hooks", () => {
  const configure = (plugin: Hooks, command: "build" | "serve") => plugin.configResolved({ command, logger: { info: () => undefined } });

  it("auto: strips #aura3d/rapier-init and the adapter's Rapier import on build when nothing uses physics", async () => {
    const plugin = auraPhysicsPlugin();
    configure(plugin, "build");
    const context = noPhysicsGraph();
    const init = await resolveWith(plugin, context, "#aura3d/rapier-init", INIT_IMPORTER);
    expect(init).toBe("\0aura3d:physics-stripped-init");
    expect(await resolveWith(plugin, context, "@dimforge/rapier3d-compat", INIT_IMPORTER)).toBe("\0aura3d:physics-stripped-rapier");
    // The app's own Rapier import (there is none here) and other packages' imports are left alone.
    expect(await resolveWith(plugin, context, "@dimforge/rapier3d-compat", "/tmp/a3d-519-app/src/main.ts")).toBeNull();
    expect(await resolveWith(plugin, context, "three", INIT_IMPORTER)).toBeNull();
    const stub = plugin.load(init!) as string;
    expect(stub).not.toMatch(/import\s*\(|from\s+["']@dimforge/);
    expect(stub).toContain(PHYSICS_STRIPPED_MESSAGE);
    expect(plugin.load("\0aura3d:physics-stripped-rapier")).toBe(strippedRapierPackageSource());
    expect(plugin.load("/somewhere/else.js")).toBeNull();
  });

  it("auto: keeps physics when an app module uses it", async () => {
    const plugin = auraPhysicsPlugin({ physics: "auto" });
    configure(plugin, "build");
    const main = path.resolve("/tmp/a3d-519-app/src/main.ts");
    const context = pluginContext({ [main]: { code: `app.physics.step(dt)`, importedIds: [], dynamicallyImportedIds: [] } }, [main]);
    expect(await resolveWith(plugin, context, "#aura3d/rapier-init", INIT_IMPORTER)).toBeNull();
    expect(await resolveWith(plugin, context, "@dimforge/rapier3d-compat", INIT_IMPORTER)).toBeNull();
  });

  it("never strips in vite dev, in SSR, or with physics: true", async () => {
    for (const [options, command, ssr] of [[{}, "serve", false], [{}, "build", true], [{ physics: true }, "build", false]] as const) {
      const plugin = auraPhysicsPlugin(options);
      configure(plugin, command);
      expect(await resolveWith(plugin, noPhysicsGraph(), "#aura3d/rapier-init", INIT_IMPORTER, { ssr })).toBeNull();
    }
  });

  it("physics: false strips even when physics is used", async () => {
    const plugin = auraPhysicsPlugin({ physics: false });
    configure(plugin, "build");
    const context = pluginContext({}, []);
    expect(await resolveWith(plugin, context, "#aura3d/rapier-init", INIT_IMPORTER)).toBe("\0aura3d:physics-stripped-init");
    expect(context.load).not.toHaveBeenCalled();
  });

  it("lazy: adds the on-demand condition and maps the workspace source to the on-demand module", async () => {
    const plugin = auraPhysicsPlugin({ physics: "lazy" });
    expect(plugin.config({})).toEqual({ resolve: { conditions: [PHYSICS_ON_DEMAND_CONDITION, "module", "browser", "development|production"] } });
    expect(plugin.config({ resolve: { conditions: ["custom"] } })).toEqual({ resolve: { conditions: [PHYSICS_ON_DEMAND_CONDITION] } });
    configure(plugin, "serve");
    const source = path.resolve("packages/physics-rapier/src/rapierInit.ts");
    const context = pluginContext({}, [], source);
    expect(await resolveWith(plugin, context, "./rapierInit.js", path.resolve("packages/physics-rapier/src/index.ts")))
      .toBe(path.resolve("packages/physics-rapier/src/rapierInit.ondemand.ts"));
    expect(auraPhysicsPlugin().config({})).toBeNull();
  });

  it("rejects an unknown mode", () => {
    expect(() => auraPhysicsPlugin({ physics: "sometimes" as never })).toThrow(/must be "auto", "lazy", true or false/);
  });

  it("aura3d() bundles the decoder plugin and the physics plugin", () => {
    expect(aura3d().map((plugin) => plugin.name)).toEqual(["aura3d-aura-decoders", "aura3d-physics"]);
    expect(aura3d({ decoders: false, physics: true }).map((plugin) => plugin.name)).toEqual(["aura3d-physics"]);
  });
});

describe("stripped stub runtime contract", () => {
  it("reports the typed PHYSICS_BACKEND_MISSING error with the strip message through the physics adapter", async () => {
    const url = `data:text/javascript,${encodeURIComponent(strippedRapierInitSource())}`;
    const stub = await import(/* @vite-ignore */ url) as Record<string, unknown>;
    expect(stub.rapierLoadMode).toBe("stripped");
    expect((stub.getRapierModule as () => unknown)()).toBeNull();
    const failure = (stub.getRapierInitializationError as () => { cause: Error })().cause;
    expect(failure).toMatchObject({ code: "PHYSICS_BACKEND_MISSING", name: "PhysicsBackendMissingError" });
    expect(failure.message).toBe(`PHYSICS_BACKEND_MISSING: ${PHYSICS_STRIPPED_MESSAGE}`);
    await expect((stub.ensureRapier as () => Promise<unknown>)()).rejects.toMatchObject({ code: "PHYSICS_BACKEND_MISSING" });
  });

  it("the adapter rethrows the stub's typed failure from new PhysicsWorld()", async () => {
    vi.resetModules();
    vi.doMock("../../../packages/physics-rapier/src/rapierInit.js", async () => {
      const url = `data:text/javascript,${encodeURIComponent(strippedRapierInitSource())}`;
      return import(/* @vite-ignore */ url);
    });
    try {
      const rapier = await import("../../../packages/physics-rapier/src/index.js");
      expect(rapier.physicsLoadMode).toBe("stripped");
      expect(rapier.getPhysicsBackendStatus()).toMatchObject({ state: "missing", code: "PHYSICS_BACKEND_MISSING" });
      expect(() => rapier.createRapierPhysicsSync()).toThrowError(`PHYSICS_BACKEND_MISSING: ${PHYSICS_STRIPPED_MESSAGE}`);
    } finally {
      vi.doUnmock("../../../packages/physics-rapier/src/rapierInit.js");
      vi.resetModules();
    }
  }, 60_000);
});
