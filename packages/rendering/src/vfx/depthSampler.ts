// PRD-07 — sampler for every lane-07 read of the scene depth texture
// (soft particles/ribbons/beams, low-res composite, volumetric apply).
// A depth texture with compare mode NONE is incomplete under LINEAR filtering
// (GLES 3.0 §3.8.13) and samples 0 on WebGL2, so the default TextureBinding
// sampler made sceneZ = near everywhere: the soft-depth fade went to zero and
// particles drew 0 pixels under A3D_QR_CORE (frame identical to -vfx).
// Same filter/address as lane 01's DEPTH_TEXTURE_SAMPLER (SceneDepthCopyPass).

import { Sampler } from "../Sampler";

export const PRD07_DEPTH_SAMPLER = new Sampler({ minFilter: "nearest", magFilter: "nearest", addressU: "clamp-to-edge", addressV: "clamp-to-edge" });
