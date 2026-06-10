export type LightKind = "directional" | "point" | "spot" | "ambient";

/**
 * Light parameters for an ECS entity.
 *
 * The ECS render bridge collects lights each frame and passes them to the
 * renderer as part of the {@link RenderSource} lighting state.
 */
export class LightComponent {
  kind: LightKind = "directional";
  color: [number, number, number] = [1, 1, 1];
  intensity = 1;
  range = 10;
  angle = Math.PI / 4; // spot only
  penumbra = 0; // spot only
  castsShadow = false;
  layerMask = 1;
}
