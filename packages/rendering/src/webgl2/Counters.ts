// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from WebGL2Device.ts; 0 changed logic lines.



export class WebGL2Counters {
  bufferUpdateCount = 0;
  drawCalls = 0;
  nativeEnvironmentBindings = 0;
  nativeInstancedSubmissions = 0;
  nativeShadowMapBindings = 0;
  nativeTemporalBindings = 0;
  nativeTemporalPasses = 0;
  programCompiles = 0;
  readbacks = 0;
  releasedTextureHandles = 0;
  samplerAnisotropyUploadCount = 0;
  samplerParameterUploadCount = 0;
  shaderProgramCreateCount = 0;
  shadowRenderTargetsAllocated = 0;
  textureBindCount = 0;
  uniformLocationLookupCount = 0;
  vertexArrayCreateCount = 0;
}
