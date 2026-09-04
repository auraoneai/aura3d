import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertNoUndocumentedRendererMount,
  classifyRouteMount,
  findUndocumentedRendererMounts,
} from "../../../tools/root-path-integrity/renderer-mount-policy";

const ROOT_ROUTE = `import { createAuraApp } from "@aura3d/engine";
const app = createAuraApp("#app", { scene });`;
const ADVANCED_ROUTE = `import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
const renderer = await A3DRenderer.create();`;
const BARE_CORE_ROUTE = `import { Renderer } from "@aura3d/rendering";
const renderer = await Renderer.create();`;

describe("T1a assertNoUndocumentedRendererMount", () => {
  test("root production-bridge mounts are documented", () => {
    expect(classifyRouteMount("apps/demo/src/main.ts", ROOT_ROUTE).violation).toBeNull();
    expect(classifyRouteMount("apps/demo/src/main.ts", ROOT_ROUTE).classification?.bucket).toBe(
      "root-production-bridge"
    );
  });

  test("advanced subordinate mounts require the advanced-runtime import and apps/ scope", () => {
    expect(classifyRouteMount("apps/demo/src/main.ts", ADVANCED_ROUTE).violation).toBeNull();
    const unattributed = classifyRouteMount(
      "apps/demo/src/main.ts",
      "const renderer = await A3DRenderer.create();"
    );
    expect(unattributed.violation?.reason).toMatch(/unattributed/);
    const inTemplate = classifyRouteMount(
      "packages/create-aura3d/templates/demo/src/main.ts",
      ADVANCED_ROUTE
    );
    expect(inTemplate.violation?.reason).toMatch(/outside apps/);
  });

  test("bare core Renderer.create mounts are apps-scoped evidence routes", () => {
    expect(classifyRouteMount("apps/demo/src/main.ts", BARE_CORE_ROUTE).violation).toBeNull();
    const inExample = classifyRouteMount("examples/demo/src/main.ts", BARE_CORE_ROUTE);
    expect(inExample.violation?.reason).toMatch(/outside apps/);
  });

  test("the zero-route AdvancedRenderer alias fails closed when mounted", () => {
    const violation = classifyRouteMount(
      "apps/demo/src/main.ts",
      "import { AdvancedRenderer } from '@aura3d/rendering';\nconst r = await AdvancedRenderer.create();"
    ).violation;
    expect(violation?.reason).toMatch(/zero-route alias/);
  });

  test("forbidden primitives fail closed", () => {
    const cases: ReadonlyArray<[string, string]> = [
      ["three import", `import { WebGLRenderer } from "three";`],
      ["three examples import", `import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";`],
      ["WebGLRenderer", `const r = new WebGLRenderer();`],
      ["new Renderer", `const r = new Renderer(canvas);`],
      ["unsafeModelUrl", `model(unsafeModelUrl("https://x/y.glb"))`],
      ["string model id", `model("hero-id")`],
    ];
    for (const [label, content] of cases) {
      expect(
        classifyRouteMount("apps/demo/src/main.ts", content).violation,
        label
      ).not.toBeNull();
    }
  });

  test("the repo's own @aura3d/assets GLTFLoader is legitimate surface", () => {
    const content = `import { GLTFLoader, LoadContext } from "@aura3d/assets";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
const asset = await new GLTFLoader().load({ url }, new LoadContext());
const renderer = await A3DRenderer.create();`;
    expect(classifyRouteMount("apps/loader-demo/src/main.ts", content).violation).toBeNull();
  });

  test("headless root logic mounts claim no pixels", () => {
    const content = `import { createGameApp } from "@aura3d/engine";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
const gameApp = createGameApp(null, { scene });
const renderer = await A3DRenderer.create({ canvas });`;
    const result = classifyRouteMount("apps/arena/src/app.ts", content);
    expect(result.violation).toBeNull();
    expect(result.classification?.bucket).toBe("advanced-subordinate");
    expect(result.classification?.detail).toMatch(/headless root logic mount/);
  });

  test("headed dual mounts still fail closed", () => {
    const violation = findUndocumentedRendererMounts([
      {
        path: "apps/arena/src/app.ts",
        content: `const app = createGameApp("#app", { scene });\n${ADVANCED_ROUTE}`,
      },
    ]);
    expect(violation).toHaveLength(1);
    expect(violation[0]?.reason).toMatch(/more than one renderer bucket/);
  });

  test("routes mounting two renderer buckets fail closed", () => {
    const violation = findUndocumentedRendererMounts([
      { path: "apps/demo/src/main.ts", content: `${ROOT_ROUTE}\n${ADVANCED_ROUTE}` },
    ]);
    expect(violation).toHaveLength(1);
    expect(violation[0]?.reason).toMatch(/more than one renderer bucket/);
  });

  test("assert throws with path and reason", () => {
    expect(() =>
      assertNoUndocumentedRendererMount([
        { path: "apps/demo/src/main.ts", content: `import { x } from "three";` },
      ])
    ).toThrow(/apps\/demo\/src\/main\.ts/);
  });

  test("live tree: violations match the ratified known set exactly", () => {
    const files = readRouteSources();
    expect(files.length).toBeGreaterThan(100);
    const violations = findUndocumentedRendererMounts(files);
    expect(
      violations.map((violation) => `${violation.path} :: ${violation.reason}`)
    ).toEqual([...KNOWN_UNDOCUMENTED_MOUNTS]);
    // The gate is not vacuous: each documented bucket is exercised live.
    const buckets = new Set(
      files
        .map((file) => classifyRouteMount(file.path, file.content).classification?.bucket)
        .filter(Boolean)
    );
    expect(buckets).toContain("root-production-bridge");
    expect(buckets).toContain("advanced-subordinate");
    expect(buckets).toContain("bare-core-evidence");
  });
});

/**
 * Ratchet, not a waiver (source-verified 2026-09-04). The one live item is
 * real T1 drift, not file-scope-fixable here:
 * - animation-studio `scene-player.ts` mounts the advanced subordinate
 *   A3DRenderer inside a user-facing scaffold (J3 lane). The T1 single-story
 *   objective wants root or documented-advanced-apps only; moving this route
 *   is a template-owner decision. ANY change to this list — a fix or a new
 *   undocumented mount — fails the test until it is updated with the new
 *   source-verified set.
 */
const KNOWN_UNDOCUMENTED_MOUNTS: readonly string[] = [
  "packages/create-aura3d/templates/animation-studio/src/scene-player.ts :: A3DRenderer subordinate mount outside apps/ (scope: templates)",

];

function readRouteSources(): Array<{ path: string; content: string }> {
  const roots = [
    "apps",
    "examples",
    "packages/create-aura3d/templates",
  ];
  const files: Array<{ path: string; content: string }> = [];
  const collect = (dir: string, relRoot: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const rel = join(relRoot, entry).replace(/\\/g, "/");
      if (statSync(full).isDirectory()) {
        collect(full, rel);
      } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
        files.push({ path: rel, content: readFileSync(full, "utf8") });
      }
    }
  };
  for (const root of roots) {
    for (const entry of readdirSync(root)) {
      const full = join(root, entry);
      if (!statSync(full).isDirectory()) continue;
      const src = join(full, "src");
      try {
        if (statSync(src).isDirectory()) collect(src, join(root, entry, "src").replace(/\\/g, "/"));
      } catch {
        /* entry without src/ — not a route source tree */
      }
    }
  }
  return files.sort((a, b) => (a.path < b.path ? -1 : 1));
}
