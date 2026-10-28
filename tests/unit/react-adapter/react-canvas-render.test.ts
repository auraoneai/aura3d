import { createElement } from "react";
// @ts-ignore -- @types/react-dom is not installed in this workspace; renderToStaticMarkup is all this file uses.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { defineAuraAssets } from "../../../packages/engine/src";
import {
  AuraAppContext,
  AuraCanvas,
  Camera,
  Effect,
  Lights,
  Model,
  Scene,
  buildSceneFromChildren,
  sceneMountKey,
  useAuraApp,
  useAuraFrame
} from "../../../packages/react/src";

const assets = defineAuraAssets({
  product: { type: "model", format: "glb", url: "/aura-assets/product.12345678.glb", hash: "sha256-product" }
} as const);

// react-dom/server runs render but not effects, which is exactly the half of AuraCanvas that must hold before
// mount: what it renders, and what its children can see. The effect half (mount, dispose, listeners) needs a
// browser and is covered by the remote Playwright run, not here.
describe("@aura3d/react AuraCanvas render tree", () => {
  test("renders one canvas with the default fill style and merges className and style", () => {
    const html = renderToStaticMarkup(createElement(AuraCanvas, { className: "viewer", style: { height: 240 } }));
    expect(html.match(/<canvas/g)).toHaveLength(1);
    expect(html).toContain('class="viewer"');
    expect(html).toContain("width:100%");
    expect(html).toContain("height:240px");
    expect(html).toContain("display:block");
  });

  test("renders non-declarative children inside the app provider, so hooks and overlays run", () => {
    let sawContext = false;
    let hookRan = false;
    const Probe = (): ReturnType<typeof createElement> => {
      sawContext = useAuraApp() === undefined; // before mount the provider value is undefined, but the provider is present
      useAuraFrame(() => undefined);
      hookRan = true;
      return createElement("i", { "data-probe": "yes" });
    };
    const html = renderToStaticMarkup(createElement(AuraCanvas, {}, createElement(Scene, { background: "#000" }), createElement(Probe)));
    expect(html).toContain('<i data-probe="yes"></i>');
    expect(sawContext).toBe(true);
    expect(hookRan).toBe(true);
    expect(AuraAppContext).toBeDefined();
  });

  test("declarative children (Scene, Model, Camera, Lights, Effect) add no DOM", () => {
    const html = renderToStaticMarkup(
      createElement(
        AuraCanvas,
        {},
        createElement(Scene, { background: "#08111f" }, createElement(Model, { asset: assets.product })),
        createElement(Camera, { mode: "orbit", distance: 4 }),
        createElement(Lights, { preset: "studio" }),
        createElement(Effect, { type: "bloom", intensity: 0.3 })
      )
    );
    expect(html.replace(/<canvas[^>]*><\/canvas>/, "")).toBe("");
  });
});

describe("@aura3d/react sceneMountKey", () => {
  const tree = (distance: number) => [createElement(Model, { asset: assets.product }), createElement(Camera, { mode: "orbit", distance })];

  test("is stable across re-renders that rebuild identical children, so the app is not remounted", () => {
    expect(sceneMountKey(buildSceneFromChildren(tree(4)))).toBe(sceneMountKey(buildSceneFromChildren(tree(4))));
  });

  test("changes when the scene changes", () => {
    expect(sceneMountKey(buildSceneFromChildren(tree(4)))).not.toBe(sceneMountKey(buildSceneFromChildren(tree(6))));
  });

  test("an unserializable snapshot never reuses a key (falls back to remount, not a stale scene)", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const builder = { toJSON: () => cyclic } as unknown as Parameters<typeof sceneMountKey>[0];
    expect(sceneMountKey(builder)).not.toBe(sceneMountKey(builder));
  });
});
