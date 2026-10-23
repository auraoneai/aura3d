#!/usr/bin/env node
// Regenerates examples/ninja-runner-port/assets/meshy/<character>.glb from Meshy downloads kept in the ignored artifacts/meshy/ (rig task output + animate task outputs).
// usage: node tools/crayon-capture/ninja-runner-meshy-merge.mjs <name> <rigDir> <outGlb> clip=dir[:file] ...   (clip names canonical: run idle jump slide punch sword jab block hit death)
// Base = rigged_character_glb.glb of rigDir (mesh, skin, textures). Clips are copied from each source GLB by node name.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { NodeIO, Document } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { dedup, prune, textureCompress, resample, reorder } = require("@gltf-transform/functions");
const { MeshoptEncoder, MeshoptDecoder } = require("meshoptimizer");
const sharp = require("sharp");
const [name, rigDir, outGlb, ...specs] = process.argv.slice(2);
const tex = Number(process.env.TEX || 1024);
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const root = new URL("../../", import.meta.url).pathname;
const base = await io.read(root + rigDir + "/rigged_character_glb.glb");
// basic animations (walking/running) come from signed Meshy CDN urls recorded in the rig task meta
const meta = JSON.parse(readFileSync(root + rigDir + "/meta.json", "utf8"));
const sources = [];
for (const s of specs) {
  const [clip, loc] = s.split("=");
  let path;
  if (loc === "basic:running" || loc === "basic:walking") {
    path = `${process.env.TMPDIR ?? "/tmp"}/ninja-meshy-${name}-${loc.split(":")[1]}.glb`;
    if (!existsSync(path)) {
      const url = meta.task.result.basic_animations[`${loc.split(":")[1]}_glb_url`];
      const res = await fetch(url); if (!res.ok) throw new Error(`download ${loc}: ${res.status}`);
      writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    }
  } else path = root + loc + "/animation_glb.glb";
  sources.push({ clip, doc: await io.read(path) });
}
const byName = new Map(base.getRoot().listNodes().map((n) => [n.getName(), n]));
const baseDoc = base;
for (const { clip, doc } of sources) {
  const src = doc.getRoot().listAnimations()[0];
  if (!src) throw new Error(`${clip}: source has no animation`);
  const anim = baseDoc.createAnimation(clip);
  const buf = baseDoc.getRoot().listBuffers()[0];
  let kept = 0;
  for (const ch of src.listChannels()) {
    const target = byName.get(ch.getTargetNode()?.getName());
    if (!target) continue;
    const s = ch.getSampler();
    const inp = baseDoc.createAccessor().setType("SCALAR").setArray(s.getInput().getArray().slice()).setBuffer(buf);
    const outp = baseDoc.createAccessor().setType(s.getOutput().getType()).setArray(s.getOutput().getArray().slice()).setBuffer(buf);
    const sampler = baseDoc.createAnimationSampler().setInput(inp).setOutput(outp).setInterpolation(s.getInterpolation());
    const channel = baseDoc.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(sampler);
    anim.addSampler(sampler).addChannel(channel); kept++;
  }
  console.log(name, clip, "channels", kept, "of", src.listChannels().length, "duration", Math.max(...src.listSamplers().map((x) => x.getInput().getMax([])[0])).toFixed(2));
}
// drop the placeholder rest-pose clip(s) the rig task shipped with
for (const a of baseDoc.getRoot().listAnimations()) if (!specs.some((s) => s.split("=")[0] === a.getName())) a.dispose();
await baseDoc.transform(
  dedup(), resample(), prune(),
  textureCompress({ encoder: sharp, resize: [tex, tex], targetFormat: "jpeg", slots: /^(?!normal)/, quality: 85 }),
  textureCompress({ encoder: sharp, resize: [tex, tex], slots: /^normal/ }),
  reorder({ encoder: MeshoptEncoder })
);
await io.write(outGlb, baseDoc);
console.log(name, "wrote", outGlb, statSync(outGlb).size, "bytes", "animations", baseDoc.getRoot().listAnimations().map((a) => a.getName()).join(","));
