/**
 * @fileoverview Unit tests for LightComponent.
 * Tests directional, point, spot, and area lights with shadow configuration.
 */

import { describe, it, expect, beforeEach } from 'vitest';

/**
 * LightComponent implementation for testing.
 */
class LightComponent {
  type: 'directional' | 'point' | 'spot' | 'area';
  color: [number, number, number];
  intensity: number;
  range: number;
  spotAngle: number;
  spotInnerAngle: number;
  castShadows: boolean;
  shadowResolution: number;
  shadowBias: number;
  shadowNormalBias: number;
  enabled: boolean;
  areaWidth: number;
  areaHeight: number;

  constructor(options?: Partial<LightComponent>) {
    this.type = options?.type ?? 'directional';
    this.color = options?.color ?? [1, 1, 1];
    this.intensity = options?.intensity ?? 1;
    this.range = options?.range ?? 10;
    this.spotAngle = options?.spotAngle ?? Math.PI / 4;
    this.spotInnerAngle = options?.spotInnerAngle ?? Math.PI / 6;
    this.castShadows = options?.castShadows ?? true;
    this.shadowResolution = options?.shadowResolution ?? 1024;
    this.shadowBias = options?.shadowBias ?? 0.0001;
    this.shadowNormalBias = options?.shadowNormalBias ?? 0.001;
    this.enabled = options?.enabled ?? true;
    this.areaWidth = options?.areaWidth ?? 1;
    this.areaHeight = options?.areaHeight ?? 1;
  }

  setType(type: 'directional' | 'point' | 'spot' | 'area'): this {
    this.type = type;
    return this;
  }

  setColor(r: number, g: number, b: number): this {
    this.color = [r, g, b];
    return this;
  }

  setIntensity(intensity: number): this {
    this.intensity = Math.max(0, intensity);
    return this;
  }

  setRange(range: number): this {
    this.range = Math.max(0, range);
    return this;
  }

  setSpotAngles(inner: number, outer: number): this {
    this.spotInnerAngle = Math.max(0, Math.min(inner, Math.PI));
    this.spotAngle = Math.max(this.spotInnerAngle, Math.min(outer, Math.PI));
    return this;
  }

  setShadowsEnabled(enabled: boolean): this {
    this.castShadows = enabled;
    return this;
  }

  setShadowResolution(resolution: number): this {
    this.shadowResolution = Math.max(64, Math.min(resolution, 8192));
    return this;
  }

  setShadowBias(bias: number, normalBias?: number): this {
    this.shadowBias = bias;
    if (normalBias !== undefined) {
      this.shadowNormalBias = normalBias;
    }
    return this;
  }

  setAreaSize(width: number, height: number): this {
    this.areaWidth = Math.max(0, width);
    this.areaHeight = Math.max(0, height);
    return this;
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    return this;
  }

  getAttenuation(distance: number): number {
    if (this.type === 'directional') {
      return 1;
    }

    if (distance >= this.range) {
      return 0;
    }

    const attenuation = 1 - (distance / this.range);
    return attenuation * attenuation;
  }

  getSpotAttenuation(angle: number): number {
    if (this.type !== 'spot') {
      return 1;
    }

    if (angle <= this.spotInnerAngle) {
      return 1;
    }

    if (angle >= this.spotAngle) {
      return 0;
    }

    const range = this.spotAngle - this.spotInnerAngle;
    const t = (angle - this.spotInnerAngle) / range;
    return 1 - t * t;
  }

  serialize(): object {
    return {
      type: this.type,
      color: this.color,
      intensity: this.intensity,
      range: this.range,
      spotAngle: this.spotAngle,
      spotInnerAngle: this.spotInnerAngle,
      castShadows: this.castShadows,
      shadowResolution: this.shadowResolution,
      shadowBias: this.shadowBias,
      shadowNormalBias: this.shadowNormalBias,
      enabled: this.enabled,
      areaWidth: this.areaWidth,
      areaHeight: this.areaHeight
    };
  }

  deserialize(data: any): void {
    this.type = data.type ?? 'directional';
    this.color = data.color ?? [1, 1, 1];
    this.intensity = data.intensity ?? 1;
    this.range = data.range ?? 10;
    this.spotAngle = data.spotAngle ?? Math.PI / 4;
    this.spotInnerAngle = data.spotInnerAngle ?? Math.PI / 6;
    this.castShadows = data.castShadows ?? true;
    this.shadowResolution = data.shadowResolution ?? 1024;
    this.shadowBias = data.shadowBias ?? 0.0001;
    this.shadowNormalBias = data.shadowNormalBias ?? 0.001;
    this.enabled = data.enabled ?? true;
    this.areaWidth = data.areaWidth ?? 1;
    this.areaHeight = data.areaHeight ?? 1;
  }

  reset(): void {
    this.type = 'directional';
    this.color = [1, 1, 1];
    this.intensity = 1;
    this.range = 10;
    this.spotAngle = Math.PI / 4;
    this.spotInnerAngle = Math.PI / 6;
    this.castShadows = true;
    this.shadowResolution = 1024;
    this.shadowBias = 0.0001;
    this.shadowNormalBias = 0.001;
    this.enabled = true;
    this.areaWidth = 1;
    this.areaHeight = 1;
  }
}

describe('LightComponent', () => {
  describe('initialization', () => {
    it('creates with default directional light settings', () => {
      const light = new LightComponent();

      expect(light.type).toBe('directional');
      expect(light.color).toEqual([1, 1, 1]);
      expect(light.intensity).toBe(1);
      expect(light.enabled).toBe(true);
      expect(light.castShadows).toBe(true);
    });

    it('creates with custom light type', () => {
      const light = new LightComponent({ type: 'point' });
      expect(light.type).toBe('point');
    });

    it('creates with custom color', () => {
      const light = new LightComponent({ color: [1, 0, 0] });
      expect(light.color).toEqual([1, 0, 0]);
    });

    it('creates with custom intensity', () => {
      const light = new LightComponent({ intensity: 2.5 });
      expect(light.intensity).toBe(2.5);
    });

    it('creates disabled', () => {
      const light = new LightComponent({ enabled: false });
      expect(light.enabled).toBe(false);
    });

    it('creates without shadows', () => {
      const light = new LightComponent({ castShadows: false });
      expect(light.castShadows).toBe(false);
    });
  });

  describe('directional light setup', () => {
    let light: LightComponent;

    beforeEach(() => {
      light = new LightComponent({ type: 'directional' });
    });

    it('creates as directional light', () => {
      expect(light.type).toBe('directional');
    });

    it('directional light has no range limitation', () => {
      const attenuation = light.getAttenuation(1000000);
      expect(attenuation).toBe(1);
    });

    it('directional light intensity is constant across distance', () => {
      const attenuation1 = light.getAttenuation(1);
      const attenuation2 = light.getAttenuation(100);
      expect(attenuation1).toBe(attenuation2);
    });

    it('supports high intensity', () => {
      light.setIntensity(10);
      expect(light.intensity).toBe(10);
    });

    it('supports colored light', () => {
      light.setColor(1, 0.8, 0.6);
      expect(light.color).toEqual([1, 0.8, 0.6]);
    });
  });

  describe('point light setup', () => {
    let light: LightComponent;

    beforeEach(() => {
      light = new LightComponent({ type: 'point' });
    });

    it('creates as point light', () => {
      expect(light.type).toBe('point');
    });

    it('point light has default range', () => {
      expect(light.range).toBe(10);
    });

    it('setRange() updates light range', () => {
      light.setRange(50);
      expect(light.range).toBe(50);
    });

    it('setRange() clamps to non-negative', () => {
      light.setRange(-5);
      expect(light.range).toBe(0);
    });

    it('point light has distance attenuation', () => {
      light.setRange(10);

      const attenuation0 = light.getAttenuation(0);
      const attenuation5 = light.getAttenuation(5);
      const attenuation10 = light.getAttenuation(10);

      expect(attenuation0).toBeGreaterThan(attenuation5);
      expect(attenuation5).toBeGreaterThan(attenuation10);
    });

    it('point light attenuation is zero beyond range', () => {
      light.setRange(10);
      const attenuation = light.getAttenuation(15);
      expect(attenuation).toBe(0);
    });

    it('point light attenuation is full at center', () => {
      light.setRange(10);
      const attenuation = light.getAttenuation(0);
      expect(attenuation).toBe(1);
    });
  });

  describe('spot light setup', () => {
    let light: LightComponent;

    beforeEach(() => {
      light = new LightComponent({ type: 'spot' });
    });

    it('creates as spot light', () => {
      expect(light.type).toBe('spot');
    });

    it('spot light has default angles', () => {
      expect(light.spotInnerAngle).toBeLessThan(light.spotAngle);
      expect(light.spotAngle).toBeGreaterThan(0);
    });

    it('setSpotAngles() updates both angles', () => {
      light.setSpotAngles(Math.PI / 6, Math.PI / 3);

      expect(light.spotInnerAngle).toBeCloseTo(Math.PI / 6);
      expect(light.spotAngle).toBeCloseTo(Math.PI / 3);
    });

    it('setSpotAngles() ensures outer >= inner', () => {
      light.setSpotAngles(Math.PI / 3, Math.PI / 6);

      expect(light.spotAngle).toBeGreaterThanOrEqual(light.spotInnerAngle);
    });

    it('setSpotAngles() clamps to valid range', () => {
      light.setSpotAngles(-1, Math.PI * 2);

      expect(light.spotInnerAngle).toBeGreaterThanOrEqual(0);
      expect(light.spotAngle).toBeLessThanOrEqual(Math.PI);
    });

    it('spot light has angular attenuation', () => {
      light.setSpotAngles(Math.PI / 6, Math.PI / 4);

      const innerAttenuation = light.getSpotAttenuation(0);
      const midAttenuation = light.getSpotAttenuation(Math.PI / 5);
      const outerAttenuation = light.getSpotAttenuation(Math.PI / 4);

      expect(innerAttenuation).toBe(1);
      expect(midAttenuation).toBeGreaterThan(0);
      expect(midAttenuation).toBeLessThan(1);
      expect(outerAttenuation).toBe(0);
    });

    it('spot light attenuation is full within inner cone', () => {
      light.setSpotAngles(Math.PI / 6, Math.PI / 4);
      const attenuation = light.getSpotAttenuation(Math.PI / 8);
      expect(attenuation).toBe(1);
    });

    it('spot light attenuation is zero beyond outer cone', () => {
      light.setSpotAngles(Math.PI / 6, Math.PI / 4);
      const attenuation = light.getSpotAttenuation(Math.PI / 3);
      expect(attenuation).toBe(0);
    });

    it('supports narrow spot cone', () => {
      light.setSpotAngles(Math.PI / 16, Math.PI / 8);
      expect(light.spotAngle).toBeCloseTo(Math.PI / 8);
    });

    it('supports wide spot cone', () => {
      light.setSpotAngles(Math.PI / 3, Math.PI / 2);
      expect(light.spotAngle).toBeCloseTo(Math.PI / 2);
    });
  });

  describe('area light setup', () => {
    let light: LightComponent;

    beforeEach(() => {
      light = new LightComponent({ type: 'area' });
    });

    it('creates as area light', () => {
      expect(light.type).toBe('area');
    });

    it('area light has default size', () => {
      expect(light.areaWidth).toBe(1);
      expect(light.areaHeight).toBe(1);
    });

    it('setAreaSize() updates dimensions', () => {
      light.setAreaSize(5, 3);

      expect(light.areaWidth).toBe(5);
      expect(light.areaHeight).toBe(3);
    });

    it('setAreaSize() clamps to non-negative', () => {
      light.setAreaSize(-1, -1);

      expect(light.areaWidth).toBe(0);
      expect(light.areaHeight).toBe(0);
    });

    it('supports rectangular area', () => {
      light.setAreaSize(10, 2);

      expect(light.areaWidth).toBe(10);
      expect(light.areaHeight).toBe(2);
    });

    it('supports square area', () => {
      light.setAreaSize(5, 5);

      expect(light.areaWidth).toBe(5);
      expect(light.areaHeight).toBe(5);
    });
  });

  describe('color and intensity', () => {
    let light: LightComponent;

    beforeEach(() => {
      light = new LightComponent();
    });

    it('setColor() updates light color', () => {
      light.setColor(1, 0, 0);
      expect(light.color).toEqual([1, 0, 0]);
    });

    it('setColor() supports method chaining', () => {
      const result = light.setColor(0, 1, 0);
      expect(result).toBe(light);
    });

    it('supports white light', () => {
      light.setColor(1, 1, 1);
      expect(light.color).toEqual([1, 1, 1]);
    });

    it('supports warm light', () => {
      light.setColor(1, 0.9, 0.7);
      expect(light.color).toEqual([1, 0.9, 0.7]);
    });

    it('supports cool light', () => {
      light.setColor(0.7, 0.8, 1);
      expect(light.color).toEqual([0.7, 0.8, 1]);
    });

    it('setIntensity() updates light intensity', () => {
      light.setIntensity(2.5);
      expect(light.intensity).toBe(2.5);
    });

    it('setIntensity() clamps to non-negative', () => {
      light.setIntensity(-1);
      expect(light.intensity).toBe(0);
    });

    it('setIntensity() supports method chaining', () => {
      const result = light.setIntensity(3);
      expect(result).toBe(light);
    });

    it('supports very low intensity', () => {
      light.setIntensity(0.001);
      expect(light.intensity).toBe(0.001);
    });

    it('supports very high intensity', () => {
      light.setIntensity(1000);
      expect(light.intensity).toBe(1000);
    });
  });

  describe('shadow configuration', () => {
    let light: LightComponent;

    beforeEach(() => {
      light = new LightComponent();
    });

    it('setShadowsEnabled() enables shadows', () => {
      light.castShadows = false;
      light.setShadowsEnabled(true);
      expect(light.castShadows).toBe(true);
    });

    it('setShadowsEnabled() disables shadows', () => {
      light.setShadowsEnabled(false);
      expect(light.castShadows).toBe(false);
    });

    it('setShadowsEnabled() supports method chaining', () => {
      const result = light.setShadowsEnabled(true);
      expect(result).toBe(light);
    });

    it('setShadowResolution() updates resolution', () => {
      light.setShadowResolution(2048);
      expect(light.shadowResolution).toBe(2048);
    });

    it('setShadowResolution() clamps minimum to 64', () => {
      light.setShadowResolution(32);
      expect(light.shadowResolution).toBe(64);
    });

    it('setShadowResolution() clamps maximum to 8192', () => {
      light.setShadowResolution(16384);
      expect(light.shadowResolution).toBe(8192);
    });

    it('setShadowResolution() supports method chaining', () => {
      const result = light.setShadowResolution(1024);
      expect(result).toBe(light);
    });

    it('supports common shadow resolutions', () => {
      const resolutions = [256, 512, 1024, 2048, 4096];

      for (const res of resolutions) {
        light.setShadowResolution(res);
        expect(light.shadowResolution).toBe(res);
      }
    });

    it('setShadowBias() updates shadow bias', () => {
      light.setShadowBias(0.001);
      expect(light.shadowBias).toBe(0.001);
    });

    it('setShadowBias() updates both biases when specified', () => {
      light.setShadowBias(0.001, 0.002);
      expect(light.shadowBias).toBe(0.001);
      expect(light.shadowNormalBias).toBe(0.002);
    });

    it('setShadowBias() supports method chaining', () => {
      const result = light.setShadowBias(0.0005);
      expect(result).toBe(light);
    });

    it('supports very small shadow bias', () => {
      light.setShadowBias(0.00001);
      expect(light.shadowBias).toBe(0.00001);
    });

    it('supports larger shadow bias for specific cases', () => {
      light.setShadowBias(0.01);
      expect(light.shadowBias).toBe(0.01);
    });
  });

  describe('light enable/disable', () => {
    let light: LightComponent;

    beforeEach(() => {
      light = new LightComponent();
    });

    it('setEnabled() enables light', () => {
      light.enabled = false;
      light.setEnabled(true);
      expect(light.enabled).toBe(true);
    });

    it('setEnabled() disables light', () => {
      light.setEnabled(false);
      expect(light.enabled).toBe(false);
    });

    it('setEnabled() supports method chaining', () => {
      const result = light.setEnabled(false);
      expect(result).toBe(light);
    });

    it('light is enabled by default', () => {
      expect(light.enabled).toBe(true);
    });
  });

  describe('light type switching', () => {
    let light: LightComponent;

    beforeEach(() => {
      light = new LightComponent();
    });

    it('setType() changes light type', () => {
      light.setType('point');
      expect(light.type).toBe('point');
    });

    it('setType() supports method chaining', () => {
      const result = light.setType('spot');
      expect(result).toBe(light);
    });

    it('can switch between all light types', () => {
      light.setType('directional');
      expect(light.type).toBe('directional');

      light.setType('point');
      expect(light.type).toBe('point');

      light.setType('spot');
      expect(light.type).toBe('spot');

      light.setType('area');
      expect(light.type).toBe('area');
    });

    it('preserves settings when changing type', () => {
      light.setIntensity(5);
      light.setColor(1, 0, 0);

      light.setType('point');

      expect(light.intensity).toBe(5);
      expect(light.color).toEqual([1, 0, 0]);
    });
  });

  describe('serialization', () => {
    it('serialize() produces correct structure', () => {
      const light = new LightComponent({
        type: 'spot',
        color: [1, 0.5, 0.25],
        intensity: 3,
        range: 25,
        castShadows: false,
        shadowResolution: 2048
      });

      const data = light.serialize();

      expect(data).toHaveProperty('type', 'spot');
      expect(data).toHaveProperty('color', [1, 0.5, 0.25]);
      expect(data).toHaveProperty('intensity', 3);
      expect(data).toHaveProperty('range', 25);
      expect(data).toHaveProperty('castShadows', false);
      expect(data).toHaveProperty('shadowResolution', 2048);
    });

    it('deserialize() restores light state', () => {
      const data = {
        type: 'point' as const,
        color: [0.8, 0.8, 1] as [number, number, number],
        intensity: 2.5,
        range: 15,
        spotAngle: Math.PI / 3,
        spotInnerAngle: Math.PI / 6,
        castShadows: true,
        shadowResolution: 1024,
        shadowBias: 0.0005,
        shadowNormalBias: 0.002,
        enabled: false,
        areaWidth: 2,
        areaHeight: 3
      };

      const light = new LightComponent();
      light.deserialize(data);

      expect(light.type).toBe('point');
      expect(light.color).toEqual([0.8, 0.8, 1]);
      expect(light.intensity).toBe(2.5);
      expect(light.range).toBe(15);
      expect(light.castShadows).toBe(true);
      expect(light.enabled).toBe(false);
    });

    it('serialize/deserialize round-trip preserves data', () => {
      const light1 = new LightComponent({
        type: 'area',
        color: [0.9, 0.7, 0.5],
        intensity: 1.5,
        range: 20,
        castShadows: false,
        areaWidth: 5,
        areaHeight: 3
      });

      const data = light1.serialize();
      const light2 = new LightComponent();
      light2.deserialize(data);

      expect(JSON.stringify(light1.serialize())).toBe(JSON.stringify(light2.serialize()));
    });
  });

  describe('reset functionality', () => {
    it('reset() returns light to default state', () => {
      const light = new LightComponent({
        type: 'point',
        color: [1, 0, 0],
        intensity: 10,
        range: 50,
        castShadows: false,
        enabled: false
      });

      light.reset();

      expect(light.type).toBe('directional');
      expect(light.color).toEqual([1, 1, 1]);
      expect(light.intensity).toBe(1);
      expect(light.range).toBe(10);
      expect(light.castShadows).toBe(true);
      expect(light.enabled).toBe(true);
    });
  });

  describe('method chaining', () => {
    it('supports full method chain configuration', () => {
      const light = new LightComponent();

      const result = light
        .setType('spot')
        .setColor(1, 0.8, 0.6)
        .setIntensity(2.5)
        .setRange(30)
        .setSpotAngles(Math.PI / 6, Math.PI / 4)
        .setShadowsEnabled(true)
        .setShadowResolution(2048)
        .setShadowBias(0.001, 0.002)
        .setEnabled(true);

      expect(result).toBe(light);
      expect(light.type).toBe('spot');
      expect(light.color).toEqual([1, 0.8, 0.6]);
      expect(light.intensity).toBe(2.5);
      expect(light.range).toBe(30);
      expect(light.castShadows).toBe(true);
      expect(light.enabled).toBe(true);
    });
  });

  describe('attenuation calculations', () => {
    it('directional light has no attenuation', () => {
      const light = new LightComponent({ type: 'directional' });

      expect(light.getAttenuation(0)).toBe(1);
      expect(light.getAttenuation(100)).toBe(1);
      expect(light.getAttenuation(1000000)).toBe(1);
    });

    it('non-spot lights have no angular attenuation', () => {
      const directional = new LightComponent({ type: 'directional' });
      const point = new LightComponent({ type: 'point' });
      const area = new LightComponent({ type: 'area' });

      expect(directional.getSpotAttenuation(0)).toBe(1);
      expect(point.getSpotAttenuation(Math.PI)).toBe(1);
      expect(area.getSpotAttenuation(Math.PI / 2)).toBe(1);
    });
  });
});
