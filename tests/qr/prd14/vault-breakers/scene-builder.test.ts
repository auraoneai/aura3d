import { describe, expect, it } from "vitest";
import { createTableSimulation } from "../../../../apps/showcase-vault-breakers/src/gameplay/table";
import { VaultFlow } from "../../../../apps/showcase-vault-breakers/src/gameplay/ball-flow";
import { FlipperController } from "../../../../apps/showcase-vault-breakers/src/gameplay/flippers";
import { buildVaultScene, vaultPoseTransforms } from "../../../../apps/showcase-vault-breakers/src/scene";

/**
 * B4 port pins for the fresh single-path scene builder: the same builder
 * runs headless here and in the browser (src/main.ts mounts its output).
 * Replaces the retired v2-camera-rig test, which imported the trashed
 * src/v2/scene/camera rig; the camera numbers it pinned carry into
 * src/scene.ts (CAMERA_POSITION/TARGET/FOV) and are asserted via the
 * built snapshot below.
 */
describe("vault breakers fresh scene builder (B4 port)", () => {
  it("builds the browser scene headless from salvaged sim state", () => {
    const sim = createTableSimulation();
    const snapshot = buildVaultScene(sim).toJSON();
    const names = snapshot.nodes.map((n) => (n as { name?: string }).name ?? "");
    // Static shell fitted to the physics box + typed mechanism assembly.
    expect(names).toContain("playfield-felt");
    expect(names).toContain("vault-mechanisms");
    // Every pre-registered dynamic visual the salvaged table declares.
    for (let i = 0; i < 8; i += 1) expect(names).toContain(`ball-${i}`);
    expect(names).toContain("flipper-left");
    expect(names).toContain("flipper-right");
    expect(names).toContain("vault-door-visual");
    for (const id of sim.targetIds) expect(names).toContain(`target:${id}`);
    for (let i = 0; i < 5; i += 1) expect(names).toContain(`bank-status-${i}`);
    // Carried camera framing (the retired rig test's numbers).
    expect(snapshot.camera).toMatchObject({
      position: [0, 5.15, 7.35],
      target: [0, -0.05, -0.38]
    });
  });

  it("pose transforms track a served ball and hide drained balls", () => {
    const sim = createTableSimulation();
    const flow = new VaultFlow(new FlipperController(sim.flippers), sim);
    const before = vaultPoseTransforms(sim).filter((p) => p.name.startsWith("ball-"));
    expect(before).toHaveLength(8);
    expect(before.every((p) => !p.visible)).toBe(true);

    expect(flow.serve(1)).toBe(true);
    flow.update(30);
    const during = vaultPoseTransforms(sim);
    const live = during.filter((p) => p.name.startsWith("ball-") && p.visible);
    expect(live.length).toBeGreaterThanOrEqual(1);
    // Ball left its mount position (real solver pose, not the authored one).
    expect(live.some((p) => Math.abs(p.position[2]) < 3.6)).toBe(true);
    expect(during.map((p) => p.name)).toContain("flipper-left");
    expect(during.map((p) => p.name)).toContain("vault-door-visual");
  });

  it("identical serve scripts reproduce identical pose hashes through the builder's sim", () => {
    const run = (): string => {
      const sim = createTableSimulation();
      const flow = new VaultFlow(new FlipperController(sim.flippers), sim);
      flow.serve(0.78);
      for (let i = 0; i < 12; i += 1) flow.update(10);
      return sim.poseHash();
    };
    expect(run()).toBe(run());
  });

  it("authors physical pinball materials and passes auditArtDirection with 1 shadowed light", async () => {
    const { auditArtDirection } = await import("../../../../packages/game/src/art/audit");
    const { snapshotForAudit, assetManifestLike } = await import("../../../../packages/game/src/art/snapshot");
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const direction = (await import("../../../../apps/showcase-vault-breakers/art/direction")).default;
    const manifestPath = fileURLToPath(new URL("../../../../apps/showcase-vault-breakers/aura.assets.json", import.meta.url));
    const manifest = assetManifestLike(JSON.parse(readFileSync(manifestPath, "utf8")));

    const sim = createTableSimulation();
    const sceneSnapshot = buildVaultScene(sim).toJSON();
    const auditSnap = snapshotForAudit(
      { scene: sceneSnapshot, diagnostics: () => ({ drawCalls: 42 }) } as unknown as Parameters<typeof snapshotForAudit>[0],
      manifest
    );
    const violations = auditArtDirection(direction, auditSnap, { drawCallsBudget: 400 });
    expect(violations).toEqual([]);
    expect(auditSnap.lights.filter((l) => l.shadow)).toHaveLength(1);
  });
});
