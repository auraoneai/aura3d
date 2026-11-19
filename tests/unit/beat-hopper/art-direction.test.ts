import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { auditArtDirection, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../apps/showcase-beat-hopper/src/art/direction";
import { BeatHopperSim } from "../../../apps/showcase-beat-hopper/src/sim";
import { buildWorld, FOG_COLOR, FOG_NEAR } from "../../../apps/showcase-beat-hopper/src/world";
import { LOOK } from "../../../apps/showcase-beat-hopper/src/look";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

/** Expected in-play draws: sky, player, shadow + 9 merged batches. */
const DRAWS_ESTIMATE = 12;

describe("beat-hopper art direction", () => {
  it("the mounted scene passes auditArtDirection and the audit record is written", () => {
    const sim = new BeatHopperSim(7);
    const world = buildWorld({ sim, aspect: 16 / 9 });
    const nodes = world.scene.toJSON().nodes as unknown as Record<string, unknown>[];
    const lights = nodes
      .filter((n) => n.kind === "light")
      .map((n) => ({ type: String(n.light), shadow: Boolean(n.shadow), intensity: Number(n.intensity ?? 1) }));
    const env = nodes.find((n) => n.kind === "environment");
    const snapshot: ArtDirectionSnapshot = {
      lights,
      hasAmbient: lights.some((l) => l.type === "ambient"),
      environment: { kind: env?.environment === "hdri" ? "hdri" : env ? "preset" : "none", background: env?.background === true },
      models: [],
      drawCalls: DRAWS_ESTIMATE
    };
    expect(lights.filter((l) => l.shadow)).toHaveLength(1);
    expect(snapshot.hasAmbient).toBe(false);
    expect(snapshot.environment.kind).toBe("preset");
    // Idol wow pass: the hero, palms and concert dressing are Idol GLBs (tools/idol/specs/beat-hopper.json).
    // One serialisation without the vertex/index buffers: with them the scene JSON is ~280 MB and stringifying it per
    // key cost ~25 s on the ACR runner. Asset keys are strings, so dropping numeric arrays cannot hide one.
    const sceneText = JSON.stringify(nodes, (_key, value: unknown) =>
      ArrayBuffer.isView(value) || (Array.isArray(value) && value.length > 32 && typeof value[0] === "number") ? undefined : value);
    for (const key of ["bhSkaterBot", "bhPalm", "bhSpeakerTower", "bhSynthStack", "bhDjConsole"]) {
      expect(sceneText).toContain(key);
    }
    expect(nodes.some((n) => n.name === "grp-dress-stacks")).toBe(true);
    expect(nodes.some((n) => n.name === "grp-dress-decks")).toBe(true);
    expect(nodes.some((n) => n.name === "beat-threshold-gate")).toBe(true);
    const violations = auditArtDirection(direction, snapshot);
    writeArtDirectionAudit("apps/showcase-beat-hopper/src/art/direction.ts", { direction, snapshot, violations });
    expect(violations).toEqual([]);
  }, 15_000);

  it("the signature effect and palette name the multi-hue synthwave equalizer identity without magenta fog/bloom wash", () => {
    expect(direction.signatureEffect).toMatch(/equalizer/);
    expect(direction.signatureEffect).toMatch(/timing rings/);
    expect(direction.palette.primary).toEqual(["#120926", "#00f2ff", "#8b5cf6", "#0e1020"]);
    expect(direction.palette.accent).toBe("#ffbe2e");
    expect(direction.lighting.environment.background).toBe("sky");
    expect(LOOK.road).toBe("#0e1020");
    expect(LOOK.hudInk).toBe("#f4f0ff");

    // Fog & bloom anti-wash invariants
    expect(FOG_NEAR).toBeGreaterThanOrEqual(140);
    expect(FOG_COLOR).toBe("#120926");
    const sim = new BeatHopperSim(7);
    const nodes = buildWorld({ sim, aspect: 16 / 9 }).scene.toJSON().nodes as unknown as Record<string, unknown>[];
    const fogNode = nodes.find((n) => n.name === "stage-fog");
    expect(fogNode).toBeDefined();
    expect(Number(fogNode?.near)).toBeGreaterThanOrEqual(140);
    expect(Number(fogNode?.maxOpacity)).toBeLessThanOrEqual(0.22);

    const bloomNode = nodes.find((n) => n.effect === "bloom");
    expect(bloomNode).toBeDefined();
    expect(Number(bloomNode?.threshold)).toBeGreaterThanOrEqual(1.0);
    expect(Number(bloomNode?.intensity)).toBeLessThanOrEqual(0.35);
    expect(bloomNode?.color).toBe("#ffffff");

    // Vertex color (`COLOR_0`) preservation across dynamic & batched PBR meshes
    for (const coloredId of ["blocks", "block-chrome", "bar-posts", "walls", "wall-truss", "orbs", "beat-pad-lacquer"]) { // bot-torso: the hero is the Idol skater-bot GLB since the Idol wow pass
      const meshNode = nodes.find((n) => n.name === coloredId) as { geometry?: { colors?: Float32Array } } | undefined;
      expect(meshNode?.geometry?.colors, `${coloredId} must carry GPU vertex colors`).toBeInstanceOf(Float32Array);
      expect((meshNode?.geometry?.colors?.length ?? 0) > 0).toBe(true);
    }

    // Game-over screen CSS must never paint an opaque hot-pink full-screen wash
    // invariant: source must not reintroduce `rgba(255, 47, 179, 0.93)` in index.html — the game-over overlay must not paint an opaque magenta wash over the multi-hue synthwave scene
    const html = readFileSync(resolve(__dirname, "../../../apps/showcase-beat-hopper/index.html"), "utf8");
    expect(html).not.toContain("rgba(255, 47, 179, 0.93)");
  });
});
