import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  base: {type:"model",format:"glb",url:"/models/relay-workcell/base.glb",hash:"sha256-2b0b8e5f037c8866bc31bb0d67239eefe17cc94cfb54489f217b4aeb4cf30972"},
  j1: {type:"model",format:"glb",url:"/models/relay-workcell/j1.glb",hash:"sha256-32e1f6cd6f1787830a1d104c4f6bd6593c164ed46fa397e7588485845cfdc94b"},
  j2: {type:"model",format:"glb",url:"/models/relay-workcell/j2.glb",hash:"sha256-942ca7a72f3f289e182249b1480e175191158b8e646a163a959ea783a2022547"},
  j3: {type:"model",format:"glb",url:"/models/relay-workcell/j3.glb",hash:"sha256-84be1cfff75dfeb491cd9a03d0dbca5121eeddebda286ff7f31f4eac3fcd7037"},
  j4: {type:"model",format:"glb",url:"/models/relay-workcell/j4.glb",hash:"sha256-ddf01551aae91be721e2ac800cc0e5f902d2f2ca1ee043e12bb17338d38dd077"},
  j5: {type:"model",format:"glb",url:"/models/relay-workcell/j5.glb",hash:"sha256-6b4a77194375685c6a164efb8a8a2955e54366f87c227bbb1536c52e6611ef69"},
  j6: {type:"model",format:"glb",url:"/models/relay-workcell/j6.glb",hash:"sha256-312131c871dd961c1f6531f0aaba5e042fbcfcd9f2bf6cc36a53da018993e6ac"},
  jawL: {type:"model",format:"glb",url:"/models/relay-workcell/jaw-l.glb",hash:"sha256-51df5f7426d3a6c62724435f4ffc7cbf0787938a10444908452aa9a2000a7952"},
  jawR: {type:"model",format:"glb",url:"/models/relay-workcell/jaw-r.glb",hash:"sha256-7ea36855dd7d18b9f47fb4cfdeae3f6ddec5985b36bdf738695e94dc2929773e"},
  studio: {type:"texture",format:"hdr",url:"/hdri/studio_small_08_1k.hdr",hash:"sha256-f6a989f89432eb4eee3191364a9c1ceed195c4ec3544173a3c04fd96cb91d0ba"}
} as const);
