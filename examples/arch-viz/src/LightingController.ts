/**
 * G3D Architectural Visualization - Advanced Lighting Control
 * Controls sun position, interior lights, and global illumination
 */

import { Vector3, Color } from 'g3d';

export interface LightingPreset {
  name: string;
  timeOfDay: number; // 0-24 hours
  sunIntensity: number;
  sunColor: Color;
  skyColor: Color;
  ambientIntensity: number;
  interiorLightsOn: boolean;
}

export interface LightSource {
  id: string;
  position: Vector3;
  color: Color;
  intensity: number;
  range: number;
  type: 'point' | 'spot' | 'area';
  enabled: boolean;
  temperature: number; // Kelvin
}

/**
 * Comprehensive lighting control for architectural scenes
 */
export class LightingController {
  private currentTimeOfDay: number = 14.0; // 2 PM default
  private sunPosition: Vector3 = new Vector3();
  private sunIntensity: number = 3.5;
  private sunColor: Color = new Color(1, 0.98, 0.95);
  private skyColor: Color = new Color(0.53, 0.81, 0.92);
  private ambientIntensity: number = 0.3;

  private interiorLights: Map<string, LightSource> = new Map();
  private interiorLightsEnabled: boolean = false;

  private presets: Map<string, LightingPreset> = new Map();

  constructor() {
    this.initializePresets();
    this.initializeInteriorLights();
    this.updateSunPosition();
  }

  /**
   * Initialize lighting presets for different times of day
   */
  private initializePresets(): void {
    // Early Morning - Sunrise
    this.presets.set('sunrise', {
      name: 'Sunrise',
      timeOfDay: 6.0,
      sunIntensity: 1.5,
      sunColor: new Color(1.0, 0.7, 0.4), // Warm orange
      skyColor: new Color(0.95, 0.7, 0.6), // Pink-orange sky
      ambientIntensity: 0.15,
      interiorLightsOn: true,
    });

    // Morning - Soft light
    this.presets.set('morning', {
      name: 'Morning',
      timeOfDay: 9.0,
      sunIntensity: 2.8,
      sunColor: new Color(1.0, 0.95, 0.88), // Soft warm white
      skyColor: new Color(0.6, 0.85, 0.95), // Clear blue
      ambientIntensity: 0.25,
      interiorLightsOn: false,
    });

    // Noon - Bright sunlight
    this.presets.set('noon', {
      name: 'Noon',
      timeOfDay: 12.0,
      sunIntensity: 4.5,
      sunColor: new Color(1.0, 0.98, 0.95), // Neutral white
      skyColor: new Color(0.53, 0.81, 0.92), // Deep blue
      ambientIntensity: 0.35,
      interiorLightsOn: false,
    });

    // Afternoon - Golden hour approaching
    this.presets.set('afternoon', {
      name: 'Afternoon',
      timeOfDay: 15.0,
      sunIntensity: 3.2,
      sunColor: new Color(1.0, 0.94, 0.85), // Slightly warm
      skyColor: new Color(0.58, 0.83, 0.93), // Bright blue
      ambientIntensity: 0.28,
      interiorLightsOn: false,
    });

    // Golden Hour - Warm evening light
    this.presets.set('golden_hour', {
      name: 'Golden Hour',
      timeOfDay: 18.0,
      sunIntensity: 2.0,
      sunColor: new Color(1.0, 0.75, 0.5), // Golden orange
      skyColor: new Color(0.95, 0.75, 0.6), // Orange-pink
      ambientIntensity: 0.2,
      interiorLightsOn: true,
    });

    // Sunset - Dramatic colors
    this.presets.set('sunset', {
      name: 'Sunset',
      timeOfDay: 19.5,
      sunIntensity: 1.2,
      sunColor: new Color(1.0, 0.5, 0.3), // Deep orange-red
      skyColor: new Color(0.9, 0.5, 0.4), // Red-orange sky
      ambientIntensity: 0.15,
      interiorLightsOn: true,
    });

    // Dusk - Blue hour
    this.presets.set('dusk', {
      name: 'Dusk',
      timeOfDay: 20.5,
      sunIntensity: 0.3,
      sunColor: new Color(0.7, 0.6, 0.9), // Purple-blue
      skyColor: new Color(0.25, 0.35, 0.65), // Deep blue
      ambientIntensity: 0.08,
      interiorLightsOn: true,
    });

    // Night - Moonlight
    this.presets.set('night', {
      name: 'Night',
      timeOfDay: 23.0,
      sunIntensity: 0.15,
      sunColor: new Color(0.7, 0.75, 0.9), // Cool blue
      skyColor: new Color(0.02, 0.03, 0.08), // Very dark blue
      ambientIntensity: 0.05,
      interiorLightsOn: true,
    });
  }

  /**
   * Initialize interior light sources
   */
  private initializeInteriorLights(): void {
    // Living room ceiling lights
    this.interiorLights.set('living_ceiling_1', {
      id: 'living_ceiling_1',
      position: new Vector3(0, 2.7, -2),
      color: this.kelvinToRGB(3000), // Warm white
      intensity: 800,
      range: 5,
      type: 'point',
      enabled: true,
      temperature: 3000,
    });

    this.interiorLights.set('living_ceiling_2', {
      id: 'living_ceiling_2',
      position: new Vector3(0, 2.7, 2),
      color: this.kelvinToRGB(3000),
      intensity: 800,
      range: 5,
      type: 'point',
      enabled: true,
      temperature: 3000,
    });

    // Kitchen task lighting
    this.interiorLights.set('kitchen_task_1', {
      id: 'kitchen_task_1',
      position: new Vector3(-3, 2.5, -1),
      color: this.kelvinToRGB(4000), // Neutral white
      intensity: 1200,
      range: 4,
      type: 'spot',
      enabled: true,
      temperature: 4000,
    });

    this.interiorLights.set('kitchen_task_2', {
      id: 'kitchen_task_2',
      position: new Vector3(-3, 2.5, 1),
      color: this.kelvinToRGB(4000),
      intensity: 1200,
      range: 4,
      type: 'spot',
      enabled: true,
      temperature: 4000,
    });

    // Bedroom ambient lighting
    this.interiorLights.set('bedroom_ambient', {
      id: 'bedroom_ambient',
      position: new Vector3(4, 2.6, 0),
      color: this.kelvinToRGB(2700), // Very warm
      intensity: 600,
      range: 6,
      type: 'point',
      enabled: true,
      temperature: 2700,
    });

    // Study desk lamp
    this.interiorLights.set('study_desk', {
      id: 'study_desk',
      position: new Vector3(3.5, 1.2, -2.5),
      color: this.kelvinToRGB(4500), // Cool white
      intensity: 400,
      range: 2.5,
      type: 'spot',
      enabled: true,
      temperature: 4500,
    });

    // Hallway lights
    this.interiorLights.set('hallway_1', {
      id: 'hallway_1',
      position: new Vector3(0, 2.5, 5),
      color: this.kelvinToRGB(3500),
      intensity: 500,
      range: 4,
      type: 'point',
      enabled: true,
      temperature: 3500,
    });

    this.interiorLights.set('hallway_2', {
      id: 'hallway_2',
      position: new Vector3(0, 2.5, -5),
      color: this.kelvinToRGB(3500),
      intensity: 500,
      range: 4,
      type: 'point',
      enabled: true,
      temperature: 3500,
    });

    // Bathroom lights
    this.interiorLights.set('bathroom_main', {
      id: 'bathroom_main',
      position: new Vector3(-4, 2.4, 3),
      color: this.kelvinToRGB(5000), // Daylight white
      intensity: 900,
      range: 3,
      type: 'area',
      enabled: true,
      temperature: 5000,
    });

    // Accent lighting
    this.interiorLights.set('accent_wall', {
      id: 'accent_wall',
      position: new Vector3(-5.5, 1.5, 0),
      color: this.kelvinToRGB(3200),
      intensity: 300,
      range: 3,
      type: 'spot',
      enabled: true,
      temperature: 3200,
    });
  }

  /**
   * Convert color temperature (Kelvin) to RGB
   */
  private kelvinToRGB(kelvin: number): Color {
    const temp = kelvin / 100;
    let r: number, g: number, b: number;

    // Red calculation
    if (temp <= 66) {
      r = 255;
    } else {
      r = temp - 60;
      r = 329.698727446 * Math.pow(r, -0.1332047592);
      r = Math.max(0, Math.min(255, r));
    }

    // Green calculation
    if (temp <= 66) {
      g = temp;
      g = 99.4708025861 * Math.log(g) - 161.1195681661;
    } else {
      g = temp - 60;
      g = 288.1221695283 * Math.pow(g, -0.0755148492);
    }
    g = Math.max(0, Math.min(255, g));

    // Blue calculation
    if (temp >= 66) {
      b = 255;
    } else if (temp <= 19) {
      b = 0;
    } else {
      b = temp - 10;
      b = 138.5177312231 * Math.log(b) - 305.0447927307;
      b = Math.max(0, Math.min(255, b));
    }

    return new Color(r / 255, g / 255, b / 255);
  }

  /**
   * Update sun position based on time of day
   */
  private updateSunPosition(): void {
    // Convert time to angle (0-24 hours to 0-360 degrees)
    const hourAngle = (this.currentTimeOfDay - 6) * 15; // 0 at 6 AM
    const elevation = Math.sin((hourAngle * Math.PI) / 180) * 60; // Max 60 degrees
    const azimuth = (hourAngle - 90) * (Math.PI / 180); // Rotate around

    const distance = 50;
    this.sunPosition.set(
      Math.cos(azimuth) * distance,
      Math.max(elevation, -10), // Don't go too far below horizon
      Math.sin(azimuth) * distance
    );
  }

  /**
   * Set time of day (0-24 hours)
   */
  setTimeOfDay(time: number): void {
    this.currentTimeOfDay = ((time % 24) + 24) % 24; // Wrap to 0-24
    this.updateSunPosition();
    this.updateLightingForTime();
  }

  /**
   * Update lighting parameters based on time
   */
  private updateLightingForTime(): void {
    const hour = this.currentTimeOfDay;

    // Interpolate lighting based on time
    if (hour >= 5 && hour < 7) {
      // Sunrise transition
      const t = (hour - 5) / 2;
      this.sunIntensity = 0.5 + t * 1.0;
      this.sunColor = this.lerpColor(
        new Color(1, 0.6, 0.3),
        new Color(1, 0.95, 0.88),
        t
      );
      this.ambientIntensity = 0.1 + t * 0.15;
    } else if (hour >= 7 && hour < 12) {
      // Morning to noon
      const t = (hour - 7) / 5;
      this.sunIntensity = 1.5 + t * 3.0;
      this.sunColor = new Color(1, 0.95 + t * 0.03, 0.88 + t * 0.07);
      this.ambientIntensity = 0.25 + t * 0.1;
    } else if (hour >= 12 && hour < 17) {
      // Afternoon
      const t = (hour - 12) / 5;
      this.sunIntensity = 4.5 - t * 1.3;
      this.sunColor = new Color(1, 0.98 - t * 0.04, 0.95 - t * 0.1);
      this.ambientIntensity = 0.35 - t * 0.07;
    } else if (hour >= 17 && hour < 20) {
      // Golden hour to sunset
      const t = (hour - 17) / 3;
      this.sunIntensity = 3.2 - t * 2.0;
      this.sunColor = this.lerpColor(
        new Color(1, 0.94, 0.85),
        new Color(1, 0.5, 0.3),
        t
      );
      this.ambientIntensity = 0.28 - t * 0.13;
      this.interiorLightsEnabled = t > 0.3;
    } else {
      // Night
      this.sunIntensity = 0.15;
      this.sunColor = new Color(0.7, 0.75, 0.9);
      this.ambientIntensity = 0.05;
      this.interiorLightsEnabled = true;
    }
  }

  /**
   * Linear interpolation between colors
   */
  private lerpColor(a: Color, b: Color, t: number): Color {
    return new Color(
      a.r + (b.r - a.r) * t,
      a.g + (b.g - a.g) * t,
      a.b + (b.b - a.b) * t
    );
  }

  /**
   * Apply a preset
   */
  applyPreset(presetName: string): void {
    const preset = this.presets.get(presetName);
    if (!preset) return;

    this.currentTimeOfDay = preset.timeOfDay;
    this.sunIntensity = preset.sunIntensity;
    this.sunColor = preset.sunColor;
    this.skyColor = preset.skyColor;
    this.ambientIntensity = preset.ambientIntensity;
    this.interiorLightsEnabled = preset.interiorLightsOn;
    this.updateSunPosition();
  }

  /**
   * Toggle interior lights
   */
  toggleInteriorLights(enabled?: boolean): void {
    this.interiorLightsEnabled = enabled ?? !this.interiorLightsEnabled;
  }

  /**
   * Toggle specific light
   */
  toggleLight(lightId: string, enabled?: boolean): void {
    const light = this.interiorLights.get(lightId);
    if (light) {
      light.enabled = enabled ?? !light.enabled;
    }
  }

  /**
   * Get sun direction vector
   */
  getSunDirection(): Vector3 {
    return this.sunPosition.clone().normalize().negate();
  }

  /**
   * Get current lighting state
   */
  getLightingState() {
    return {
      timeOfDay: this.currentTimeOfDay,
      sunPosition: this.sunPosition.clone(),
      sunIntensity: this.sunIntensity,
      sunColor: this.sunColor,
      skyColor: this.skyColor,
      ambientIntensity: this.ambientIntensity,
      interiorLightsEnabled: this.interiorLightsEnabled,
    };
  }

  /**
   * Get all interior lights
   */
  getInteriorLights(): LightSource[] {
    return Array.from(this.interiorLights.values());
  }

  /**
   * Get available presets
   */
  getPresets(): LightingPreset[] {
    return Array.from(this.presets.values());
  }
}
