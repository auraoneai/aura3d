/**
 * Texture maps on batched/instanced nodes: `instances.mesh` and `batched.mesh` used to emit the scalar PBR material only,
 * so a `texture` (or normalMap/emissiveMap/...) on the material spec rendered as an untextured white surface. The handler now
 * runs the same textured upgrade ordinary primitives get and swaps the TexturedPBRMaterial in once it resolves.
 */

import { describe, expect, it } from "vitest";

import { InstancedPBRMaterial, PBRMaterial, TexturedPBRMaterial } from "../../../packages/rendering/src";
import { batched, batchedNodeHandler } from "../../../packages/engine/src/agent-api/nodes/batched";
import { instances } from "../../../packages/engine/src/agent-api/nodes/instances";
import { material } from "../../../packages/engine/src/agent-api/nodes/material";
import { texture } from "../../../packages/engine/src/agent-api/nodes/texture";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";

function ctxFor(options: string) {
  return { flags: resolveQrFlags({ options: options as never }), renderer: undefined, assets: undefined, quality: undefined, strict: false, degrade: () => undefined } as never;
}

function collect() {
  const items: Array<{ material: unknown }> = [];
  return { items, addItems(list: readonly unknown[]) { items.push(...(list as Array<{ material: unknown }>)); }, addLights() {}, set() {}, feature() {} };
}

const texturedSpec = () => material.pbr({ color: "#ffffff", texture: texture.data({ width: 2, height: 1, data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]) }) as never });
const plainSpec = () => material.pbr({ color: "#ff8800" });
const settle = async () => { for (let i = 0; i < 10; i += 1) await new Promise((r) => setTimeout(r, 0)); };

describe("instanced and batched nodes honour material texture maps", () => {
  for (const flags of ["all", "parity.batching,-core"]) {
    it(`instances.mesh: scalar material first, TexturedPBRMaterial after the upgrade resolves (${flags})`, async () => {
      const mesh = instances.mesh("box", texturedSpec(), 2);
      const node = mesh.toJSON() as never;
      const first = collect();
      batchedNodeHandler.compile(node, ctxFor(flags), first as never);
      expect(first.items.length).toBeGreaterThan(0);
      expect(first.items[0]!.material).not.toBeInstanceOf(TexturedPBRMaterial);
      await settle();
      const second = collect();
      batchedNodeHandler.update!(node, undefined, ctxFor(flags), second as never, 0);
      expect(second.items[0]!.material).toBeInstanceOf(TexturedPBRMaterial);
      const upgrade = (mesh.state as unknown as { textureUpgrade: { resource: { textureSlots: readonly string[] } } }).textureUpgrade;
      expect(upgrade.resource.textureSlots).toContain("baseColor");
      mesh.dispose();
    });
  }

  it("batched.mesh multi-geometry route uses the textured material too", async () => {
    const mesh = batched.mesh({ maxInstances: 4, geometries: ["box", "sphere"], material: texturedSpec() });
    mesh.addInstance(0);
    mesh.addInstance(1);
    const node = mesh.toJSON() as never;
    batchedNodeHandler.compile(node, ctxFor("all"), collect() as never);
    await settle();
    const out = collect();
    batchedNodeHandler.update!(node, undefined, ctxFor("all"), out as never, 0);
    expect(out.items.length).toBeGreaterThan(0);
    expect(out.items.every((item) => item.material instanceof TexturedPBRMaterial)).toBe(true);
    mesh.dispose();
  });

  it("a material without texture maps keeps the scalar material and never starts an upgrade", async () => {
    const mesh = instances.mesh("box", plainSpec(), 2);
    const node = mesh.toJSON() as never;
    batchedNodeHandler.compile(node, ctxFor("all"), collect() as never);
    await settle();
    const out = collect();
    batchedNodeHandler.update!(node, undefined, ctxFor("all"), out as never, 0);
    expect(out.items[0]!.material).toBeInstanceOf(InstancedPBRMaterial);
    expect(out.items[0]!.material).not.toBeInstanceOf(TexturedPBRMaterial);
    expect((mesh.state as unknown as { textureUpgrade?: unknown }).textureUpgrade).toBeUndefined();
    void PBRMaterial;
    mesh.dispose();
  });

  it("dispose releases the textured material", async () => {
    const mesh = instances.mesh("box", texturedSpec(), 1);
    const node = mesh.toJSON() as never;
    batchedNodeHandler.compile(node, ctxFor("all"), collect() as never);
    await settle();
    const upgrade = (mesh.state as unknown as { textureUpgrade: { resource: { texturedMaterial: unknown } } }).textureUpgrade;
    expect(upgrade.resource.texturedMaterial).toBeInstanceOf(TexturedPBRMaterial);
    mesh.dispose();
    expect(upgrade.resource.texturedMaterial).toBeNull();
  });
});
