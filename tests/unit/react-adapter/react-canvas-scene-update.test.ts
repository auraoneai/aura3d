import { createElement } from "react";
import { describe, expect, test, vi } from "vitest";
import { defineAuraAssets } from "../../../packages/engine/src";
import {
  Camera,
  Lights,
  Model,
  Scene,
  applySceneChange,
  buildSceneFromChildren,
  sceneChildrenKey
} from "../../../packages/react/src";

/**
 * anim-phys-10: AuraCanvas ran `JSON.stringify(scene.toJSON())` on every render and disposed and
 * recreated the app (and its WebGL context) whenever the scene changed. It now keys the children
 * without building the scene and hands a changed scene to the live app with `setScene`.
 */
const assets = defineAuraAssets({
  product: { type: "model", format: "glb", url: "/aura-assets/product.12345678.glb", hash: "sha256-product" }
} as const);

const tree = (distance: number, extra: Record<string, unknown> = {}) => [
  createElement(Scene, { background: "#000" }, createElement(Model, { asset: assets.product, name: "product", ...extra })),
  createElement(Camera, { mode: "orbit", distance }),
  createElement(Lights, { preset: "studio" })
];

describe("sceneChildrenKey", () => {
  test("is stable for identical children rebuilt on a re-render", () => {
    expect(sceneChildrenKey(tree(4))).toBe(sceneChildrenKey(tree(4)));
  });

  test("changes when a scene prop changes, including inside <Scene>", () => {
    expect(sceneChildrenKey(tree(4))).not.toBe(sceneChildrenKey(tree(6)));
    expect(sceneChildrenKey(tree(4))).not.toBe(sceneChildrenKey(tree(4, { targetHeight: 2 })));
  });

  test("ignores React-only props: a new inline fallback or loader does not change the scene", () => {
    const a = tree(4, { fallback: createElement("span", null, "loading"), loader: async () => ({ ok: true, loaded: [], failed: [] }) });
    const b = tree(4, { fallback: createElement("b", null, "wait"), loader: async () => ({ ok: true, loaded: [], failed: [] }) });
    expect(sceneChildrenKey(a)).toBe(sceneChildrenKey(b));
  });

  test("never builds or serializes the scene", () => {
    const toJSON = vi.fn();
    const spy = { toJSON } as never;
    sceneChildrenKey([createElement(Model, { asset: assets.product, material: spy })]);
    expect(toJSON).toHaveBeenCalledTimes(1); // the material prop's own toJSON (JSON.stringify), not scene().toJSON()
  });
});

describe("applySceneChange", () => {
  test("calls setScene once per scene change and keeps the app", () => {
    const app = { setScene: vi.fn() };
    const k4 = sceneChildrenKey(tree(4));
    const k6 = sceneChildrenKey(tree(6));
    let mounted = k4;
    mounted = applySceneChange(app, mounted, k4, buildSceneFromChildren(tree(4)));
    expect(app.setScene).not.toHaveBeenCalled();
    const next = buildSceneFromChildren(tree(6));
    mounted = applySceneChange(app, mounted, k6, next);
    expect(app.setScene).toHaveBeenCalledTimes(1);
    expect(app.setScene).toHaveBeenCalledWith(next);
    expect(mounted).toBe(k6);
    applySceneChange(app, mounted, k6, next);
    expect(app.setScene).toHaveBeenCalledTimes(1);
  });
});

describe("buildSceneFromChildren passes only model options to model()", () => {
  test("Suspense props and the asset raise no OPTION_IGNORED note", () => {
    const snapshot = buildSceneFromChildren([
      createElement(Model, {
        asset: assets.product,
        name: "product",
        suspendOnLoad: [{ id: "product", url: "/aura-assets/product.12345678.glb" }],
        fallback: createElement("span", null, "loading")
      })
    ]).toJSON();
    const node = snapshot.nodes.find((entry) => entry.kind === "model") as { ignoredOptions?: readonly string[]; name?: string };
    expect(node.name).toBe("product");
    expect(node.ignoredOptions).toBeUndefined();
  });
});
