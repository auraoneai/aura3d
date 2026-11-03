/**
 * IC47-V2: a restrained screen-space heat shimmer over the Airstrip deck.
 * The existing custom post-pass API supplies the scene colour; no new asset or engine feature is required.
 * The pass is mounted only for the GU47 Airstrip look on non-Low, non-coarse-pointer devices with motion and VFX enabled.
 */
import { effects, type AuraCustomPostPass } from "@aura3d/engine";

export const AIRSTRIP_HAZE_PASS = "ic-airstrip-haze";

const GLSL = `
uniform float u_icTime;
void main() {
  vec2 uv = v_uv;
  // A soft band above the deck, with no sharp edge or persistent flash.
  float band = smoothstep(0.20, 0.30, uv.y) * (1.0 - smoothstep(0.46, 0.55, uv.y));
  float wave = sin(uv.y * 105.0 + u_icTime * 2.0 + sin(uv.x * 30.0 - u_icTime) * 1.5);
  float lift = sin(uv.x * 45.0 + uv.y * 35.0 - u_icTime * 1.4);
  vec2 offset = vec2(wave, lift * 0.25) * (0.0015 * band);
  outColor = texture(u_color, clamp(uv + offset, vec2(0.0), vec2(1.0)));
}`;

export function airstripHazePass(): AuraCustomPostPass {
  return effects.shaderPass({
    name: AIRSTRIP_HAZE_PASS,
    order: "before-tonemap",
    glsl: GLSL,
    uniforms: { u_icTime: 0 }
  });
}
