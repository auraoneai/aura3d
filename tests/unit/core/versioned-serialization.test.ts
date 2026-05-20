import { MigrationRegistry, SaveSlot, ValidationError, VersionedSchema } from "@galileo3d/core";
import { describe, expect, it } from "vitest";

describe("versioned serialization utilities", () => {
  it("validates schema fields, applies defaults, and reports precise issues", () => {
    const transform = VersionedSchema.builder("TransformSave", 2)
      .string("id", { required: true })
      .array("position", "float32", { required: true })
      .boolean("visible", { defaultValue: true })
      .build();

    expect(transform.validate({ id: "node-a", position: [1, 2, 3] })).toEqual({ ok: true, issues: [] });
    expect(transform.serialize({ id: "node-a", position: [1, 2, 3] })).toEqual({
      id: "node-a",
      position: [1, 2, 3],
      visible: true
    });
    expect(transform.validate({ id: "node-a", position: [1, "bad", 3] }).issues).toContain("position[1] expected float32.");
    expect(() => transform.serialize({ position: [1, 2, 3] })).toThrow(ValidationError);
  });

  it("migrates save data across explicit version paths and rejects gaps", () => {
    type SaveData = { readonly version: number; readonly name?: string; readonly scene?: { readonly nodes: number }; readonly metadata?: { readonly migrated: boolean } };
    const migrations = new MigrationRegistry<SaveData>()
      .register({
        from: 0,
        to: 1,
        description: "Add scene container",
        migrate: (data) => ({ ...data, version: 1, scene: { nodes: 1 } })
      })
      .register({
        from: 1,
        to: 2,
        description: "Add metadata",
        migrate: (data) => ({ ...data, version: 2, metadata: { migrated: true } })
      });

    expect(migrations.canMigrate(0, 2)).toBe(true);
    expect(migrations.migrate({ version: 0, name: "legacy" }, 0, 2)).toEqual({
      version: 2,
      name: "legacy",
      scene: { nodes: 1 },
      metadata: { migrated: true }
    });
    expect(migrations.canMigrate(2, 3)).toBe(false);
    expect(() => migrations.migrate({ version: 2 }, 2, 3)).toThrow(/No migration path/);
  });

  it("roundtrips save-slot metadata and binary payloads without browser storage", () => {
    const slot = new SaveSlot("autosave-1", 100);
    slot.setMetadata({ name: "Checkpoint", playTime: 42, autoSave: true });
    slot.setData(new Uint8Array([1, 2, 3, 255]), "binary", { compressed: true });

    const restored = SaveSlot.fromJSON(slot.toJSON());

    expect(restored.id).toBe("autosave-1");
    expect(restored.getFormat()).toBe("binary");
    expect(restored.isCompressed()).toBe(true);
    expect(restored.getMetadata()).toMatchObject({ name: "Checkpoint", playTime: 42, autoSave: true });
    expect(restored.getData()).toEqual(new Uint8Array([1, 2, 3, 255]));
    expect(restored.getSize()).toBe(4);
  });
});
