/**
 * PRD-05 Phase 3 — `createCollidersFromSidecar` contact proof.
 *
 * The optimized benchmark `crate` (prop-large → convex hull ≤ 64 verts) drops
 * onto the optimized `racing-starter` track (track → trimesh from LOD0) and
 * must rest within 1 cm of the measured surface after 120 fixed steps
 * (Rapier, dt = 1/60). Optimized bytes are produced in-test through the real
 * §6.3 pipeline so the sidecar contract is exercised end to end.
 *
 * Skips when tools/asset-optimize deps are absent (CONTRACTS §4.4 — lanes that
 * never `npm install --prefix tools/asset-optimize` stay green).
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createCollidersFromSidecar, createRapierPhysicsSync } from "../../../packages/physics-rapier/src/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const toolDir = join(repoRoot, "tools", "asset-optimize");
const hasToolDeps = existsSync(join(toolDir, "node_modules", "@gltf-transform", "core"));

const CRATE_GLB = join(repoRoot, "packages/engine/assets/world/kits/interior/crate-1x1.glb");
const CIRCUIT_GLB = join(repoRoot, "templates/racing-starter/public/aura-assets/showcaseReadableKartCircuit.5cbb912e.glb");

describe.runIf(hasToolDeps)("prd05 generated collider contact", () => {
  it("convex crate rests on trimesh track within 1 cm after 120 fixed steps", async () => {
    const { optimizeGLB } = await import("../../../tools/asset-optimize/pipeline.js");
    const { ASSET_OPTIMIZE_PROFILES } = await import("../../../tools/asset-optimize/profiles.js");

    const crate = await optimizeGLB(new Uint8Array(readFileSync(CRATE_GLB)), {
      profile: ASSET_OPTIMIZE_PROFILES["prop-large"],
      log: () => {}
    });
    const circuit = await optimizeGLB(new Uint8Array(readFileSync(CIRCUIT_GLB)), {
      profile: ASSET_OPTIMIZE_PROFILES.track,
      log: () => {}
    });
    expect(crate.collisionGlb, "crate sidecar").toBeTruthy();
    expect(circuit.collisionGlb, "circuit sidecar").toBeTruthy();

    // Contract check: read the extras back through the same decoder path the
    // runtime uses so the sidecar shape is asserted, not just emitted. The
    // tool's own node_modules resolve via createRequire (root lacks them).
    const toolRequire = createRequire(join(toolDir, "package.json"));
    const toolImport = (specifier: string) => import(pathToFileURL(toolRequire.resolve(specifier)).href);
    const { NodeIO } = await toolImport("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await toolImport("@gltf-transform/extensions");
    const { MeshoptDecoder } = await toolImport("meshoptimizer");
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
    await MeshoptDecoder.ready;
    const crateDoc = await io.readBinary(crate.collisionGlb!);
    const crateExtras = crateDoc.getRoot().listNodes()
      .map((n: { getMesh(): { getExtras(): unknown } | null }) => (n.getMesh()?.getExtras() as { aura3dCollider?: { shape?: string } } | undefined)?.aura3dCollider?.shape)
      .filter(Boolean);
    expect(crateExtras).toContain("convex");
    const circuitDoc = await io.readBinary(circuit.collisionGlb!);
    const circuitExtras = circuitDoc.getRoot().listNodes()
      .map((n: { getMesh(): { getExtras(): unknown } | null }) => (n.getMesh()?.getExtras() as { aura3dCollider?: { shape?: string } } | undefined)?.aura3dCollider?.shape)
      .filter(Boolean);
    expect(circuitExtras).toContain("trimesh");

    const world = createRapierPhysicsSync();
    const track = await createCollidersFromSidecar(world, circuit.collisionGlb!);
    expect(track.colliders.length).toBeGreaterThan(0);

    // Crate source is a 1 m cube grounded at y=0 → the body's rest y equals
    // the trimesh surface height under the drop point (the circuit's flat
    // centre ribbon sits at world y ≈ 0).
    const crateBody = world.createRigidBody({ type: "dynamic", position: [0, 4, 0] });
    const crateColliders = await createCollidersFromSidecar(world, crate.collisionGlb!, { body: crateBody });
    expect(crateColliders.colliders.length).toBeGreaterThan(0);

    for (let i = 0; i < 120; i += 1) world.step(1 / 60);

    const speed = Math.hypot(...crateBody.velocity());
    const [x, y, z] = crateBody.position();
    expect(speed, "crate settled").toBeLessThan(0.05);
    expect(Math.abs(x), "crate stayed near drop column").toBeLessThan(0.5);
    expect(Math.abs(z), "crate stayed near drop column").toBeLessThan(0.5);
    // Resting means the hull base sits on the trimesh surface at y ≈ 0 —
    // within 1 cm, neither sunk nor floating (§phase-3 checklist).
    expect(y, "crate rests on the trimesh surface within 1 cm").toBeGreaterThan(-0.01);
    expect(y, "crate rests on the trimesh surface within 1 cm").toBeLessThan(0.01);
  });
});
