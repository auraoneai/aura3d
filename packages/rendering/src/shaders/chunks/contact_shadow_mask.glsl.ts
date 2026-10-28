/**
 * contact_shadow_mask — forward-shading consumer of the screen-space contact-shadow
 * mask (beat-three.js PRD-2 WP-4). `a3dContactShadowMaskFactor()` is multiplied into the
 * shadow-casting light's visibility only (direct light, never ambient/IBL). Strength 0
 * (no mask bound) returns exactly 1.0 so draws without `effects.contactShadows()` are
 * unchanged. The mask is sampled by fragment position over the forward target size.
 */
export const CONTACT_SHADOW_MASK_CHUNK_ID = "contact_shadow_mask";

export const CONTACT_SHADOW_MASK_GLSL = /* glsl */ `
uniform sampler2D u_contactShadowMask;
uniform float u_contactShadowMaskStrength;
uniform vec2 u_contactShadowMaskViewport;
float a3dContactShadowMaskFactor() {
  if (u_contactShadowMaskStrength < 0.001) return 1.0;
  float mask = texture(u_contactShadowMask, gl_FragCoord.xy / u_contactShadowMaskViewport).r;
  return mix(1.0, mask, clamp(u_contactShadowMaskStrength, 0.0, 1.0));
}
`;
