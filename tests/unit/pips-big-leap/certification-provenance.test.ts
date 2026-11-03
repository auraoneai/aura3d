import { readFileSync } from "node:fs";
import { game } from "@aura3d/engine";
import { describe, expect, it, vi } from "vitest";
import { assets } from "../../../apps/showcase-pips-big-leap/src/aura-assets";
import { certifyWorld } from "../../../apps/showcase-pips-big-leap/src/game/certify";
import { WORLD_IDS } from "../../../apps/showcase-pips-big-leap/src/game/looks";
import { deriveWorldMotion } from "../../../apps/showcase-pips-big-leap/src/game/motion";
import { buildWorld } from "../../../apps/showcase-pips-big-leap/src/game/world";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";

function stretchedAcademy() {
  const spec = worldSpec("academy");
  const scale = 3;
  return {
    ...spec,
    spawn: [spec.spawn[0], spec.spawn[1], spec.spawn[2] * scale] as const,
    gate: { ...spec.gate, z: spec.gate.z * scale },
    platforms: spec.platforms.map((p) => ({ ...p, z: p.z * scale, d: p.d * scale, mover: undefined })),
    hazards: spec.hazards.map((h) => ({ ...h, z: h.z * scale, d: h.d * scale })),
    seeds: spec.seeds.map((s) => ({ ...s, z: s.z * scale })),
    checkpoints: spec.checkpoints.map((c) => ({ ...c, z: c.z * scale }))
  };
}

describe("pips-big-leap certification provenance", () => {
  it("does not claim an unmounted world or certified surfaces in route health", () => {
    const health = JSON.parse(readFileSync("apps/showcase-pips-big-leap/route-health.json", "utf8")) as {
      primaryAssets: { typedRef: string; role: string; hash: string }[];
      claimStatus: { allowed: string[]; notAllowed: string[] };
    };
    expect(health.primaryAssets.some((asset) => asset.role === "primaryWorld")).toBe(false);
    expect(health.primaryAssets.find((asset) => asset.typedRef === `assets.${assets.sidekick.id}`)?.hash).toBe(assets.sidekick.hash);
    expect(health.claimStatus.allowed.join(" ")).not.toMatch(/certified surface/i);
    expect(health.claimStatus.notAllowed.join(" ")).toMatch(/certified asset-bound world surfaces/i);
  });

  it("reports the unmounted backdrop for every shipped world and look", () => {
    for (const id of WORLD_IDS) {
      const spec = worldSpec(id);
      const backdrop = assets.backdrop[spec.backdrops[0]?.asset ?? "verdant"];
      for (const look of ["diorama", "original"] as const) {
        const built = buildWorld(spec, { look });
        const scene = JSON.stringify(built.scene.toJSON());
        expect(scene, `${id} ${look} hero`).toContain(assets.pip.url);
        // invariant: source must not reintroduce `<backdrop url>` in the built world — Pips keeps the uncertified backdrop unmounted so route health never claims it
        expect(scene, `${id} ${look} backdrop`).not.toContain(backdrop.url);

        const cert = certifyWorld(spec, built.motion);
        expect(cert.ok, `${id} ${look}`).toBe(false);
        expect(cert.error, `${id} ${look}`).toMatch(/overlay-validated/i);
        expect(cert.error, `${id} ${look}`).toContain(backdrop.id);
        expect(cert.error, `${id} ${look}`).toMatch(/not mounted/i);
        expect(cert.notes.join(" "), `${id} ${look}`).toContain(backdrop.id);
        expect(cert.notes.join(" "), `${id} ${look}`).toMatch(/not mounted/i);
      }
    }
  });

  it("does not certify a longer course just because the helper's duration gate passes", () => {
    const spec = stretchedAcademy();
    const motion = deriveWorldMotion(spec);
    expect((-spec.gate.z - spec.spawn[2] + 1) / motion.tuning.moveSpeed).toBeGreaterThanOrEqual(30);

    const cert = certifyWorld(spec, motion);
    expect(cert.ok).toBe(false);
    expect(cert.level).toBeUndefined();
    expect(cert.geometry).toBeNull();
    expect(cert.presentation).toBeNull();
    expect(cert.notes.join(" ")).toContain(assets.backdrop.verdant.id);
    expect(cert.notes.join(" ")).toMatch(/not mounted/i);
    expect(cert.error).toMatch(/overlay-validated/i);
  });

  it("submits authored, not overlay-validated, provenance to the existing helper", () => {
    const spec = stretchedAcademy();
    const helper = vi.spyOn(game, "assetBoundPlatformerLevel");
    try {
      certifyWorld(spec, deriveWorldMotion(spec));
      expect(helper).toHaveBeenCalledTimes(1);
      const options = helper.mock.calls[0]![0];
      expect(options.playableSurfaceMap?.source).toBe("compiler-authored");
      expect(options.playableSurfaceMap?.modelAlignment.source).toBe("compiler-authored");
      expect(options.worldAssetBindings[0]?.surfaceSource).toBe("compiler-authored");
      expect(options.playableSurfaceMap?.evidence.routeOverlay).toBeUndefined();
      expect(options.playableSurfaceMap?.modelAlignment.evidence.routeOverlay).toBeUndefined();
    } finally {
      helper.mockRestore();
    }
  });

  it("keeps both real certifiers blocked even if the source and proof are hypothetically relabelled as passing", () => {
    const spec = stretchedAcademy();
    const assetBound = game.assetBoundPlatformerLevel;
    const certifyGeometry = game.certifyPlatformerGeometry;
    const certifyPresentation = game.certifyPlatformerPresentation;
    const withHypotheticalProof = (input: Parameters<typeof game.certifyPlatformerGeometry>[0]) => ({
      ...input,
      worldCertification: "certified-generated-game-world" as const,
      retainedProof: {
        ...input.retainedProof,
        routePrimaryScreenshot: "hypothetical.png",
        routePrimaryScreenshotSha256: `sha256-${"a".repeat(64)}`,
        geometryReport: "hypothetical.json",
        manifestHash: `sha256-${"b".repeat(64)}`,
        visualReview: "pass" as const,
        assetPairPass: true,
        blockers: input.retainedProof.blockers.filter((blocker) => blocker !== "retained-proof pending captured browser run (screenshot + sha256)")
      }
    });
    const helper = vi.spyOn(game, "assetBoundPlatformerLevel").mockImplementation((options) => {
      const map = options.playableSurfaceMap;
      if (!map) throw new Error("Missing surface map");
      Object.assign(map, { source: "compiler-authored-overlay-validated" });
      Object.assign(map.modelAlignment, { source: "compiler-authored-overlay-validated" });
      Object.assign(map.evidence, { routeOverlay: "hypothetical.png" });
      Object.assign(map.modelAlignment.evidence, { routeOverlay: "hypothetical.png" });
      for (const binding of options.worldAssetBindings) {
        Object.assign(binding, { surfaceSource: "compiler-authored-overlay-validated" });
      }
      return assetBound(options);
    });
    const geometry = vi.spyOn(game, "certifyPlatformerGeometry")
      .mockImplementation((input) => certifyGeometry(withHypotheticalProof(input)));
    const presentation = vi.spyOn(game, "certifyPlatformerPresentation")
      .mockImplementation((input) => certifyPresentation({ ...withHypotheticalProof(input), presentation: input.presentation }));
    try {
      const cert = certifyWorld(spec, deriveWorldMotion(spec));
      const blocker = `platformer:retained-proof:blocker:world-asset-not-mounted:${assets.backdrop.verdant.id}`;
      expect(helper).toHaveBeenCalledTimes(1);
      expect(geometry).toHaveBeenCalledTimes(1);
      expect(presentation).toHaveBeenCalledTimes(1);
      expect(cert.error).toBeUndefined();
      expect(cert.ok).toBe(false);
      expect(cert.level).toBeUndefined();
      expect(cert.geometry?.publicReady).toBe(false);
      expect(cert.geometry?.blockers).toContain(blocker);
      expect(cert.presentation?.publicReady).toBe(false);
      expect(cert.presentation?.blockers).toContain(blocker);
      expect(cert.geometry?.blockers).not.toContain("platformer:world-certification:candidate-needs-geometry");
      expect(cert.geometry?.blockers).not.toContain("platformer:retained-proof:screenshot-missing");
      expect(cert.notes.join(" ")).toMatch(/helper nodes generated but not mounted/i);
    } finally {
      presentation.mockRestore();
      geometry.mockRestore();
      helper.mockRestore();
    }
  });
});
