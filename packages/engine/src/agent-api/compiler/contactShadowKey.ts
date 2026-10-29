import type { AuraColor, AuraLightNode, AuraSceneSnapshot, AuraVec3 } from "../nodes/types.js";
import { groups } from "../nodes/groups.js";
import { colorToLinearRgb } from "../colorUtils.js";

/**
 * LIGHT-09: `effects.contactShadows()` darkens only the shadow-casting directional light. The mask is marched along
 * that light's direction, so applying it to a spot or point light would draw a shadow that light does not cast. In a
 * night look the key is weak (night-city 0.7, polar-night 0.5) and stages are lit by spots and points, so the contact
 * shadows barely show. This warns when the shadowed key supplies under `CONTACT_SHADOW_KEY_MIN_SHARE` of the direct
 * light that reaches the camera target. Heuristic: directional lights count at their intensity; point and spot lights
 * at intensity / distance^2 at the camera target (inverse-square, the physical falloff), and a spot only when the
 * target is inside its cone. Colours weight by luminance.
 */
export const CONTACT_SHADOW_KEY_MIN_SHARE = 0.2;

const luminance = (color: AuraColor | undefined): number => {
  const [r, g, b] = colorToLinearRgb(color ?? "#ffffff");
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function shadowCasting(light: AuraLightNode): boolean {
  const shadow = (light as { shadow?: unknown }).shadow;
  return shadow !== undefined && shadow !== false;
}

function contributionAt(light: AuraLightNode, target: AuraVec3): number {
  const intensity = Math.max(0, light.intensity ?? 0) * luminance(light.color);
  if (light.light === "directional") return intensity;
  if (light.light !== "point" && light.light !== "spot") return 0;
  const p = light.position ?? [0, 0, 0];
  const d: AuraVec3 = [target[0] - p[0], target[1] - p[1], target[2] - p[2]];
  const dist2 = Math.max(1e-4, d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
  if (light.light === "spot") {
    const aim = (light as { target?: AuraVec3 }).target ?? [0, 0, 0];
    const axis: AuraVec3 = [aim[0] - p[0], aim[1] - p[1], aim[2] - p[2]];
    const axisLen = Math.hypot(axis[0], axis[1], axis[2]);
    const angle = (light as { angle?: number }).angle ?? Math.PI / 6;
    if (axisLen > 1e-6) {
      const cos = (axis[0] * d[0] + axis[1] * d[1] + axis[2] * d[2]) / (axisLen * Math.sqrt(dist2));
      if (cos < Math.cos(angle)) return 0;
    }
  }
  return intensity / dist2;
}

/** The warning text, or null when the scene has no contact shadows or its shadowed key is strong enough. */
export function contactShadowKeyWarning(snapshot: AuraSceneSnapshot): string | null {
  const nodes = groups.flatten(snapshot.nodes);
  const contact = nodes.some((node) => node.kind === "effect" && (node.effect as string) === "contact-shadows");
  if (!contact) return null;
  const lights = nodes.filter((node): node is AuraLightNode => node.kind === "light");
  const target = snapshot.camera?.target ?? [0, 0, 0];
  let key = 0;
  let total = 0;
  for (const light of lights) {
    const value = contributionAt(light, target);
    total += value;
    if (light.light === "directional" && shadowCasting(light)) key = Math.max(key, value);
  }
  if (total <= 0) return null;
  const share = key / total;
  if (share >= CONTACT_SHADOW_KEY_MIN_SHARE) return null;
  return `CONTACT_SHADOWS_WEAK_KEY: effects.contactShadows() darkens only the shadow-casting directional light, which supplies ${Math.round(share * 100)}% of the direct light at the camera target (under ${Math.round(CONTACT_SHADOW_KEY_MIN_SHARE * 100)}%); contact shadows will barely show. Raise that light or the contactShadows intensity, or rely on the spot/point shadows.`;
}
