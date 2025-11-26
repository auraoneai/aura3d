/**
 * Weather state definition and configuration
 * Defines all possible weather states and their properties
 * @module Weather
 */

import { Vector3 } from '../math/Vector3';

/**
 * Weather state types
 */
export enum WeatherType {
    CLEAR = 'clear',
    PARTLY_CLOUDY = 'partly_cloudy',
    CLOUDY = 'cloudy',
    LIGHT_RAIN = 'light_rain',
    RAIN = 'rain',
    HEAVY_RAIN = 'heavy_rain',
    THUNDERSTORM = 'thunderstorm',
    LIGHT_SNOW = 'light_snow',
    SNOW = 'snow',
    BLIZZARD = 'blizzard',
    FOG = 'fog'
}

/**
 * Weather state properties
 */
export interface WeatherStateConfig {
    /** Weather type identifier */
    type: WeatherType;

    /** Cloud coverage [0-1] */
    cloudCoverage: number;

    /** Cloud density [0-1] */
    cloudDensity: number;

    /** Cloud opacity [0-1] */
    cloudOpacity: number;

    /** Fog density [0-1] */
    fogDensity: number;

    /** Fog color */
    fogColor: Vector3;

    /** Rain intensity [0-1] */
    rainIntensity: number;

    /** Snow intensity [0-1] */
    snowIntensity: number;

    /** Wind speed in m/s */
    windSpeed: number;

    /** Wind direction */
    windDirection: Vector3;

    /** Wind gustiness [0-1] */
    windGustiness: number;

    /** Lightning frequency (strikes per minute) */
    lightningFrequency: number;

    /** Sun light intensity multiplier [0-1] */
    sunIntensity: number;

    /** Ambient light intensity multiplier [0-1] */
    ambientIntensity: number;

    /** Wetness accumulation rate */
    wetnessRate: number;

    /** Visibility distance in meters */
    visibility: number;
}

/**
 * Weather state with properties and behavior
 */
export class WeatherState {
    /** State configuration */
    public readonly config: WeatherStateConfig;

    /** Current blend factor when transitioning */
    public blendFactor: number = 0;

    /**
     * Creates a new weather state
     * @param config - Weather state configuration
     */
    constructor(config: WeatherStateConfig) {
        this.config = config;
    }

    /**
     * Gets the weather type
     */
    public getType(): WeatherType {
        return this.config.type;
    }

    /**
     * Creates a copy of this weather state
     */
    public clone(): WeatherState {
        return new WeatherState({
            type: this.config.type,
            cloudCoverage: this.config.cloudCoverage,
            cloudDensity: this.config.cloudDensity,
            cloudOpacity: this.config.cloudOpacity,
            fogDensity: this.config.fogDensity,
            fogColor: this.config.fogColor.clone(),
            rainIntensity: this.config.rainIntensity,
            snowIntensity: this.config.snowIntensity,
            windSpeed: this.config.windSpeed,
            windDirection: this.config.windDirection.clone(),
            windGustiness: this.config.windGustiness,
            lightningFrequency: this.config.lightningFrequency,
            sunIntensity: this.config.sunIntensity,
            ambientIntensity: this.config.ambientIntensity,
            wetnessRate: this.config.wetnessRate,
            visibility: this.config.visibility
        });
    }

    /**
     * Interpolates between two weather states
     * @param from - Starting state
     * @param to - Target state
     * @param t - Interpolation factor [0-1]
     * @returns Interpolated weather state
     */
    public static lerp(from: WeatherState, to: WeatherState, t: number): WeatherState {
        const config: WeatherStateConfig = {
            type: t < 0.5 ? from.config.type : to.config.type,
            cloudCoverage: from.config.cloudCoverage + (to.config.cloudCoverage - from.config.cloudCoverage) * t,
            cloudDensity: from.config.cloudDensity + (to.config.cloudDensity - from.config.cloudDensity) * t,
            cloudOpacity: from.config.cloudOpacity + (to.config.cloudOpacity - from.config.cloudOpacity) * t,
            fogDensity: from.config.fogDensity + (to.config.fogDensity - from.config.fogDensity) * t,
            fogColor: Vector3.lerp(from.config.fogColor, to.config.fogColor, t),
            rainIntensity: from.config.rainIntensity + (to.config.rainIntensity - from.config.rainIntensity) * t,
            snowIntensity: from.config.snowIntensity + (to.config.snowIntensity - from.config.snowIntensity) * t,
            windSpeed: from.config.windSpeed + (to.config.windSpeed - from.config.windSpeed) * t,
            windDirection: Vector3.lerp(from.config.windDirection, to.config.windDirection, t).normalize(),
            windGustiness: from.config.windGustiness + (to.config.windGustiness - from.config.windGustiness) * t,
            lightningFrequency: from.config.lightningFrequency + (to.config.lightningFrequency - from.config.lightningFrequency) * t,
            sunIntensity: from.config.sunIntensity + (to.config.sunIntensity - from.config.sunIntensity) * t,
            ambientIntensity: from.config.ambientIntensity + (to.config.ambientIntensity - from.config.ambientIntensity) * t,
            wetnessRate: from.config.wetnessRate + (to.config.wetnessRate - from.config.wetnessRate) * t,
            visibility: from.config.visibility + (to.config.visibility - from.config.visibility) * t
        };

        return new WeatherState(config);
    }
}
