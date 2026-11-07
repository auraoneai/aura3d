import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findPhysicsUsage, PHYSICS_USAGE_PATTERN } from "../../../packages/assets/src/vite/auraPhysics.js";
import {
  PHYSICS_ENTRY_POINTS,
  PHYSICS_ENTRY_TOKENS,
  PHYSICS_NAMESPACE_OBJECTS
} from "../../../packages/assets/src/vite/physicsEntryPoints.generated.js";

/**
 * Lane 519 review fix: the build-time physics strip must keep Rapier for every public engine API that declares bodies
 * internally. The list is generated from the engine sources by packages/assets/scripts/gen-physics-entry-points.mjs.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const GENERATOR = path.join(ROOT, "packages/assets/scripts/gen-physics-entry-points.mjs");

/** A minimal app that uses `entry` the way the docs do: import the root name, call the path, add it to a scene. */
function appUsing(entry: string): string {
  const [root] = entry.split(".");
  return `import { createAuraApp, scene, ${root} } from "@aura3d/engine";\nconst built = ${entry}();\ncreateAuraApp("#stage", { scene: scene().add(...[built].flat()) });\n`;
}

describe("generated physics entry points", () => {
  it("is up to date with the engine sources (regenerate with node packages/assets/scripts/gen-physics-entry-points.mjs)", () => {
    const result = spawnSync(process.execPath, [GENERATOR, "--check"], { cwd: ROOT, encoding: "utf8" });
    expect(`${result.stdout}${result.stderr}`.trim()).toMatch(/is up to date$/);
    expect(result.status).toBe(0);
  }, 600_000);

  it("finds the body-declaring prefabs from the review (miniGolfHole and its alias miniGolfCourse)", () => {
    const paths = PHYSICS_ENTRY_POINTS.map((entry) => entry.path);
    expect(paths).toEqual(expect.arrayContaining(["prefabs.miniGolfHole", "prefabs.miniGolfCourse", "prefabs.physicsPlayground", "prefabs.physicsRamp", "sceneKits", "game", "games"]));
    expect(PHYSICS_ENTRY_POINTS.find((entry) => entry.path === "prefabs.miniGolfHole")?.evidence).toMatch(/AuraNodeBuilder\.physics/);
    expect(PHYSICS_ENTRY_POINTS.find((entry) => entry.path === "prefabs.miniGolfCourse")?.evidence).toMatch(/miniGolfCourse .* -> miniGolfHole/);
    expect(PHYSICS_NAMESPACE_OBJECTS).toContain("prefabs");
  });

  it("does not flag the plain scene APIs (the strip still applies to apps without physics)", () => {
    const paths = new Set(PHYSICS_ENTRY_POINTS.map((entry) => entry.path));
    for (const plain of ["createAuraApp", "scene", "primitives.box", "model", "material.pbr", "lights.studio", "looks.preset", "prefabs.solarSystem"]) {
      expect(paths.has(plain), plain).toBe(false);
    }
  });

  it.each(PHYSICS_ENTRY_POINTS.map((entry) => [entry.path, entry] as const))("an app using %s keeps physics", (entryPath, entry) => {
    expect(findPhysicsUsage(appUsing(entryPath)), entry.evidence).toBeDefined();
    // Not only by accident of the keyword rule: either the app has to spell a keyword, or the generated token matches.
    const segments = entryPath.split(".");
    const spelledKeyword = segments.slice(0, -1).some((segment) => PHYSICS_USAGE_PATTERN.test(segment)) || PHYSICS_USAGE_PATTERN.test(segments.at(-1)!);
    expect(spelledKeyword || PHYSICS_ENTRY_TOKENS.includes(segments.at(-1)!), entryPath).toBe(true);
  });

  it.each(PHYSICS_ENTRY_TOKENS.map((token) => [token]))("the bare name %s keeps physics as an identifier, a member and a string key", (token) => {
    expect(findPhysicsUsage(`use(${token});`)).toBeDefined();
    expect(findPhysicsUsage(`ns.${token}();`)).toBeDefined();
    expect(findPhysicsUsage(`ns["${token}"]();`)).toBeDefined();
  });
});
