import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { camera, createAuraApp, material, primitives, scene } from "@aura3d/engine";

/**
 * WS-2.5 — the Canvas 2D path is internal and diagnostic-only.
 *
 * `renderDiagnosticPreviewToCanvas` draws a linear gradient, a grid, and a coloured rectangle per node.
 * It is a schematic, not a render, and it has already produced one real defect class: world labels
 * reached the scene graph but were drawn only there, so every production callout was silently dropped
 * while evidence counted the nodes.
 *
 * The defect was the *selection rule*, not the function. It was the fallback for anything the WebGL path
 * declined, so a developer whose scene failed to qualify got a plausible-looking gradient frame with no
 * indication they were not looking at their renderer.
 */
const source = readFileSync("packages/engine/src/agent-api/index.ts", "utf8");

describe("Canvas 2D is diagnostic-only (WS-2.5)", () => {
  it("is named for what it is", () => {
    expect(source).toContain("function renderDiagnosticPreviewToCanvas(");
    // The old name described a render. Nothing may call it under that name again.
    expect(source).not.toContain("function renderSceneToCanvas(");
    expect(source).not.toMatch(/=\s*renderSceneToCanvas\(/);
  });

  it("has exactly one selection site, and it refuses the 2D path for a renderable scene", () => {
    /*
     * Asserted on the selection rule rather than by constructing the failure.
     *
     * The behavioural case — a real canvas whose WebGL2 context cannot be created — is not reachable
     * from Node: `resolveCanvas` requires a genuine `HTMLCanvasElement`, which does not exist here, so a
     * stub throws "HTMLCanvasElement is not defined" before the selection rule is consulted. Faking it
     * further would test the fake. The runtime half lives in
     * `tests/browser/canvas2d-diagnostic-only.spec.ts`, where a canvas is real.
     *
     * What this pins is the rule itself: a scene declaring renderable content, on a supplied canvas,
     * with no WebGL2, must throw rather than silently draw a schematic.
     */
    const guard = source.slice(source.indexOf("const declaresRenderableContent"), source.indexOf("const backend: AuraBackend"));
    expect(guard).toContain("declaresRenderableContent && canvas && !shouldUseProductionRenderer");
    expect(guard).toContain("NOT fall back to the Canvas 2D diagnostic preview");
    // And the throw must name a cause and a fix, not merely fail.
    expect(guard).toContain("Suggested fix:");
  });

  it("still allows a headless app with no canvas, because that is a legitimate pattern", () => {
    /*
     * Deliberately not covered by the throw. Constructing an app with no canvas is how a large number of
     * tests exercise scene, runtime and physics behaviour, and `createAuraApp(undefined, ...)` is the
     * documented way to reach `app.physics` without rendering. Throwing here would break working
     * semantics to satisfy a rendering rule, which R7 forbids — and such a caller is not being shown a
     * misleading frame, they are not being shown a frame at all.
     */
    const app = createAuraApp(undefined as never, {
      scene: scene().add(primitives.box({ material: material.pbr({ color: "#fff" }) }))
    });
    expect(app.backend).toBe("headless");
    app.dispose();
  });

  it("documents canvas2d as internal on the public backend union", () => {
    const unionIndex = source.indexOf('export type AuraBackend =');
    const doc = source.slice(Math.max(0, unionIndex - 900), unionIndex);
    expect(doc).toContain("internal and diagnostic-only");
    expect(doc).toContain("never selected for a scene that");
  });
});
