/**
 * Temperature Simulator
 *
 * Simulates temperature dynamics based on solar radiation, altitude,
 * land/ocean heat capacity, and diffusion.
 *
 * @example
 * ```typescript
 * const simulator = new TemperatureSimulator(grid);
 * simulator.update(deltaTime, dayOfYear, timeOfDay);
 * ```
 */

import { ClimateGrid } from './ClimateGrid';

export interface TemperatureConfig {
    solarConstant?: number; // W/m²
    albedo?: number; // Surface reflectivity
    emissivity?: number; // IR emissivity
    atmosphericTransmittance?: number;
    landHeatCapacity?: number;
    oceanHeatCapacity?: number;
    altitudeEffect?: number; // °C per km
}

/**
 * Temperature dynamics simulator
 */
export class TemperatureSimulator {
    private grid: ClimateGrid;
    private config: Required<TemperatureConfig>;

    constructor(grid: ClimateGrid, config: TemperatureConfig = {}) {
        this.grid = grid;
        this.config = {
            solarConstant: config.solarConstant ?? 1361, // W/m²
            albedo: config.albedo ?? 0.3,
            emissivity: config.emissivity ?? 0.9,
            atmosphericTransmittance: config.atmosphericTransmittance ?? 0.7,
            landHeatCapacity: config.landHeatCapacity ?? 1.0,
            oceanHeatCapacity: config.oceanHeatCapacity ?? 4.0,
            altitudeEffect: config.altitudeEffect ?? 6.5 // °C per km
        };
    }

    /**
     * Update temperature field
     */
    public update(deltaTime: number, dayOfYear: number, timeOfDay: number): void {
        // Solar radiation heating
        this.applySolarRadiation(dayOfYear, timeOfDay, deltaTime);

        // Heat diffusion
        this.applyHeatDiffusion(deltaTime);

        // Day/night cycle
        this.applyDayNightCycle(timeOfDay, deltaTime);
    }

    /**
     * Apply solar radiation heating
     */
    private applySolarRadiation(dayOfYear: number, timeOfDay: number, deltaTime: number): void {
        // Solar declination (tilt effect)
        const declination = 23.45 * Math.sin((dayOfYear - 81) * 2 * Math.PI / 365);

        for (let latIdx = 0; latIdx < this.grid.height; latIdx++) {
            const lat = this.grid.indexToLatitude(latIdx);

            // Solar altitude angle
            const hourAngle = (timeOfDay - 12) * 15; // degrees
            const solarAltitude = Math.asin(
                Math.sin(lat * Math.PI / 180) * Math.sin(declination * Math.PI / 180) +
                Math.cos(lat * Math.PI / 180) * Math.cos(declination * Math.PI / 180) *
                Math.cos(hourAngle * Math.PI / 180)
            );

            if (solarAltitude <= 0) continue; // Night time

            // Incoming solar radiation
            const radiation = this.config.solarConstant *
                            this.config.atmosphericTransmittance *
                            (1 - this.config.albedo) *
                            Math.sin(solarAltitude);

            for (let lonIdx = 0; lonIdx < this.grid.width; lonIdx++) {
                const isOcean = this.grid.isOcean(lonIdx, latIdx);
                const heatCapacity = isOcean ? this.config.oceanHeatCapacity : this.config.landHeatCapacity;

                // Temperature increase (simplified)
                const tempIncrease = (radiation * deltaTime) / (heatCapacity * 1000);

                const currentTemp = this.grid.getTemperature(lonIdx, latIdx);
                this.grid.setTemperature(lonIdx, latIdx, currentTemp + tempIncrease);
            }
        }
    }

    /**
     * Apply heat diffusion
     */
    private applyHeatDiffusion(deltaTime: number): void {
        const diffusionCoefficient = 0.01;
        this.grid.diffuse('temperature', diffusionCoefficient, deltaTime);
    }

    /**
     * Apply day/night cooling
     */
    private applyDayNightCycle(timeOfDay: number, deltaTime: number): void {
        // Radiative cooling (stronger at night)
        const stefanBoltzmann = 5.67e-8; // W/m²/K⁴

        for (let latIdx = 0; latIdx < this.grid.height; latIdx++) {
            for (let lonIdx = 0; lonIdx < this.grid.width; lonIdx++) {
                const temp = this.grid.getTemperature(lonIdx, latIdx);

                // Longwave radiation cooling
                const cooling = this.config.emissivity * stefanBoltzmann * Math.pow(temp, 4);

                const isOcean = this.grid.isOcean(lonIdx, latIdx);
                const heatCapacity = isOcean ? this.config.oceanHeatCapacity : this.config.landHeatCapacity;

                const tempDecrease = (cooling * deltaTime) / (heatCapacity * 1000);

                this.grid.setTemperature(lonIdx, latIdx, temp - tempDecrease * 0.001);
            }
        }
    }

    /**
     * Apply altitude effect on temperature
     */
    public applyAltitudeEffect(altitude: Float32Array): void {
        for (let latIdx = 0; latIdx < this.grid.height; latIdx++) {
            for (let lonIdx = 0; lonIdx < this.grid.width; lonIdx++) {
                const idx = latIdx * this.grid.width + lonIdx;
                const alt = altitude[idx]; // meters

                if (alt > 0) {
                    const tempReduction = (alt / 1000) * this.config.altitudeEffect;
                    const currentTemp = this.grid.getTemperature(lonIdx, latIdx);
                    this.grid.setTemperature(lonIdx, latIdx, currentTemp - tempReduction);
                }
            }
        }
    }

    /**
     * Set seasonal temperature variation
     */
    public applySeasonalVariation(dayOfYear: number, amplitude: number = 10): void {
        // Temperature variation follows sine wave through the year
        const phase = (dayOfYear - 172) * 2 * Math.PI / 365; // Peak at summer solstice

        for (let latIdx = 0; latIdx < this.grid.height; latIdx++) {
            const lat = this.grid.indexToLatitude(latIdx);

            // Seasonal variation decreases near equator
            const seasonalEffect = amplitude * Math.cos(lat * Math.PI / 180) * Math.sin(phase);

            for (let lonIdx = 0; lonIdx < this.grid.width; lonIdx++) {
                const currentTemp = this.grid.getTemperature(lonIdx, latIdx);
                this.grid.setTemperature(lonIdx, latIdx, currentTemp + seasonalEffect);
            }
        }
    }

    /**
     * Calculate heat index (apparent temperature)
     */
    public calculateHeatIndex(lonIdx: number, latIdx: number): number {
        const tempC = this.grid.getTemperature(lonIdx, latIdx) - 273.15;
        const humidity = this.grid.getHumidity(lonIdx, latIdx);

        if (tempC < 27) return tempC;

        // Simplified heat index formula
        const hi = -8.78 + 1.61 * tempC + 2.34 * humidity -
                   0.146 * tempC * humidity;

        return hi;
    }

    /**
     * Calculate wind chill
     */
    public calculateWindChill(lonIdx: number, latIdx: number): number {
        const tempC = this.grid.getTemperature(lonIdx, latIdx) - 273.15;
        const windSpeed = this.grid.getWindSpeed(lonIdx, latIdx) * 3.6; // m/s to km/h

        if (tempC > 10 || windSpeed < 4.8) return tempC;

        // Wind chill formula
        const wc = 13.12 + 0.6215 * tempC - 11.37 * Math.pow(windSpeed, 0.16) +
                   0.3965 * tempC * Math.pow(windSpeed, 0.16);

        return wc;
    }
}
