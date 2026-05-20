import type { Light } from '../scene/Lights';
export class LightManager {
  private readonly lights = new Map<string, Light>();
  add(light: Light): void { this.lights.set(light.id, light); }
  list(): readonly Light[] { return [...this.lights.values()]; }
  get shadowCastingCount(): number { return this.list().filter((light) => light.castsShadow).length; }
}
