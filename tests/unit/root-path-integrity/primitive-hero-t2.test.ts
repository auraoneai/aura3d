import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertPrimitiveHeroDisclosure,
  findUndisclosedPrimitiveHeroes,
  usesTypedRig,
} from "../../../tools/root-path-integrity/primitive-hero-policy";

// Shape of the one live route violation (apps/world-war-x-showcase fitness
// function keeps the real file as the source of truth; this fixture proves
// the assert fires on exactly that shape: typed-GLB-first with a retained
// primitive fallback and no abstract label).
const WWX_SHAPED_FALLBACK = `if (fighterAsset) {
    s.add(model(fighterAsset, { name: "typed GLB fighter model" }));
  } else {
    const connectedRig = character.lowPolyHumanoid({ style: "athletic", pose: "side-view", clip: "idle" });
    s.add(group("connected low poly humanoid fighter rig", connectedRig));
  }`;

describe("T2a assertPrimitiveHeroDisclosure", () => {
  test("typed-first with a retained primitive fallback still violates", () => {
    const violations = findUndisclosedPrimitiveHeroes([
      { path: "route.ts", content: WWX_SHAPED_FALLBACK },
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.heroes).toEqual(["character.lowPolyHumanoid"]);
  });

  test("the abstract label clears every primitive hero spelling", () => {
    const content = `// Abstract hero: explicitly stylized, not a product claim.
const a = character.primitiveHumanoid();
const b = character.lowPolyHumanoid();
const c = character.authoredHumanoid();
const d = character.proceduralHumanMesh();
const e = prefabs.primitiveHumanoid();`;
    expect(
      findUndisclosedPrimitiveHeroes([{ path: "route.ts", content }])
    ).toEqual([]);
  });

  test("each hero spelling violates without the label", () => {
    for (const snippet of [
      "character.primitiveHumanoid()",
      "character.lowPolyHumanoid({})",
      "character.authoredHumanoid({})",
      "character.authoredLowPolyHumanoid({})",
      "character.proceduralHumanMesh()",
      "prefabs.primitiveHumanoid()",
    ]) {
      expect(
        findUndisclosedPrimitiveHeroes([{ path: "route.ts", content: snippet }]),
        snippet
      ).toHaveLength(1);
    }
  });

  test("typed-rig exits and non-hero helpers are clean", () => {
    const content = `const hero = model(character.builtInHumanoidAsset(), { name: "typed rig" });
await character.importedRigRuntime({ url });
const bones = character.skeleton();
const clips = character.clips();`;
    expect(findUndisclosedPrimitiveHeroes([{ path: "route.ts", content }])).toEqual([]);
    expect(usesTypedRig(content)).toBe(true);
  });

  test("primitive set dressing without a humanoid hero is clean", () => {
    const content = `scene().add(primitives.capsule({ name: "character stand-in marker" }));`;
    expect(findUndisclosedPrimitiveHeroes([{ path: "route.ts", content }])).toEqual([]);
  });

  test("assert throws with path and hero name", () => {
    expect(() =>
      assertPrimitiveHeroDisclosure([
        { path: "route.ts", content: "character.primitiveHumanoid()" },
      ])
    ).toThrow(/route\.ts.*character\.primitiveHumanoid/);
  });

  test("live: the three migrated templates carry no undisclosed primitive hero", () => {
    const files = readTemplateSources([
      "packages/create-aura3d/templates/mini-game/src",
      "packages/create-aura3d/templates/character-controller/src",
      "packages/create-aura3d/templates/fighting-game/src",
    ]);
    expect(files.length).toBeGreaterThan(3);
    expect(findUndisclosedPrimitiveHeroes(files)).toEqual([]);
    expect(() => assertPrimitiveHeroDisclosure(files)).not.toThrow();
  });

  test("live: the WWX lowPolyHumanoid fallback is a recorded OPEN violation", () => {
    // Route-owner lane item: WorldWarXApp.ts:1074 retains
    // character.lowPolyHumanoid as the missing-asset fallback with no abstract
    // label. This test locks the finding in: fixing WWX must flip this
    // expectation, not silently pass.
    const content = readFileSync(
      "apps/world-war-x-showcase/src/WorldWarXApp.ts",
      "utf8"
    );
    const violations = findUndisclosedPrimitiveHeroes([
      { path: "apps/world-war-x-showcase/src/WorldWarXApp.ts", content },
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.heroes).toContain("character.lowPolyHumanoid");
  });
});

function readTemplateSources(roots: readonly string[]): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  const collect = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) collect(full);
      else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
        files.push({ path: full.replace(/\\/g, "/"), content: readFileSync(full, "utf8") });
      }
    }
  };
  for (const root of roots) collect(root);
  return files;
}
