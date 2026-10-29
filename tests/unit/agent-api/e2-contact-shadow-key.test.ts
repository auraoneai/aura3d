/** Audit lane E2, LIGHT-09: warn when contact shadows sit on a weak shadowed key. */
import { describe, expect, it } from "vitest";
import type { AuraSceneSnapshot } from "@aura3d/engine";
import { contactShadowKeyWarning } from "../../../packages/engine/src/agent-api/compiler/contactShadowKey";

const snapshot = (nodes: readonly unknown[]): AuraSceneSnapshot => ({
  schema: "aura3d-scene-snapshot/1.0",
  background: "#000000",
  camera: { mode: "orbit", position: [0, 6, 14], target: [0, 0, 0] },
  nodes: nodes as never,
  diagnostics: { enabled: false }
});

const contact = { kind: "effect", effect: "contact-shadows", contactShadows: { intensity: 0.7 } };
const nightKey = { kind: "light", light: "directional", name: "look key light", intensity: 0.7, color: "#9fb4ff", position: [2, 6, 3], shadow: true };
const stageSpot = (x: number) => ({ kind: "light", light: "spot", name: `flood ${x}`, intensity: 220, color: "#ffffff", position: [x, 12, 0], target: [0, 0, 0], angle: Math.PI / 5 });

describe("LIGHT-09 contact-shadow key share", () => {
  it("a night court lit by floodlights (key 0.7) warns", () => {
    const warning = contactShadowKeyWarning(snapshot([contact, nightKey, stageSpot(-6), stageSpot(6)]));
    expect(warning).toMatch(/^CONTACT_SHADOWS_WEAK_KEY: /);
    expect(warning).toContain("% of the direct light");
  });

  it("a daytime sun as the main light does not warn", () => {
    const sun = { ...nightKey, intensity: 3, color: "#fff4e0" };
    expect(contactShadowKeyWarning(snapshot([contact, sun, stageSpot(6)]))).toBeNull();
  });

  it("no contact-shadows effect: no warning", () => {
    expect(contactShadowKeyWarning(snapshot([nightKey, stageSpot(-6), stageSpot(6)]))).toBeNull();
  });

  it("a spot whose cone misses the camera target does not count", () => {
    const aimedAway = { ...stageSpot(6), target: [40, 0, 0], angle: 0.2 };
    expect(contactShadowKeyWarning(snapshot([contact, nightKey, aimedAway]))).toBeNull();
  });

  it("only a shadow-casting directional is the key", () => {
    const unshadowed = { ...nightKey, intensity: 3, shadow: false };
    expect(contactShadowKeyWarning(snapshot([contact, unshadowed]))).toMatch(/0% of the direct light/);
  });
});
