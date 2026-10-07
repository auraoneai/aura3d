import { NodeIO } from "@gltf-transform/core";
const io = new NodeIO();
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const root = doc.getRoot();
  const clips = root.listAnimations().map(a => a.getName());
  let tris = 0, joints = 0;
  for (const skin of root.listSkins()) joints += skin.listJoints().length;
  for (const mesh of root.listMeshes())
    for (const prim of mesh.listPrimitives())
      tris += (prim.getIndices()?.getCount() ?? prim.getAttribute("POSITION").getCount()) / 3;
  const skins = root.listSkins().length;
  const texs = root.listTextures().length;
  console.log(JSON.stringify({ file: f.split("/").pop(), tris: Math.round(tris), joints, skins, textures: texs, clips }, null, 1));
}
