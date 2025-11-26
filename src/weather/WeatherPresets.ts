/**
 * Predefined weather state configurations
 * @module Weather
 */

import { Vector3 } from '../math/Vector3';
import { WeatherType, WeatherStateConfig } from './WeatherState';

/**
 * Predefined weather configurations
 */
export class WeatherPresets {
    /**
     * Clear sunny weather
     */
    public static readonly CLEAR: WeatherStateConfig = {
        type: WeatherType.CLEAR,
        cloudCoverage: 0.1,
        cloudDensity: 0.3,
        cloudOpacity: 0.8,
        fogDensity: 0.0,
        fogColor: new Vector3(0.8, 0.9, 1.0),
        rainIntensity: 0.0,
        snowIntensity: 0.0,
        windSpeed: 2.0,
        windDirection: new Vector3(1, 0, 0),
        windGustiness: 0.1,
        lightningFrequency: 0.0,
        sunIntensity: 1.0,
        ambientIntensity: 0.8,
        wetnessRate: 0.0,
        visibility: 50000
    };

    /**
     * Partly cloudy weather
     */
    public static readonly PARTLY_CLOUDY: WeatherStateConfig = {
        type: WeatherType.PARTLY_CLOUDY,
        cloudCoverage: 0.4,
        cloudDensity: 0.5,
        cloudOpacity: 0.85,
        fogDensity: 0.05,
        fogColor: new Vector3(0.75, 0.85, 0.95),
        rainIntensity: 0.0,
        snowIntensity: 0.0,
        windSpeed: 3.5,
        windDirection: new Vector3(1, 0, 0),
        windGustiness: 0.2,
        lightningFrequency: 0.0,
        sunIntensity: 0.8,
        ambientIntensity: 0.7,
        wetnessRate: 0.0,
        visibility: 30000
    };

    /**
     * Overcast cloudy weather
     */
    public static readonly CLOUDY: WeatherStateConfig = {
        type: WeatherType.CLOUDY,
        cloudCoverage: 0.85,
        cloudDensity: 0.7,
        cloudOpacity: 0.95,
        fogDensity: 0.1,
        fogColor: new Vector3(0.7, 0.75, 0.8),
        rainIntensity: 0.0,
        snowIntensity: 0.0,
        windSpeed: 5.0,
        windDirection: new Vector3(1, 0, 0),
        windGustiness: 0.3,
        lightningFrequency: 0.0,
        sunIntensity: 0.5,
        ambientIntensity: 0.6,
        wetnessRate: 0.0,
        visibility: 20000
    };

    /**
     * Light rain
     */
    public static readonly LIGHT_RAIN: WeatherStateConfig = {
        type: WeatherType.LIGHT_RAIN,
        cloudCoverage: 0.7,
        cloudDensity: 0.65,
        cloudOpacity: 0.9,
        fogDensity: 0.15,
        fogColor: new Vector3(0.65, 0.7, 0.75),
        rainIntensity: 0.3,
        snowIntensity: 0.0,
        windSpeed: 4.0,
        windDirection: new Vector3(1, 0, 0),
        windGustiness: 0.25,
        lightningFrequency: 0.0,
        sunIntensity: 0.4,
        ambientIntensity: 0.55,
        wetnessRate: 0.3,
        visibility: 15000
    };

    /**
     * Moderate rain
     */
    public static readonly RAIN: WeatherStateConfig = {
        type: WeatherType.RAIN,
        cloudCoverage: 0.9,
        cloudDensity: 0.75,
        cloudOpacity: 0.95,
        fogDensity: 0.2,
        fogColor: new Vector3(0.6, 0.65, 0.7),
        rainIntensity: 0.6,
        snowIntensity: 0.0,
        windSpeed: 6.5,
        windDirection: new Vector3(1, 0, 0),
        windGustiness: 0.4,
        lightningFrequency: 0.5,
        sunIntensity: 0.3,
        ambientIntensity: 0.5,
        wetnessRate: 0.6,
        visibility: 10000
    };

    /**
     * Heavy rain
     */
    public static readonly HEAVY_RAIN: WeatherStateConfig = {
        type: WeatherType.HEAVY_RAIN,
        cloudCoverage: 1.0,
        cloudDensity: 0.85,
        cloudOpacity: 1.0,
        fogDensity: 0.3,
        fogColor: new Vector3(0.5, 0.55, 0.6),
        rainIntensity: 0.9,
        snowIntensity: 0.0,
        windSpeed: 9.0,
        windDirection: new Vector3(1, 0, 0),
        windGustiness: 0.5,
        lightningFrequency: 1.5,
        sunIntensity: 0.2,
        ambientIntensity: 0.4,
        wetnessRate: 0.9,
        visibility: 5000
    };

    /**
     * Thunderstorm
     */
    public static readonly THUNDERSTORM: WeatherStateConfig = {
        type: WeatherType.THUNDERSTORM,
        cloudCoverage: 1.0,
        cloudDensity: 0.9,
        cloudOpacity: 1.0,
        fogDensity: 0.35,
        fogColor: new Vector3(0.45, 0.5, 0.55),
        rainIntensity: 1.0,
        snowIntensity: 0.0,
        windSpeed: 12.0,
        windDirection: new Vector3(1, 0, 0),
        windGustiness: 0.7,
        lightningFrequency: 3.0,
        sunIntensity: 0.15,
        ambientIntensity: 0.35,
        wetnessRate: 1.0,
        visibility: 3000
    };

    /**
     * Light snow
     */
    public static readonly LIGHT_SNOW: WeatherStateConfig = {
        type: WeatherType.LIGHT_SNOW,
        cloudCoverage: 0.8,
        cloudDensity: 0.7,
        cloudOpacity: 0.9,
        fogDensity: 0.1,
        fogColor: new Vector3(0.9, 0.92, 0.95),
        rainIntensity: 0.0,
        snowIntensity: 0.3,
        windSpeed: 3.0,
        windDirection: new Vector3(1, 0, 0),
        windGustiness: 0.2,
        lightningFrequency: 0.0,
        sunIntensity: 0.5,
        ambientIntensity: 0.65,
        wetnessRate: 0.1,
        visibility: 12000
    };

    /**
     * Moderate snow
     */
    public static readonly SNOW: WeatherStateConfig = {
        type: WeatherType.SNOW,
        cloudCoverage: 0.95,
        cloudDensity: 0.8,
        cloudOpacity: 0.95,
        fogDensity: 0.2,
        fogColor: new Vector3(0.85, 0.88, 0.92),
        rainIntensity: 0.0,
        snowIntensity: 0.6,
        windSpeed: 5.5,
        windDirection: new Vector3(1, 0, 0),
        windGustiness: 0.35,
        lightningFrequency: 0.0,
        sunIntensity: 0.4,
        ambientIntensity: 0.6,
        wetnessRate: 0.2,
        visibility: 8000
    };

    /**
     * Blizzard
     */
    public static readonly BLIZZARD: WeatherStateConfig = {
        type: WeatherType.BLIZZARD,
        cloudCoverage: 1.0,
        cloudDensity: 0.9,
        cloudOpacity: 1.0,
        fogDensity: 0.4,
        fogColor: new Vector3(0.8, 0.85, 0.9),
        rainIntensity: 0.0,
        snowIntensity: 1.0,
        windSpeed: 15.0,
        windDirection: new Vector3(1, 0, 0),
        windGustiness: 0.8,
        lightningFrequency: 0.0,
        sunIntensity: 0.25,
        ambientIntensity: 0.5,
        wetnessRate: 0.0,
        visibility: 2000
    };

    /**
     * Dense fog
     */
    public static readonly FOG: WeatherStateConfig = {
        type: WeatherType.FOG,
        cloudCoverage: 0.6,
        cloudDensity: 0.5,
        cloudOpacity: 0.85,
        fogDensity: 0.6,
        fogColor: new Vector3(0.75, 0.78, 0.82),
        rainIntensity: 0.0,
        snowIntensity: 0.0,
        windSpeed: 1.5,
        windDirection: new Vector3(1, 0, 0),
        windGustiness: 0.05,
        lightningFrequency: 0.0,
        sunIntensity: 0.3,
        ambientIntensity: 0.55,
        wetnessRate: 0.05,
        visibility: 1000
    };

    /**
     * Gets a weather preset by type
     * @param type - Weather type
     * @returns Weather configuration
     */
    public static getPreset(type: WeatherType): WeatherStateConfig {
        switch (type) {
            case WeatherType.CLEAR:
                return this.CLEAR;
            case WeatherType.PARTLY_CLOUDY:
                return this.PARTLY_CLOUDY;
            case WeatherType.CLOUDY:
                return this.CLOUDY;
            case WeatherType.LIGHT_RAIN:
                return this.LIGHT_RAIN;
            case WeatherType.RAIN:
                return this.RAIN;
            case WeatherType.HEAVY_RAIN:
                return this.HEAVY_RAIN;
            case WeatherType.THUNDERSTORM:
                return this.THUNDERSTORM;
            case WeatherType.LIGHT_SNOW:
                return this.LIGHT_SNOW;
            case WeatherType.SNOW:
                return this.SNOW;
            case WeatherType.BLIZZARD:
                return this.BLIZZARD;
            case WeatherType.FOG:
                return this.FOG;
            default:
                return this.CLEAR;
        }
    }
}
