import { describe, expect, test } from "vitest";
import { createAuraAssetPanelRows, createAuraPerformancePanelSnapshot, createAuraTuneOverlay } from "../../../packages/engine/src";
import { createAuraTuneOverlay as createPublicDevtoolsTuneOverlay } from "../../../packages/engine/src/public/devtools";

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    raw: map
  };
}

describe("devtools helpers", () => {
  test("summarizes asset load state and performance diagnostics", () => {
    const diagnostics = {
      backend: "canvas2d" as const,
      fps: 60,
      drawCalls: 3,
      renderSize: [960, 540] as const,
      assets: [{ id: "robot", type: "model" as const, url: "/robot.glb", status: "ready" as const }],
      warnings: [],
      errors: []
    };
    expect(createAuraAssetPanelRows(diagnostics.assets)).toEqual([{ id: "robot", status: "ready", url: "/robot.glb", message: undefined }]);
    expect(createAuraPerformancePanelSnapshot(diagnostics)).toMatchObject({ fps: 60, drawCalls: 3, backend: "canvas2d" });
  });

  test("createAuraTuneOverlay snaps values, exports agent diff blocks, and auto-invalidates stale baseline storage", async () => {
    expect(createPublicDevtoolsTuneOverlay).toBe(createAuraTuneOverlay);
    const storage = createMemoryStorage();
    let copiedText = "";
    const changes: Array<{ key: string; value: unknown; baseline: unknown }> = [];

    const first = createAuraTuneOverlay({
      id: "drift-kart",
      host: null,
      toggleKey: false,
      storage,
      clipboard: {
        async writeText(text) {
          copiedText = text;
        }
      },
      schema: {
        gravity: { value: -24, min: -40, max: -5, step: 0.5 },
        camera: { value: "chase" as "chase" | "orbit" | "hood", options: ["chase", "orbit", "hood"] as const }
      },
      onChange: (ev) => changes.push({ key: ev.key, value: ev.value, baseline: ev.baseline })
    });

    expect(first.values).toEqual({ gravity: -24, camera: "chase" });
    expect(first.diffBlock()).toBe("");

    // Snaps -27.24 -> -27.0 (step 0.5) and rejects invalid enum choices.
    expect(first.set("gravity", -27.24)).toBe(true);
    expect(first.values.gravity).toBe(-27);
    expect(first.set("camera", "orbit")).toBe(true);
    expect(first.set("camera", "invalid" as "chase")).toBe(false);
    expect(changes).toEqual([
      { key: "gravity", value: -27, baseline: -24 },
      { key: "camera", value: "orbit", baseline: "chase" }
    ]);

    const saved = await first.save();
    expect(saved.saved).toBe(true);
    expect(saved.copied).toBe(true);
    expect(copiedText).toBe("Tuned in Aura3D: drift-kart\ngravity -24 → -27\ncamera chase → orbit");
    first.dispose();

    // Second mount: gravity baseline stays -24 (kept from storage), camera baseline changed in source to "hood" (stale cache dropped!).
    const second = createAuraTuneOverlay({
      id: "drift-kart",
      host: null,
      toggleKey: false,
      storage,
      search: "?tune=1",
      schema: {
        gravity: { value: -24, min: -40, max: -5, step: 0.5 },
        camera: { value: "hood" as "chase" | "orbit" | "hood", options: ["chase", "orbit", "hood"] as const }
      }
    });
    expect(second.isOpen).toBe(true);
    expect(second.values).toEqual({ gravity: -27, camera: "hood" });

    second.set("gravity", -30);
    // Reset without options goes back to the saved override (-27); toBaseline goes all the way to -24.
    second.reset();
    expect(second.values.gravity).toBe(-27);
    second.reset({ toBaseline: true });
    expect(second.values.gravity).toBe(-24);
    expect(second.diffBlock()).toBe("");
    expect(storage.raw.has(second.storageKey)).toBe(false);
    second.dispose();
  });
});
