/**
 * Day/night cycle and celestial body positioning
 * @module Weather
 */

import { Vector3 } from '../math/Vector3';

/**
 * Time of day parameters
 */
export interface TimeOfDayParams {
    /** Current time in hours [0-24] */
    currentTime: number;

    /** Day duration in real seconds */
    dayDuration: number;

    /** Latitude in degrees [-90, 90] */
    latitude: number;

    /** Day of year [1-365] */
    dayOfYear: number;

    /** Time scale multiplier */
    timeScale: number;
}

/**
 * Sun position data
 */
export interface SunData {
    /** Sun direction vector */
    direction: Vector3;

    /** Sun position in sky */
    position: Vector3;

    /** Sun altitude angle in radians */
    altitude: number;

    /** Sun azimuth angle in radians */
    azimuth: number;

    /** Sun color */
    color: Vector3;

    /** Sun intensity [0-1] */
    intensity: number;
}

/**
 * Moon position data
 */
export interface MoonData {
    /** Moon direction vector */
    direction: Vector3;

    /** Moon position in sky */
    position: Vector3;

    /** Moon altitude angle in radians */
    altitude: number;

    /** Moon azimuth angle in radians */
    azimuth: number;

    /** Moon phase [0-1] (0=new, 0.5=full) */
    phase: number;

    /** Moon color */
    color: Vector3;

    /** Moon intensity [0-1] */
    intensity: number;
}

/**
 * Sky color data
 */
export interface SkyColors {
    /** Zenith color */
    zenith: Vector3;

    /** Horizon color */
    horizon: Vector3;

    /** Ground color */
    ground: Vector3;

    /** Ambient color */
    ambient: Vector3;
}

/**
 * Day/night cycle system with celestial positioning
 */
export class TimeOfDay {
    /** Current time in hours [0-24] */
    private currentTime: number;

    /** Day duration in real seconds */
    private dayDuration: number;

    /** Latitude in degrees */
    private latitude: number;

    /** Day of year [1-365] */
    private dayOfYear: number;

    /** Time scale multiplier */
    private timeScale: number;

    /** Sun distance from origin */
    private readonly sunDistance: number = 10000;

    /** Moon distance from origin */
    private readonly moonDistance: number = 8000;

    /** Sunrise time in hours */
    private readonly sunriseTime: number = 6.0;

    /** Sunset time in hours */
    private readonly sunsetTime: number = 18.0;

    /**
     * Creates a new time of day system
     * @param params - Initial parameters
     */
    constructor(params?: Partial<TimeOfDayParams>) {
        this.currentTime = params?.currentTime ?? 12.0;
        this.dayDuration = params?.dayDuration ?? 1200.0;
        this.latitude = params?.latitude ?? 45.0;
        this.dayOfYear = params?.dayOfYear ?? 172;
        this.timeScale = params?.timeScale ?? 1.0;
    }

    /**
     * Updates the time of day
     * @param deltaTime - Time elapsed in seconds
     */
    public update(deltaTime: number): void {
        const timeProgress = (deltaTime * this.timeScale) / this.dayDuration;
        const hoursElapsed = timeProgress * 24;

        this.currentTime += hoursElapsed;

        // Wrap around 24 hours
        if (this.currentTime >= 24) {
            this.currentTime -= 24;
            this.dayOfYear = (this.dayOfYear % 365) + 1;
        }
    }

    /**
     * Gets sun data
     */
    public getSunData(): SunData {
        const { altitude, azimuth } = this.calculateSunPosition();
        const direction = this.calculateDirectionFromAngles(altitude, azimuth);
        const position = direction.clone().multiplyScalar(this.sunDistance);

        return {
            direction: direction,
            position: position,
            altitude: altitude,
            azimuth: azimuth,
            color: this.calculateSunColor(altitude),
            intensity: this.calculateSunIntensity(altitude)
        };
    }

    /**
     * Gets moon data
     */
    public getMoonData(): MoonData {
        const { altitude, azimuth } = this.calculateMoonPosition();
        const direction = this.calculateDirectionFromAngles(altitude, azimuth);
        const position = direction.clone().multiplyScalar(this.moonDistance);

        return {
            direction: direction,
            position: position,
            altitude: altitude,
            azimuth: azimuth,
            phase: this.calculateMoonPhase(),
            color: new Vector3(0.8, 0.85, 1.0),
            intensity: this.calculateMoonIntensity(altitude)
        };
    }

    /**
     * Gets sky colors based on time of day
     */
    public getSkyColors(): SkyColors {
        const sunData = this.getSunData();
        const sunAltitudeDeg = sunData.altitude * 180 / Math.PI;

        let zenith: Vector3;
        let horizon: Vector3;
        let ground: Vector3;
        let ambient: Vector3;

        if (sunAltitudeDeg > 5) {
            // Daytime
            const dayFactor = Math.min(1, (sunAltitudeDeg - 5) / 25);
            zenith = Vector3.lerp(
                new Vector3(0.3, 0.4, 0.6),
                new Vector3(0.2, 0.5, 0.9),
                dayFactor
            );
            horizon = Vector3.lerp(
                new Vector3(0.8, 0.6, 0.5),
                new Vector3(0.6, 0.7, 0.9),
                dayFactor
            );
            ground = new Vector3(0.3, 0.25, 0.2);
            ambient = Vector3.lerp(
                new Vector3(0.4, 0.4, 0.5),
                new Vector3(0.6, 0.65, 0.7),
                dayFactor
            );
        } else if (sunAltitudeDeg > -5) {
            // Twilight
            const twilightFactor = (sunAltitudeDeg + 5) / 10;
            if (sunAltitudeDeg > 0) {
                // Sunset
                zenith = Vector3.lerp(
                    new Vector3(0.1, 0.1, 0.2),
                    new Vector3(0.3, 0.4, 0.6),
                    twilightFactor
                );
                horizon = Vector3.lerp(
                    new Vector3(0.4, 0.2, 0.3),
                    new Vector3(0.8, 0.6, 0.5),
                    twilightFactor
                );
            } else {
                // Dawn
                zenith = Vector3.lerp(
                    new Vector3(0.05, 0.05, 0.15),
                    new Vector3(0.3, 0.4, 0.6),
                    twilightFactor
                );
                horizon = Vector3.lerp(
                    new Vector3(0.3, 0.15, 0.25),
                    new Vector3(0.8, 0.6, 0.5),
                    twilightFactor
                );
            }
            ground = new Vector3(0.15, 0.12, 0.1);
            ambient = Vector3.lerp(
                new Vector3(0.15, 0.15, 0.25),
                new Vector3(0.4, 0.4, 0.5),
                twilightFactor
            );
        } else {
            // Night
            zenith = new Vector3(0.01, 0.01, 0.05);
            horizon = new Vector3(0.05, 0.05, 0.1);
            ground = new Vector3(0.05, 0.04, 0.03);
            ambient = new Vector3(0.05, 0.05, 0.15);
        }

        return { zenith, horizon, ground, ambient };
    }

    /**
     * Calculates sun position
     */
    private calculateSunPosition(): { altitude: number; azimuth: number } {
        const hourAngle = (this.currentTime - 12) * 15 * Math.PI / 180;
        const latRad = this.latitude * Math.PI / 180;
        const declination = this.calculateSolarDeclination();

        // Calculate altitude
        const sinAlt = Math.sin(latRad) * Math.sin(declination) +
                      Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngle);
        const altitude = Math.asin(sinAlt);

        // Calculate azimuth
        const cosAz = (Math.sin(declination) - Math.sin(latRad) * sinAlt) /
                     (Math.cos(latRad) * Math.cos(altitude));
        let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz)));

        if (hourAngle > 0) {
            azimuth = 2 * Math.PI - azimuth;
        }

        return { altitude, azimuth };
    }

    /**
     * Calculates moon position (simplified)
     */
    private calculateMoonPosition(): { altitude: number; azimuth: number } {
        const sunPos = this.calculateSunPosition();

        // Moon is roughly opposite to sun (simplified)
        const altitude = -sunPos.altitude;
        const azimuth = (sunPos.azimuth + Math.PI) % (2 * Math.PI);

        return { altitude, azimuth };
    }

    /**
     * Calculates solar declination
     */
    private calculateSolarDeclination(): number {
        const n = this.dayOfYear;
        return 23.45 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + n) / 365);
    }

    /**
     * Calculates direction from altitude and azimuth
     */
    private calculateDirectionFromAngles(altitude: number, azimuth: number): Vector3 {
        const x = Math.cos(altitude) * Math.sin(azimuth);
        const y = Math.sin(altitude);
        const z = Math.cos(altitude) * Math.cos(azimuth);

        return new Vector3(x, y, z).normalize();
    }

    /**
     * Calculates sun color based on altitude
     */
    private calculateSunColor(altitude: number): Vector3 {
        const altitudeDeg = altitude * 180 / Math.PI;

        if (altitudeDeg > 30) {
            return new Vector3(1.0, 1.0, 0.95);
        } else if (altitudeDeg > 0) {
            const t = altitudeDeg / 30;
            return Vector3.lerp(
                new Vector3(1.0, 0.7, 0.5),
                new Vector3(1.0, 1.0, 0.95),
                t
            );
        } else if (altitudeDeg > -10) {
            const t = (altitudeDeg + 10) / 10;
            return Vector3.lerp(
                new Vector3(0.8, 0.5, 0.4),
                new Vector3(1.0, 0.7, 0.5),
                t
            );
        } else {
            return new Vector3(0.5, 0.3, 0.2);
        }
    }

    /**
     * Calculates sun intensity based on altitude
     */
    private calculateSunIntensity(altitude: number): number {
        const altitudeDeg = altitude * 180 / Math.PI;

        if (altitudeDeg > 0) {
            return Math.min(1, altitudeDeg / 30);
        } else if (altitudeDeg > -10) {
            return Math.max(0, (altitudeDeg + 10) / 10) * 0.1;
        } else {
            return 0;
        }
    }

    /**
     * Calculates moon intensity based on altitude
     */
    private calculateMoonIntensity(altitude: number): number {
        const altitudeDeg = altitude * 180 / Math.PI;

        if (altitudeDeg > 0) {
            const phase = this.calculateMoonPhase();
            const phaseBrightness = 1 - Math.abs(phase - 0.5) * 2;
            return Math.min(1, altitudeDeg / 30) * phaseBrightness * 0.3;
        }

        return 0;
    }

    /**
     * Calculates moon phase [0-1]
     */
    private calculateMoonPhase(): number {
        const cycleLength = 29.53;
        const phase = (this.dayOfYear % cycleLength) / cycleLength;
        return phase;
    }

    /**
     * Sets current time
     * @param hours - Time in hours [0-24]
     */
    public setTime(hours: number): void {
        this.currentTime = ((hours % 24) + 24) % 24;
    }

    /**
     * Gets current time in hours
     */
    public getTime(): number {
        return this.currentTime;
    }

    /**
     * Sets time scale
     * @param scale - Time scale multiplier
     */
    public setTimeScale(scale: number): void {
        this.timeScale = Math.max(0, scale);
    }

    /**
     * Gets time scale
     */
    public getTimeScale(): number {
        return this.timeScale;
    }

    /**
     * Checks if it's daytime
     */
    public isDaytime(): boolean {
        return this.currentTime >= this.sunriseTime && this.currentTime < this.sunsetTime;
    }

    /**
     * Checks if it's nighttime
     */
    public isNighttime(): boolean {
        return !this.isDaytime();
    }

    /**
     * Gets day of year
     */
    public getDayOfYear(): number {
        return this.dayOfYear;
    }

    /**
     * Sets day of year
     * @param day - Day of year [1-365]
     */
    public setDayOfYear(day: number): void {
        this.dayOfYear = Math.max(1, Math.min(365, Math.floor(day)));
    }
}
