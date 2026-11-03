import { afterEach, describe, expect, it, vi } from "vitest";
import { Texture } from "@aura3d/rendering";
import { SceneNode } from "@aura3d/scene";
import type { EditorShell } from "../../../apps/editor/src/EditorShell";
import { EditorViewport } from "../../../apps/editor/src/viewport/EditorViewport";
import { HierarchyPanel } from "../../../apps/editor/src/panels/HierarchyPanel";
import { ConsolePanel } from "../../../apps/editor/src/panels/ConsolePanel";
import { ShaderGraphPanel } from "../../../apps/editor/src/panels/ShaderGraphPanel";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("editor texture inspector runtime-only inventory (S5-WP17-01)", () => {
  it("lists device-held textures no project asset owns, with stable ids, and drops them once released", () => {
    const assetTexture = new Texture({ width: 2, height: 2, data: new Uint8Array(16), label: "asset" });
    const shadowMap = new Texture({ width: 4, height: 4, data: new Uint8Array(64), label: "shadow map" });
    const released = new Texture({ width: 1, height: 1, data: new Uint8Array(4), label: "released" });
    released.dispose();
    const getLiveTextures = vi.fn(() => [assetTexture, shadowMap, released]);
    const viewport = Object.create(EditorViewport.prototype) as EditorViewport;
    Object.assign(viewport, {
      textureAssets: new Map([["asset", { texture: assetTexture }]]),
      meshAssets: new Map(),
      renderer: { device: { getLiveTextures } }
    });

    const listed = viewport.getInspectableTextures();
    expect(listed.map((entry) => [entry.id, entry.texture, entry.origin])).toEqual([
      ["asset", assetTexture, "asset"],
      ["runtime:1", shadowMap, "runtime"]
    ]);
    expect(viewport.getInspectableTextures()[1]!.id).toBe("runtime:1");
    expect(viewport.textureResourceState("runtime:1")).toMatchObject({ status: "ready", gpuResident: true });

    shadowMap.dispose();
    expect(viewport.getInspectableTextures().map((entry) => entry.id)).toEqual(["asset"]);
    expect(viewport.textureResourceState("runtime:1")).toMatchObject({ status: "unloaded" });
    assetTexture.dispose();
  });

  it("shows no runtime entries when the device does not expose an inventory", () => {
    const viewport = Object.create(EditorViewport.prototype) as EditorViewport;
    Object.assign(viewport, { textureAssets: new Map(), meshAssets: new Map(), renderer: { device: {} } });
    expect(viewport.getInspectableTextures()).toEqual([]);
  });
});

function feedback(): { textContent: string } {
  return { textContent: "" };
}

describe("hierarchy keyboard reparenting (S5-WP17-02)", () => {
  function setup() {
    const root = new SceneNode({ id: "root", name: "Root" });
    const a = new SceneNode({ id: "a", name: "A" });
    const b = new SceneNode({ id: "b", name: "B" });
    const c = new SceneNode({ id: "c", name: "C" });
    root.addChild(a); root.addChild(b); a.addChild(c);
    const nodes = new Map([root, a, b, c].map((node) => [node.id, node]));
    const scene = { root, getNodeById: (id: string) => nodes.get(id) };
    const panel = Object.create(HierarchyPanel.prototype) as HierarchyPanel;
    const reparent = vi.fn(async () => undefined);
    const status = feedback();
    const error = feedback();
    Object.assign(panel, { shell: { scene } as unknown as EditorShell, status, error, reparent });
    return { panel, reparent, status };
  }

  it("Alt+Right nests under the previous sibling and Alt+Left moves up one level", async () => {
    const { panel, reparent } = setup();
    await panel.keyboardReparent("b", "indent");
    expect(reparent).toHaveBeenLastCalledWith("b", "a");
    await panel.keyboardReparent("c", "outdent");
    expect(reparent).toHaveBeenLastCalledWith("c", null);
  });

  it("announces why a move is impossible instead of silently ignoring the key", async () => {
    const { panel, reparent, status } = setup();
    await panel.keyboardReparent("a", "indent");
    expect(status.textContent).toBe("A has no previous sibling to nest under.");
    await panel.keyboardReparent("a", "outdent");
    expect(status.textContent).toBe("A is already at the scene root.");
    expect(reparent).not.toHaveBeenCalled();
  });
});

interface FakeElement {
  className: string;
  innerHTML: string;
  textContent: string;
  dataset: Record<string, string>;
  attributes: Map<string, string>;
  children: FakeElement[];
  setAttribute(name: string, value: string): void;
  append(...nodes: FakeElement[]): void;
  querySelector(): { addEventListener(): void } | null;
}

function stubDocument(): void {
  vi.stubGlobal("document", {
    createElement: (): FakeElement => {
      const element: FakeElement = {
        className: "", innerHTML: "", textContent: "", dataset: {}, attributes: new Map(), children: [],
        setAttribute(name, value) { element.attributes.set(name, value); },
        append(...nodes) { element.children.push(...nodes); },
        querySelector: () => ({ addEventListener: () => undefined })
      };
      return element;
    }
  });
}

describe("editor console live region (S5-WP17-02)", () => {
  it("keeps one persistent log region and raises each new error once in an alert", () => {
    stubDocument();
    const messages: { level: "info" | "error"; text: string; at: string }[] = [];
    const panel = new ConsolePanel({ consoleMessages: () => messages, clearConsole: () => { messages.length = 0; } } as unknown as EditorShell);
    const [alert, log] = (panel.element as unknown as FakeElement).children;
    expect(log!.attributes.get("role")).toBe("log");
    expect(log!.attributes.get("aria-live")).toBe("polite");
    expect(alert!.attributes.get("role")).toBe("alert");

    messages.push({ level: "error", text: "Transform field position.X needs a finite number.", at: "t0" });
    panel.render();
    expect(alert!.textContent).toBe("Transform field position.X needs a finite number.");
    expect(log!.innerHTML).toContain("position.X needs a finite number");
    alert!.textContent = "";
    messages.push({ level: "info", text: "Edited name.", at: "t1" });
    panel.render();
    expect(alert!.textContent).toBe("");
    expect((panel.element as unknown as FakeElement).children[1]).toBe(log);
    messages.length = 0;
    panel.render();
    expect(log!.innerHTML).toContain("No editor diagnostics.");
  });
});

describe("shader graph texture import loading and error state (S5-WP17-02)", () => {
  it("renders a visible pending state while the import runs and a named failure afterwards", async () => {
    stubDocument();
    vi.stubGlobal("HTMLElement", class {});
    const panel = Object.create(ShaderGraphPanel.prototype) as ShaderGraphPanel;
    const seen: (string | null)[] = [];
    Object.assign(panel, { error: "", pending: null, element: { contains: () => false } });
    const render = vi.fn(function (this: { pending: string | null }) { seen.push(this.pending); });
    Object.assign(panel, { render });
    const run = (panel as unknown as { run(action: () => Promise<void>, pending?: string): Promise<void> }).run.bind(panel);
    await run(async () => { throw new Error("The texture file could not be read."); }, "Importing texture wood.png…");
    expect(seen).toEqual(["Importing texture wood.png…", null]);
    expect((panel as unknown as { error: string }).error).toBe("Importing texture wood.png failed: The texture file could not be read.");
  });
});
