import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Lane 514 (benchmark fix 8). When `@dimforge/rapier3d-compat` cannot be resolved, physics must fail with the typed
 * `PHYSICS_BACKEND_MISSING` error that carries the exact install command, and `createAuraApp` must keep the app
 * inspectable (diagnostics + on-canvas error) instead of dying with an anonymous string.
 */
const INSTALL = "npm install @dimforge/rapier3d-compat@0.20.0";

async function withAbsentBackend<T>(run: () => Promise<T>): Promise<T> {
  vi.resetModules();
  vi.doMock("@dimforge/rapier3d-compat", () => { throw new Error("Cannot find package '@dimforge/rapier3d-compat'"); });
  return run();
}

afterEach(() => {
  vi.doUnmock("@dimforge/rapier3d-compat");
  vi.resetModules();
});

describe("PHYSICS_BACKEND_MISSING", () => {
  it("is thrown by the world constructor with the install command and is observable as a status", async () => {
    await withAbsentBackend(async () => {
      const rapier = await import("../../../packages/physics-rapier/src/index.js");
      const world = await import("../../../packages/physics/src/world.js");
      expect(rapier.getPhysicsBackendStatus()).toMatchObject({ state: "missing", code: "PHYSICS_BACKEND_MISSING", installCommand: INSTALL });
      let thrown: unknown;
      try { new world.PhysicsWorld(); } catch (error) { thrown = error; }
      expect(thrown).toBeInstanceOf(rapier.PhysicsBackendMissingError);
      expect(thrown).toMatchObject({ code: "PHYSICS_BACKEND_MISSING", installCommand: INSTALL, name: "PhysicsBackendMissingError" });
      expect((thrown as Error).message).toContain(INSTALL);
    });
  });

  it("rejects createRapierPhysics with the typed error when the module is not found", async () => {
    vi.resetModules();
    const rapier = await import("../../../packages/physics-rapier/src/index.js");
    const missing = Object.assign(new Error("not found"), { code: "ERR_MODULE_NOT_FOUND" });
    await expect(rapier.createRapierPhysics({ moduleLoader: () => Promise.reject(missing) as never }))
      .rejects.toMatchObject({ code: "PHYSICS_BACKEND_MISSING", installCommand: INSTALL });
  });

  it("rejects preloadPhysics with the typed error", async () => {
    await withAbsentBackend(async () => {
      const v5 = await import("../../../packages/engine/src/public/v5-context.js");
      await expect(v5.preloadPhysics()).rejects.toMatchObject({ code: "PHYSICS_BACKEND_MISSING", installCommand: INSTALL });
    });
  });

  it("createAuraApp keeps a physics-declaring app alive, reports the error in diagnostics, and app.physics throws the typed error", async () => {
    await withAbsentBackend(async () => {
      const engine = await import("../../../packages/engine/src/public/index.js");
      const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        const app = engine.createAuraApp(undefined as never, {
          scene: engine.scene().add(
            engine.primitives.box({ name: "crate", material: engine.material.pbr({ color: "#c98b4b" }) })
              .physics({ type: "dynamic", shape: "box", halfExtents: [0.5, 0.5, 0.5], mass: 1 })
          )
        });
        const diagnostics = app.diagnostics();
        expect(diagnostics.errors.some((entry) => entry.includes("PHYSICS_BACKEND_MISSING") && entry.includes(INSTALL))).toBe(true);
        expect(errors).toHaveBeenCalledWith(expect.stringContaining("PHYSICS_BACKEND_MISSING"));
        let thrown: unknown;
        try { void app.physics; } catch (error) { thrown = error; }
        expect(thrown).toMatchObject({ code: "PHYSICS_BACKEND_MISSING", installCommand: INSTALL });
      } finally { errors.mockRestore(); }
    });
  });
});

describe("aura3d doctor physics signal", () => {
  it("flags a project that uses physics without the backend and passes once it is installed", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { physicsBackendFailures } = await import("../../../packages/aura3d-cli/src/physics-backend-check.js");
    const dir = mkdtempSync(join(tmpdir(), "a3d-physics-doctor-"));
    try {
      mkdirSync(join(dir, "src"));
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "p", dependencies: { "@aura3d/engine": "5.0.2" } }));
      writeFileSync(join(dir, "src", "main.ts"), "const crate = primitives.box({}).physics({ type: 'dynamic' });\n");
      const failures = physicsBackendFailures(dir);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toContain("PHYSICS_BACKEND_MISSING");
      expect(failures[0]).toContain(INSTALL);
      mkdirSync(join(dir, "node_modules", "@dimforge", "rapier3d-compat"), { recursive: true });
      writeFileSync(join(dir, "node_modules", "@dimforge", "rapier3d-compat", "package.json"), JSON.stringify({ name: "@dimforge/rapier3d-compat", version: "0.20.0" }));
      expect(physicsBackendFailures(dir)).toEqual([]);
      writeFileSync(join(dir, "src", "main.ts"), "export const x = 1;\n");
      rmSync(join(dir, "node_modules"), { recursive: true });
      expect(physicsBackendFailures(dir)).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
