/**
 * Pressure and Humidity Simulator
 *
 * Simulates atmospheric pressure and humidity dynamics including
 * evaporation, precipitation, and cloud formation.
 *
 * @example
 * ```typescript
 * const simulator = new PressureHumiditySimulator(grid);
 * simulator.update(deltaTime);
 * const dewPoint = simulator.calculateDewPoint(lon, lat);
 * ```
 */

import { ClimateGrid } from './ClimateGrid';

export interface PressureHumidityConfig {
    evaporationRate?: number;
    condensationRate?: number;
    cloudFormationThreshold?: number;
    baselinePressure?: number; // Pa
}

/**
 * Pressure and humidity simulator
 */
export class PressureHumiditySimulator {
    private grid: ClimateGrid;
    private config: Required<PressureHumidityConfig>;

    constructor(grid: ClimateGrid, config: PressureHumidityConfig = {}) {
        this.grid = grid;
        this.config = {
            evaporationRate: config.evaporationRate ?? 0.1,
            condensationRate: config.condensationRate ?? 0.05,
            cloudFormationThreshold: config.cloudFormationThreshold ?? 80, // %
            baselinePressure: config.baselinePressure ?? 101325 // Pa
        };
    }

    /**
     * Update pressure and humidity
     */
    public update(deltaTime: number): void {
        this.updatePressure(deltaTime);
        this.updateHumidity(deltaTime);
    }

    /**
     * Update atmospheric pressure based on temperature
     */
    private updatePressure(deltaTime: number): void {
        for (let latIdx = 0; latIdx < this.grid.height; latIdx++) {
            for (let lonIdx = 0; lonIdx < this.grid.width; lonIdx++) {
                const temp = this.grid.getTemperature(lonIdx, latIdx);

                // Ideal gas law approximation: P ∝ T
                const pressure = this.config.baselinePressure * (temp / 288.15);

                this.grid.setPressure(lonIdx, latIdx, pressure);
            }
        }

        // Diffuse pressure for smoothness
        this.grid.diffuse('pressure', 0.005, deltaTime);
    }

    /**
     * Update humidity (evaporation and precipitation)
     */
    private updateHumidity(deltaTime: number): void {
        for (let latIdx = 0; latIdx < this.grid.height; latIdx++) {
            for (let lonIdx = 0; lonIdx < this.grid.width; lonIdx++) {
                const temp = this.grid.getTemperature(lonIdx, latIdx);
                const humidity = this.grid.getHumidity(lonIdx, latIdx);
                const isOcean = this.grid.isOcean(lonIdx, latIdx);

                // Evaporation from ocean
                if (isOcean) {
                    const saturationVaporPressure = this.calculateSaturationVaporPressure(temp);
                    const maxHumidity = Math.min(100, saturationVaporPressure / 10);

                    if (humidity < maxHumidity) {
                        const evaporation = this.config.evaporationRate * (maxHumidity - humidity) * deltaTime;
                        this.grid.setHumidity(lonIdx, latIdx, humidity + evaporation);
                    }
                }

                // Condensation/precipitation over land or high humidity
                if (!isOcean && humidity > this.config.cloudFormationThreshold) {
                    const precipitation = this.config.condensationRate * (humidity - this.config.cloudFormationThreshold) * deltaTime;
                    this.grid.setHumidity(lonIdx, latIdx, Math.max(0, humidity - precipitation));
                }

                // Temperature-driven humidity adjustment
                const saturationHumidity = this.calculateRelativeHumidity(temp, this.grid.getPressure(lonIdx, latIdx));
                if (humidity > saturationHumidity) {
                    this.grid.setHumidity(lonIdx, latIdx, saturationHumidity);
                }
            }
        }

        // Diffuse humidity
        this.grid.diffuse('humidity', 0.01, deltaTime);
    }

    /**
     * Calculate saturation vapor pressure (hPa)
     */
    private calculateSaturationVaporPressure(tempK: number): number {
        const tempC = tempK - 273.15;

        // Tetens formula
        return 6.112 * Math.exp((17.67 * tempC) / (tempC + 243.5));
    }

    /**
     * Calculate relative humidity from temperature and pressure
     */
    private calculateRelativeHumidity(tempK: number, pressure: number): number {
        const tempC = tempK - 273.15;
        const es = this.calculateSaturationVaporPressure(tempK);

        // Simplified calculation
        return Math.min(100, (es / (pressure / 100)) * 100);
    }

    /**
     * Calculate dew point temperature
     */
    public calculateDewPoint(lonIdx: number, latIdx: number): number {
        const tempK = this.grid.getTemperature(lonIdx, latIdx);
        const tempC = tempK - 273.15;
        const humidity = this.grid.getHumidity(lonIdx, latIdx);

        // Magnus formula
        const a = 17.27;
        const b = 237.7;

        const gamma = (a * tempC) / (b + tempC) + Math.log(humidity / 100);
        const dewPointC = (b * gamma) / (a - gamma);

        return dewPointC + 273.15; // Return in Kelvin
    }

    /**
     * Check if cloud formation conditions are met
     */
    public isCloudFormation(lonIdx: number, latIdx: number): boolean {
        const humidity = this.grid.getHumidity(lonIdx, latIdx);
        const temp = this.grid.getTemperature(lonIdx, latIdx);
        const dewPoint = this.calculateDewPoint(lonIdx, latIdx);

        // Clouds form when temperature is close to dew point and high humidity
        return humidity > this.config.cloudFormationThreshold && (temp - dewPoint) < 5;
    }

    /**
     * Calculate cloud cover (0-1)
     */
    public getCloudCover(lonIdx: number, latIdx: number): number {
        const humidity = this.grid.getHumidity(lonIdx, latIdx);

        if (humidity < this.config.cloudFormationThreshold) {
            return 0;
        }

        // Linear mapping from threshold to 100%
        return Math.min(1, (humidity - this.config.cloudFormationThreshold) / (100 - this.config.cloudFormationThreshold));
    }

    /**
     * Calculate precipitation rate (mm/h)
     */
    public getPrecipitationRate(lonIdx: number, latIdx: number): number {
        if (!this.isCloudFormation(lonIdx, latIdx)) {
            return 0;
        }

        const humidity = this.grid.getHumidity(lonIdx, latIdx);
        const temp = this.grid.getTemperature(lonIdx, latIdx);

        // Higher humidity and temperature = more precipitation
        const basePrecip = (humidity - this.config.cloudFormationThreshold) / 20;
        const tempFactor = Math.max(0, (temp - 273.15) / 30);

        return basePrecip * (1 + tempFactor);
    }

    /**
     * Determine precipitation type
     */
    public getPrecipitationType(lonIdx: number, latIdx: number): 'none' | 'rain' | 'snow' | 'sleet' {
        const precip = this.getPrecipitationRate(lonIdx, latIdx);

        if (precip === 0) {
            return 'none';
        }

        const temp = this.grid.getTemperature(lonIdx, latIdx) - 273.15; // °C

        if (temp < -2) {
            return 'snow';
        } else if (temp < 2) {
            return 'sleet';
        } else {
            return 'rain';
        }
    }

    /**
     * Calculate air density (kg/m³)
     */
    public getAirDensity(lonIdx: number, latIdx: number): number {
        const pressure = this.grid.getPressure(lonIdx, latIdx);
        const temp = this.grid.getTemperature(lonIdx, latIdx);

        // Ideal gas law: ρ = P / (R * T)
        const R = 287.05; // J/(kg·K) for dry air
        return pressure / (R * temp);
    }

    /**
     * Calculate pressure altitude (meters)
     */
    public getPressureAltitude(lonIdx: number, latIdx: number): number {
        const pressure = this.grid.getPressure(lonIdx, latIdx);

        // Barometric formula
        const seaLevelPressure = 101325; // Pa
        const temp = 288.15; // K (standard temperature)
        const lapseRate = 0.0065; // K/m
        const R = 287.05; // J/(kg·K)
        const g = 9.80665; // m/s²

        return (temp / lapseRate) * (1 - Math.pow(pressure / seaLevelPressure, (R * lapseRate) / g));
    }

    /**
     * Apply pressure gradient (for wind calculation)
     */
    public getPressureGradient(lonIdx: number, latIdx: number): { dx: number; dy: number } {
        const p = this.grid.getPressure(lonIdx, latIdx);

        // Neighboring pressures
        const pE = this.grid.getPressure(lonIdx + 1, latIdx);
        const pW = this.grid.getPressure(lonIdx - 1, latIdx);
        const pN = latIdx > 0 ? this.grid.getPressure(lonIdx, latIdx - 1) : p;
        const pS = latIdx < this.grid.height - 1 ? this.grid.getPressure(lonIdx, latIdx + 1) : p;

        // Gradient (simplified)
        const dx = (pE - pW) / 2;
        const dy = (pS - pN) / 2;

        return { dx, dy };
    }
}
