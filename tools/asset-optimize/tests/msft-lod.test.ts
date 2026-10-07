/**
 * Round-trip for the custom `MSFT_lod` extension (PRD-05 §6.1):
 * write a 3-level node chain with `extensions.MSFT_lod.ids` +
 * `extras.MSFT_screencoverage`, read it back, assert structure.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Document, Format, NodeIO } from "@gltf-transform/core";
import { MSFTLod, MSFTLodNode, MSFT_LOD_EXTENSION_NAME, MSFT_SCREENCOVERAGE_EXTRA } from "../extensions/msft-lod";

const toolDir = dirname(fileURLToPath(import.meta.url));
const depsInstalled = existsSync(join(toolDir, "..", "node_modules", "@gltf-transform"));
const d = depsInstalled ? describe : describe.skip;

d("MSFTLod extension", () => {
  it("writes extensions.MSFT_lod.ids + extras.MSFT_screencoverage and reads them back", async () => {
    const doc = new Document();
    doc.createBuffer();
    const scene = doc.createScene("s");
    const lod0 = doc.createNode("lod0");
    const lod1 = doc.createNode("lod1");
    const lod2 = doc.createNode("lod2");
    scene.addChild(lod0).addChild(lod1).addChild(lod2);

    const ext = doc.createExtension(MSFTLod);
    const prop = ext.createLodNode();
    prop.addLod(lod1).addLod(lod2);
    lod0.setExtension(MSFT_LOD_EXTENSION_NAME, prop);
    lod0.setExtras({ [MSFT_SCREENCOVERAGE_EXTRA]: [0.25, 0.08, 0.02] });

    const io = new NodeIO().registerExtensions([MSFTLod]);
    const json = await io.writeJSON(doc, { format: Format.GLTF });

    // Written shape: node0 carries ids of node1,node2 + screencoverage extras.
    const nodes = (json.json as { nodes?: { extensions?: Record<string, { ids?: number[] }>; extras?: Record<string, unknown> }[] }).nodes!;
    expect(nodes[0].extensions?.[MSFT_LOD_EXTENSION_NAME]?.ids).toEqual([1, 2]);
    expect(nodes[0].extras?.[MSFT_SCREENCOVERAGE_EXTRA]).toEqual([0.25, 0.08, 0.02]);
    expect((json.json as { extensionsUsed?: string[] }).extensionsUsed).toContain(MSFT_LOD_EXTENSION_NAME);

    // Read back: LOD0 lists lod1+lod2, order preserved.
    const roundTrip = await io.readJSON(json);
    const [n0, n1, n2] = roundTrip.getRoot().listNodes();
    const readBack = n0.getExtension(MSFT_LOD_EXTENSION_NAME) as MSFTLodNode;
    expect(readBack.listLods().map((n) => n.getName())).toEqual([n1.getName(), n2.getName()]);
    expect(n0.getExtras()[MSFT_SCREENCOVERAGE_EXTRA]).toEqual([0.25, 0.08, 0.02]);
  });

  it("binary GLB round-trip preserves the LOD chain", async () => {
    const doc = new Document();
    doc.createBuffer();
    const scene = doc.createScene("s");
    const lod0 = doc.createNode("n0");
    const lod1 = doc.createNode("n1");
    scene.addChild(lod0).addChild(lod1);
    const ext = doc.createExtension(MSFTLod);
    const prop = ext.createLodNode();
    prop.addLod(lod1);
    lod0.setExtension(MSFT_LOD_EXTENSION_NAME, prop);
    lod0.setExtras({ [MSFT_SCREENCOVERAGE_EXTRA]: [0.5, 0.1] });

    const io = new NodeIO().registerExtensions([MSFTLod]);
    const glb = await io.writeBinary(doc);
    const back = await io.readBinary(glb);
    const [r0] = back.getRoot().listNodes();
    const prop2 = r0.getExtension(MSFT_LOD_EXTENSION_NAME) as MSFTLodNode;
    expect(prop2.listLods().map((n) => n.getName())).toEqual(["n1"]);
    expect(r0.getExtras()[MSFT_SCREENCOVERAGE_EXTRA]).toEqual([0.5, 0.1]);
  });
});
