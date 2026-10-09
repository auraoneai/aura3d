// Extracts one named node from a kit GLB into a standalone GLB (kit-mesh
// → asset admission; e.g. `light_squareCross` out of kenney-modular-road-kit).
// Usage: tsx extract-node.mts <src.glb> <node-name> <out.glb>
import { NodeIO } from "@gltf-transform/core";
import { prune } from "@gltf-transform/functions";
const [,, src, keepName, out] = process.argv;
const io = new NodeIO();
const doc = await io.read(src!);
const root = doc.getRoot();
const keep = root.listNodes().find(n => n.getName() === keepName);
if (!keep) throw new Error(`node ${keepName} not found`);
for (const scene of root.listScenes()) {
  for (const child of scene.listChildren()) if (child !== keep) scene.removeChild(child);
  if (!scene.listChildren().includes(keep)) scene.addChild(keep);
}
for (const node of root.listNodes()) if (node !== keep) node.dispose();
await doc.transform(prune({ keepLeaves: false }));
await io.write(out!, doc);
const mesh = keep.getMesh();
const tris = mesh ? mesh.listPrimitives().reduce((t,p)=>t+(p.getIndices()?.getCount()??0)/3,0) : 0;
console.log(`wrote ${out} tris=${tris}`);
