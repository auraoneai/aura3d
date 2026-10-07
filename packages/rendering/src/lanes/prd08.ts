/**
 * Lane prd08 barrel — owned by lane 08 (CONTRACTS.md §3.8). `provide()` calls
 * for that lane's real implementations live here; empty in PR 0a.
 *
 * Registers the `prd08.cameraFade` C-02 chunk + feature (S-1) and the
 * `prd08.cameraFadeOffset` C-01 contributor that advances `u_cameraFadeOffset`
 * per-frame when a TAA post pass exists (S-2). With `A3D_QR_CAMERA` off the
 * feature is inactive (registry filters by flag) and no draw changes.
 */
import { registerShaderChunk, registerShaderFeature } from "../contracts/program";
import { registerFrameContributor } from "../contracts/frameGraph";
import {
  cameraFadeParsChunk,
  cameraFadeDiscardChunk,
  cameraFadeFeature,
  createCameraFadeOffsetContributor
} from "../shaders/camera-fade.glsl.js";

registerShaderChunk(cameraFadeParsChunk);
registerShaderChunk(cameraFadeDiscardChunk);
registerShaderFeature(cameraFadeFeature);
registerFrameContributor(createCameraFadeOffsetContributor());
