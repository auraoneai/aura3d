import { describe, expect, it } from "vitest";
import { auditArtDirection, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../examples/kid-goku-beyond-the-clouds-port/art/direction";
import { ACTIVE_LOOK, CUMULUS_LOOK, CUMULUS_PALETTE, lookIdFrom, lookRow } from "../../../examples/kid-goku-beyond-the-clouds-port/art/look";
import { CUMULUS_VFX_EVENTS, CUMULUS_VFX_KINDS, CUMULUS_VFX_LIVE_CAP, cumulusVfxFor, cumulusVfxPresets, registerCumulusVfx } from "../../../examples/kid-goku-beyond-the-clouds-port/art/vfx";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

/**
 * GU47 WP-35 look contract. The snapshot mirrors what world.ts mounts for the storm-washed row: the look's one shadowed key
 * and its unshadowed cool rim (no hemisphere, no ambient), the spruit_sunrise IBL behind the custom dome (background off),
 * and the GLB models. Triangle counts are 0 (not measured in phase 1; the audit skips the floor check for 0). The sky pearls
 * and orbs are the only emissive-looking materials and both are light sources by design.
 */
function mountedSceneMirror(): ArtDirectionSnapshot {
  const row = CUMULUS_LOOK[0];
  const model = (assetKey: string) => ({ assetKey, triangles: 0, textures: 1, unlit: false, overridesTextures: false });
  return {
    lights: [
      { type: "directional", shadow: true, intensity: row.sun.intensity },
      ...(row.rim ? [{ type: "directional", shadow: false, intensity: row.rim.intensity }] : [])
    ],
    hasAmbient: row.hemisphere !== null,
    environment: { kind: "hdri", background: false },
    models: ["hero", "cloud", "boulder", "ptero", "rex", "treeRound", "treePine", "mesa"].map(model),
    materials: [
      { node: "ball", emissiveIntensity: 1.6, lightSource: true },
      { node: "orbs", emissiveIntensity: 1.2, lightSource: true }
    ],
    drawCalls: 0
  };
}

describe("Cumulus Dash art direction (GU47 WP-35)", () => {
  it("passes the C-35 audit against the mounted-scene mirror and writes the audit record", () => {
    const snapshot = mountedSceneMirror();
    const violations = auditArtDirection(direction, snapshot);
    writeArtDirectionAudit("examples/kid-goku-beyond-the-clouds-port/art/direction.ts", { direction, snapshot, violations });
    expect(violations).toEqual([]);
  });

  it("names the identity palette, the IBL and the signature effect", () => {
    expect(direction.palette.primary).toEqual(["#2f6fb8", "#b5643c", "#6f8f4a"]);
    expect(direction.palette.accent).toBe("#ffb347");
    expect(direction.lighting.environment.hdri).toBe("spruit_sunrise");
    expect(direction.lighting.environment.background).toBe("sky");
    expect(direction.signatureEffect).toMatch(/rainbow over silver-lined storm towers/i);
  });

  it("has one look row per variant, the storm row with the WP's numbers", () => {
    expect(CUMULUS_LOOK.map((row) => row.id)).toEqual(["storm-washed", "original"]);
    const storm = CUMULUS_LOOK[0];
    expect(storm.sun.elevationDeg).toBe(28);
    expect(storm.sun.color).toBe("#ffe2b8");
    expect(storm.sun.cascades).toBe(4);
    expect(storm.sun.maxDistance).toBe(160);
    expect(storm.sun.filter).toBe("pcss");
    expect(storm.environmentIntensity).toBe(0.8);
    expect(storm.hemisphere).toBeNull();
    expect(storm.rim).toMatchObject({ color: "#9fc8ff", intensity: 0.8 });
    expect(storm.fog.color).toBe("#9fb8cf");
    expect(storm.fog.density).toBe(0.0032);
    expect(storm.grade.temperature).toBe(0.08);
    expect(storm.vignette.intensity).toBe(0.2);
    expect(storm.signature.rainbowDeg).toEqual([40, 42]);
    expect(CUMULUS_PALETTE.amber).toBe("#ffb347");
  });

  it("keeps ?look=original as today's look and boots storm-washed by default", () => {
    expect(lookIdFrom("?look=original")).toBe("original");
    expect(lookIdFrom("?autostart=1&look=original&x=1")).toBe("original");
    expect(lookIdFrom("?look=originals")).toBe("storm-washed");
    expect(lookIdFrom("")).toBe("storm-washed");
    expect(lookIdFrom(undefined)).toBe("storm-washed");
    expect(ACTIVE_LOOK.id).toBe("storm-washed");
    const original = lookRow("original");
    expect(original.authoredSunPos).toEqual([48, 78, 38]);
    expect(original.fog.lookScale).toBe(0);
    expect(original.sky.rainbow).toBe(0);
    expect(original.grade).toEqual({ exposure: 1.02, contrast: 1.07, saturation: 1.16 });
  });

  it("registers all seven presets; reduced motion halves every emission; a dense moment stays under the cap", () => {
    const registered: string[] = [];
    const kinds = registerCumulusVfx({ registerPreset: (kind) => registered.push(kind) });
    expect(kinds).toEqual(CUMULUS_VFX_KINDS);
    expect(registered).toEqual(["pearl-spark", "cloud-puff", "puddle-splash", "storm-mist", "speed-lines", "landing-dust", "falls-spray"]);
    const full = cumulusVfxPresets(false), reduced = cumulusVfxPresets(true);
    let total = 0;
    for (const kind of CUMULUS_VFX_KINDS) {
      expect(full[kind].name).toBe(kind);
      full[kind].layers.forEach((layer, i) => {
        if (layer.type !== "emitter") return;
        const count = Number(layer.count);
        total += count;
        expect(Number(reduced[kind].layers[i]!.count)).toBeLessThanOrEqual(Math.max(1, Math.ceil(count / 2)));
        // colours come from the identity palette, not the engine defaults
        expect(typeof layer.color).toBe("string");
      });
    }
    expect(total).toBeLessThanOrEqual(CUMULUS_VFX_LIVE_CAP);
    for (const kind of Object.values(CUMULUS_VFX_EVENTS).flat()) expect(CUMULUS_VFX_KINDS).toContain(kind);
    expect(registerCumulusVfx(undefined)).toEqual([]);
  });

  it("CD-15: a landing fires the puddle splash on the wet stretch and the landing dust off it; launches throw speed lines", () => {
    expect(cumulusVfxFor("land", true)).toEqual(["puddle-splash"]);
    expect(cumulusVfxFor("land", false)).toEqual(["landing-dust"]);
    expect(cumulusVfxFor("launch", false)).toEqual(["storm-mist", "speed-lines"]);
    expect(cumulusVfxFor("glider-mount", true)).toContain("speed-lines");
    expect(cumulusVfxFor("not-an-event", false)).toEqual([]);
    const presets = cumulusVfxPresets(false);
    for (const kind of ["speed-lines", "landing-dust"] as const) {
      expect(presets[kind].layers.some((l) => l.type === "camera" || l.type === "light")).toBe(false); // no shake, no flash
    }
  });
});
